/**
 * services/habitService.js
 * 习惯服务层
 *
 * Phase 3A: 负责 userHabitId 生成、用户习惯实例 CRUD、策略版本管理
 * Phase 6B: 负责习惯列表展示模型构建、策略文本生成、日期计算辅助
 */

const { getBuiltInHabit, getAllBuiltInHabits, isValidBuiltInHabitId } = require('../constants/habitLibrary')
const { generateUserHabitId, generatePolicyVersionId } = require('../constants/idPrefixes')
const storageService = require('./storageService')
const timeService = require('./timeService')
const syncService = require('./syncService')

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

  // 7. 创建首个策略版本（skipSync=true，避免重复入队）
  const policyVersion = await createPolicyVersion(userHabitId, {
    duration,
    frequencyType,
    frequencyConfig,
    startDate
  }, { skipSync: true })

  // 8. 更新 latestPolicyVersionId
  userHabit.latestPolicyVersionId = policyVersion.policyVersionId
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index >= 0) {
    habits[index] = userHabit
    storageService.setMyHabits(habits)
  }

  // 9. 进入 pending 队列，等待云端同步（Phase 4）
  // 携带完整的 userHabit 和 policyVersion 数据，一次同步完成
  syncService.pushWithDedup('habit', 'addHabit', {
    userHabitId,
    habitId,
    policyVersionId: policyVersion.policyVersionId,
    duration: policyVersion.duration,
    frequencyType: policyVersion.frequencyType,
    frequencyConfig: policyVersion.frequencyConfig,
    startDate: policyVersion.startDate
  })

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

  const businessDate = timeService.getBusinessDate()

  // 更新为 deleted 状态
  habit.status = 'deleted'
  habit.deletedAt = businessDate

  storageService.setMyHabits(habits)

  // 关闭当前策略版本
  const policy = storageService.getActivePolicyVersion(userHabitId)
  if (policy) {
    storageService.closePolicyVersion(policy.policyVersionId, businessDate)
  }

  // 更新 migrationMeta
  const meta = storageService.getMigrationMeta()
  if (meta.userHabitInstances && meta.userHabitInstances[userHabitId]) {
    meta.userHabitInstances[userHabitId].status = 'deleted'
    meta.userHabitInstances[userHabitId].deletedAt = habit.deletedAt
    storageService.setMigrationMeta(meta)
  }

  // 进入 pending 队列，等待云端同步（Phase 4）
  // 携带 deletedAt（本地业务日期），云端使用此日期而非同步当天
  syncService.pushWithDedup('habit', 'deleteHabit', {
    userHabitId,
    habitId: habit.habitId,
    deletedAt: habit.deletedAt
  })

  return true
}

// ==================== 策略版本 ====================

/**
 * 创建新策略版本（关闭旧版本）
 * @param {string} userHabitId
 * @param {object} policyInput
 * @param {object} options - { skipSync?: boolean } 跳过 syncService 入队（addHabit 内部调用时使用）
 * @returns {Promise<PolicyVersion>}
 */
async function createPolicyVersion(userHabitId, policyInput, options = {}) {
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

  // 5. 进入 pending 队列，等待云端同步（Phase 4）
  // skipSync 用于 addHabit 内部调用（避免重复入队）
  // payload 携带完整 policyVersion 数据，供云端重建 habit_policy_versions
  // previousPolicyVersionId 用于云端关闭旧版本
  if (!options.skipSync) {
    const previousPolicy = currentPolicy
    syncService.pushWithDedup('habit', 'updatePolicy', {
      userHabitId,
      habitId: habit.habitId,
      policyVersionId: newPolicy.policyVersionId,
      duration: newPolicy.duration,
      frequencyType: newPolicy.frequencyType,
      frequencyConfig: newPolicy.frequencyConfig,
      startDate: newPolicy.startDate,
      effectiveStartDate: newPolicy.effectiveStartDate,
      previousPolicyVersionId: previousPolicy ? previousPolicy.policyVersionId : null,
      previousEffectiveEndDate: previousPolicy ? startDate : null
    })
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
      name: getBuiltInHabitDef(habit.habitId)?.name || '',
      category: getBuiltInHabitDef(habit.habitId)?.category || '',
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

// ==================== Phase 6B 展示辅助 ====================

/**
 * 构建策略显示文本
 * @param {Object} strategy - 策略对象
 * @returns {string}
 */
function buildStrategyText(strategy) {
  const { freq_type, freq_rules, freq_category } = strategy

  // 间隔打卡
  if (freq_type === 'interval') {
    const interval = freq_rules || 1
    return `每${interval + 1}天`
  }

  // 每天或按天间隔（legacy：freq_category 为 daily-interval 但 freq_type 被保存为 daily）
  if (freq_category === 'daily-interval' || freq_type === 'daily') {
    if (freq_rules && freq_rules > 1) {
      return `每${freq_rules + 1}天`
    }
    return '每天'
  }

  // 每周固定
  if (freq_category === 'weekly' || freq_type === 'weekly') {
    if (freq_rules && freq_rules.length > 0) {
      const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日']
      const days = freq_rules.map(d => weekdayNames[d]).join('、')
      return `每周${days}`
    }
    return '每周'
  }

  return '每天'
}

/**
 * 构建策略对象（供习惯添加/编辑使用）
 * @param {string} userHabitId - 习惯实例ID
 * @param {Object} policyInput - 策略输入（来自页面 picker 等）
 * @param {Object} options - 额外选项 { habitTitle, category }
 * @returns {Object}
 */
function buildStrategyObject(userHabitId, policyInput, options = {}) {
  const freqType = policyInput.frequencyType || 'daily'
  const freqRules = policyInput.frequencyConfig || { intervalDays: 1 }
  const freqCategory = freqType === 'weekly' ? 'weekly'
    : (freqRules > 1 ? 'daily-interval' : 'everyday')

  return {
    habit_id: userHabitId,
    habit_title: options.habitTitle || '',
    category: options.category || '',
    duration: policyInput.duration,
    freq_type: freqType,
    freq_rules: freqRules,
    freq_category: freqCategory,
    plan_start_date: policyInput.startDate
  }
}

/**
 * 构建习惯列表展示模型（Phase 6B）
 * 将内置习惯列表转换为带策略状态的展示列表
 * @param {Array} builtInHabits - 内置习惯定义列表（来自页面 hardcoded）
 * @returns {Array} - 带策略状态的展示列表
 */
function buildHabitDisplayList(builtInHabits) {
  const activeUserHabits = getActiveUserHabits()

  // 构建 habitId -> userHabit 映射
  const userHabitMap = {}
  activeUserHabits.forEach(uh => {
    userHabitMap[uh.habitId] = uh
  })

  return builtInHabits.map(habit => {
    const habitId = String(habit._id)
    const userHabit = userHabitMap[habitId]

    if (!userHabit) {
      return {
        ...habit,
        hasStrategy: false
      }
    }

    const policy = getActivePolicyVersion(userHabit.userHabitId)
    const freqType = policy ? policy.frequencyType : 'daily'
    const freqRules = policy
      ? (policy.frequencyType === 'weekly' ? policy.frequencyConfig.weekdays : policy.frequencyConfig.intervalDays)
      : 1
    const duration = policy ? policy.duration : (habit.default_duration || 20)

    const strategy = buildStrategyObject(userHabit.userHabitId, {
      duration,
      frequencyType: freqType,
      frequencyConfig: freqRules,
      startDate: policy ? policy.startDate : ''
    }, {
      habitTitle: habit.title,
      category: habit.category
    })

    const freqText = buildStrategyText({
      freq_type: freqType,
      freq_rules: freqRules,
      freq_category: freqType === 'weekly' ? 'weekly' : (freqRules > 1 ? 'daily-interval' : 'everyday')
    })
    const strategyText = `${freqText} · ${duration}分钟`

    return {
      ...habit,
      hasStrategy: true,
      createdAt: userHabit.createdAt,
      strategy,
      strategyText
    }
  })
}

/**
 * 获取今天的日期字符串（支持模拟日期）
 * @param {Object} app - 可选，微信小程序 app 对象，用于支持 DEBUG_DAY_OFFSET
 * @returns {string} YYYY-MM-DD
 */
function getTodayDateStr(app) {
  return timeService.getSimulatedDateStr(app || null)
}

/**
 * 获取偏移日期字符串
 * @param {number} days - 偏移天数
 * @param {Object} app - 可选，微信小程序 app 对象
 * @returns {string} YYYY-MM-DD
 */
function getOffsetDateStr(days, app) {
  return timeService.addDays(timeService.getSimulatedDateStr(app || null), days)
}

/**
 * 获取下个星期一的日期字符串
 * @param {Object} app - 可选，微信小程序 app 对象
 * @returns {string} YYYY-MM-DD
 */
function getNextMondayStr(app) {
  const today = timeService.parseDate(timeService.getSimulatedDateStr(app || null))
  const dayOfWeek = today.getUTCDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  return timeService.addDays(timeService.getSimulatedDateStr(app || null), daysUntilMonday)
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
  runMigration,

  // Phase 6B 展示辅助
  buildStrategyText,
  buildStrategyObject,
  buildHabitDisplayList,
  getTodayDateStr,
  getOffsetDateStr,
  getNextMondayStr
}