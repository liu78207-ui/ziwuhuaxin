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
const eventBus = require('./eventBus')

// ==================== 并发保护 ====================

let isProcessing = false
let processQueueTimer = null

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
    // clientSequence 单调递增序列号，解决同毫秒操作的排序问题
    clientCreatedAt: payload.clientCreatedAt || new Date().toISOString(),
    clientSequence: payload.clientSequence || 0,
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
    (i.status === 'pending' || i.status === 'syncing' || i.status === 'retrying')
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
    (i.status === 'pending' || i.status === 'syncing' || i.status === 'retrying')
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
  let syncedCount = 0

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
          action: item.payload.action || item.action,
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
          syncedCount += 1
        } else {
          const newRetryCount = (currentItem?.retryCount || 0) + 1
          // 仍可重试的失败项标记为 retrying，超过上限才进入 failed。
          storageService.updatePendingItem(item.queueId, {
            status: newRetryCount >= 3 ? 'failed' : 'retrying',
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
          status: newRetryCount >= 3 ? 'failed' : 'retrying',
          lastError: e.message,
          retryCount: newRetryCount,
          nextRetryAt: calculateNextRetry(newRetryCount),
          updatedAt: new Date().toISOString()
        })
      }
    }

    // 失败重试项放回队尾（最多保留3次）
    const finalQueue = getPendingOperations()
    const retryingItems = finalQueue.filter(i => i.status === 'retrying' && i.retryCount < 3)
    const otherItems = finalQueue.filter(i => i.status !== 'retrying' || i.retryCount >= 3)
    if (retryingItems.length > 0) {
      setPendingOperations([...otherItems, ...retryingItems])
    }

    if (syncedCount > 0) {
      eventBus.emit('sync:updated', {
        syncedCount,
        source: 'processQueue'
      })
    }
  } finally {
    isProcessing = false
  }
}

function requestProcessQueue() {
  if (processQueueTimer) return

  processQueueTimer = setTimeout(() => {
    processQueueTimer = null
    processQueue().catch(e => {
      console.warn('syncService.requestProcessQueue failed:', e && e.message ? e.message : String(e || 'unknown error'))
    })
  }, 0)
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
    let settled = false
    console.info('syncService.getNetworkType 开始')
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      console.warn('syncService.getNetworkType 超时，按 none 处理')
      resolve('none')
    }, 3000)
    const finish = (networkType) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      console.info('syncService.getNetworkType 完成:', networkType)
      resolve(networkType)
    }
    try {
      wx.getNetworkType({
        success: (res) => finish(res.networkType),
        fail: () => finish('none')
      })
    } catch (e) {
      console.warn('syncService.getNetworkType 异常:', e && e.message ? e.message : String(e || 'unknown error'))
      finish('none')
    }
  })
}

/**
 * 网络恢复时调用：检测网络 -> 处理队列
 */
async function recoverOrSync() {
  try {
    const queue = getPendingOperations()
    const hasPendingWork = queue.some(item => item.status !== 'synced')
    console.info('syncService.recoverOrSync 开始:', `pending=${queue.length}`)
    if (!hasPendingWork) {
      console.info('syncService.recoverOrSync 跳过: no pending work')
      return { success: true, skipped: true, reason: 'NO_PENDING_WORK' }
    }

    const networkType = await getNetworkTypeAsync()
    if (networkType === 'none') {
      console.info('syncService.recoverOrSync 跳过: offline')
      return { success: false, skipped: true, reason: 'OFFLINE' }
    }

    await processQueue()
    console.info('syncService.recoverOrSync 完成')
    return { success: true, skipped: false }
  } catch (e) {
    console.error('syncService.recoverOrSync failed:', e && e.message ? e.message : String(e || 'unknown error'))
    return { success: false, error: e && e.message ? e.message : String(e || 'unknown error') }
  }
}

/**
 * 从云端恢复 V1 数据到本地缓存
 * 在本地关键缓存为空时调用（清缓存/换设备/首次登录）
 */
function isFunctionNotFoundError(error) {
  const message = error?.message || ''
  const code = error?.code || ''
  return code === 'FUNCTION_NOT_FOUND' ||
    message.includes('-501000') ||
    message.includes('FUNCTION_NOT_FOUND') ||
    message.includes('FunctionName parameter could not be found')
}

function isTimeoutError(error) {
  const message = (error?.message || '').toLowerCase()
  const code = error?.code || ''
  return code === cloudService.ERROR_CODES.TIMEOUT ||
    message.includes('timeout')
}

function isCollectionMissingError(error) {
  const message = error?.message || ''
  return message.includes('-502005') ||
    message.includes('collection not exists') ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('ResourceNotFound') ||
    message.includes('Db or Table not exist')
}

function shouldFallbackToLegacyRecover(error) {
  return isFunctionNotFoundError(error) ||
    isTimeoutError(error) ||
    isCollectionMissingError(error)
}

function persistLegacyRecoverPayload(payload) {
  if (payload.MyHabits && Array.isArray(payload.MyHabits)) {
    storageService.setMyHabits(payload.MyHabits)
  }
  if (payload.CheckinLogs && Array.isArray(payload.CheckinLogs)) {
    storageService.setCheckinLogs(payload.CheckinLogs)
  }
  if (payload.AllHabitsInfo && typeof payload.AllHabitsInfo === 'object') {
    storageService.setAllHabitsInfo(payload.AllHabitsInfo)
  }
}

async function recoverFromLegacyCloud() {
  const result = await cloudService.callFunction('syncLocalData', {})
  if (!result.success) {
    return {
      success: false,
      source: 'none',
      error: result.error || {
        code: 'RECOVER_FAILED',
        message: 'syncLocalData cloud function failed'
      }
    }
  }

  const payload = result.data?.data || result.data || {}
  persistLegacyRecoverPayload(payload)
  return { success: true, source: 'syncLocalData', restored: true }
}

function buildRecoverDataParams(options = {}) {
  const params = {
    dailyStateDays: options.dailyStateDays || 90
  }
  const optionalKeys = ['startDate', 'endDate', 'cursor', 'limit']
  optionalKeys.forEach(key => {
    if (options[key] !== undefined && options[key] !== null && options[key] !== '') {
      params[key] = options[key]
    }
  })
  return params
}

async function recoverFromCloud(options = {}) {
  const result = await cloudService.callFunction('recoverData', buildRecoverDataParams(options))
  if (!result.success) {
    if (shouldFallbackToLegacyRecover(result.error)) {
      return recoverFromLegacyCloud()
    }
    throw new Error(result.error?.message || 'recoverData 云函数返回失败')
  }

  // cloudService.callFunction 返回 { success, data }
  // recoverData 云函数返回 { success, data: { userHabits, policyVersions, dailyStates } }
  // 所以实际数据在 result.data.data
  const payload = result.data?.data || result.data || {}
  const { userHabits, policyVersions, dailyStates } = payload

  // 恢复 userHabits -> MyHabits
  if (userHabits && Array.isArray(userHabits)) {
    const migratedHabits = userHabits.map(h => ({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      name: h.name || h.title || h.habitTitle || '',
      category: h.category || '运动类',
      targetMinutes: h.targetMinutes || h.duration || 20,
      themeClass: h.themeClass || 't-default',
      iconUrl: h.iconUrl || '',
      status: h.status || 'active',
      createdAt: h.createdAt || '',
      deletedAt: h.deletedAt || null,
      latestPolicyVersionId: h.latestPolicyVersionId || '',
      syncStatus: 1
    }))
    storageService.setMyHabits(migratedHabits)
  }

  // 恢复 policyVersions
  if (policyVersions && Array.isArray(policyVersions)) {
    storageService.setPolicyVersions(policyVersions)
  }

  // 恢复 dailyStates
  if (dailyStates && Array.isArray(dailyStates)) {
    storageService.setDailyCheckinStates(dailyStates)
  }

  return { success: true, source: 'recoverData', restored: true }
}

/**
 * 检查本地关键缓存是否为空，需要从云端恢复
 */
function needsLocalRecovery() {
  const habits = storageService.getMyHabits()
  // 如果本地没有任何习惯实例，则需要从云端恢复
  return !habits || habits.length === 0
}

async function bootstrapCloudData(options = {}) {
  try {
    if (!needsLocalRecovery()) {
      return {
        success: true,
        source: 'localCache',
        restored: false,
        skipped: true
      }
    }

    const result = await recoverFromCloud(options)
    if (result && result.success && result.restored) {
      eventBus.emit('sync:recovered', {
        source: result.source,
        restored: true
      })
    }
    return {
      success: result.success,
      source: result.source,
      restored: Boolean(result.restored),
      skipped: false,
      error: result.error
    }
  } catch (e) {
    return {
      success: false,
      source: 'none',
      restored: false,
      skipped: false,
      error: e && e.message ? e.message : String(e || 'unknown error')
    }
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
  requestProcessQueue,
  retry,
  recoverOrSync,
  bootstrapCloudData,
  recoverFromCloud,
  needsLocalRecovery,
  calculateNextRetry,
  getNetworkTypeAsync
}
