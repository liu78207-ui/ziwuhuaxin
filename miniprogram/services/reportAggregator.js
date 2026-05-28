/**
 * reportAggregator.js
 * 报表纯计算层
 *
 * Phase 5A: 无副作用，接受纯数据输入，输出统计结果
 *
 * 核心原则：
 * - userHabitId 是生命周期计算边界
 * - policyVersion 控制应修日
 * - DailyCheckinState 控制完成状态
 * - CheckinOperation 不直接作为最终完成状态
 */

const { FREQ_TYPES } = require('../constants/frequencyTypes.js')
const dateUtils = require('../utils/dateUtils.js')

// ==================== 日期工具 ====================

function parseDate(dateStr) {
  return dateUtils.parseDate(dateStr)
}

function formatDate(date) {
  return dateUtils.formatDate(date)
}

function compareDate(a, b) {
  return dateUtils.compareDate(a, b)
}

function addDays(dateStr, days) {
  return dateUtils.addDays(dateStr, days)
}

function dateDiff(endDateStr, startDateStr) {
  return dateUtils.dateDiff(endDateStr, startDateStr)
}

function buildDateRange(startDate, endDate) {
  return dateUtils.buildDateRange(startDate, endDate)
}

// ==================== 状态枚举 ====================

const DAY_STATUS = {
  checked: 'checked',
  unchecked: 'unchecked',
  canceled: 'canceled',
  not_required: 'not_required',
  future: 'future',
  low_confidence: 'low_confidence',
  partial: 'partial'
}

// ==================== 策略命中 ====================

/**
 * 按日期查找有效的 policyVersion
 * effectiveEndDate = null 表示当前有效（开放结束）
 * 策略修改当天：旧版本 effectiveEndDate = 修改日，当天仍有效
 * @param {Array} policyVersions - 策略版本数组
 * @param {string} date - YYYY-MM-DD
 * @returns {object|null} 命中的策略版本
 */
function resolveEffectivePolicyVersion(policyVersions, date) {
  if (!policyVersions || !Array.isArray(policyVersions)) {
    return null
  }
  return policyVersions.find(pv => {
    if (!pv.effectiveStartDate) return false
    if (compareDate(date, pv.effectiveStartDate) < 0) return false
    if (pv.effectiveEndDate === null) return true
    return compareDate(date, pv.effectiveEndDate) <= 0
  }) || null
}

/**
 * 判断某日是否应修（基于频率规则，不考虑生命周期边界）
 * @param {object} policyVersion - 策略版本
 * @param {string} date - YYYY-MM-DD
 * @returns {boolean}
 */
function isDueOnDateByFrequency(policyVersion, date) {
  if (!policyVersion) return false

  const { frequencyType, frequencyConfig, effectiveStartDate, startDate } = policyVersion
  const anchorDate = effectiveStartDate || startDate

  if (!anchorDate) return false
  if (compareDate(date, anchorDate) < 0) return false

  const freqType = frequencyType || FREQ_TYPES.DAILY

  if (freqType === FREQ_TYPES.DAILY) {
    return true
  }

  if (freqType === FREQ_TYPES.WEEKLY) {
    const weekdays = frequencyConfig?.weekdays
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      return true // 未配置则每日应修
    }
    const d = parseDate(date)
    if (!d) return false
    const dayOfWeek = d.getUTCDay()
    const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek
    return weekdays.includes(normalizedDay)
  }

  if (freqType === FREQ_TYPES.INTERVAL) {
    const intervalDays = frequencyConfig?.intervalDays
    if (!intervalDays || intervalDays < 1) return false
    const diff = dateDiff(date, anchorDate)
    if (diff < 0) return false
    return diff % intervalDays === 0
  }

  return false
}

// ==================== 核心裁决函数 ====================

/**
 * 每日应修裁决函数
 *
 * 输入完整上下文，返回结构化裁决结果
 *
 * @param {object} context - 裁决上下文
 * @param {object} context.userHabit - UserHabit 实例（含 createdAt/deletedAt）
 * @param {object} context.policyVersion - 该日期命中的 policyVersion（可能为 null）
 * @param {object} context.dailyState - DailyCheckinState（可能为 null）
 * @param {string} context.date - YYYY-MM-DD
 * @param {string} context.todayKey - 当前业务日期 YYYY-MM-DD
 * @param {string} context.dateConfidence - 'high' | 'low'
 * @param {object} context.lockSnapshot - 锁定快照对象（删除当天/策略修改当天可能有）
 * @returns {object} 裁决结果
 */
function resolveReportDayStatus(context) {
  const {
    userHabit,
    policyVersion,
    dailyState,
    date,
    todayKey,
    dateConfidence = 'high',
    lockSnapshot
  } = context

  // 1. 未来日期
  if (compareDate(date, todayKey) > 0) {
    return {
      status: DAY_STATUS.future,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'future_date',
      effectivePolicyVersionId: null
    }
  }

  // 2. 低可信日期
  if (dateConfidence === 'low') {
    return {
      status: DAY_STATUS.low_confidence,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'low_confidence',
      effectivePolicyVersionId: policyVersion?.policyVersionId || null
    }
  }

  // 3. 锁定快照优先（删除当天、策略修改当天）
  // 这些特殊日的口径按最终状态来：
  // - 最终 checked：分母+1，分子+1
  // - 最终 canceled/unchecked：分母+0，分子+0
  if (lockSnapshot) {
    const finalStatus = dailyState?.status || DAY_STATUS.unchecked
    const isChecked = finalStatus === DAY_STATUS.checked
    return {
      status: finalStatus,
      isDue: false,
      contributesDenominator: isChecked,
      contributesNumerator: isChecked,
      reason: lockSnapshot.reason || 'locked',
      effectivePolicyVersionId: lockSnapshot.policyVersionId || null
    }
  }

  // 4. userHabit 生命周期检查
  const createdAt = userHabit?.createdAt
  const deletedAt = userHabit?.deletedAt
  const status = userHabit?.status

  // 日期早于创建日，不应修
  if (createdAt && compareDate(date, createdAt) < 0) {
    return {
      status: DAY_STATUS.not_required,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'before_created',
      effectivePolicyVersionId: null
    }
  }

  // 已删除实例：删除日之后不应修
  if (status === 'deleted' && deletedAt) {
    if (compareDate(date, deletedAt) > 0) {
      return {
        status: DAY_STATUS.not_required,
        isDue: false,
        contributesDenominator: false,
        contributesNumerator: false,
        reason: 'deleted_after',
        effectivePolicyVersionId: null
      }
    }
    // 删除当天按特殊口径处理（见下）
    if (compareDate(date, deletedAt) === 0) {
      return resolveDeletedDayStatus(context)
    }
  }

  // 5. 无策略版本，不应修
  if (!policyVersion) {
    return {
      status: DAY_STATUS.not_required,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'no_policy_version',
      effectivePolicyVersionId: null
    }
  }

  // 6. 日期超出策略有效期
  if (policyVersion.effectiveStartDate && compareDate(date, policyVersion.effectiveStartDate) < 0) {
    return {
      status: DAY_STATUS.not_required,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'before_policy_start',
      effectivePolicyVersionId: null
    }
  }

  if (policyVersion.effectiveEndDate && compareDate(date, policyVersion.effectiveEndDate) > 0) {
    return {
      status: DAY_STATUS.not_required,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'after_policy_end',
      effectivePolicyVersionId: null
    }
  }

  // 7. 策略修改当天（通过 effectiveEndDate 判断）
  // 如果这个日期正好是旧版本的 effectiveEndDate，且有更新的版本存在
  if (policyVersion.effectiveEndDate && compareDate(date, policyVersion.effectiveEndDate) === 0) {
    return resolveStrategyChangeDayStatus(context)
  }

  // 8. 按频率规则判断是否应修
  const isDue = isDueOnDateByFrequency(policyVersion, date)

  if (!isDue) {
    return {
      status: DAY_STATUS.not_required,
      isDue: false,
      contributesDenominator: false,
      contributesNumerator: false,
      reason: 'not_due_by_frequency',
      effectivePolicyVersionId: policyVersion.policyVersionId
    }
  }

  // 9. 应修日：根据 dailyState 判定最终状态
  const finalStatus = dailyState?.status || DAY_STATUS.unchecked

  if (finalStatus === DAY_STATUS.checked) {
    return {
      status: DAY_STATUS.checked,
      isDue: true,
      contributesDenominator: true,
      contributesNumerator: true,
      reason: 'checked',
      effectivePolicyVersionId: policyVersion.policyVersionId
    }
  }

  if (finalStatus === DAY_STATUS.canceled) {
    return {
      status: DAY_STATUS.canceled,
      isDue: true,
      contributesDenominator: true,
      contributesNumerator: false,
      reason: 'canceled',
      effectivePolicyVersionId: policyVersion.policyVersionId
    }
  }

  // unchecked
  return {
    status: DAY_STATUS.unchecked,
    isDue: true,
    contributesDenominator: true,
    contributesNumerator: false,
    reason: 'unchecked',
    effectivePolicyVersionId: policyVersion.policyVersionId
  }
}

/**
 * 删除当天特殊裁决
 * - 已打卡且最终 checked：分母+1，分子+1
 * - 已打卡后取消（最终 canceled）：分母+0，分子+0
 * - 未打卡（unchecked）：分母+0，分子+0
 */
function resolveDeletedDayStatus(context) {
  const { dailyState, userHabit } = context
  const finalStatus = dailyState?.status || DAY_STATUS.unchecked

  if (finalStatus === DAY_STATUS.checked) {
    return {
      status: DAY_STATUS.checked,
      isDue: true,
      contributesDenominator: true,
      contributesNumerator: true,
      reason: 'deleted_after_checkin',
      effectivePolicyVersionId: null
    }
  }

  // deleted_without_checkin 或 deleted_canceled
  return {
    status: finalStatus,
    isDue: false,
    contributesDenominator: false,
    contributesNumerator: false,
    reason: finalStatus === DAY_STATUS.canceled ? 'deleted_canceled' : 'deleted_without_checkin',
    effectivePolicyVersionId: null
  }
}

/**
 * 策略修改当天特殊裁决
 * - 已打卡且最终 checked：分母+1，分子+1
 * - 已打卡后取消（最终 canceled）：分母+0，分子+0
 * - 未打卡（unchecked）：分母+0，分子+0
 * - 新策略从次日开始参与应修
 */
function resolveStrategyChangeDayStatus(context) {
  const { dailyState, policyVersion } = context
  const finalStatus = dailyState?.status || DAY_STATUS.unchecked

  if (finalStatus === DAY_STATUS.checked) {
    return {
      status: DAY_STATUS.checked,
      isDue: true,
      contributesDenominator: true,
      contributesNumerator: true,
      reason: 'strategy_changed_after_checkin',
      effectivePolicyVersionId: policyVersion.policyVersionId
    }
  }

  return {
    status: finalStatus,
    isDue: false,
    contributesDenominator: false,
    contributesNumerator: false,
    reason: finalStatus === DAY_STATUS.canceled ? 'strategy_changed_canceled' : 'strategy_changed_without_checkin',
    effectivePolicyVersionId: policyVersion.policyVersionId
  }
}

// ==================== 批量裁决 ====================

/**
 * 为周期内每一天生成 resolveReportDayStatus 结果
 *
 * @param {object} userHabit - UserHabit 实例
 * @param {Array} policyVersions - 策略版本数组
 * @param {Array} dailyStates - DailyCheckinState 数组（按 date 和 userHabitId 索引）
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string} todayKey - 当前业务日期 YYYY-MM-DD
 * @param {string} dateConfidence - 'high' | 'low'
 * @param {Array} lockSnapshots - 锁定快照数组
 * @returns {Array} 每日裁决结果数组
 */
function buildDayVerdicts(userHabit, policyVersions, dailyStates, startDate, endDate, todayKey, dateConfidence = 'high', lockSnapshots = []) {
  const dates = buildDateRange(startDate, endDate)
  const statesByDate = {}

  // 按 date 索引 dailyState
  if (dailyStates && Array.isArray(dailyStates)) {
    dailyStates.forEach(state => {
      const key = `${state.userHabitId}_${state.date}`
      statesByDate[key] = state
    })
  }

  // 按 date 索引 lockSnapshot
  const locksByDate = {}
  if (lockSnapshots && Array.isArray(lockSnapshots)) {
    lockSnapshots.forEach(snap => {
      if (snap.date) {
        locksByDate[snap.date] = snap
      }
    })
  }

  return dates.map(date => {
    const userHabitId = userHabit.userHabitId
    const dailyState = statesByDate[`${userHabitId}_${date}`] || null
    const lockSnapshot = locksByDate[date] || null

    // 查找该日有效的策略版本
    const policyVersion = resolveEffectivePolicyVersion(policyVersions, date)

    const verdict = resolveReportDayStatus({
      userHabit,
      policyVersion,
      dailyState,
      date,
      todayKey,
      dateConfidence,
      lockSnapshot
    })

    return {
      date,
      userHabitId,
      policyVersion,
      dailyState,
      ...verdict
    }
  })
}

// ==================== 统计聚合 ====================

/**
 * 从 dayVerdicts 统计 isDue=true 的天数（应修次数/分母）
 * @param {Array} dayVerdicts
 * @returns {number}
 */
function calculateDueCount(dayVerdicts) {
  if (!dayVerdicts || !Array.isArray(dayVerdicts)) return 0
  return dayVerdicts.filter(v => v.contributesDenominator).length
}

/**
 * 从 dayVerdicts 统计 status='checked' 的天数（完成次数/分子）
 * @param {Array} dayVerdicts
 * @returns {number}
 */
function calculateDoneCount(dayVerdicts) {
  if (!dayVerdicts || !Array.isArray(dayVerdicts)) return 0
  return dayVerdicts.filter(v => v.contributesNumerator).length
}

/**
 * 计算完成率
 * @param {number} doneCount
 * @param {number} dueCount
 * @returns {number} 0-100
 */
function calculateCompletionRate(doneCount, dueCount) {
  if (!dueCount || dueCount === 0) return 0
  return Math.round((doneCount / dueCount) * 100)
}

/**
 * 基于 dayVerdicts 计算连日
 * 规则：
 * - 非应修日不打断 streak，但也不增加 streak
 * - checked 计为完成日
 * - canceled/unchecked 不计
 * @param {Array} dayVerdicts
 * @param {string} startDate
 * @param {string} endDate
 * @returns {number}
 */
function calculateStreak(dayVerdicts) {
  if (!dayVerdicts || !Array.isArray(dayVerdicts)) return 0

  const verdictByDate = {}
  dayVerdicts.forEach(v => {
    verdictByDate[v.date] = v
  })

  let maxStreak = 0
  let currentStreak = 0
  const dates = buildDateRange(dayVerdicts[0]?.date, dayVerdicts[dayVerdicts.length - 1]?.date)

  dates.forEach(date => {
    const verdict = verdictByDate[date]
    if (!verdict) return

    // 非应修日不打断 streak（跳过，不重置也不增加）
    if (!verdict.isDue) {
      return
    }

    // unchecked/canceled 不增加 streak，但也不打断（重置）
    if (verdict.status !== DAY_STATUS.checked) {
      currentStreak = 0
      return
    }

    // checked 计为完成日，增加 streak
    currentStreak++
    maxStreak = Math.max(maxStreak, currentStreak)
  })

  return maxStreak
}

/**
 * 计算累计修习（只统计 checked）
 * @param {Array} dayVerdicts
 * @returns {number}
 */
function calculateCumulativePractice(dayVerdicts) {
  return calculateDoneCount(dayVerdicts)
}

/**
 * 计算坚持时日（按自然日去重，checked 的日期数）
 * @param {Array} dayVerdicts
 * @returns {number}
 */
function calculateCheckinDays(dayVerdicts) {
  if (!dayVerdicts || !Array.isArray(dayVerdicts)) return 0
  const checkedDates = new Set(
    dayVerdicts
      .filter(v => v.status === DAY_STATUS.checked)
      .map(v => v.date)
  )
  return checkedDates.size
}

// ==================== 按 habitId 聚合 ====================

/**
 * 按 habitId 聚合多个 userHabitId 的独立报表
 * @param {Array} instanceReports - 各 userHabitId 的独立报表
 * @returns {object} 聚合后的报表
 */
function aggregateByHabitId(instanceReports) {
  if (!instanceReports || !Array.isArray(instanceReports)) {
    return { habitGroups: [], summary: { doneCount: 0, dueCount: 0, completionRate: 0 } }
  }

  // 按 habitId 分组
  const groups = {}

  instanceReports.forEach(report => {
    const habitId = report.habitId
    if (!groups[habitId]) {
      groups[habitId] = {
        habitId,
        name: report.name,
        theme: report.theme,
        instances: []
      }
    }
    groups[habitId].instances.push(report)
  })

  // 聚合每个 habitId 的分母/分子
  const habitGroups = Object.values(groups).map(group => {
    let totalDue = 0
    let totalDone = 0
    let totalStreak = 0
    let maxStreak = 0

    group.instances.forEach(inst => {
      totalDue += inst.dueCount || 0
      totalDone += inst.doneCount || 0
      totalStreak += inst.streak || 0
      maxStreak = Math.max(maxStreak, inst.streak || 0)
    })

    return {
      ...group,
      summary: {
        doneCount: totalDone,
        dueCount: totalDue,
        completionRate: calculateCompletionRate(totalDone, totalDue),
        maxStreak
      }
    }
  })

  // 全局汇总
  const totalDueCount = habitGroups.reduce((sum, g) => sum + g.summary.dueCount, 0)
  const totalDoneCount = habitGroups.reduce((sum, g) => sum + g.summary.doneCount, 0)

  return {
    habitGroups,
    summary: {
      doneCount: totalDoneCount,
      dueCount: totalDueCount,
      completionRate: calculateCompletionRate(totalDoneCount, totalDueCount)
    }
  }
}

// ==================== 报表构建 ====================

/**
 * 构建单 userHabitId 的日列表（用于周报点阵）
 * @param {object} userHabit
 * @param {Array} policyVersions
 * @param {Array} dailyStates
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} todayKey
 * @param {string} dateConfidence
 * @param {Array} lockSnapshots
 * @returns {object}
 */
function buildInstanceReport(userHabit, policyVersions, dailyStates, startDate, endDate, todayKey, dateConfidence = 'high', lockSnapshots = []) {
  const dayVerdicts = buildDayVerdicts(
    userHabit,
    policyVersions,
    dailyStates,
    startDate,
    endDate,
    todayKey,
    dateConfidence,
    lockSnapshots
  )

  const dueCount = calculateDueCount(dayVerdicts)
  const doneCount = calculateDoneCount(dayVerdicts)
  const streak = calculateStreak(dayVerdicts)

  const days = dayVerdicts.map(v => ({
    date: v.date,
    status: v.status,
    isDue: v.isDue,
    isStreakDay: v.status === DAY_STATUS.checked
  }))

  return {
    userHabitId: userHabit.userHabitId,
    habitId: userHabit.habitId,
    createdAt: userHabit.createdAt,
    deletedAt: userHabit.deletedAt,
    dueCount,
    doneCount,
    streak,
    days
  }
}

/**
 * 构建周报
 * @param {Array} instanceReports - 各 userHabitId 的独立报表
 * @param {string} weekStart - YYYY-MM-DD (周一)
 * @returns {object}
 */
function buildWeekReport(instanceReports, weekStart) {
  const aggregated = aggregateByHabitId(instanceReports)
  const weekEnd = addDays(weekStart, 6)

  return {
    reportType: 'weekly',
    startDate: weekStart,
    endDate: weekEnd,
    stats: {
      completionRate: aggregated.summary.completionRate,
      doneCount: aggregated.summary.doneCount,
      dueCount: aggregated.summary.dueCount,
      checkinDays: aggregated.habitGroups.reduce((sum, g) => {
        const instanceCheckinDays = g.instances.reduce((s, i) => s + (i.checkinDays || 0), 0)
        return sum + instanceCheckinDays
      }, 0),
      maxStreak: Math.max(...aggregated.habitGroups.map(g => g.summary.maxStreak), 0)
    },
    habitGroups: aggregated.habitGroups
  }
}

/**
 * 构建月报
 * @param {Array} instanceReports
 * @param {string} month - YYYY-MM
 * @returns {object}
 */
function buildMonthReport(instanceReports, month) {
  const aggregated = aggregateByHabitId(instanceReports)
  const [year, monthNum] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, monthNum - 1, 1))
  const lastDay = new Date(Date.UTC(year, monthNum, 0))
  const startDate = formatDate(firstDay)
  const endDate = formatDate(lastDay)

  return {
    reportType: 'monthly',
    startDate,
    endDate,
    month,
    stats: {
      completionRate: aggregated.summary.completionRate,
      doneCount: aggregated.summary.doneCount,
      dueCount: aggregated.summary.dueCount,
      checkinDays: aggregated.habitGroups.reduce((sum, g) => {
        const instanceCheckinDays = g.instances.reduce((s, i) => s + (i.checkinDays || 0), 0)
        return sum + instanceCheckinDays
      }, 0),
      maxStreak: Math.max(...aggregated.habitGroups.map(g => g.summary.maxStreak), 0)
    },
    habitGroups: aggregated.habitGroups
  }
}

/**
 * 构建年报
 * @param {Array} instanceReports
 * @param {string} year - YYYY
 * @returns {object}
 */
function buildYearReport(instanceReports, year) {
  const aggregated = aggregateByHabitId(instanceReports)
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  return {
    reportType: 'yearly',
    startDate,
    endDate,
    year,
    stats: {
      completionRate: aggregated.summary.completionRate,
      doneCount: aggregated.summary.doneCount,
      dueCount: aggregated.summary.dueCount,
      checkinDays: aggregated.habitGroups.reduce((sum, g) => {
        const instanceCheckinDays = g.instances.reduce((s, i) => s + (i.checkinDays || 0), 0)
        return sum + instanceCheckinDays
      }, 0),
      maxStreak: Math.max(...aggregated.habitGroups.map(g => g.summary.maxStreak), 0)
    },
    habitGroups: aggregated.habitGroups
  }
}

/**
 * 构建月历状态（单日聚合）
 * @param {string} date - YYYY-MM-DD
 * @param {Array} instanceVerdicts - 该日所有 userHabitId 的裁决结果
 * @returns {string} 聚合后的状态
 */
function buildCalendarDayStatus(instanceVerdicts) {
  if (!instanceVerdicts || instanceVerdicts.length === 0) {
    return DAY_STATUS.not_required
  }

  // 全部非应修
  const dueVerdicts = instanceVerdicts.filter(v => v.isDue)
  if (dueVerdicts.length === 0) {
    return DAY_STATUS.not_required
  }

  // 全部 checked
  const allChecked = dueVerdicts.every(v => v.status === DAY_STATUS.checked)
  if (allChecked) {
    return DAY_STATUS.checked
  }

  // 部分完成
  const anyChecked = dueVerdicts.some(v => v.status === DAY_STATUS.checked)
  if (anyChecked) {
    return DAY_STATUS.partial
  }

  // 全部 unchecked
  return DAY_STATUS.unchecked
}

/**
 * 构建热力状态
 * @param {Array} yearDays - 全年每日聚合状态
 * @param {object} aggregated - 聚合报表
 * @returns {object}
 */
function buildHeatmapStatus(yearDays, aggregated) {
  return yearDays.map(day => {
    const { date, status } = day
    let level = ''

    if (status === DAY_STATUS.checked) {
      level = 'high'
    } else if (status === DAY_STATUS.partial) {
      level = 'medium'
    } else if (status === DAY_STATUS.unchecked) {
      level = 'low'
    } else if (status === DAY_STATUS.not_required || status === DAY_STATUS.future) {
      level = 'none'
    } else {
      level = 'pending'
    }

    return { date, status, level }
  })
}

module.exports = {
  DAY_STATUS,
  resolveEffectivePolicyVersion,
  isDueOnDateByFrequency,
  resolveReportDayStatus,
  buildDayVerdicts,
  calculateDueCount,
  calculateDoneCount,
  calculateCompletionRate,
  calculateStreak,
  calculateCumulativePractice,
  calculateCheckinDays,
  aggregateByHabitId,
  buildInstanceReport,
  buildWeekReport,
  buildMonthReport,
  buildYearReport,
  buildCalendarDayStatus,
  buildHeatmapStatus,
  // 导出工具函数供 reportService 使用
  parseDate,
  formatDate,
  compareDate,
  addDays,
  dateDiff,
  buildDateRange
}
