// services/timeService.js
// 唯一业务时间入口，统一 Asia/Shanghai (+08:00)
// 所有业务日期计算基于 Asia/Shanghai，不依赖本地时区

const dateUtils = require('../utils/dateUtils.js')

let _serverTimeOffset = 0
let _serverTimeConfidence = 'low'

function getNow() {
  return new Date(Date.now() + _serverTimeOffset)
}

function getBusinessDate() {
  return dateUtils.dateToAsiaShanghaiDateStr(getNow())
}

function getTodayKey() {
  return getBusinessDate()
}

function getSimulatedDate(app) {
  const offset = app && app.getDebugOffset ? app.getDebugOffset() : 0
  const now = getNow()
  const asiaNow = dateUtils.asAsiaShanghai(now)
  if (offset !== 0) {
    asiaNow.setDate(asiaNow.getUTCDate() + offset)
  }
  return asiaNow
}

function getSimulatedDateStr(app) {
  const d = getSimulatedDate(app)
  return dateUtils.formatDate(d)
}

function parseDate(dateStr) {
  return dateUtils.parseDate(dateStr)
}

function formatDate(date) {
  return dateUtils.formatDate(date)
}

function addDays(dateStr, days) {
  return dateUtils.addDays(dateStr, days)
}

function dateDiff(endDateStr, startDateStr) {
  return dateUtils.dateDiff(endDateStr, startDateStr)
}

function compareDate(a, b) {
  return dateUtils.compareDate(a, b)
}

function minDate(a, b) {
  return dateUtils.minDate(a, b)
}

function buildDateRange(startDate, endDate) {
  return dateUtils.buildDateRange(startDate, endDate)
}

function getWeekRange(date) {
  const asiaDate = dateUtils.asAsiaShanghai(parseDate(date) || getSimulatedDate(null))
  const day = asiaDate.getUTCDay()
  const diff = asiaDate.getUTCDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(asiaDate.getTime())
  start.setUTCDate(diff)
  const end = new Date(start.getTime())
  end.setUTCDate(start.getUTCDate() + 6)
  return {
    startDate: dateUtils.formatDate(start),
    endDate: dateUtils.formatDate(end)
  }
}

function getMonthRange(date) {
  const asiaDate = dateUtils.asAsiaShanghai(parseDate(date) || getSimulatedDate(null))
  const year = asiaDate.getUTCFullYear()
  const month = asiaDate.getUTCMonth()
  const firstDay = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  return {
    startDate: dateUtils.formatDate(firstDay),
    endDate: dateUtils.formatDate(lastDay)
  }
}

function getYearRange(date) {
  const asiaDate = dateUtils.asAsiaShanghai(parseDate(date) || getSimulatedDate(null))
  const year = asiaDate.getUTCFullYear()
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

async function refreshServerTime(cloudCaller) {
  if (cloudCaller) {
    try {
      const { serverTime } = await cloudCaller()
      if (serverTime) {
        _serverTimeOffset = serverTime - Date.now()
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