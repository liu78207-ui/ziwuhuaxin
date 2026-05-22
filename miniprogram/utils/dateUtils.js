// utils/dateUtils.js
// 日期基础工具函数（纯函数，无副作用）

const ASIA_SHANGHAI_OFFSET = 8 * 60 * 60 * 1000 // +8h in ms

function parseDate(dateStr) {
  if (!dateStr) return null
  const normalized = String(dateStr).split('T')[0]
  const parts = normalized.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr)
  if (!date) return null
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function dateDiff(endDateStr, startDateStr) {
  const start = parseDate(startDateStr)
  const end = parseDate(endDateStr)
  if (!start || !end) return NaN
  return Math.floor((end - start) / (24 * 60 * 60 * 1000))
}

function compareDate(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function minDate(a, b) {
  if (!a) return b || null
  if (!b) return a || null
  return compareDate(a, b) <= 0 ? a : b
}

function buildDateRange(startDate, endDate) {
  const dates = []
  const current = parseDate(startDate)
  const end = parseDate(endDate)
  if (!current || !end || current > end) return dates
  while (current <= end) {
    dates.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = parseDate(dateStr)
  if (!d) return false
  return formatDate(d) === dateStr
}

function getAsiaShanghaisDate(localDate) {
  const utc = localDate.getTime() + localDate.getTimezoneOffset() * 60 * 1000
  return new Date(utc + ASIA_SHANGHAI_OFFSET)
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
  getAsiaShanghaisDate
}