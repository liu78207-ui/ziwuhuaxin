/**
 * services/habitService.js
 * 习惯服务层
 *
 * Phase 3A: 负责 userHabitId 生成、用户习惯实例 CRUD、策略版本管理
 */

const { getBuiltInHabit, getAllBuiltInHabits, isValidBuiltInHabitId } = require('../constants/habitLibrary')
const { generateUserHabitId, generatePolicyVersionId } = require('../constants/idPrefixes')
const storageService = require('./storageService')
const timeService = require('./timeService')

// ==================== 内置习惯 ====================

/**
 * 获取所有内置习惯（21个固定定义）
 * @returns {BuiltInHabit[]}
 */
function getBuiltInHabits() {
  return getAllBuiltInHabits()
}

/**
 * 获取单个内置习惯定义
 * @param {string} habitId
 * @returns {BuiltInHabit|null}
 */
function getBuiltInHabitDef(habitId) {
  return getBuiltInHabit(habitId)
}

// ==================== 用户习惯实例 CRUD ====================

/**
 * 添加习惯（生成新 userHabitId，创建首个策略版本）
 * @param {string} habitId - 内置习惯 ID
 * @param {object} policyInput - 策略配置 { duration, frequencyType, frequencyConfig, startDate }
 * @returns {Promise<UserHabit>} 新增的用户习惯实例
 */
async function addHabit(habitId, policyInput) {
  // 1. 校验 habitId
  if (!isValidBuiltInHabitId(habitId)) {
    throw new Error(`Invalid habitId: ${habitId}`)
  }

  // 2. 校验 policyInput
  const duration = policyInput.duration || 20
  const frequencyType = policyInput.frequencyType || 'daily'
  const frequencyConfig = policyInput.frequencyConfig || { intervalDays: 1 }
  const startDate = policyInput.startDate || timeService.getBusinessDate()

  // 3. 生成新的 userHabitId（不复用已删除的）
  const userHabitId = generateUserHabitId(habitId)
  const now = new Date().toISOString()
  const businessDate = timeService.getBusinessDate()

  // 4. 创建 UserHabit 对象
  const userHabit = {
    userHabitId,
    habitId,
    status: 'active',
    createdAt: businessDate,
    deletedAt: null,
    latestPolicyVersionId: '',
    syncStatus: 1
  }

  // 5. 保存到 storage（触发迁移补齐其他字段）
  const existingHabits = storageService.getMyHabitsWithMigration()
  existingHabits.push(userHabit)
  storageService.setMyHabits(existingHabits)

  // 6. 更新 migrationMeta
  const meta = storageService.getMigrationMeta()
  if (!meta.userHabitInstances) {
    meta.userHabitInstances = {}
  }
  meta.userHabitInstances[userHabitId] = {
    userHabitId,
    habitId,
    status: 'active',
    createdAt: businessDate,
    deletedAt: null
  }
  storageService.setMigrationMeta(meta)

  // 7. 创建首个策略版本
  const policyVersion = await createPolicyVersion(userHabitId, {
    duration,
    frequencyType,
    frequencyConfig,
    startDate
  })

  // 8. 更新 latestPolicyVersionId
  userHabit.latestPolicyVersionId = policyVersion.policyVersionId
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index >= 0) {
    habits[index] = userHabit
    storageService.setMyHabits(habits)
  }

  return userHabit
}

/**
 * 获取所有活跃用户习惯实例
 * @returns {UserHabit[]}
 */
function getActiveUserHabits() {
  const habits = storageService.getMyHabitsWithMigration()
  return habits.filter(h => h.status === 'active')
}

/**
 * 获取用户习惯实例（按 userHabitId）
 * @param {string} userHabitId
 * @returns {UserHabit|null}
 */
function getHabitByUserHabitId(userHabitId) {
  const habits = storageService.getMyHabitsWithMigration()
  return habits.find(h => h.userHabitId === userHabitId) || null
}

/**
 * 获取用户习惯实例（按 habitId，含已删除）
 * @param {string} habitId
 * @returns {UserHabit[]}
 */
function getHabitsByHabitId(habitId) {
  const habits = storageService.getMyHabitsWithMigration()
  return habits.filter(h => h.habitId === habitId)
}

/**
 * 软删除用户习惯实例
 * @param {string} userHabitId
 * @returns {Promise<boolean>}
 */
async function softDeleteHabit(userHabitId) {
  const habits = storageService.getMyHabitsWithMigration()
  const habit = habits.find(h => h.userHabitId === userHabitId)

  if (!habit) {
    return false
  }

  // 更新为 deleted 状态
  habit.status = 'deleted'
  habit.deletedAt = new Date().toISOString().split('T')[0]

  storageService.setMyHabits(habits)

  // 关闭当前策略版本
  const policy = storageService.getActivePolicyVersion(userHabitId)
  if (policy) {
    const businessDate = timeService.getBusinessDate()
    storageService.closePolicyVersion(policy.policyVersionId, businessDate)
  }

  // 更新 migrationMeta
  const meta = storageService.getMigrationMeta()
  if (meta.userHabitInstances && meta.userHabitInstances[userHabitId]) {
    meta.userHabitInstances[userHabitId].status = 'deleted'
    meta.userHabitInstances[userHabitId].deletedAt = habit.deletedAt
    storageService.setMigrationMeta(meta)
  }

  return true
}

// ==================== 策略版本 ====================

/**
 * 创建新策略版本（关闭旧版本）
 * @param {string} userHabitId
 * @param {object} policyInput
 * @returns {Promise<PolicyVersion>}
 */
async function createPolicyVersion(userHabitId, policyInput) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }

  const duration = policyInput.duration || 20
  const frequencyType = policyInput.frequencyType || 'daily'
  const frequencyConfig = policyInput.frequencyConfig || { intervalDays: 1 }
  const startDate = policyInput.startDate || timeService.getBusinessDate()

  // 1. 查找当前有效策略版本，关闭旧版本
  const currentPolicy = storageService.getActivePolicyVersion(userHabitId)
  if (currentPolicy) {
    storageService.closePolicyVersion(currentPolicy.policyVersionId, startDate)
  }

  // 2. 创建新版本
  const policyVersionId = generatePolicyVersionId(habit.habitId)
  const businessDate = timeService.getBusinessDate()

  const newPolicy = {
    policyVersionId,
    userHabitId,
    habitId: habit.habitId,
    duration,
    frequencyType,
    frequencyConfig,
    startDate,
    effectiveStartDate: startDate,
    effectiveEndDate: null,
    createdAt: businessDate,
    updatedAt: businessDate,
    syncStatus: 1
  }

  // 3. 保存
  storageService.savePolicyVersion(newPolicy)

  // 4. 更新 UserHabit.latestPolicyVersionId
  habit.latestPolicyVersionId = policyVersionId
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index >= 0) {
    habits[index] = habit
    storageService.setMyHabits(habits)
  }

  return newPolicy
}

/**
 * 获取用户习惯实例的当前有效策略版本
 * @param {string} userHabitId
 * @returns {PolicyVersion|null}
 */
function getActivePolicyVersion(userHabitId) {
  return storageService.getActivePolicyVersion(userHabitId)
}

/**
 * 获取用户习惯实例的所有策略版本
 * @param {string} userHabitId
 * @returns {PolicyVersion[]}
 */
function getPolicyVersionsByUserHabitId(userHabitId) {
  return storageService.getPolicyVersionsByUserHabitId(userHabitId)
}

/**
 * 关闭策略版本
 * @param {string} policyVersionId
 * @param {string} effectiveEndDate
 */
function closePolicyVersion(policyVersionId, effectiveEndDate) {
  storageService.closePolicyVersion(policyVersionId, effectiveEndDate)
}

// ==================== 今日习惯 ====================

/**
 * 获取今日应修习惯列表
 * @param {string} date - 业务日期 YYYY-MM-DD
 * @returns {Promise<TodayHabit[]>}
 */
async function getTodayHabits(date) {
  const activeHabits = getActiveUserHabits()
  const states = storageService.getDailyStatesByDate(date)

  return activeHabits.map(habit => {
    const policy = storageService.getActivePolicyVersion(habit.userHabitId)
    const state = states.find(s => s.userHabitId === habit.userHabitId)

    return {
      userHabitId: habit.userHabitId,
      habitId: habit.habitId,
      name: habit.name || getBuiltInHabitDef(habit.habitId)?.name || '',
      category: habit.category || '',
      duration: habit.targetMinutes || policy?.duration || 20,
      policy,
      isChecked: state && state.status === 'checked',
      stateId: state ? state.stateId : null,
      status: habit.status,
      createdAt: habit.createdAt
    }
  })
}

// ==================== 迁移辅助 ====================

/**
 * 获取迁移元数据
 */
function getMigrationMeta() {
  return storageService.getMigrationMeta()
}

/**
 * 执行完整迁移（供外部调用）
 */
async function runMigration() {
  // 1. 备份
  const habitsBackup = storageService.backupMyHabitsForMigration()
  const logsBackup = storageService.backupCheckinLogsForMigration()
  const versionsBackup = storageService.backupPolicyVersionsForMigration()

  // 2. 触发迁移读取
  storageService.getMyHabitsWithMigration()
  storageService.getCheckinLogsWithMigration()

  return {
    habitsBackup,
    logsBackup,
    versionsBackup
  }
}

module.exports = {
  // 内置习惯
  getBuiltInHabits,
  getBuiltInHabitDef,

  // userHabitId
  generateUserHabitId,

  // 用户习惯实例
  addHabit,
  getActiveUserHabits,
  getHabitByUserHabitId,
  getHabitsByHabitId,
  softDeleteHabit,

  // 策略版本
  createPolicyVersion,
  getActivePolicyVersion,
  getPolicyVersionsByUserHabitId,
  closePolicyVersion,

  // 今日习惯
  getTodayHabits,

  // 迁移
  getMigrationMeta,
  runMigration
}