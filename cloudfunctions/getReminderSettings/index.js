const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const COLLECTIONS = {
  userSettings: 'user_settings'
};

const DEFAULT_REMINDER = {
  enabled: false,
  reminderTime: '21:00',
  timezone: 'Asia/Shanghai',
  remindIfNoCheckin: true,
  subscribeStatus: 'unknown',
  subscribeGrantCount: 0,
  lastSentDate: ''
};

function getCollectionName(key) {
  const name = COLLECTIONS[key];
  if (!name) {
    throw new Error(`未登记的 CloudBase 集合: ${key}`);
  }
  return name;
}

function getCollectionPrefix(event = {}) {
  const prefix = String(event.__collectionPrefix || event.collectionPrefix || '');
  if (!prefix) return '';
  if (prefix === 'test_') return prefix;
  throw new Error(`非法集合前缀: ${prefix}`);
}

function collection(key, event = {}) {
  return db.collection(`${getCollectionPrefix(event)}${getCollectionName(key)}`);
}

function isCollectionMissing(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -502005 ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('Table not exist')
  );
}

function normalizeReminder(reminder = {}) {
  return {
    ...DEFAULT_REMINDER,
    ...reminder,
    enabled: reminder.enabled === true,
    reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(reminder.reminderTime || ''))
      ? reminder.reminderTime
      : DEFAULT_REMINDER.reminderTime,
    timezone: reminder.timezone || DEFAULT_REMINDER.timezone,
    remindIfNoCheckin: reminder.remindIfNoCheckin !== false,
    subscribeGrantCount: Math.max(0, Math.floor(Number(reminder.subscribeGrantCount || 0))),
    lastSentDate: reminder.lastSentDate || ''
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;
  const serverTime = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份', serverTime };
  }

  try {
    const result = await collection('userSettings', event)
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    const settings = result.data && result.data[0] ? result.data[0] : {};
    return {
      success: true,
      reminder: normalizeReminder(settings.reminder),
      serverTime
    };
  } catch (err) {
    if (isCollectionMissing(err) && getCollectionPrefix(event) === 'test_') {
      return {
        success: true,
        reminder: normalizeReminder(),
        serverTime
      };
    }
    console.error('getReminderSettings error:', err);
    return {
      success: false,
      code: 'CLOUD_ERROR',
      message: err.message || '获取提醒设置失败',
      serverTime
    };
  }
};
