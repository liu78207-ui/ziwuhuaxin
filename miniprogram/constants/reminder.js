/**
 * constants/reminder.js
 * V1 lightweight practice reminder constants.
 */

const REMINDER_DEFAULTS = {
  enabled: false,
  reminderTime: '21:00',
  timezone: 'Asia/Shanghai',
  remindIfNoCheckin: true,
  subscribeStatus: 'unknown',
  subscribeGrantCount: 0,
  lastSentDate: ''
}

const REMINDER_SUBSCRIBE_STATUS = {
  accepted: 'accepted',
  rejected: 'rejected',
  banned: 'banned',
  unknown: 'unknown'
}

const REMINDER_SEND_STATUS = {
  success: 'success',
  failed: 'failed',
  skipped: 'skipped'
}

const REMINDER_TEMPLATE_ID = 'TODO_REPLACE_WITH_CHECKIN_REMINDER_TEMPLATE_ID'
const REMINDER_MESSAGE_TEXT = '今天还没有留下修习记录，记得给身体一点时间。'

function isReminderTemplateConfigured(templateId = REMINDER_TEMPLATE_ID) {
  return Boolean(templateId) && !String(templateId).startsWith('TODO_')
}

module.exports = {
  REMINDER_DEFAULTS,
  REMINDER_SUBSCRIBE_STATUS,
  REMINDER_SEND_STATUS,
  REMINDER_TEMPLATE_ID,
  REMINDER_MESSAGE_TEXT,
  isReminderTemplateConfigured
}
