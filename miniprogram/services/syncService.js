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

// ==================== 并发保护 ====================

let isProcessing = false

// ==================== ID 生成 ====================

function generateQueueId() {
  return `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}

/**
 * 生成 idempotencyKey
 * 优先使用 payload 中已有的 operationId/idempotencyKey（来自业务层）
 * 否则自行生成
 */
function generateIdempotencyKey(entityType, action, payload) {
  if (payload.idempotencyKey) {
    return payload.idempotencyKey
  }
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
 * 优先使用 payload 中已有的 operationId（来自 checkinOperation 等业务对象）
 * queueId 仅作为本地队列标识，不替代业务 operationId
 * @returns {string} queueId
 */
function push(entityType, action, payload) {
  const queueId = generateQueueId()
  // 业务层（如 checkinService）已生成的 idempotencyKey，优先复用
  const idempotencyKey = payload.idempotencyKey || generateIdempotencyKey(entityType, action, payload)

  const item = {
    queueId,
    entityType,
    action,
    entityId: payload.userHabitId || payload.habitId || '',
    payload,
    idempotencyKey,
    // 业务层 operationId（如 checkinOperation.operationId），云端同步时必须传递
    operationId: payload.operationId || null,
    // 客户端本地创建时间，用于云端判断操作顺序，防止旧操作覆盖新状态
    clientCreatedAt: payload.clientCreatedAt || new Date().toISOString(),
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
 * 去重按 idempotencyKey 精确匹配，防止同日同操作被吞
 * @returns {{success: boolean, queueId?: string, reason?: string}}
 */
function pushWithDedup(entityType, action, payload) {
  // 精确按 idempotencyKey 去重（每个业务操作唯一）
  const idempotencyKey = payload.idempotencyKey || generateIdempotencyKey(entityType, action, payload)
  const existing = getPendingOperations().find(i =>
    i.idempotencyKey === idempotencyKey &&
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
 * 包含并发保护：同一时刻只允许一个 processQueue 执行
 */
async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  try {
    const queue = getPendingOperations()
    if (queue.length === 0) return

    // 按 createdAt 从旧到新处理
    const sortedQueue = [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    for (const item of sortedQueue) {
      // 已 synced 的跳过
      if (item.status === 'synced') continue

      // 有 nextRetryAt 的项（failed 或 pending）都要检查是否到时间
      if (item.nextRetryAt) {
        const now = Date.now()
        const retryTime = new Date(item.nextRetryAt).getTime()
        if (now < retryTime) continue
      }

      // 再次检查最新状态（防止并发）
      const latestItem = getPendingOperations().find(i => i.queueId === item.queueId)
      if (!latestItem || latestItem.status === 'synced') continue

      try {
        // 更新状态为 syncing（每次操作前重新读取最新状态）
        storageService.updatePendingItem(item.queueId, {
          status: 'syncing',
          updatedAt: new Date().toISOString()
        })

        // 调用云函数，传递业务 operationId（而非 queueId）
        const cloudFnName = getCloudFunctionName(item.entityType, item.action)
        const result = await cloudService.callFunction(cloudFnName, {
          ...item.payload,
          // 优先使用业务层 operationId
          operationId: item.operationId || item.queueId,
          idempotencyKey: item.idempotencyKey
        })

        // 再次读取最新状态，避免用旧快照覆盖其他并发的更新
        const currentItem = getPendingOperations().find(i => i.queueId === item.queueId)
        if (result.success) {
          storageService.updatePendingItem(item.queueId, {
            status: 'synced',
            lastError: null,
            updatedAt: new Date().toISOString()
          })
        } else {
          const newRetryCount = (currentItem?.retryCount || 0) + 1
          // 失败项保持 'failed'，不改为 'pending'，以便 nextRetryAt 检查生效
          storageService.updatePendingItem(item.queueId, {
            status: newRetryCount >= 3 ? 'failed' : 'failed',
            lastError: result.error?.message || '未知错误',
            retryCount: newRetryCount,
            nextRetryAt: calculateNextRetry(newRetryCount),
            updatedAt: new Date().toISOString()
          })
        }
      } catch (e) {
        const currentItem = getPendingOperations().find(i => i.queueId === item.queueId)
        const newRetryCount = (currentItem?.retryCount || 0) + 1
        storageService.updatePendingItem(item.queueId, {
          status: newRetryCount >= 3 ? 'failed' : 'failed',
          lastError: e.message,
          retryCount: newRetryCount,
          nextRetryAt: calculateNextRetry(newRetryCount),
          updatedAt: new Date().toISOString()
        })
      }
    }

    // 失败重试项放回队尾（最多保留3次）
    const finalQueue = getPendingOperations()
    const failedItems = finalQueue.filter(i => i.status === 'failed' && i.retryCount < 3)
    const doneItems = finalQueue.filter(i => i.status !== 'failed' || i.retryCount >= 3)
    if (failedItems.length > 0) {
      setPendingOperations([...doneItems, ...failedItems])
    }
  } finally {
    isProcessing = false
  }
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

  storageService.updatePendingItem(queueId, {
    status: 'pending',
    updatedAt: new Date().toISOString()
  })

  return processQueue()
}

/**
 * 将 wx.getNetworkType 封装为 Promise
 * @returns {Promise<string>} networkType 或 'none'
 */
function getNetworkTypeAsync() {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => resolve(res.networkType),
      fail: () => resolve('none')
    })
  })
}

/**
 * 网络恢复时调用：检测网络 -> 处理队列
 */
async function recoverOrSync() {
  try {
    const networkType = await getNetworkTypeAsync()
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
  calculateNextRetry,
  getNetworkTypeAsync
}