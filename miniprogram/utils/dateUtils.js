// utils/dateUtils.js
// 日期基础工具函数（纯函数，无副作用）
// 所有业务日期计算基于 Asia/Shanghai (+08:00)，不依赖本地时区

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ASIA_SHANGHAI_OFFSET = 8 * 60 * 60 * 1000

function parseDate(dateStr) {
  if (!dateStr) return null
  const normalized = String(dateStr).split('T')[0]
  const parts = normalized.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const [year, month, day] = parts
  const d = new Date(Date.UTC(year, month - 1, day))
  if (isNaN(d.getTime())) return null
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d
}

function formatDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr)
  if (!date) return null
  return formatDate(new Date(date.getTime() + days * MS_PER_DAY))
}

function dateDiff(endDateStr, startDateStr) {
  const end = parseDate(endDateStr)
  const start = parseDate(startDateStr)
  if (!end || !start) return NaN
  return Math.floor((end - start) / MS_PER_DAY)
}

function compareDate(a, b) {
  if (!a || !b) return null
  return a === b ? 0 : a < b ? -1 : 1
}

function minDate(a, b) {
  if (!a) return b || null
  if (!b) return a || null
  return compareDate(a, b) <= 0 ? a : b
}

function buildDateRange(startDate, endDate) {
  const dates = []
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end || start > end) return dates
  let current = start
  while (current <= end) {
    dates.push(formatDate(current))
    current = new Date(current.getTime() + MS_PER_DAY)
  }
  return dates
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  return parseDate(dateStr) !== null
}

function asAsiaShanghai(localDate) {
  return new Date(localDate.getTime() + ASIA_SHANGHAI_OFFSET)
}

module.exports = {
  parseDate,
  formatDate,
  addDays,
  dateDiff,
  compareDate,
  minDate,
  buildDateRange,
  isValidDateStr,
  asAsiaShanghai,
  MS_PER_DAY,
  ASIA_SHANGHAI_OFFSET
}