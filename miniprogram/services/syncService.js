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

const CUSTOM_ICON_URL = '/assets/icons/habit-zidingyi.png'
const RECOVERY_PROTOCOL_VERSION = 2
const DEFAULT_RECOVERY_PAGE_TIMEOUT_MS = 15000
const MAX_RECOVERY_PAGES = 1000

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
    updatePolicy: 'syncHabit',
    updateHabitMeta: 'syncHabit',
    updatePinned: 'syncHabit'
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

function getSyncSummary() {
  const queue = getPendingOperations()
  const counts = {
    pending: 0,
    syncing: 0,
    retrying: 0,
    failed: 0,
    synced: 0
  }
  queue.forEach(item => {
    if (Object.prototype.hasOwnProperty.call(counts, item.status)) {
      counts[item.status] += 1
    }
  })
  const unsyncedCount = counts.pending + counts.syncing + counts.retrying + counts.failed
  return {
    ...counts,
    total: queue.length,
    unsyncedCount,
    allSynced: unsyncedCount === 0
  }
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

function scheduleProcessQueue(delay = 0) {
  if (processQueueTimer) return

  processQueueTimer = setTimeout(() => {
    processQueueTimer = null
    processQueue().catch(e => {
      console.warn('syncService.requestProcessQueue failed:', e && e.message ? e.message : String(e || 'unknown error'))
    })
  }, Math.max(0, delay))
}

function scheduleRetryingQueue(queue) {
  const retryTimes = queue
    .filter(item => item.status === 'retrying' && item.retryCount < 3 && item.nextRetryAt)
    .map(item => new Date(item.nextRetryAt).getTime())
    .filter(time => Number.isFinite(time))

  if (retryTimes.length === 0) return
  const nextRetryTime = Math.min(...retryTimes)
  scheduleProcessQueue(Math.max(0, nextRetryTime - Date.now()))
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
      scheduleRetryingQueue(getPendingOperations())
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
  scheduleProcessQueue(0)
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
    const summary = getSyncSummary()
    if (!summary.allSynced) {
      return {
        success: false,
        skipped: false,
        reason: 'UNSYNCED_OPERATIONS_REMAIN',
        summary
      }
    }
    console.info('syncService.recoverOrSync 完成')
    return { success: true, skipped: false, summary }
  } catch (e) {
    console.error('syncService.recoverOrSync failed:', e && e.message ? e.message : String(e || 'unknown error'))
    return { success: false, error: e && e.message ? e.message : String(e || 'unknown error') }
  }
}

function buildRecoverDataParams(options = {}) {
  const hasExplicitRange = Boolean(options.startDate || options.endDate || options.dailyStateDays)
  const historyScope = options.historyScope || (hasExplicitRange ? '' : 'all')
  const params = historyScope === 'all'
    ? {
        historyScope: 'all',
        recoveryProtocolVersion: RECOVERY_PROTOCOL_VERSION
      }
    : {
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

function cleanRecoveredObject(data) {
  return Object.keys(data).reduce((result, key) => {
    const value = data[key]
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value
    }
    return result
  }, {})
}

function extractTimestampFromUserHabitId(userHabitId) {
  const value = String(userHabitId || '')
  const match = value.match(/^uh_(?:.+_)?(\d{12,})_[a-z0-9]+$/i)
  return match ? Number(match[1]) : null
}

function parseOrderTime(value) {
  if (!value) return null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function resolveRecoveredHabitOrderTime(habit) {
  const addedAtTime = parseOrderTime(habit.addedAt)
  if (addedAtTime !== null) return addedAtTime

  const idTime = extractTimestampFromUserHabitId(habit.userHabitId)
  if (idTime !== null) return idTime

  return parseOrderTime(habit.createdAt)
}

function compareRecoveredHabitOrder(a, b) {
  const aTime = resolveRecoveredHabitOrderTime(a)
  const bTime = resolveRecoveredHabitOrderTime(b)
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return aTime - bTime
  }
  if (aTime !== null && bTime === null) return -1
  if (aTime === null && bTime !== null) return 1

  const sourceCompare = (a.sourceIndex || 0) - (b.sourceIndex || 0)
  if (sourceCompare !== 0) return sourceCompare

  return String(a.userHabitId || '').localeCompare(String(b.userHabitId || ''))
}

function resolveLatestPolicyVersionId(policyVersions, userHabitId) {
  const policies = Array.isArray(policyVersions) ? policyVersions : []
  const active = policies.find(pv =>
    pv.userHabitId === userHabitId && pv.effectiveEndDate === null
  )
  return active ? active.policyVersionId : ''
}

async function recoverFromCloud(options = {}) {
  const snapshot = await fetchRecoverySnapshot(options)
  if (!storageService.stageRecoverySnapshot(snapshot)) {
    storageService.discardRecoverySnapshot()
    throw new Error('恢复快照暂存失败，本地数据未修改')
  }
  const commitResult = storageService.commitRecoverySnapshot()
  if (!commitResult.success) {
    throw new Error('恢复快照提交失败，本地数据未修改')
  }
  return { success: true, source: 'recoverData', restored: true }
}

function normalizeRecoveredHabits(userHabits, policyVersions) {
  return userHabits.map((h, sourceIndex) => {
    const isCustom = h.source === 'custom' || String(h.habitId || '').indexOf('custom_') === 0
    return cleanRecoveredObject({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      source: isCustom ? 'custom' : (h.source || 'system'),
      name: h.name || h.title || h.habitTitle,
      category: h.category || (isCustom ? '自定义' : '运动类'),
      remark: h.remark || '',
      targetMinutes: h.targetMinutes || h.duration || 20,
      themeClass: h.themeClass || (isCustom ? 't-purple' : 't-default'),
      iconUrl: h.iconUrl || (isCustom ? CUSTOM_ICON_URL : ''),
      status: h.status || 'active',
      createdAt: h.createdAt,
      addedAt: h.addedAt || null,
      pinnedAt: h.pinnedAt || null,
      deletedAt: h.deletedAt,
      latestPolicyVersionId: resolveLatestPolicyVersionId(policyVersions, h.userHabitId),
      sourceIndex
    })
  })
    .sort(compareRecoveredHabitOrder)
    .map(({ sourceIndex, ...habit }) => habit)
}

function validateRecoverySnapshot(snapshot, snapshotMeta) {
  if (
    !snapshot ||
    !Array.isArray(snapshot.userHabits) ||
    !Array.isArray(snapshot.policyVersions) ||
    !Array.isArray(snapshot.dailyStates)
  ) {
    throw new Error('recoverData 返回的快照结构无效')
  }
  if (
    !snapshotMeta ||
    snapshotMeta.protocolVersion !== RECOVERY_PROTOCOL_VERSION ||
    snapshotMeta.scope !== 'all' ||
    !snapshotMeta.token
  ) {
    throw new Error('recoverData 云函数版本不支持全量安全恢复')
  }
  if (
    snapshot.userHabits.length !== snapshotMeta.totalUserHabits ||
    snapshot.policyVersions.length !== snapshotMeta.totalPolicyVersions ||
    snapshot.dailyStates.length !== snapshotMeta.totalDailyStates
  ) {
    throw new Error('recoverData 快照数量校验失败')
  }

  const seenHabits = new Set()
  snapshot.userHabits.forEach(habit => {
    if (!habit || !habit.userHabitId) {
      throw new Error('recoverData 返回了无效的用户习惯')
    }
    const key = String(habit.userHabitId)
    if (seenHabits.has(key)) {
      throw new Error(`recoverData 返回了重复的用户习惯: ${key}`)
    }
    seenHabits.add(key)
  })

  const seenPolicies = new Set()
  snapshot.policyVersions.forEach(policy => {
    if (!policy || !policy.policyVersionId || !policy.userHabitId) {
      throw new Error('recoverData 返回了无效的策略版本')
    }
    const key = String(policy.policyVersionId)
    if (seenPolicies.has(key)) {
      throw new Error(`recoverData 返回了重复的策略版本: ${key}`)
    }
    seenPolicies.add(key)
  })

  const seenStates = new Set()
  snapshot.dailyStates.forEach(state => {
    if (!state || !state.userHabitId || !state.date || !state.status) {
      throw new Error('recoverData 返回了无效的每日状态')
    }
    const key = `${state.userHabitId}:${state.date}`
    if (seenStates.has(key)) {
      throw new Error(`recoverData 返回了重复的每日状态: ${key}`)
    }
    seenStates.add(key)
  })
}

async function fetchRecoveryPage(params, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      cloudService.callFunction('recoverData', params),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('recoverData 分页请求超时，本地数据未修改'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchRecoverySnapshot(options = {}) {
  const requestedTimeout = Number(options.pageTimeoutMs)
  const pageTimeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? requestedTimeout
    : DEFAULT_RECOVERY_PAGE_TIMEOUT_MS
  const seenCursors = new Set()
  const seenPageSignatures = new Set()
  const dailyStates = []
  let cursor = ''
  let userHabits = []
  let policyVersions = []
  let expectedMeta = null
  let pageCount = 0

  while (true) {
    const params = buildRecoverDataParams({
      ...options,
      historyScope: 'all',
      cursor
    })
    const result = await fetchRecoveryPage(params, pageTimeoutMs)
    if (!result.success) {
      throw new Error(result.error?.message || 'recoverData 云函数返回失败')
    }
    const payload = result.data?.data || result.data || {}
    const pageStates = Array.isArray(payload.dailyStates) ? payload.dailyStates : []
    const pageMeta = payload.snapshotMeta
    if (
      !pageMeta ||
      pageMeta.protocolVersion !== RECOVERY_PROTOCOL_VERSION ||
      pageMeta.scope !== 'all' ||
      !pageMeta.token
    ) {
      throw new Error('recoverData 云函数版本不支持全量安全恢复')
    }
    if (!expectedMeta) {
      expectedMeta = { ...pageMeta }
      userHabits = Array.isArray(payload.userHabits) ? payload.userHabits : []
      policyVersions = Array.isArray(payload.policyVersions) ? payload.policyVersions : []
    } else if (
      pageMeta.token !== expectedMeta.token ||
      pageMeta.totalUserHabits !== expectedMeta.totalUserHabits ||
      pageMeta.totalPolicyVersions !== expectedMeta.totalPolicyVersions ||
      pageMeta.totalDailyStates !== expectedMeta.totalDailyStates
    ) {
      throw new Error('recoverData 分页期间云端快照发生变化，请重试')
    }

    const signature = pageStates
      .map(state => `${state.stateId || ''}:${state.userHabitId || ''}:${state.date || ''}`)
      .join('|')
    if (signature && seenPageSignatures.has(signature)) {
      throw new Error('recoverData 返回了重复分页，本地数据未修改')
    }
    if (signature) seenPageSignatures.add(signature)
    dailyStates.push(...pageStates)

    const nextCursor = payload.nextCursor
    if (nextCursor === null || nextCursor === undefined || nextCursor === '') break
    const normalizedCursor = String(nextCursor)
    if (normalizedCursor === String(cursor) || seenCursors.has(normalizedCursor)) {
      throw new Error('recoverData 游标未前进，本地数据未修改')
    }
    seenCursors.add(normalizedCursor)
    cursor = normalizedCursor
    pageCount += 1
    if (pageCount >= MAX_RECOVERY_PAGES) {
      throw new Error('recoverData 分页超过安全上限，本地数据未修改')
    }
  }

  const snapshot = {
    userHabits: normalizeRecoveredHabits(userHabits, policyVersions),
    policyVersions,
    dailyStates
  }
  validateRecoverySnapshot(snapshot, expectedMeta)
  return snapshot
}

/**
 * 检查本地关键缓存是否为空，需要从云端恢复
 */
function needsLocalRecovery() {
  const habits = storageService.getMyHabits()
  const policyVersions = storageService.getPolicyVersions()
  const dailyStates = storageService.getDailyCheckinStates()
  // 本地核心缓存任一关键部分缺失，都应从云端恢复，避免 MyHabits 存在但报表事实为空的半恢复状态。
  if (!habits || habits.length === 0) return true
  if (!policyVersions || policyVersions.length === 0) return true
  if (!dailyStates || dailyStates.length === 0) return true
  return false
}

async function bootstrapCloudData(options = {}) {
  try {
    if (!options.force && !needsLocalRecovery()) {
      return {
        success: true,
        source: 'localCache',
        restored: false,
        skipped: true
      }
    }

    const { force, ...recoverOptions } = options
    const result = await recoverFromCloud(recoverOptions)
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
  getSyncSummary,
  hasDuplicatePending,
  processQueue,
  requestProcessQueue,
  retry,
  recoverOrSync,
  bootstrapCloudData,
  recoverFromCloud,
  fetchRecoverySnapshot,
  validateRecoverySnapshot,
  needsLocalRecovery,
  calculateNextRetry,
  getNetworkTypeAsync
}
