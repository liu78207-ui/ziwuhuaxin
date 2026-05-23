// services/storageService.js
// 所有本地缓存读写统一入口

const { STORAGE_KEYS } = require('../constants/storageKeys')
const { generateUserHabitId } = require('../constants/idPrefixes')
const timeService = require('./timeService')

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

/**
 * 迁移时备份 MyHabits
 */
function backupMyHabitsForMigration() {
  const timestamp = Date.now()
  const backupKey = `MyHabits_backup_phase3_${timestamp}`
  const habits = getMyHabits()
  setItem(backupKey, habits)
  return backupKey
}

/**
 * 将业务日期字符串转换为 YYYY-MM-DD 格式
 * @param {string} dateStr
 * @returns {string}
 */
function normalizeToDateStr(dateStr) {
  if (!dateStr) return ''
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  return String(dateStr).split('T')[0]
}

/**
 * 安全的字符串日期比较（仅比较 YYYY-MM-DD）
 */
function compareDateStr(a, b) {
  const dateA = normalizeToDateStr(a)
  const dateB = normalizeToDateStr(b)
  if (dateA < dateB) return -1
  if (dateA > dateB) return 1
  return 0
}

/**
 * 获取 MyHabits（带渐进迁移）
 * 已迁移记录（有 userHabitId）不重新生成 ID
 */
function getMyHabitsWithMigration() {
  const habits = asArray(getItem(STORAGE_KEYS.habits))
  const meta = getMigrationMeta()

  // 检查是否已迁移（meta 有 userHabitInstances 且有数据）
  const hasMigrationData = meta && meta.userHabitInstances &&
    Object.keys(meta.userHabitInstances).length > 0

  // 如果没有迁移数据，先初始化 meta
  if (!hasMigrationData) {
    // 初始化空的 migrationMeta（用于记录后续迁移）
    if (Object.keys(meta || {}).length === 0) {
      setMigrationMeta({
        migrationVersion: 1,
        migratedAt: null,
        userHabitInstances: {},
        status: 'pending'
      })
    }
  }

  return habits.map(habit => {
    if (!habit.userHabitId) {
      // 生成新的 userHabitId
      const userHabitId = generateUserHabitId(habit.habitId)
      const now = new Date().toISOString()
      const status = habit.isDeleted ? 'deleted' : 'active'

      const migratedHabit = {
        ...habit,
        userHabitId,
        status,
        deletedAt: habit.isDeleted ? now : null,
        latestPolicyVersionId: '',
        syncStatus: 1
      }

      // 更新 migrationMeta
      const currentMeta = getMigrationMeta()
      if (!currentMeta.userHabitInstances) {
        currentMeta.userHabitInstances = {}
      }
      currentMeta.userHabitInstances[userHabitId] = {
        userHabitId,
        habitId: habit.habitId,
        status,
        createdAt: normalizeToDateStr(habit.createdAt),
        deletedAt: habit.isDeleted ? normalizeToDateStr(now) : null
      }
      setMigrationMeta(currentMeta)

      return migratedHabit
    }
    return habit
  })
}

// ==================== Phase 3: CheckinLogs 迁移（安全映射）====================

/**
 * 迁移时备份 CheckinLogs
 */
function backupCheckinLogsForMigration() {
  const timestamp = Date.now()
  const backupKey = `CheckinLogs_backup_phase3_${timestamp}`
  const logs = getCheckinLogs()
  setItem(backupKey, logs)
  return backupKey
}

/**
 * 安全映射 CheckinLog 到 userHabitId
 * 基于实例生命周期区间：[createdAt, deletedAt)
 */
function safeMapUserHabitId(log, meta) {
  if (log.userHabitId) {
    return log
  }

  const { userHabitInstances } = meta

  // 收集所有命中该 habitId 的实例
  const candidates = []
  for (const [uhId, instance] of Object.entries(userHabitInstances)) {
    if (instance.habitId !== log.habitId) continue
    candidates.push({ uhId, instance })
  }

  if (candidates.length === 0) {
    return { ...log, needRepair: true }
  }

  // 按 createdAt 排序
  candidates.sort((a, b) =>
    compareDateStr(a.instance.createdAt, b.instance.createdAt)
  )

  // 精确区间匹配：log.date 必须在 [createdAt, deletedAt) 区间内
  const logDate = normalizeToDateStr(log.date)
  const validCandidates = candidates.filter(({ instance }) => {
    const createdAt = instance.createdAt
    const deletedAt = instance.deletedAt // null 表示 active

    // log.date >= createdAt 且（deletedAt 为 null 或 log.date < deletedAt）
    return compareDateStr(logDate, createdAt) >= 0 &&
      (deletedAt === null || compareDateStr(logDate, deletedAt) < 0)
  })

  if (validCandidates.length === 1) {
    return { ...log, userHabitId: validCandidates[0].uhId }
  } else {
    // 没有唯一匹配（0个或多个），标记 needRepair
    return { ...log, needRepair: true }
  }
}

/**
 * 获取 CheckinLogs（带渐进迁移）
 */
function getCheckinLogsWithMigration() {
  const logs = asArray(getItem(STORAGE_KEYS.logs))
  const meta = getMigrationMeta()

  if (!meta || !meta.userHabitInstances ||
    Object.keys(meta.userHabitInstances).length === 0) {
    return logs
  }

  return logs.map(log => safeMapUserHabitId(log, meta))
}

// ==================== Phase 3: PolicyVersions ====================

function getPolicyVersions() {
  return asArray(getItem(STORAGE_KEYS.policyVersions))
}

function setPolicyVersions(versions) {
  return setItem(STORAGE_KEYS.policyVersions, asArray(versions))
}

/**
 * 迁移时备份 PolicyVersions
 */
function backupPolicyVersionsForMigration() {
  const timestamp = Date.now()
  const backupKey = `policyVersions_backup_phase3_${timestamp}`
  const versions = getPolicyVersions()
  setItem(backupKey, versions)
  return backupKey
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
  const states = getDailyCheckinStates()
  return states.filter(s => s.date === date)
}

function getDailyStatesByUserHabitId(userHabitId) {
  const states = getDailyCheckinStates()
  return states.filter(s => s.userHabitId === userHabitId)
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
  // 检查是否已存在（幂等）
  const existing = operations.find(op => op.idempotencyKey === operation.idempotencyKey)
  if (existing) {
    return existing
  }
  operations.push(operation)
  setCheckinOperations(operations)
  return operation
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
  backupMyHabitsForMigration,
  backupCheckinLogsForMigration,
  normalizeToDateStr,
  compareDateStr,
  getMyHabitsWithMigration,
  getCheckinLogsWithMigration,

  // Phase 3: PolicyVersions
  getPolicyVersions,
  setPolicyVersions,
  backupPolicyVersionsForMigration,
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
  saveCheckinOperation
}