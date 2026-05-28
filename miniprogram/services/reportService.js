/**
 * reportService.js
 * 报表服务层
 *
 * Phase 5B: 统一数据获取、状态裁决、报表输出
 *
 * 核心原则：
 * - 所有报表计算必须走 reportService / reportAggregator
 * - 不得直接累计 checkin_operations 作为统计源
 * - DailyCheckinState 是事实源
 */

const reportAggregator = require('./reportAggregator')
const storageService = require('./storageService')
const habitService = require('./habitService')
const timeService = require('./timeService')
const dateUtils = require('../utils/dateUtils.js')

// ==================== 周期构建 ====================

/**
 * 构建报表周期
 * @param {string} type - 'weekly' | 'monthly' | 'yearly'
 * @param {string} anchorDate - YYYY-MM-DD 或 YYYY-MM
 * @returns {object} { startDate, endDate, type }
 */
function buildPeriod(type, anchorDate) {
  if (type === 'weekly') {
    const range = timeService.getWeekRange(anchorDate)
    return { ...range, type: 'weekly' }
  }
  if (type === 'monthly') {
    const [year, month] = anchorDate.split('-').map(Number)
    const range = timeService.getMonthRange(`${year}-${String(month).padStart(2, '0')}-01`)
    return { ...range, type: 'monthly' }
  }
  if (type === 'yearly') {
    const year = Number(anchorDate)
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      type: 'yearly'
    }
  }
  throw new Error(`Unknown period type: ${type}`)
}

// ==================== 数据获取 ====================

/**
 * 获取用户习惯实例
 * @param {string} status - 'active' | 'deleted' | null (获取全部)
 * @returns {Array}
 */
function fetchUserHabits(status) {
  const habits = storageService.getMyHabitsWithMigration()
  if (status) {
    return habits.filter(h => h.status === status)
  }
  return habits
}

/**
 * 获取策略版本（按 userHabitId 分组）
 * @returns {Array}
 */
function fetchPolicyVersions() {
  return storageService.getPolicyVersions()
}

/**
 * 获取每日状态
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Array}
 */
function fetchDailyStates(startDate, endDate) {
  const allStates = storageService.getDailyCheckinStates()
  if (!startDate || !endDate) {
    return allStates
  }
  return allStates.filter(s => s.date >= startDate && s.date <= endDate)
}

/**
 * 按 userHabitId 获取策略版本
 * @param {string} userHabitId
 * @returns {Array}
 */
function fetchPolicyVersionsByUserHabitId(userHabitId) {
  return storageService.getPolicyVersionsByUserHabitId(userHabitId)
}

// ==================== 锁定快照 ====================

/**
 * 解析锁定快照
 * 删除当天、策略修改当天可能有锁定快照
 * @param {object} userHabit
 * @param {Array} policyVersions
 * @param {string} date
 * @returns {object|null}
 */
function resolveLockSnapshot(userHabit, policyVersions, date) {
  // 检查是否是删除当天
  if (userHabit.status === 'deleted' && userHabit.deletedAt) {
    if (dateUtils.compareDate(date, userHabit.deletedAt) === 0) {
      return {
        date,
        reason: 'deleted_day',
        policyVersionId: null
      }
    }
  }

  // 检查是否是策略修改当天
  // 找到该日有效的策略版本
  const effectivePV = reportAggregator.resolveEffectivePolicyVersion(policyVersions, date)
  if (effectivePV && effectivePV.effectiveEndDate) {
    if (dateUtils.compareDate(date, effectivePV.effectiveEndDate) === 0) {
      return {
        date,
        reason: 'strategy_change_day',
        policyVersionId: effectivePV.policyVersionId
      }
    }
  }

  return null
}

// ==================== 单习惯报表构建 ====================

/**
 * 构建单 userHabitId 的实例报表
 * @param {object} userHabit
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} todayKey
 * @returns {object}
 */
function buildInstanceReport(userHabit, startDate, endDate, todayKey) {
  const userHabitId = userHabit.userHabitId

  // 获取该实例的策略版本
  const policyVersions = fetchPolicyVersionsByUserHabitId(userHabitId)

  // 获取每日状态
  const dailyStates = fetchDailyStates(startDate, endDate)

  // 构建锁定快照
  const lockSnapshots = []
  const dates = dateUtils.buildDateRange(startDate, endDate)
  dates.forEach(date => {
    const lock = resolveLockSnapshot(userHabit, policyVersions, date)
    if (lock) {
      lockSnapshots.push(lock)
    }
  })

  // 构建实例报表
  const instanceReport = reportAggregator.buildInstanceReport(
    userHabit,
    policyVersions,
    dailyStates,
    startDate,
    endDate,
    todayKey,
    'high',
    lockSnapshots
  )

  // 补充 builtInHabit 信息
  let name = userHabit.name || ''
  let theme = userHabit.themeClass || 't-blue'

  try {
    const builtInHabits = habitService.getBuiltInHabits()
    const builtIn = builtInHabits.find(h => h.habitId === userHabit.habitId)
    if (builtIn) {
      name = builtIn.name || name
      theme = builtIn.themeClass || theme
    }
  } catch (e) {
    // ignore
  }

  return {
    ...instanceReport,
    habitId: userHabit.habitId,
    name,
    theme
  }
}

// ==================== 聚合报表构建 ====================

/**
 * 构建聚合报表（按 habitId 聚合多个 userHabitId）
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} todayKey
 * @returns {Array}
 */
function buildAggregatedReports(startDate, endDate, todayKey) {
  const userHabits = fetchUserHabits(null) // 获取所有实例

  // 过滤有效实例（有策略版本的才参与报表）
  const validHabits = userHabits.filter(h => {
    const pvs = fetchPolicyVersionsByUserHabitId(h.userHabitId)
    return pvs && pvs.length > 0
  })

  // 为每个有效实例构建报表
  const instanceReports = validHabits.map(h => {
    return buildInstanceReport(h, startDate, endDate, todayKey)
  })

  // 按 habitId 聚合
  const aggregated = reportAggregator.aggregateByHabitId(instanceReports)

  return aggregated
}

// ==================== 适配层 ====================

/**
 * 将 reportAggregator 的输出适配为 stats.js 期望的格式
 * 这是 Phase 5C 迁移的兼容层
 *
 * stats.js 期望的 habitReports 格式：
 * {
 *   habitId, habit: { ...习惯元数据 }, days: [ ... ], dueCount, doneCount
 * }
 *
 * @param {object} aggregated - reportAggregator.aggregateByHabitId 的输出
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} todayKey
 * @returns {object}
 */
function adaptToLegacyFormat(aggregated, startDate, endDate, todayKey) {
  const habitReports = []

  aggregated.habitGroups.forEach(group => {
    group.instances.forEach(instance => {
      // 构建兼容的 habit 对象
      const habit = {
        habitId: instance.habitId,
        name: instance.name || group.name || '',
        isDeleted: instance.deletedAt ? true : false,
        deletedAt: instance.deletedAt || null
      }

      // 映射 days 数组，补充兼容字段
      const days = instance.days.map((day, index) => {
        const verdict = instance._verdicts ? instance._verdicts[index] : null
        return {
          date: day.date,
          checked: day.status === 'checked',
          isChecked: day.status === 'checked',
          isDue: day.isDue || false,
          shouldShow: day.isDue || false,
          status: day.status,
          countsInDueDenominator: day.isDue || false,
          countsInDenominator: day.isDue || false,
          countsAsDone: day.status === 'checked',
          isAfterDeletion: day.date > (instance.deletedAt || '9999-12-31')
        }
      })

      habitReports.push({
        habitId: instance.habitId,
        habit,
        days,
        dueCount: instance.dueCount,
        doneCount: instance.doneCount
      })
    })
  })

  // 计算全局 stats
  const dueCount = habitReports.reduce((sum, r) => sum + r.dueCount, 0)
  const doneCount = habitReports.reduce((sum, r) => sum + r.doneCount, 0)
  const uniqueCheckinDates = [...new Set(
    habitReports.flatMap(r =>
      r.days
        .filter(d => d.countsAsDone)
        .map(d => d.date)
    )
  )]

  const stats = {
    checkinRate: dueCount > 0 ? Math.round((doneCount / dueCount) * 100) : 0,
    totalCount: doneCount,
    checkinDays: uniqueCheckinDates.length,
    maxStreak: 0 // 需要额外计算
  }

  return {
    habitReports,
    stats
  }
}

// ==================== 对外接口 ====================

/**
 * 获取周报
 * @param {string} weekStart - YYYY-MM-DD (周一)
 * @returns {Promise<object>}
 */
async function getWeeklyReport(weekStart) {
  const todayKey = timeService.getTodayKey()
  const period = buildPeriod('weekly', weekStart)

  const aggregated = buildAggregatedReports(period.startDate, period.endDate, todayKey)
  return adaptToLegacyFormat(aggregated, period.startDate, period.endDate, todayKey)
}

/**
 * 获取月报
 * @param {string} month - YYYY-MM
 * @returns {Promise<object>}
 */
async function getMonthlyReport(month) {
  const todayKey = timeService.getTodayKey()
  const period = buildPeriod('monthly', month)

  const aggregated = buildAggregatedReports(period.startDate, period.endDate, todayKey)

  // 月报适配：转换为 stats.js 期望的格式
  const adapted = adaptToLegacyFormat(aggregated, period.startDate, period.endDate, todayKey)

  // 月报还需要 startWeekday 等信息，由 stats.js 在 mapMonthHabitReport 中计算
  return {
    ...adapted,
    period // 包含 startDate, endDate, type
  }
}

/**
 * 获取年报
 * @param {string} year - YYYY
 * @returns {Promise<object>}
 */
async function getYearlyReport(year) {
  const todayKey = timeService.getTodayKey()
  const period = buildPeriod('yearly', year)

  const aggregated = buildAggregatedReports(period.startDate, period.endDate, todayKey)

  // 年报适配：转换为 stats.js 期望的格式
  const adapted = adaptToLegacyFormat(aggregated, period.startDate, period.endDate, todayKey)

  return {
    ...adapted,
    period // 包含 startDate, endDate, type, year
  }
}

/**
 * 获取单习惯历史报表（不常用，预留接口）
 * @param {string} habitId
 * @returns {Promise<object>}
 */
async function getHabitReport(habitId) {
  const todayKey = timeService.getTodayKey()
  const userHabits = fetchUserHabits(null)
  const habit = userHabits.find(h => h.habitId === habitId)

  if (!habit) {
    return null
  }

  // 默认查全量历史
  const startDate = habit.createdAt
  const endDate = todayKey

  return buildInstanceReport(habit, startDate, endDate, todayKey)
}

/**
 * 获取今日进度（供首页使用）
 * 注意：本阶段 home.js 不接入此方法
 * @returns {Promise<object>}
 */
async function getTodayProgress() {
  const todayKey = timeService.getTodayKey()
  const userHabits = fetchUserHabits('active')

  const progress = {
    date: todayKey,
    totalDue: 0,
    totalDone: 0,
    habits: []
  }

  for (const habit of userHabits) {
    const pvs = fetchPolicyVersionsByUserHabitId(habit.userHabitId)
    if (!pvs || pvs.length === 0) continue

    const pv = reportAggregator.resolveEffectivePolicyVersion(pvs, todayKey)
    if (!pv) continue

    const isDue = reportAggregator.isDueOnDateByFrequency(pv, todayKey)
    if (!isDue) continue

    const dailyState = storageService.getDailyState(habit.userHabitId, todayKey)
    const status = dailyState?.status || 'unchecked'

    progress.totalDue++
    if (status === 'checked') {
      progress.totalDone++
    }

    progress.habits.push({
      userHabitId: habit.userHabitId,
      habitId: habit.habitId,
      name: habit.name,
      status
    })
  }

  return progress
}

module.exports = {
  buildPeriod,
  fetchUserHabits,
  fetchPolicyVersions,
  fetchDailyStates,
  resolveLockSnapshot,
  buildInstanceReport,
  buildAggregatedReports,
  getWeeklyReport,
  getMonthlyReport,
  getYearlyReport,
  getHabitReport,
  getTodayProgress
}
