// services/storageService.js
// 所有本地缓存读写统一入口

const { STORAGE_KEYS } = require('../constants/storageKeys')
const { generateUserHabitId } = require('../constants/idPrefixes')

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

function getUserOpenid() {
  return getItem(STORAGE_KEYS.userOpenid)
}

function setUserOpenid(openid) {
  return setItem(STORAGE_KEYS.userOpenid, openid)
}

function getUserInfo() {
  return getItem(STORAGE_KEYS.userInfo)
}

function setUserInfo(info) {
  return setItem(STORAGE_KEYS.userInfo, info)
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
      return habit
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
        deletedAt: habit.deletedAt || null
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
    if (instance.habitId === log.habitId) {
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
      (deletedAt === null || compareDateStr(logDate, deletedAt) < 0)
  })

  if (validCandidates.length === 1) {
    return { ...log, userHabitId: validCandidates[0].uhId }
  } else {
    return { ...log, needRepair: true }
  }
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
  queue.unshift(item) // 新操作插入队首
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
  removeItem,
  clear,

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
  removePendingItem
}