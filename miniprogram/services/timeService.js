// services/timeService.js
// 唯一业务时间入口，统一 Asia/Shanghai (+08:00)
// 所有业务日期计算基于 Asia/Shanghai 时区，不依赖本地时区

let _serverTimeOffset = 0
let _serverTimeConfidence = 'low'

// Asia/Shanghai UTC offset: +08:00 = 8 * 60 * 60 * 1000 ms
const ASIA_SHANGHAI_OFFSET = 8 * 60 * 60 * 1000

function asAsiaShanghaiTime(localDate) {
  const utc = localDate.getTime() + localDate.getTimezoneOffset() * 60 * 1000
  return new Date(utc + ASIA_SHANGHAI_OFFSET)
}

function getNow() {
  return new Date(Date.now() + _serverTimeOffset)
}

function getBusinessDate() {
  return formatDate(asAsiaShanghaiTime(getNow()))
}

function getTodayKey() {
  return getBusinessDate()
}

function getSimulatedDate(app) {
  const DEBUG_DAY_OFFSET = app && app.getDebugOffset ? app.getDebugOffset() : 0
  const today = new Date()
  if (DEBUG_DAY_OFFSET !== 0) {
    today.setDate(today.getDate() + DEBUG_DAY_OFFSET)
  }
  return today
}

function getSimulatedDateStr(app) {
  return formatDate(getSimulatedDate(app))
}

function parseDate(dateStr) {
  if (!dateStr) return null
  const normalized = String(dateStr).split('T')[0]
  const parts = normalized.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  if (isNaN(d.getTime())) return null
  return d
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
  if (!a || !b) return null
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

function getWeekRange(date) {
  const d = parseDate(date) || asAsiaShanghaiTime(new Date())
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(d)
  start.setDate(diff)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  }
}

function getMonthRange(date) {
  const d = parseDate(date) || asAsiaShanghaiTime(new Date())
  const year = d.getFullYear()
  const month = d.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  return {
    startDate: formatDate(firstDay),
    endDate: formatDate(lastDay)
  }
}

function getYearRange(date) {
  const d = parseDate(date) || asAsiaShanghaiTime(new Date())
  const year = d.getFullYear()
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  }
}

function isFutureDate(dateStr) {
  return compareDate(dateStr, getBusinessDate()) > 0
}

function isSameBusinessDay(a, b) {
  return compareDate(a, b) === 0
}

function shouldRefreshByDate(lastDate, currentDate) {
  return lastDate && currentDate && compareDate(lastDate, currentDate) < 0
}

// 刷新服务端时间校准
// cloudCaller: 可选的云函数调用器，签名为 () => Promise<{ serverTime: number }>
// 如果未传入 cloudCaller，将使用本地时间并返回 low confidence
async function refreshServerTime(cloudCaller) {
  if (cloudCaller) {
    try {
      const { serverTime } = await cloudCaller()
      if (serverTime) {
        const localNow = Date.now()
        _serverTimeOffset = serverTime - localNow
        _serverTimeConfidence = 'high'
        return { serverTime, confidence: 'high' }
      }
    } catch (e) {
      console.error('refreshServerTime failed:', e)
    }
  }
  _serverTimeConfidence = 'low'
  return { serverTime: Date.now(), confidence: 'low' }
}

module.exports = {
  getNow,
  getBusinessDate,
  getTodayKey,
  getSimulatedDate,
  getSimulatedDateStr,
  parseDate,
  formatDate,
  addDays,
  dateDiff,
  compareDate,
  minDate,
  buildDateRange,
  getWeekRange,
  getMonthRange,
  getYearRange,
  isFutureDate,
  isSameBusinessDay,
  shouldRefreshByDate,
  refreshServerTime
}