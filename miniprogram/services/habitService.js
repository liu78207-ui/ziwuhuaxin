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
const eventBus = require('./eventBus')
const reportAggregator = require('./reportAggregator')
const { DAILY_STATE_STATUS, createDailyCheckinState } = require('../models/dailyCheckinState')

function schedulePendingAfterLocalWrite() {
  if (typeof syncService.requestProcessQueue === 'function') {
    syncService.requestProcessQueue()
    return
  }
  if (typeof syncService.processQueue !== 'function') return
  try {
    syncService.processQueue().catch(e => {
      console.warn('habitService flush pending failed:', e && e.message ? e.message : String(e || 'unknown error'))
    })
  } catch (e) {
    console.warn('habitService flush pending failed:', e && e.message ? e.message : String(e || 'unknown error'))
  }
}

function emitHabitUpdated(action, payload = {}) {
  eventBus.emit('habit:updated', {
    action,
    userHabitId: payload.userHabitId || '',
    habitId: payload.habitId || '',
    policyVersionId: payload.policyVersionId || '',
    date: payload.date || timeService.getBusinessDate()
  })
  eventBus.emit('report:updated', {
    source: 'habit',
    action,
    userHabitId: payload.userHabitId || '',
    habitId: payload.habitId || '',
    date: payload.date || timeService.getBusinessDate()
  })
}

// ==================== 内置习惯 ====================

/**
 * 获取所有内置习惯（25个固定定义）
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
    latestPolicyVersionId: ''
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
    createdAt: userHabit.createdAt,
    policyVersionId: policyVersion.policyVersionId,
    duration: policyVersion.duration,
    frequencyType: policyVersion.frequencyType,
    frequencyConfig: policyVersion.frequencyConfig,
    startDate: policyVersion.startDate
  })
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('addHabit', {
    userHabitId,
    habitId,
    policyVersionId: policyVersion.policyVersionId,
    date: startDate
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
  const deletionDailyState = markDeletionToday(userHabitId, businessDate)

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
    deletedAt: habit.deletedAt,
    deletionDailyState
  })
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('deleteHabit', {
    userHabitId,
    habitId: habit.habitId,
    policyVersionId: habit.latestPolicyVersionId,
    date: habit.deletedAt
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
    updatedAt: businessDate
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
    schedulePendingAfterLocalWrite()
    emitHabitUpdated('updatePolicy', {
      userHabitId,
      habitId: habit.habitId,
      policyVersionId: newPolicy.policyVersionId,
      date: newPolicy.effectiveStartDate
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
 * 更新用户习惯的策略
 *
 * 复用现有 userHabitId，关闭当前有效策略版本并创建新版本。
 * 适用于「修习」页面修改策略的场景。
 *
 * @param {string} userHabitId - 必须已存在的 userHabitId
 * @param {object} policyInput - 策略配置 { duration, frequencyType, frequencyConfig, startDate }
 * @returns {Promise<UserHabit>} 更新后的 userHabit
 */
async function updateHabitPolicy(userHabitId, policyInput) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }
  if (habit.status !== 'active') {
    throw new Error(`UserHabit is not active: ${userHabitId}`)
  }

  const previousPolicy = storageService.getActivePolicyVersion(userHabitId)

  // 复用 createPolicyVersion：它会关闭旧版本并创建新版本。
  // updateHabitPolicy 自己入队，才能携带策略修改当天的 dailyState 锁定字段。
  const policyVersion = await createPolicyVersion(userHabitId, policyInput, { skipSync: true })
  const strategyChangedDailyState = markStrategyChangedToday(
    userHabitId,
    timeService.getBusinessDate(),
    policyVersion.policyVersionId
  )

  syncService.pushWithDedup('habit', 'updatePolicy', {
    userHabitId,
    habitId: habit.habitId,
    policyVersionId: policyVersion.policyVersionId,
    duration: policyVersion.duration,
    frequencyType: policyVersion.frequencyType,
    frequencyConfig: policyVersion.frequencyConfig,
    startDate: policyVersion.startDate,
    effectiveStartDate: policyVersion.effectiveStartDate,
    previousPolicyVersionId: previousPolicy ? previousPolicy.policyVersionId : null,
    previousEffectiveEndDate: previousPolicy ? policyVersion.effectiveStartDate : null,
    strategyChangedDailyState
  })
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('updatePolicy', {
    userHabitId,
    habitId: habit.habitId,
    policyVersionId: policyVersion.policyVersionId,
    date: policyVersion.effectiveStartDate
  })

  // 重新读取 userHabit（latestPolicyVersionId 已被 createPolicyVersion 更新）
  return getHabitByUserHabitId(userHabitId)
}

function resolveStrategyChangeLockedReason(status) {
  return status === DAILY_STATE_STATUS.checked
    ? 'strategy_changed_after_checkin'
    : 'strategy_changed_without_checkin'
}

function markStrategyChangedToday(userHabitId, date, policyVersionId) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit || !date) return null

  const existingState = storageService.getDailyState(userHabitId, date)
  const status = existingState?.status || DAILY_STATE_STATUS.unchecked
  const baseState = existingState || createDailyCheckinState({
    userHabitId,
    habitId: habit.habitId,
    date,
    status
  })

  const state = {
    ...baseState,
    status,
    policyVersionId,
    hasPolicyChangedToday: true,
    lockReason: resolveStrategyChangeLockedReason(status),
    updatedAt: new Date().toISOString()
  }

  storageService.setDailyState(state)
  return state
}

function resolveDeletionLockedReason(status) {
  return status === DAILY_STATE_STATUS.checked
    ? 'deleted_after_checkin'
    : 'deleted_without_checkin'
}

function markDeletionToday(userHabitId, date) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit || !date) return null

  const existingState = storageService.getDailyState(userHabitId, date)
  const finalStatus = existingState?.status === DAILY_STATE_STATUS.checked
    ? DAILY_STATE_STATUS.checked
    : DAILY_STATE_STATUS.not_required
  const lockReason = resolveDeletionLockedReason(finalStatus)
  const baseState = existingState || createDailyCheckinState({
    userHabitId,
    habitId: habit.habitId,
    date,
    status: finalStatus
  })

  const state = {
    ...baseState,
    status: finalStatus,
    policyVersionId: habit.latestPolicyVersionId || baseState.policyVersionId || '',
    hasDeletionToday: true,
    isLocked: true,
    lockReason,
    updatedAt: new Date().toISOString()
  }

  storageService.setDailyState(state)
  return state
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
 *
 * 过滤规则（与观心页 isDueOnDateByFrequency 完全统一）：
 * 1. 仅 status === 'active' 的 userHabit。
 * 2. 必须存在 effectiveEndDate === null 的最新版策略（不存在则视为未来，跳过）。
 * 3. 策略 effectiveStartDate <= date 视为今日有效；否则视为未来策略，不展示。
 * 4. 同一 userHabit 的多个策略版本只考虑最新版（effectiveEndDate === null）。
 * 5. 今日必须为该策略的应修日（基于频率规则：daily / weekly / interval），
 *    调用 reportAggregator.isDueOnDateByFrequency。
 *    这是关键：与观心页的应修裁决共用同一函数，避免出现「案台显示但观心不计分」
 *    或「观心应修但案台不显示」的不一致。
 *
 * @param {string} date - 业务日期 YYYY-MM-DD
 * @returns {Promise<TodayHabit[]>}
 */
async function getTodayHabits(date) {
  const allHabits = storageService.getMyHabitsWithMigration()
  const states = storageService.getDailyStatesByDate(date)

  return allHabits
    .map(habit => {
      const policy = storageService.getActivePolicyVersion(habit.userHabitId)
      const state = states.find(s => s.userHabitId === habit.userHabitId)
      return { habit, policy, state }
    })
    .filter(({ habit, policy, state }) => {
      const deletedAt = habit.deletedAt ? String(habit.deletedAt).split('T')[0] : null
      const deletedCheckedToday = habit.status === 'deleted' &&
        deletedAt === date &&
        state &&
        state.status === 'checked'

      if (deletedCheckedToday) return true
      if (habit.status !== 'active') return false
      if (!policy) return false
      if (!policy.effectiveStartDate) return false
      // 关键例外：用户今天已打卡 → 无论新策略如何，都展示（让用户看到自己的打卡）
      // 覆盖两种场景：
      // (a) 新策略在今天之后（被改成明天/未来）
      // (b) 新策略频率不包含今天（如改成 weekly 周三，今天是周二）
      if (state && state.status === 'checked') {
        return true
      }
      if (policy.effectiveStartDate > date) return false
      // 应修日判定：与观心页的 buildDayVerdicts 使用同一个函数
      return reportAggregator.isDueOnDateByFrequency(policy, date)
    })
    .map(({ habit, policy, state }) => {
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
        createdAt: habit.createdAt,
        deletedAt: habit.deletedAt || null
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
  const frequencyType = strategy.frequencyType || 'daily'
  const frequencyConfig = strategy.frequencyConfig || {}
  const freqRules = frequencyType === 'weekly'
    ? (frequencyConfig.weekdays || [])
    : (frequencyConfig.intervalDays || 1)
  const freqCategory = frequencyType === 'weekly'
    ? 'weekly'
    : (frequencyType === 'interval' || Number(freqRules) > 1 ? 'daily-interval' : 'everyday')

  // 间隔打卡
  if (frequencyType === 'interval') {
    const interval = freqRules || 1
    return `每${interval + 1}天`
  }

  // 每天或按天间隔
  if (freqCategory === 'daily-interval' || frequencyType === 'daily') {
    if (freqRules && freqRules > 1) {
      return `每${freqRules + 1}天`
    }
    return '每天'
  }

  // 每周固定
  if (freqCategory === 'weekly' || frequencyType === 'weekly') {
    if (freqRules && freqRules.length > 0) {
      const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日']
      const days = freqRules.map(d => weekdayNames[d]).join('、')
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
  const frequencyConfig = policyInput.frequencyConfig
  // 规范化 frequencyConfig：支持数字、数组、{ intervalDays }、{ weekdays }
  let freqRules
  if (typeof frequencyConfig === 'number') {
    freqRules = frequencyConfig
  } else if (Array.isArray(frequencyConfig)) {
    freqRules = frequencyConfig
  } else if (freqType === 'weekly') {
    freqRules = frequencyConfig?.weekdays || []
  } else {
    freqRules = frequencyConfig?.intervalDays || 1
  }
  return {
    userHabitId,
    habitTitle: options.habitTitle || '',
    category: options.category || '',
    duration: policyInput.duration,
    frequencyType: freqType,
    frequencyConfig: freqType === 'weekly'
      ? { weekdays: Array.isArray(freqRules) ? freqRules : [] }
      : { intervalDays: Number(freqRules) || 1 },
    startDate: policyInput.startDate || ''
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

    const freqText = buildStrategyText(strategy)
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

// ==================== Phase 6 跨页 Tab Intent（轻量状态） ====================

let _pendingTabIntent = null

/**
 * 设置待消费的分页 tab 意图（home -> habits）
 * @param {string} tab - 'sports' 等
 */
function requestPendingTab(tab) {
  _pendingTabIntent = tab
}

/**
 * 消费并返回待处理的 tab 意图（habits onLoad 时调用）
 * @returns {string|null}
 */
function consumePendingTabIntent() {
  const intent = _pendingTabIntent
  _pendingTabIntent = null
  return intent
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
  updateHabitPolicy,
  markStrategyChangedToday,
  markDeletionToday,

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
  getNextMondayStr,

  // Phase 6 跨页 tab intent
  requestPendingTab,
  consumePendingTabIntent
}
