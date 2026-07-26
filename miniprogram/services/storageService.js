// services/storageService.js
// 所有本地缓存读写统一入口

const { STORAGE_KEYS } = require('../constants/storageKeys')
const { generateUserHabitId } = require('../constants/idPrefixes')

const CURRENT_CACHE_VERSION = 2
const CURRENT_MIGRATION_VERSION = 2

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getItem(key) {
  try {
    return wx.getStorageSync(key)
  } catch (e) {
    console.error(`storageService.getItem ${key} failed:`, e)
    return null
  }
}

function setItem(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error(`storageService.setItem ${key} failed:`, e)
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

function getDefaultCacheMeta() {
  return {
    cacheVersion: CURRENT_CACHE_VERSION,
    dataVersion: 0,
    reportVersion: 0,
    migrationVersion: CURRENT_MIGRATION_VERSION,
    ownerUserId: '',
    runtimeEnv: '',
    lastBusinessDate: '',
    lastSyncedAt: null,
    lastRecoveredAt: null,
    lastMigratedAt: null,
    readMode: 'current',
    dateConfidence: 'high'
  }
}

function getCacheMeta() {
  return {
    ...getDefaultCacheMeta(),
    ...asObject(getItem(STORAGE_KEYS.cacheMeta))
  }
}

function setCacheMeta(meta) {
  return setItem(STORAGE_KEYS.cacheMeta, {
    ...getDefaultCacheMeta(),
    ...asObject(meta)
  })
}

function patchCacheMeta(patch) {
  return setCacheMeta({
    ...getCacheMeta(),
    ...asObject(patch)
  })
}

function bumpDataVersions() {
  const meta = getCacheMeta()
  return setCacheMeta({
    ...meta,
    dataVersion: (Number(meta.dataVersion) || 0) + 1,
    reportVersion: (Number(meta.reportVersion) || 0) + 1
  })
}

function removeItem(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    console.error(`storageService.removeItem ${key} failed:`, e)
  }
}

function clear() {
  try {
    wx.clearStorageSync()
  } catch (e) {
    console.error('storageService.clear failed:', e)
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
  STORAGE_KEYS.clientSequenceCounter,
  'allHabitIds',
  'DynamicThreeDayScenarioSummary'
]

function quarantinePendingOperations(reason, identity = {}) {
  const pending = getPendingOperations()
  if (pending.length === 0) return []

  const existing = asArray(getItem(STORAGE_KEYS.pendingOperationsQuarantine))
  const quarantinedAt = new Date().toISOString()
  const quarantined = pending.map(item => ({
    ...item,
    quarantineReason: reason,
    quarantinedAt,
    expectedOwnerUserId: identity.ownerUserId || '',
    expectedRuntimeEnv: identity.runtimeEnv || ''
  }))
  setItem(STORAGE_KEYS.pendingOperationsQuarantine, [...existing, ...quarantined])
  setPendingOperations([])
  return quarantined
}

function claimUnownedPendingOperations(ownerUserId, runtimeEnv) {
  const queue = getPendingOperations()
  let changed = false
  const claimed = queue.map(item => {
    if (item.ownerUserId || item.runtimeEnv) return item
    changed = true
    return {
      ...item,
      ownerUserId,
      runtimeEnv,
      updatedAt: new Date().toISOString()
    }
  })
  if (changed) setPendingOperations(claimed)
  return changed
}

function bindCacheIdentity(ownerUserId, runtimeEnv) {
  const normalizedOwner = String(ownerUserId || '')
  const normalizedEnv = String(runtimeEnv || '')
  if (!normalizedOwner || !normalizedEnv) {
    return { success: false, reason: 'INVALID_CACHE_IDENTITY', changed: false }
  }

  const meta = getCacheMeta()
  const cachedUser = getUserInfo() || {}
  const previousOwner = meta.ownerUserId || cachedUser._userId || ''
  const previousEnv = meta.runtimeEnv || ''
  const mismatch = Boolean(
    (previousOwner && previousOwner !== normalizedOwner) ||
    (previousEnv && previousEnv !== normalizedEnv)
  )

  let quarantinedCount = 0
  if (mismatch) {
    quarantinedCount = quarantinePendingOperations('CACHE_IDENTITY_MISMATCH', {
      ownerUserId: normalizedOwner,
      runtimeEnv: normalizedEnv
    }).length
    clearUserDataCache()
  } else {
    claimUnownedPendingOperations(normalizedOwner, normalizedEnv)
  }

  setCacheMeta({
    ...(mismatch ? getDefaultCacheMeta() : meta),
    ownerUserId: normalizedOwner,
    runtimeEnv: normalizedEnv,
    cacheVersion: CURRENT_CACHE_VERSION,
    migrationVersion: CURRENT_MIGRATION_VERSION
  })
  return {
    success: true,
    changed: mismatch || previousOwner !== normalizedOwner || previousEnv !== normalizedEnv,
    mismatch,
    quarantinedCount
  }
}

function isPhase3BackupKey(key) {
  return /^MyHabits_backup_phase3_\d+$/.test(key) ||
    /^CheckinLogs_backup_phase3_\d+$/.test(key) ||
    /^policyVersions_backup_phase3_\d+$/.test(key)
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
  const keys = new Set(USER_DATA_CACHE_KEYS)
  getStorageKeys()
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
  return Boolean(snapshot && typeof snapshot === 'object' &&
    Array.isArray(snapshot.userHabits) &&
    Array.isArray(snapshot.policyVersions) &&
    Array.isArray(snapshot.dailyStates))
}

function stageRecoverySnapshot(snapshot) {
  if (!isRecoverySnapshot(snapshot)) return false
  return setItem(STORAGE_KEYS.recoveryStaging, {
    userHabits: snapshot.userHabits,
    policyVersions: snapshot.policyVersions,
    dailyStates: snapshot.dailyStates,
    stagedAt: Date.now()
  })
}

function discardRecoverySnapshot() {
  removeItem(STORAGE_KEYS.recoveryStaging)
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
  const writes = [
    [STORAGE_KEYS.habits, snapshot.userHabits],
    [STORAGE_KEYS.policyVersions, snapshot.policyVersions],
    [STORAGE_KEYS.dailyStates, snapshot.dailyStates]
  ]
  const failedKey = writes.find(([key, value]) => !setItem(key, value))

  if (failedKey) {
    setItem(STORAGE_KEYS.habits, previous.userHabits)
    setItem(STORAGE_KEYS.policyVersions, previous.policyVersions)
    setItem(STORAGE_KEYS.dailyStates, previous.dailyStates)
    return { success: false, reason: 'RECOVERY_COMMIT_FAILED', failedKey: failedKey[0] }
  }

  discardRecoverySnapshot()
  return { success: true }
}

function replaceUserDataCacheFromRecoverySnapshot() {
  const snapshot = getItem(STORAGE_KEYS.recoveryStaging)
  if (!isRecoverySnapshot(snapshot)) {
    return { success: false, cleared: false, reason: 'INVALID_RECOVERY_STAGING', failedKeys: [] }
  }

  const existingKeys = new Set(getStorageKeys())
  const keys = new Set(USER_DATA_CACHE_KEYS)
  // 安全恢复不等同于退出登录。保留已经验证过的本地用户资料，避免
  // 核心快照替换成功后还依赖一次新的网络登录才能恢复页面身份。
  keys.delete(STORAGE_KEYS.userInfo)
  getStorageKeys()
    .filter(isPhase3BackupKey)
    .forEach(key => keys.add(key))
  const backup = {}
  keys.forEach(key => {
    backup[key] = {
      exists: existingKeys.has(key),
      value: existingKeys.has(key) ? getItem(key) : undefined
    }
  })

  const failedKeys = []
  keys.forEach(key => {
    try {
      wx.removeStorageSync(key)
    } catch (e) {
      failedKeys.push(key)
    }
  })

  const writes = [
    [STORAGE_KEYS.habits, snapshot.userHabits],
    [STORAGE_KEYS.policyVersions, snapshot.policyVersions],
    [STORAGE_KEYS.dailyStates, snapshot.dailyStates]
  ]
  writes.forEach(([key, value]) => {
    if (!setItem(key, value)) failedKeys.push(key)
  })

  if (failedKeys.length > 0) {
    keys.forEach(key => {
      try {
        wx.removeStorageSync(key)
      } catch (e) {
        // 回滚尽力而为；最终失败键会返回给调用方。
      }
    })
    Object.entries(backup).forEach(([key, entry]) => {
      if (entry.exists && !setItem(key, entry.value)) {
        failedKeys.push(`rollback:${key}`)
      }
    })
    return {
      success: false,
      cleared: false,
      reason: 'RECOVERY_REPLACE_FAILED',
      failedKeys: Array.from(new Set(failedKeys))
    }
  }

  discardRecoverySnapshot()
  return {
    success: true,
    cleared: true,
    removedKeys: Array.from(keys),
    failedKeys: []
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

function updateCheckinOperation(operationId, updates) {
  const operations = getCheckinOperations()
  const index = operations.findIndex(op => op.operationId === operationId)
  if (index < 0) return false
  operations[index] = {
    ...operations[index],
    ...updates
  }
  return setCheckinOperations(operations)
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

module.exports = {
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
  getCacheMeta,
  setCacheMeta,
  patchCacheMeta,
  bumpDataVersions,
  bindCacheIdentity,
  claimUnownedPendingOperations,
  quarantinePendingOperations,
  removeItem,
  clear,
  clearUserDataCache,
  stageRecoverySnapshot,
  discardRecoverySnapshot,
  commitRecoverySnapshot,
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
  updateCheckinOperation,

  // Phase 4: PendingOperations
  getPendingOperations,
  setPendingOperations,
  pushPending,
  updatePendingItem,
  removePendingItem,

  // Phase 4: ClientSequence
  getNextClientSequence
}
