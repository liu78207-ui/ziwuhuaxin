/**
 * services/reminderService.js
 * 轻量修习提醒服务。
 *
 * 页面只通过本 service 读取 ViewModel、请求订阅授权、保存设置。
 * 云端 user_settings.reminder 为最终来源，本地 reminderSettings 仅作显示缓存。
 */

const cloudService = require('./cloudService')
const storageService = require('./storageService')
const eventBus = require('./eventBus')
const userService = require('./userService')
const {
  REMINDER_DEFAULTS,
  REMINDER_SUBSCRIBE_STATUS,
  REMINDER_TEMPLATE_ID
} = require('../constants/reminder')

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function getNowIsoString() {
  return new Date().toISOString()
}

function normalizeReminderTime(value) {
  const time = String(value || '').trim()
  return TIME_PATTERN.test(time) ? time : REMINDER_DEFAULTS.reminderTime
}

function normalizeSubscribeStatus(value) {
  const status = String(value || '')
  return Object.values(REMINDER_SUBSCRIBE_STATUS).includes(status)
    ? status
    : REMINDER_SUBSCRIBE_STATUS.unknown
}

function normalizeSubscribeGrantCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function normalizeSettings(settings = {}) {
  return {
    ...REMINDER_DEFAULTS,
    ...settings,
    enabled: settings.enabled === true,
    reminderTime: normalizeReminderTime(settings.reminderTime),
    timezone: settings.timezone || REMINDER_DEFAULTS.timezone,
    remindIfNoCheckin: settings.remindIfNoCheckin !== false,
    subscribeStatus: normalizeSubscribeStatus(settings.subscribeStatus),
    subscribeGrantCount: normalizeSubscribeGrantCount(settings.subscribeGrantCount),
    lastSentDate: settings.lastSentDate || ''
  }
}

function getCachedSettings() {
  return normalizeSettings(storageService.getReminderSettings())
}

function cacheSettings(settings) {
  const normalized = normalizeSettings(settings)
  storageService.setReminderSettings(normalized)
  return normalized
}

function buildSummary(settings = getCachedSettings()) {
  const normalized = normalizeSettings(settings)
  return normalized.enabled ? '已开启' : '未开启'
}

function buildSettingsViewModel(settings = getCachedSettings()) {
  const normalized = normalizeSettings(settings)
  const grantCount = normalizeSubscribeGrantCount(normalized.subscribeGrantCount)
  const needsSettingsGuide = normalized.subscribeStatus === REMINDER_SUBSCRIBE_STATUS.banned
  const needsGrantGuide = normalized.enabled && grantCount === 0
  const authTextMap = {
    [REMINDER_SUBSCRIBE_STATUS.accepted]: grantCount > 0
      ? `已授权，可提醒 ${grantCount} 次`
      : '已开启，后续可再次授权增加提醒次数',
    [REMINDER_SUBSCRIBE_STATUS.rejected]: '你已暂未授权，可点击开启提醒重新授权',
    [REMINDER_SUBSCRIBE_STATUS.banned]: '你已关闭订阅权限，可在微信设置中重新开启',
    [REMINDER_SUBSCRIBE_STATUS.unknown]: '提醒需要你授权微信订阅消息'
  }

  return {
    settings: normalized,
    enabled: normalized.enabled,
    reminderTime: normalized.reminderTime,
    remindIfNoCheckin: normalized.remindIfNoCheckin,
    summary: buildSummary(normalized),
    authText: authTextMap[normalized.subscribeStatus] || authTextMap[REMINDER_SUBSCRIBE_STATUS.unknown],
    canSend: grantCount > 0,
    authGuideVisible: needsSettingsGuide || needsGrantGuide,
    authGuideTitle: needsSettingsGuide ? '订阅权限已关闭' : '需要补充提醒授权',
    authGuideText: needsSettingsGuide
      ? '请在小程序设置中允许订阅消息；如果仍收不到提醒，请确认微信和手机系统通知已开启。'
      : '微信一次授权通常只可发送一次提醒，重新打开开关可补充授权次数。',
    authGuideActionText: needsSettingsGuide ? '打开小程序设置' : ''
  }
}

async function refreshSettings() {
  const result = await cloudService.callFunction('getReminderSettings', {})
  if (!result.success) {
    return getCachedSettings()
  }
  return cacheSettings(result.data?.reminder || result.data?.settings || {})
}

async function saveSettings(patch = {}) {
  const previous = getCachedSettings()
  const nextSettings = normalizeSettings({
    ...previous,
    ...patch,
    updatedAt: getNowIsoString()
  })

  const result = await cloudService.callFunction('saveReminderSettings', {
    reminder: nextSettings
  })
  if (!result.success) {
    throw new Error(result.error?.message || '保存提醒设置失败')
  }

  const saved = cacheSettings(result.data?.reminder || nextSettings)
  eventBus.emit('reminder:updated', {
    source: 'reminderService',
    enabled: saved.enabled,
    reminderTime: saved.reminderTime
  })
  return saved
}

function requestSubscribeMessage(templateId) {
  return new Promise((resolve, reject) => {
    if (!wx || typeof wx.requestSubscribeMessage !== 'function') {
      reject(new Error('当前微信版本不支持订阅消息'))
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: resolve,
      fail: reject
    })
  })
}

function openSubscriptionSettings() {
  return new Promise((resolve, reject) => {
    if (!wx || typeof wx.openSetting !== 'function') {
      reject(new Error('当前微信版本不支持打开设置页'))
      return
    }
    wx.openSetting({
      success: resolve,
      fail: reject
    })
  })
}

function parseSubscribeResult(result, templateId) {
  const value = result && result[templateId]
  if (value === 'accept') {
    return REMINDER_SUBSCRIBE_STATUS.accepted
  }
  if (value === 'ban') {
    return REMINDER_SUBSCRIBE_STATUS.banned
  }
  if (value === 'reject') {
    return REMINDER_SUBSCRIBE_STATUS.rejected
  }
  return REMINDER_SUBSCRIBE_STATUS.unknown
}

async function requestSubscribeAndEnable(options = {}) {
  await userService.login({ force: false }).catch(() => {})

  const templateId = options.templateId || REMINDER_TEMPLATE_ID
  const current = getCachedSettings()
  const subscribeResult = await requestSubscribeMessage(templateId)
  const subscribeStatus = parseSubscribeResult(subscribeResult, templateId)
  const accepted = subscribeStatus === REMINDER_SUBSCRIBE_STATUS.accepted
  const subscribeGrantCount = accepted
    ? normalizeSubscribeGrantCount(current.subscribeGrantCount) + 1
    : normalizeSubscribeGrantCount(current.subscribeGrantCount)

  const saved = await saveSettings({
    enabled: accepted,
    reminderTime: normalizeReminderTime(options.reminderTime || current.reminderTime),
    remindIfNoCheckin: options.remindIfNoCheckin !== false,
    subscribeStatus,
    subscribeGrantCount,
    lastRequestResult: subscribeResult || {}
  })

  return {
    accepted,
    subscribeStatus,
    settings: saved
  }
}

module.exports = {
  normalizeSettings,
  normalizeReminderTime,
  getCachedSettings,
  refreshSettings,
  saveSettings,
  requestSubscribeAndEnable,
  openSubscriptionSettings,
  buildSummary,
  buildSettingsViewModel,
  parseSubscribeResult
}
