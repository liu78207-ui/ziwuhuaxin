// services/storageService.js
// 所有本地缓存读写统一入口

const { STORAGE_KEYS } = require('../constants/storageKeys')
const { generateUserHabitId } = require('../constants/idPrefixes')

const RUNTIME_ENVS = {
  test: 'test',
  prod: 'prod'
}
const TEST_STORAGE_PREFIX = 'test:'

// 默认保持正式版旧行为。App.onLaunch 会在首次缓存读取前显式设置当前环境。
let activeRuntimeEnv = RUNTIME_ENVS.prod

function configureRuntimeEnv(runtimeEnv) {
  if (runtimeEnv !== RUNTIME_ENVS.test && runtimeEnv !== RUNTIME_ENVS.prod) {
    throw new Error(`未知缓存运行环境: ${runtimeEnv}`)
  }
  activeRuntimeEnv = runtimeEnv
  return activeRuntimeEnv
}

function getRuntimeEnv() {
  return activeRuntimeEnv
}

function resolveStorageKey(key) {
  const logicalKey = String(key || '')
  return activeRuntimeEnv === RUNTIME_ENVS.test
    ? `${TEST_STORAGE_PREFIX}${logicalKey}`
    : logicalKey
}

function stripTestStoragePrefix(key) {
  const value = String(key || '')
  return value.startsWith(TEST_STORAGE_PREFIX)
    ? value.slice(TEST_STORAGE_PREFIX.length)
    : value
}

function isCurrentRuntimePhysicalKey(key) {
  const value = String(key || '')
  return activeRuntimeEnv === RUNTIME_ENVS.test
    ? value.startsWith(TEST_STORAGE_PREFIX)
    : !value.startsWith(TEST_STORAGE_PREFIX)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getItem(key) {
  const physicalKey = resolveStorageKey(key)
  try {
    return wx.getStorageSync(physicalKey)
  } catch (e) {
    console.error(`storageService.getItem ${physicalKey} failed:`, e)
    return null
  }
}

function setItem(key, value) {
  const physicalKey = resolveStorageKey(key)
  try {
    wx.setStorageSync(physicalKey, value)
    return true
  } catch (e) {
    console.error(`storageService.setItem ${physicalKey} failed:`, e)
    return false
  }
}

// ==================== 基础读写 ====================

function getMyHabits() {
  return asArray(getItem(STORAGE_KEYS.habits))
}

function setMyHabits(habits) {
  return setItem(STORAGE_KEYS.habits, asArray(habits))
}

function getCheckinLogs() {
  return asArray(getItem(STORAGE_KEYS.logs))
}

function setCheckinLogs(logs) {
  return setItem(STORAGE_KEYS.logs, asArray(logs))
}

function getAllHabitsInfo() {
  return asObject(getItem(STORAGE_KEYS.allHabitsInfo))
}

function setAllHabitsInfo(info) {
  return setItem(STORAGE_KEYS.allHabitsInfo, asObject(info))
}

/**
 * @deprecated Phase 7 起不再读写，openid 仅由云函数 cloud.getWXContext() 获取
 * 已改为 no-op，后续版本将移除此方法
 */
function getUserOpenid() {
  return null; // no-op
}

/**
 * @deprecated Phase 7 起不再读写，openid 仅由云函数 cloud.getWXContext() 获取
 * 已改为 no-op，后续版本将移除此方法
 */
function setUserOpenid(openid) {
  return false; // no-op，不写入 storage
}

function getUserInfo() {
  return getItem(STORAGE_KEYS.userInfo)
}

function setUserInfo(info) {
  return setItem(STORAGE_KEYS.userInfo, info)
}

function removeItem(key) {
  const physicalKey = resolveStorageKey(key)
  try {
    wx.removeStorageSync(physicalKey)
  } catch (e) {
    console.error(`storageService.removeItem ${physicalKey} failed:`, e)
  }
}

function clear() {
  if (activeRuntimeEnv === RUNTIME_ENVS.prod) {
    try {
      wx.clearStorageSync()
      return { success: true }
    } catch (e) {
      console.error('storageService.clear failed:', e)
      return { success: false }
    }
  }

  const failedKeys = []
  getStorageKeys()
    .filter(key => String(key).startsWith(TEST_STORAGE_PREFIX))
    .forEach(key => {
      try {
        wx.removeStorageSync(key)
      } catch (e) {
        failedKeys.push(key)
      }
    })
  return {
    success: failedKeys.length === 0,
    failedKeys
  }
}

const USER_DATA_CACHE_KEYS = [
  STORAGE_KEYS.habits,
  STORAGE_KEYS.logs,
  STORAGE_KEYS.allHabitsInfo,
  STORAGE_KEYS.userInfo,
  STORAGE_KEYS.operationLogs,
  STORAGE_KEYS.userStrategies,
  STORAGE_KEYS.checkinRecords,
  STORAGE_KEYS.dailyStates,
  STORAGE_KEYS.policyVersions,
  STORAGE_KEYS.checkinOperations,
  STORAGE_KEYS.migrationMeta,
  STORAGE_KEYS.pendingOperations,
  STORAGE_KEYS.recoveryStaging,
  STORAGE_KEYS.recoveryTransaction,
  STORAGE_KEYS.clientSequenceCounter,
  'allHabitIds',
  'DynamicThreeDayScenarioSummary'
]

function isPhase3BackupKey(key) {
  const logicalKey = stripTestStoragePrefix(key)
  return /^MyHabits_backup_phase3_\d+$/.test(logicalKey) ||
    /^CheckinLogs_backup_phase3_\d+$/.test(logicalKey) ||
    /^policyVersions_backup_phase3_\d+$/.test(logicalKey)
}

function getStorageKeys() {
  if (typeof wx.getStorageInfoSync !== 'function') {
    return []
  }
  try {
    const info = wx.getStorageInfoSync()
    return Array.isArray(info.keys) ? info.keys : []
  } catch (e) {
    console.error('storageService.getStorageKeys failed:', e)
    return []
  }
}

function clearUserDataCache() {
  const keys = new Set(USER_DATA_CACHE_KEYS.map(resolveStorageKey))
  getStorageKeys()
    .filter(isCurrentRuntimePhysicalKey)
    .filter(isPhase3BackupKey)
    .forEach(key => keys.add(key))

  const details = {}
  keys.forEach(key => {
    try {
      wx.removeStorageSync(key)
      details[key] = true
    } catch (e) {
      console.error(`storageService.clearUserDataCache ${key} failed:`, e)
      details[key] = false
    }
  })

  return {
    success: Object.values(details).every(Boolean),
    removedKeys: Object.keys(details).filter(key => details[key]),
    failedKeys: Object.keys(details).filter(key => !details[key])
  }
}

function isRecoverySnapshot(snapshot) {
  return Boolean(
    snapshot &&
    typeof snapshot === 'object' &&
    Array.isArray(snapshot.userHabits) &&
    Array.isArray(snapshot.policyVersions) &&
    Array.isArray(snapshot.dailyStates)
  )
}

function stageRecoverySnapshot(snapshot) {
  if (!isRecoverySnapshot(snapshot)) return false
  const staged = {
    userHabits: snapshot.userHabits,
    policyVersions: snapshot.policyVersions,
    dailyStates: snapshot.dailyStates,
    stagedAt: Date.now()
  }
  if (!setItem(STORAGE_KEYS.recoveryStaging, staged)) return false
  return setItem(STORAGE_KEYS.recoveryTransaction, {
    status: 'staged',
    stagedAt: staged.stagedAt
  })
}

function discardRecoverySnapshot() {
  removeItem(STORAGE_KEYS.recoveryTransaction)
  removeItem(STORAGE_KEYS.recoveryStaging)
}

function isSameStoredValue(actual, expected) {
  try {
    return JSON.stringify(actual) === JSON.stringify(expected)
  } catch (e) {
    return false
  }
}

function commitRecoverySnapshot() {
  const snapshot = getItem(STORAGE_KEYS.recoveryStaging)
  if (!isRecoverySnapshot(snapshot)) {
    return { success: false, reason: 'INVALID_RECOVERY_STAGING' }
  }

  const previous = {
    userHabits: getMyHabits(),
    policyVersions: getPolicyVersions(),
    dailyStates: getDailyCheckinStates()
  }
  if (!setItem(STORAGE_KEYS.recoveryTransaction, {
    status: 'committing',
    stagedAt: snapshot.stagedAt || Date.now()
  })) {
    return { success: false, reason: 'RECOVERY_TRANSACTION_MARKER_FAILED' }
  }

  const writes = [
    [STORAGE_KEYS.habits, snapshot.userHabits],
    [STORAGE_KEYS.policyVersions, snapshot.policyVersions],
    [STORAGE_KEYS.dailyStates, snapshot.dailyStates]
  ]
  const failedKey = writes.find(([key, value]) => !setItem(key, value))
  const verifyFailedKey = failedKey || writes.find(([key, value]) =>
    !isSameStoredValue(getItem(key), value)
  )

  if (verifyFailedKey) {
    const rollbackWrites = [
      [STORAGE_KEYS.habits, previous.userHabits],
      [STORAGE_KEYS.policyVersions, previous.policyVersions],
      [STORAGE_KEYS.dailyStates, previous.dailyStates]
    ]
    const rollbackResults = rollbackWrites.map(([key, value]) => setItem(key, value))
    const rollbackFailed = rollbackResults.some(result => !result)
    if (!rollbackFailed) {
      discardRecoverySnapshot()
    }
    return {
      success: false,
      reason: rollbackFailed ? 'RECOVERY_ROLLBACK_FAILED' : 'RECOVERY_COMMIT_FAILED',
      failedKey: verifyFailedKey[0]
    }
  }

  discardRecoverySnapshot()
  return { success: true }
}

function recoverInterruptedRecoveryTransaction() {
  const transaction = getItem(STORAGE_KEYS.recoveryTransaction)
  if (!transaction || (transaction.status !== 'staged' && transaction.status !== 'committing')) {
    return { success: true, recovered: false }
  }
  const result = commitRecoverySnapshot()
  return {
    ...result,
    recovered: Boolean(result.success)
  }
}

function replaceUserDataCacheFromRecoverySnapshot() {
  const commitResult = commitRecoverySnapshot()
  if (!commitResult.success) {
    return {
      success: false,
      cleared: false,
      reason: commitResult.reason,
      failedKeys: commitResult.failedKey ? [commitResult.failedKey] : []
    }
  }

  // 核心快照已经完整提交后再清理 legacy 展示缓存。身份、pending、
  // checkinOperations 和客户端序列号属于同步安全状态，清缓存也不得删除。
  const clearKeys = new Set([
    STORAGE_KEYS.logs,
    STORAGE_KEYS.allHabitsInfo,
    STORAGE_KEYS.operationLogs,
    STORAGE_KEYS.userStrategies,
    STORAGE_KEYS.checkinRecords,
    STORAGE_KEYS.migrationMeta,
    'allHabitIds',
    'DynamicThreeDayScenarioSummary'
  ].map(resolveStorageKey))
  getStorageKeys()
    .filter(isCurrentRuntimePhysicalKey)
    .filter(isPhase3BackupKey)
    .forEach(key => clearKeys.add(key))

  const removedKeys = []
  const failedKeys = []
  clearKeys.forEach(key => {
    try {
      wx.removeStorageSync(key)
      removedKeys.push(key)
    } catch (e) {
      failedKeys.push(key)
    }
  })
  return {
    success: true,
    cleared: true,
    removedKeys,
    failedKeys
  }
}

// ==================== Phase 3: Migration Meta ====================

function getMigrationMeta() {
  const meta = getItem(STORAGE_KEYS.migrationMeta)
  return asObject(meta)
}

function setMigrationMeta(meta) {
  return setItem(STORAGE_KEYS.migrationMeta, asObject(meta))
}

// ==================== Phase 3: MyHabits 迁移（幂等）====================

function normalizeToDateStr(dateStr) {
  if (!dateStr) return ''
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  return String(dateStr).split('T')[0]
}

function compareDateStr(a, b) {
  const dateA = normalizeToDateStr(a)
  const dateB = normalizeToDateStr(b)
  if (dateA < dateB) return -1
  if (dateA > dateB) return 1
  return 0
}

function backupMyHabitsForMigration() {
  const timestamp = Date.now()
  const backupKey = `MyHabits_backup_phase3_${timestamp}`
  setItem(backupKey, getMyHabits())
  return backupKey
}

function backupCheckinLogsForMigration() {
  const timestamp = Date.now()
  const backupKey = `CheckinLogs_backup_phase3_${timestamp}`
  setItem(backupKey, getCheckinLogs())
  return backupKey
}

function backupPolicyVersionsForMigration() {
  const timestamp = Date.now()
  const backupKey = `policyVersions_backup_phase3_${timestamp}`
  setItem(backupKey, getPolicyVersions())
  return backupKey
}

/**
 * 确保迁移已完成（幂等）
 * 首次调用时：备份 -> 迁移 -> 持久化写回 -> 更新 meta
 * 后续调用时：直接返回已迁移数据，不重复生成 ID
 */
function ensureMigrationCompleted() {
  const meta = getMigrationMeta()

  // 如果已完成，直接返回 false（不需要迁移）
  if (meta.status === 'completed') {
    return false
  }

  // === 首次迁移 ===

  // 1. 备份
  backupMyHabitsForMigration()
  backupCheckinLogsForMigration()
  backupPolicyVersionsForMigration()

  // 2. 获取原始数据
  const rawHabits = asArray(getItem(STORAGE_KEYS.habits))
  const rawLogs = asArray(getItem(STORAGE_KEYS.logs))

  // 3. 迁移 MyHabits
  const migratedHabits = rawHabits.map(habit => {
    if (habit.userHabitId) {
      // 已有 userHabitId，跳过（幂等）
      return {
        ...habit,
        addedAt: habit.addedAt || habit.added_at || null,
        pinnedAt: habit.pinnedAt || null
      }
    }
    const userHabitId = generateUserHabitId(habit.habitId)
    const now = new Date().toISOString()
    const status = habit.isDeleted ? 'deleted' : 'active'
    // 优先保留旧记录已有的 deletedAt，不要用迁移当天覆盖
    // 如果 isDeleted 但无 deletedAt，用 now；否则保留原始值
    const deletedAt = habit.isDeleted
      ? (habit.deletedAt || habit.deleted_at
        ? normalizeToDateStr(habit.deletedAt || habit.deleted_at)
        : normalizeToDateStr(now))
      : null
    return {
      ...habit,
      userHabitId,
      status,
      deletedAt,
      addedAt: habit.addedAt || habit.added_at || null,
      pinnedAt: habit.pinnedAt || null,
      latestPolicyVersionId: '',
      syncStatus: 1
    }
  })

  // 4. 持久化写回 MyHabits
  setItem(STORAGE_KEYS.habits, migratedHabits)

  // 5. 建立 userHabitInstances 映射
  const userHabitInstances = {}
  migratedHabits.forEach(habit => {
    if (habit.userHabitId) {
      userHabitInstances[habit.userHabitId] = {
        userHabitId: habit.userHabitId,
        habitId: habit.habitId,
        status: habit.status,
        createdAt: normalizeToDateStr(habit.createdAt),
        addedAt: habit.addedAt || null,
        deletedAt: habit.deletedAt || null,
        pinnedAt: habit.pinnedAt || null
      }
    }
  })

  // 6. 迁移 CheckinLogs（按生命周期区间映射）
  const migratedLogs = rawLogs.map(log => {
    if (log.userHabitId) {
      return log
    }
    return safeMapUserHabitId(log, { userHabitInstances })
  })

  // 7. 持久化写回 CheckinLogs
  setItem(STORAGE_KEYS.logs, migratedLogs)

  // 7.1 从旧 CheckinLogs 生成 dailyCheckinStates，报表和首页只读取最终状态
  const existingDailyStates = asArray(getItem(STORAGE_KEYS.dailyStates))
  const migratedDailyStates = mergeDailyStates(
    existingDailyStates,
    buildDailyStatesFromLegacyLogs(migratedLogs, migratedHabits, getPolicyVersions())
  )
  setItem(STORAGE_KEYS.dailyStates, migratedDailyStates)

  // 8. 更新 meta 并标记完成
  setMigrationMeta({
    migrationVersion: 1,
    migratedAt: new Date().toISOString(),
    userHabitInstances,
    status: 'completed'
  })

  return true
}

function getMyHabitsWithMigration() {
  ensureMigrationCompleted()
  return asArray(getItem(STORAGE_KEYS.habits))
}

function getCheckinLogsWithMigration() {
  ensureMigrationCompleted()
  return asArray(getItem(STORAGE_KEYS.logs))
}

// ==================== Phase 3: CheckinLogs 迁移（安全映射）====================

function safeMapUserHabitId(log, meta) {
  if (log.userHabitId) {
    return log
  }

  const { userHabitInstances } = meta
  const candidates = []

  for (const [uhId, instance] of Object.entries(userHabitInstances)) {
    if (String(instance.habitId) === String(log.habitId || log.habit_id)) {
      candidates.push({ uhId, instance })
    }
  }

  if (candidates.length === 0) {
    return { ...log, needRepair: true }
  }

  candidates.sort((a, b) =>
    compareDateStr(a.instance.createdAt, b.instance.createdAt)
  )

  const logDate = normalizeToDateStr(log.date)
  const validCandidates = candidates.filter(({ instance }) => {
    const createdAt = instance.createdAt
    const deletedAt = instance.deletedAt

    return compareDateStr(logDate, createdAt) >= 0 &&
      (deletedAt === null || compareDateStr(logDate, deletedAt) <= 0)
  })

  if (validCandidates.length === 1) {
    return { ...log, userHabitId: validCandidates[0].uhId }
  } else {
    return { ...log, needRepair: true }
  }
}

function getLegacyLogDate(log) {
  return normalizeToDateStr(log.date || log.checkin_date || log.checkinDate)
}

function getLegacyLogOrderTime(log) {
  return log.deleted_at ||
    log.deletedAt ||
    log.updatedAt ||
    log.updated_at ||
    log.createdAt ||
    log.created_at ||
    log.timestamp ||
    ''
}

function resolvePolicyVersionIdForDate(policyVersions, userHabitId, date) {
  const policies = asArray(policyVersions)
    .filter(pv => pv.userHabitId === userHabitId)
    .sort((a, b) => compareDateStr(a.effectiveStartDate || a.startDate, b.effectiveStartDate || b.startDate))

  const matched = policies.find(pv => {
    const start = pv.effectiveStartDate || pv.startDate
    const end = pv.effectiveEndDate
    if (!start || compareDateStr(date, start) < 0) return false
    return !end || compareDateStr(date, end) <= 0
  })

  return matched ? matched.policyVersionId : ''
}

function buildDailyStatesFromLegacyLogs(logs, habits, policyVersions) {
  const habitByUserHabitId = {}
  asArray(habits).forEach(habit => {
    if (habit.userHabitId) {
      habitByUserHabitId[habit.userHabitId] = habit
    }
  })

  const sortedLogs = asArray(logs)
    .filter(log => log && log.userHabitId && !log.needRepair && getLegacyLogDate(log))
    .slice()
    .sort((a, b) => String(getLegacyLogOrderTime(a)).localeCompare(String(getLegacyLogOrderTime(b))))

  const statesByKey = {}
  sortedLogs.forEach(log => {
    const date = getLegacyLogDate(log)
    const userHabitId = log.userHabitId
    const habit = habitByUserHabitId[userHabitId]
    const habitId = String(log.habitId || log.habit_id || habit?.habitId || '')
    if (!habitId) return

    const status = Number(log.sync_status) === 2 ? 'canceled' : 'checked'
    const now = new Date().toISOString()
    statesByKey[`${userHabitId}_${date}`] = {
      stateId: log.stateId || `state_legacy_${userHabitId}_${date}`,
      userHabitId,
      habitId,
      policyVersionId: log.policyVersionId || log.policy_version_id || resolvePolicyVersionIdForDate(policyVersions, userHabitId, date),
      date,
      status,
      checkedAt: status === 'checked' ? (log.created_at || log.createdAt || now) : null,
      canceledAt: status === 'canceled' ? (log.deleted_at || log.deletedAt || log.updatedAt || now) : null,
      lastOperationId: log.operationId || log.logId || `legacy_${userHabitId}_${date}_${status}`,
      syncStatus: Number(log.sync_status) === 0 ? 0 : 1,
      migratedFrom: 'CheckinLogs',
      updatedAt: now
    }
  })

  return Object.values(statesByKey)
}

function mergeDailyStates(existingStates, generatedStates) {
  const merged = {}
  asArray(generatedStates).forEach(state => {
    if (state.userHabitId && state.date) {
      merged[`${state.userHabitId}_${state.date}`] = state
    }
  })
  asArray(existingStates).forEach(state => {
    if (state.userHabitId && state.date) {
      merged[`${state.userHabitId}_${state.date}`] = state
    }
  })
  return Object.values(merged)
}

// ==================== Phase 3: PolicyVersions ====================

function getPolicyVersions() {
  return asArray(getItem(STORAGE_KEYS.policyVersions))
}

function setPolicyVersions(versions) {
  return setItem(STORAGE_KEYS.policyVersions, asArray(versions))
}

function getPolicyVersionsByUserHabitId(userHabitId) {
  return getPolicyVersions().filter(pv => pv.userHabitId === userHabitId)
}

function getActivePolicyVersion(userHabitId) {
  return getPolicyVersions().find(pv =>
    pv.userHabitId === userHabitId && pv.effectiveEndDate === null
  )
}

function savePolicyVersion(policyVersion) {
  const versions = getPolicyVersions()
  const index = versions.findIndex(pv =>
    pv.policyVersionId === policyVersion.policyVersionId
  )
  if (index >= 0) {
    versions[index] = policyVersion
  } else {
    versions.push(policyVersion)
  }
  return setPolicyVersions(versions)
}

function closePolicyVersion(policyVersionId, effectiveEndDate) {
  const versions = getPolicyVersions()
  const pv = versions.find(pv => pv.policyVersionId === policyVersionId)
  if (pv) {
    pv.effectiveEndDate = effectiveEndDate
    return setPolicyVersions(versions)
  }
  return false
}

// ==================== Phase 3: DailyCheckinStates ====================

function getDailyCheckinStates() {
  return asArray(getItem(STORAGE_KEYS.dailyStates))
}

function setDailyCheckinStates(states) {
  return setItem(STORAGE_KEYS.dailyStates, asArray(states))
}

function getDailyState(userHabitId, date) {
  const states = getDailyCheckinStates()
  return states.find(s => s.userHabitId === userHabitId && s.date === date) || null
}

function setDailyState(state) {
  const states = getDailyCheckinStates()
  const index = states.findIndex(s =>
    s.userHabitId === state.userHabitId && s.date === state.date
  )
  if (index >= 0) {
    states[index] = state
  } else {
    states.push(state)
  }
  return setDailyCheckinStates(states)
}

function getDailyStatesByDate(date) {
  return getDailyCheckinStates().filter(s => s.date === date)
}

function getDailyStatesByUserHabitId(userHabitId) {
  return getDailyCheckinStates().filter(s => s.userHabitId === userHabitId)
}

// ==================== Phase 3: CheckinOperations ====================

function getCheckinOperations() {
  return asArray(getItem(STORAGE_KEYS.checkinOperations))
}

function setCheckinOperations(operations) {
  return setItem(STORAGE_KEYS.checkinOperations, asArray(operations))
}

function getCheckinOperationsByUserHabitId(userHabitId) {
  return getCheckinOperations().filter(op => op.userHabitId === userHabitId)
}

function getCheckinOperationByIdempotencyKey(idempotencyKey) {
  return getCheckinOperations().find(op => op.idempotencyKey === idempotencyKey) || null
}

function saveCheckinOperation(operation) {
  const operations = getCheckinOperations()
  const existing = operations.find(op => op.idempotencyKey === operation.idempotencyKey)
  if (existing) {
    return existing
  }
  operations.push(operation)
  setCheckinOperations(operations)
  return operation
}

// ==================== Phase 4: PendingOperations ====================

function getPendingOperations() {
  return asArray(getItem(STORAGE_KEYS.pendingOperations))
}

function setPendingOperations(operations) {
  return setItem(STORAGE_KEYS.pendingOperations, asArray(operations))
}

function pushPending(item) {
  const queue = getPendingOperations()
  // append 入队（队尾），保证先发生的操作排在队列前面
  // 不使用 unshift（队首），避免同一毫秒操作导致逆序
  queue.push(item)
  return setPendingOperations(queue)
}

function updatePendingItem(queueId, updates) {
  const queue = getPendingOperations()
  const index = queue.findIndex(i => i.queueId === queueId)
  if (index >= 0) {
    queue[index] = { ...queue[index], ...updates }
    return setPendingOperations(queue)
  }
  return false
}

function removePendingItem(queueId) {
  const queue = getPendingOperations()
  const filtered = queue.filter(i => i.queueId !== queueId)
  return setPendingOperations(filtered)
}

// ==================== 客户端序列号计数器 ====================

/**
 * 获取并递增客户端序列号（持久化到 storage）
 * 保证跨重启单调递增
 * @returns {number} 下一个序列号
 */
function getNextClientSequence() {
  const current = getItem(STORAGE_KEYS.clientSequenceCounter) || 0
  const next = current + 1
  setItem(STORAGE_KEYS.clientSequenceCounter, next)
  return next
}

function getCoreDataCounts() {
  return {
    userHabits: getMyHabits().length,
    policyVersions: getPolicyVersions().length,
    dailyStates: getDailyCheckinStates().length
  }
}

module.exports = {
  configureRuntimeEnv,
  getRuntimeEnv,
  resolveStorageKey,

  // 基础读写
  getItem,
  setItem,
  getMyHabits,
  setMyHabits,
  getCheckinLogs,
  setCheckinLogs,
  getAllHabitsInfo,
  setAllHabitsInfo,
  getUserOpenid,
  setUserOpenid,
  getUserInfo,
  setUserInfo,
  removeItem,
  clear,
  clearUserDataCache,
  stageRecoverySnapshot,
  discardRecoverySnapshot,
  commitRecoverySnapshot,
  recoverInterruptedRecoveryTransaction,
  replaceUserDataCacheFromRecoverySnapshot,

  // Phase 3: Migration
  getMigrationMeta,
  setMigrationMeta,
  normalizeToDateStr,
  compareDateStr,
  backupMyHabitsForMigration,
  backupCheckinLogsForMigration,
  backupPolicyVersionsForMigration,
  ensureMigrationCompleted,
  safeMapUserHabitId,
  getMyHabitsWithMigration,
  getCheckinLogsWithMigration,

  // Phase 3: PolicyVersions
  getPolicyVersions,
  setPolicyVersions,
  getPolicyVersionsByUserHabitId,
  getActivePolicyVersion,
  savePolicyVersion,
  closePolicyVersion,

  // Phase 3: DailyCheckinStates
  getDailyCheckinStates,
  setDailyCheckinStates,
  getDailyState,
  setDailyState,
  getDailyStatesByDate,
  getDailyStatesByUserHabitId,

  // Phase 3: CheckinOperations
  getCheckinOperations,
  setCheckinOperations,
  getCheckinOperationsByUserHabitId,
  getCheckinOperationByIdempotencyKey,
  saveCheckinOperation,

  // Phase 4: PendingOperations
  getPendingOperations,
  setPendingOperations,
  pushPending,
  updatePendingItem,
  removePendingItem,

  // Phase 4: ClientSequence
  getNextClientSequence,
  getCoreDataCounts
}
