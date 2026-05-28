/**
 * reportData.js
 * 报表输出数据结构
 *
 * Phase 5: 定义周报、月报、年报的稳定输出模型
 * 所有报表输出必须符合此模型定义
 */

/**
 * 每日状态枚举
 */
const DAY_STATUS = {
  checked: 'checked',           // 已完成
  unchecked: 'unchecked',     // 应修未完成
  canceled: 'canceled',       // 已取消
  not_required: 'not_required', // 非应修日
  future: 'future',           // 未来日期
  low_confidence: 'low_confidence', // 低可信日期
  partial: 'partial',         // 部分完成（多 userHabitId 场景）
  empty: 'empty'              // 空单元格（用于月历填充）
}

/**
 * 报表周期类型
 */
const REPORT_TYPE = {
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly'
}

/**
 * 单日数据（用于周报点阵）
 * @typedef {Object} DayData
 * @property {string} date - YYYY-MM-DD
 * @property {string} status - 状态枚举
 * @property {boolean} isDue - 是否应修
 * @property {boolean} isStreakDay - 是否连日完成
 */

/**
 * 单习惯实例报表（不聚合）
 * @typedef {Object} InstanceReport
 * @property {string} userHabitId
 * @property {string} habitId
 * @property {string} createdAt
 * @property {string} deletedAt - 可为 null
 * @property {number} dueCount - 应修次数（分母）
 * @property {number} doneCount - 完成次数（分子）
 * @property {number} streak - 连续完成天数
 * @property {DayData[]} days - 每日数据
 */

/**
 * 习惯组（同一 habitId 的多个 userHabitId 聚合）
 * @typedef {Object} HabitGroup
 * @property {string} habitId
 * @property {string} name
 * @property {string} theme - 主题色
 * @property {InstanceReport[]} instances - 该习惯的所有实例
 * @property {Summary} summary - 汇总统计
 */

/**
 * 汇总统计
 * @typedef {Object} Summary
 * @property {number} doneCount
 * @property {number} dueCount
 * @property {number} completionRate - 0-100
 * @property {number} maxStreak
 */

/**
 * 全局统计
 * @typedef {Object} ReportStats
 * @property {number} completionRate - 0-100
 * @property {number} doneCount
 * @property {number} dueCount
 * @property {number} checkinDays - 坚持时日（自然日去重）
 * @property {number} maxStreak - 最长连日
 */

/**
 * 周报输出
 * @typedef {Object} WeekReport
 * @property {string} reportType - 'weekly'
 * @property {string} startDate - YYYY-MM-DD (周一)
 * @property {string} endDate - YYYY-MM-DD (周日)
 * @property {ReportStats} stats
 * @property {HabitGroup[]} habitGroups
 */

/**
 * 月报输出
 * @typedef {Object} MonthReport
 * @property {string} reportType - 'monthly'
 * @property {string} startDate - YYYY-MM-DD
 * @property {string} endDate - YYYY-MM-DD
 * @property {string} month - YYYY-MM
 * @property {ReportStats} stats
 * @property {HabitGroup[]} habitGroups
 */

/**
 * 年报输出
 * @typedef {Object} YearReport
 * @property {string} reportType - 'yearly'
 * @property {string} startDate - YYYY-MM-DD
 * @property {string} endDate - YYYY-MM-DD
 * @property {string} year - YYYY
 * @property {ReportStats} stats
 * @property {HabitGroup[]} habitGroups
 */

/**
 * stats.js 兼容格式（adaptToLegacyFormat 输出）
 * 这是 Phase 5C 迁移期间的兼容层
 * @typedef {Object} LegacyReport
 * @property {Array} habitReports - 习惯报表数组
 * @property {ReportStats} stats
 */

/**
 * 创建空报表
 * @returns {WeekReport}
 */
function createEmptyWeekReport() {
  return {
    reportType: REPORT_TYPE.weekly,
    startDate: '',
    endDate: '',
    stats: {
      completionRate: 0,
      doneCount: 0,
      dueCount: 0,
      checkinDays: 0,
      maxStreak: 0
    },
    habitGroups: []
  }
}

function createEmptyMonthReport() {
  return {
    reportType: REPORT_TYPE.monthly,
    startDate: '',
    endDate: '',
    month: '',
    stats: {
      completionRate: 0,
      doneCount: 0,
      dueCount: 0,
      checkinDays: 0,
      maxStreak: 0
    },
    habitGroups: []
  }
}

function createEmptyYearReport() {
  return {
    reportType: REPORT_TYPE.yearly,
    startDate: '',
    endDate: '',
    year: '',
    stats: {
      completionRate: 0,
      doneCount: 0,
      dueCount: 0,
      checkinDays: 0,
      maxStreak: 0
    },
    habitGroups: []
  }
}

module.exports = {
  DAY_STATUS,
  REPORT_TYPE,
  createEmptyWeekReport,
  createEmptyMonthReport,
  createEmptyYearReport
}
