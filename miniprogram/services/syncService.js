/**
 * services/syncService.js
 * 同步服务层 - pending 队列管理（Phase 4）
 *
 * 职责：
 * - 管理 pendingOperations 队列
 * - 提供 push/pop/retry 能力
 * - 幂等去重
 * - 消费 cloudService 进行云端同步
 * - 网络恢复自动同步
 *
 * 禁止：
 * - 直接操作 storage（委托 storageService）
 * - 业务逻辑判断（委托 checkinService/habitService）
 */

const storageService = require('./storageService')
const cloudService = require('./cloudService')

// ==================== ID 生成 ====================

function generateQueueId() {
  return `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}

function generateIdempotencyKey(entityType, action, payload) {
  const userHabitId = payload.userHabitId || ''
  const date = payload.date || ''
  return `${entityType}_${userHabitId}_${date}_${action}`
}

// ==================== 云函数名称映射 ====================

const CLOUD_FUNCTION_MAP = {
  checkin: {
    checkin: 'syncCheckin',
    undoCheckin: 'syncCheckin'
  },
  habit: {
    addHabit: 'syncHabit',
    deleteHabit: 'syncHabit',
    updatePolicy: 'syncHabit'
  }
}

function getCloudFunctionName(entityType, action) {
  return CLOUD_FUNCTION_MAP[entityType]?.[action] || 'syncHabit'
}

// ==================== 队列操作 ====================

function getPendingOperations() {
  return storageService.getPendingOperations()
}

function setPendingOperations(queue) {
  return storageService.setPendingOperations(queue)
}

/**
 * 添加操作到 pending 队列
 * @returns {string} queueId
 */
function push(entityType, action, payload) {
  const queueId = generateQueueId()
  const idempotencyKey = generateIdempotencyKey(entityType, action, payload)

  const item = {
    queueId,
    entityType,
    action,
    entityId: payload.userHabitId || payload.habitId || '',
    payload,
    idempotencyKey,
    status: 'pending',
    retryCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRetryAt: null
  }

  storageService.pushPending(item)
  return queueId
}

/**
 * 检查是否有重复的 pending 操作
 */
function hasDuplicatePending(entityType, entityId, action) {
  const queue = getPendingOperations()
  return queue.some(i =>
    i.entityType === entityType &&
    i.entityId === entityId &&
    i.action === action &&
    (i.status === 'pending' || i.status === 'syncing')
  )
}

/**
 * 添加操作到 pending 队列（带去重）
 * @returns {{success: boolean, queueId?: string, reason?: string}}
 */
function pushWithDedup(entityType, action, payload) {
  const entityId = payload.userHabitId || payload.habitId || ''
  const existing = getPendingOperations().find(i =>
    i.entityType === entityType &&
    i.action === action &&
    i.entityId === entityId &&
    (i.status === 'pending' || i.status === 'syncing')
  )

  if (existing) {
    return { success: false, reason: 'DUPLICATE_PENDING', queueId: existing.queueId }
  }

  const queueId = push(entityType, action, payload)
  return { success: true, queueId }
}

// ==================== 队列处理 ====================

/**
 * 计算下次重试时间（指数退避）
 */
function calculateNextRetry(retryCount) {
  const baseDelay = 5000 // 5s
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), 60000) // 最多 60s
  return new Date(Date.now() + delay).toISOString()
}

/**
 * 处理 pending 队列（同步到云端）
 */
async function processQueue() {
  const queue = getPendingOperations()
  if (queue.length === 0) return

  // 按 createdAt 从旧到新处理
  const sortedQueue = [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const processedItems = []

  for (const item of sortedQueue) {
    // 已 synced 的跳过
    if (item.status === 'synced') {
      processedItems.push(item)
      continue
    }

    // 失败项检查重试时间，未到时间则跳过
    if (item.status === 'failed' && item.nextRetryAt) {
      const now = Date.now()
      const retryTime = new Date(item.nextRetryAt).getTime()
      if (now < retryTime) {
        processedItems.push(item)
        continue
      }
    }

    try {
      // 更新状态为 syncing
      item.status = 'syncing'
      item.updatedAt = new Date().toISOString()
      storageService.updatePendingItem(item.queueId, { status: 'syncing', updatedAt: item.updatedAt })

      // 调用云函数
      const cloudFnName = getCloudFunctionName(item.entityType, item.action)
      const result = await cloudService.callFunction(cloudFnName, {
        ...item.payload,
        idempotencyKey: item.idempotencyKey,
        operationId: item.queueId
      })

      if (result.success) {
        item.status = 'synced'
        item.updatedAt = new Date().toISOString()
      } else {
        item.status = 'failed'
        item.lastError = result.error?.message || '未知错误'
        item.retryCount += 1
        item.nextRetryAt = calculateNextRetry(item.retryCount)
      }
    } catch (e) {
      item.status = 'failed'
      item.lastError = e.message
      item.retryCount += 1
      item.nextRetryAt = calculateNextRetry(item.retryCount)
    }

    item.updatedAt = new Date().toISOString()
    processedItems.push(item)
    storageService.updatePendingItem(item.queueId, {
      status: item.status,
      lastError: item.lastError,
      retryCount: item.retryCount,
      nextRetryAt: item.nextRetryAt,
      updatedAt: item.updatedAt
    })
  }

  // 失败重试项放回队尾
  const failedItems = processedItems.filter(i => i.status === 'failed' && i.retryCount < 3)
  const finalItems = processedItems.filter(i => i.status !== 'failed' || i.retryCount >= 3)

  setPendingOperations([...finalItems, ...failedItems])
}

/**
 * 重试指定队列项
 */
async function retry(queueId) {
  const queue = getPendingOperations()
  const item = queue.find(i => i.queueId === queueId)

  if (!item) return { success: false, error: 'NOT_FOUND' }
  if (item.retryCount >= 3) {
    return { success: false, error: 'MAX_RETRIES_EXCEEDED' }
  }

  item.status = 'pending'
  item.updatedAt = new Date().toISOString()
  storageService.updatePendingItem(queueId, { status: 'pending', updatedAt: item.updatedAt })

  // 触发处理
  return processQueue()
}

/**
 * 网络恢复时调用：检测网络 -> 处理队列 -> 同步最新数据
 */
async function recoverOrSync() {
  try {
    const networkType = wx.getNetworkType()
    if (networkType === 'none') return

    await processQueue()
  } catch (e) {
    console.error('syncService.recoverOrSync failed:', e)
  }
}

module.exports = {
  generateQueueId,
  generateIdempotencyKey,
  push,
  pushWithDedup,
  getPendingOperations,
  setPendingOperations,
  hasDuplicatePending,
  processQueue,
  retry,
  recoverOrSync,
  calculateNextRetry
}