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

function groupByUserHabitId(items) {
  return (items || []).reduce((result, item) => {
    const userHabitId = item && item.userHabitId
    if (!userHabitId) return result
    if (!result[userHabitId]) {
      result[userHabitId] = []
    }
    result[userHabitId].push(item)
    return result
  }, {})
}

function indexByHabitId(items) {
  return (items || []).reduce((result, item) => {
    if (item && item.habitId) {
      result[item.habitId] = item
    }
    return result
  }, {})
}

function buildReportContext(startDate, endDate) {
  let builtInHabits = []
  try {
    builtInHabits = habitService.getBuiltInHabits()
  } catch (e) {
    builtInHabits = []
  }

  const userHabits = fetchUserHabits(null)
  const policyVersions = fetchPolicyVersions()
  const dailyStates = fetchDailyStates(startDate, endDate)

  return {
    userHabits,
    policyVersions,
    dailyStates,
    policyVersionsByUserHabitId: groupByUserHabitId(policyVersions),
    builtInByHabitId: indexByHabitId(builtInHabits)
  }
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

  // 策略修改当天不再通过 lock snapshot 拦截，
  // 而是在 reportAggregator.resolveReportDayStatus 的 item 7 分支中处理。
  // 这样可以与案台 getTodayHabits 共用同一套频率判定（isDueOnDateByFrequency），
  // 并区分"已打卡"和"未打卡"两种情况。

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
function buildInstanceReport(userHabit, startDate, endDate, todayKey, context = null) {
  const userHabitId = userHabit.userHabitId

  // 获取该实例的策略版本
  const policyVersions = context?.policyVersionsByUserHabitId
    ? (context.policyVersionsByUserHabitId[userHabitId] || [])
    : fetchPolicyVersionsByUserHabitId(userHabitId)

  // 获取每日状态
  const dailyStates = context?.dailyStates || fetchDailyStates(startDate, endDate)

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
    const builtIn = context?.builtInByHabitId
      ? context.builtInByHabitId[userHabit.habitId]
      : habitService.getBuiltInHabits().find(h => h.habitId === userHabit.habitId)
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
    theme,
    _policyVersions: policyVersions
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
function buildAggregatedReports(startDate, endDate, todayKey, context = null) {
  const reportContext = context || buildReportContext(startDate, endDate)
  const userHabits = reportContext.userHabits || [] // 获取所有实例

  // 过滤有效实例：
  // 1. 必须至少有一个策略版本。
  // 2. 先构建实例报表，再按裁决结果判断是否展示，避免软删除无 checked
  //    记录时误删删除前的真实 unchecked 历史。
  // 3. 删除当天未打卡仍由裁决结果保持低压力口径，不单独撑出报表行。
  const instanceReports = userHabits
    .filter(h => {
      const pvs = reportContext.policyVersionsByUserHabitId
        ? (reportContext.policyVersionsByUserHabitId[h.userHabitId] || [])
        : fetchPolicyVersionsByUserHabitId(h.userHabitId)
      return pvs && pvs.length > 0
    })
    .map(h => buildInstanceReport(h, startDate, endDate, todayKey, reportContext))
    .filter(report => shouldShowInstanceReport(report, startDate, endDate, todayKey))

  // 按 habitId 聚合
  const aggregated = reportAggregator.aggregateByHabitId(instanceReports)

  return aggregated
}

function shouldShowInstanceReport(instanceReport, startDate, endDate, todayKey) {
  const verdicts = instanceReport?._verdicts || []
  if (!verdicts.length) return false

  const hasVisibleVerdict = verdicts.some(v => {
    if (v.contributesDenominator || v.contributesNumerator) return true
    if (v.status === 'checked') return true

    const latestPolicy = getLatestPolicy(instanceReport._policyVersions || [])
    return isVisibleReportState(v, latestPolicy, v.date)
  })

  if (hasVisibleVerdict) return true

  return !instanceReport.deletedAt &&
    hasAnyDueDayByPolicyVersions(instanceReport._policyVersions || [], startDate, endDate, todayKey)
}

function hasAnyDueDayByPolicyVersions(pvs, startDate, endDate, todayKey) {
  const dates = dateUtils.buildDateRange(startDate, endDate)
  const latestPolicy = getLatestPolicy(pvs)
  if (!latestPolicy) return false

  const hasAnyDueDay = dates.some(date => {
    if (latestPolicy.effectiveStartDate <= date) {
      return reportAggregator.isDueOnDateByFrequency(latestPolicy, date)
    }

    const oldPolicy = pvs.find(pv =>
      pv.effectiveEndDate !== null &&
      pv.effectiveEndDate < latestPolicy.effectiveStartDate &&
      dateUtils.compareDate(date, pv.effectiveEndDate) === 0
    )

    return oldPolicy
      ? reportAggregator.isDueOnDateByFrequency(oldPolicy, date)
      : false
  })

  if (hasAnyDueDay) return true

  return latestPolicy.effectiveStartDate === todayKey &&
    reportAggregator.isDueOnDateByFrequency(latestPolicy, todayKey)
}

// ==================== 适配层 ====================

function isStrategyChangeStateLike(item) {
  if (!item) return false
  const reason = item.lockedReason || item.lockReason || item.reason
  return item.hasPolicyChangedToday === true ||
    reason === 'strategy_changed_after_checkin' ||
    reason === 'strategy_changed_without_checkin' ||
    reason === 'strategy_changed_canceled' ||
    reason === 'strategy_changed_to_not_due' ||
    reason === 'strategy_changed_after_checkin_to_not_due' ||
    reason === 'strategy_changed_canceled_to_not_due' ||
    reason === 'strategy_changed_to_not_due_unchecked'
}

function getLatestPolicy(policyVersions) {
  return (policyVersions || []).find(pv => pv.effectiveEndDate === null) || null
}

function isLatestPolicyDueOnDate(policyVersion, date) {
  if (!policyVersion || !date) return false
  if (policyVersion.effectiveStartDate && dateUtils.compareDate(date, policyVersion.effectiveStartDate) < 0) {
    return false
  }
  return reportAggregator.isDueOnDateByFrequency(policyVersion, date)
}

function isVisibleReportState(item, latestPolicy, date) {
  if (!item) return false
  if (item.status === 'checked') return true
  if (!isStrategyChangeStateLike(item)) return false
  if (item.status === 'canceled' || item.status === 'unchecked') {
    return isLatestPolicyDueOnDate(latestPolicy, date || item.date)
  }
  return false
}

function resolveDisplayStatus(status, countsInDenominator, countsAsDone) {
  if (countsAsDone || status === 'checked') {
    return 'checked'
  }
  if ((status === 'canceled' || status === 'unchecked') && !countsInDenominator) {
    return 'not_required'
  }
  if (status === 'not_required' && countsInDenominator) {
    return 'unchecked'
  }
  return status || 'not_required'
}

/**
 * 将 reportAggregator 的输出适配为 stats.js 期望的格式
 * 这是 Phase 5C 迁移的兼容层
 *
 * stats.js 期望的 habitReports 格式：
 * {
 *   habitId, habit: { ...习惯元数据 }, days: [ ... ],
 *   dueCount, doneCount, practiceCount, checkinDays
 * }
 *
 * @param {object} aggregated - reportAggregator.aggregateByHabitId 的输出
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} todayKey
 * @returns {object}
 */
function adaptToLegacyFormat(aggregated, startDate, endDate, todayKey) {
  const dates = dateUtils.buildDateRange(startDate, endDate)
  const habitReports = aggregated.habitGroups.map(group => {
    const representative = group.instances.find(inst => !inst.deletedAt) || group.instances[0] || {}
    const habit = {
      habitId: group.habitId,
      name: representative.name || group.name || '',
      themeClass: representative.theme || group.theme || '',
      isDeleted: group.instances.every(inst => inst.deletedAt),
      deletedAt: representative.deletedAt || null
    }

    const days = dates.map(date => {
      const dayItems = group.instances
        .map(instance => {
          const index = instance.days.findIndex(day => day.date === date)
          if (index < 0) return null
          const day = instance.days[index]
          const verdict = instance._verdicts ? instance._verdicts[index] : null
          const latestPolicy = getLatestPolicy(instance._policyVersions || [])
          return {
            date: day.date,
            status: day.status,
            isDue: day.isDue || false,
            shouldShow: day.isDue || isVisibleReportState({ ...day, ...(verdict || {}) }, latestPolicy, day.date),
            countsInDenominator: verdict ? verdict.contributesDenominator : (day.isDue || false),
            countsAsDone: verdict ? verdict.contributesNumerator : (day.status === 'checked'),
            isAfterDeletion: day.date > (instance.deletedAt || '9999-12-31'),
            reason: verdict ? verdict.reason : null,
            themeClass: instance.theme || group.theme || ''
          }
        })
        .filter(Boolean)

      const hasChecked = dayItems.some(day => day.status === 'checked' || day.countsAsDone)
      const hasCanceled = dayItems.some(day => day.status === 'canceled')
      const hasUnfinished = dayItems.some(day => day.status === 'unchecked' || day.countsInDenominator)
      const hasLowConfidence = dayItems.some(day => day.status === 'low_confidence')
      const hasFuture = dayItems.some(day => day.status === 'future')
      const isDue = dayItems.some(day => day.isDue)
      const countsInDenominator = dayItems.some(day => day.countsInDenominator)
      const countsAsDone = dayItems.some(day => day.countsAsDone)

      let status = 'not_required'
      if (hasChecked) {
        status = 'checked'
      } else if (hasCanceled) {
        status = 'canceled'
      } else if (hasUnfinished) {
        status = 'unchecked'
      } else if (hasLowConfidence) {
        status = 'low_confidence'
      } else if (hasFuture) {
        status = 'future'
      }

      const displayStatus = resolveDisplayStatus(status, countsInDenominator, countsAsDone)

      return {
        date,
        checked: status === 'checked',
        isChecked: status === 'checked',
        isDue,
        shouldShow: isDue || dayItems.some(day => day.shouldShow),
        status,
        displayStatus,
        countsInDueDenominator: countsInDenominator,
        countsInDenominator,
        countsAsDone,
        isAfterDeletion: dayItems.length > 0 && dayItems.every(day => day.isAfterDeletion),
        themeClass: representative.theme || group.theme || ''
      }
    })

    const dueCount = days.filter(day => day.countsInDenominator).length
    const doneCount = days.filter(day => day.countsAsDone).length
    const practiceCount = group.summary?.doneCount ?? doneCount
    const checkinDays = new Set(
      days
        .filter(day => day.countsAsDone)
        .map(day => day.date)
    ).size

    return {
      habitId: group.habitId,
      habit,
      days,
      dueCount,
      doneCount,
      practiceCount,
      checkinDays,
      hasVisibleState: days.some(day => day.shouldShow || day.countsInDenominator || day.countsAsDone),
      instances: group.instances
    }
  })

  // 计算全局 stats
  const dueCount = habitReports.reduce((sum, r) => sum + r.dueCount, 0)
  const doneCount = habitReports.reduce((sum, r) => sum + r.doneCount, 0)
  const practiceCount = habitReports.reduce((sum, r) => sum + (r.practiceCount ?? r.doneCount), 0)
  const uniqueCheckinDates = [...new Set(
    habitReports.flatMap(r =>
      r.days
        .filter(d => d.countsAsDone)
        .map(d => d.date)
    )
  )]

  const globalMaxStreak = (aggregated.habitGroups || []).reduce((max, group) => {
 return Math.max(max, group.summary && group.summary.maxStreak ||0)
 },0)

 const stats = {
 checkinRate: dueCount >0 ? Math.round((doneCount / dueCount) *100) :0,
 totalCount: practiceCount,
 checkinDays: uniqueCheckinDates.length,
 maxStreak: globalMaxStreak
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
