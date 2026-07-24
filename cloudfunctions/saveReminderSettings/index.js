const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const COLLECTIONS = {
  userSettings: 'user_settings'
};

const SUBSCRIBE_STATUS = ['accepted', 'rejected', 'banned', 'unknown'];

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

function getResolvedCollectionName(key, event = {}) {
  return `${getCollectionPrefix(event)}${getCollectionName(key)}`;
}

function collection(key, event = {}) {
  return db.collection(getResolvedCollectionName(key, event));
}

function isCollectionAlreadyExists(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -501001 ||
    message.includes('already exists') ||
    message.includes('collection exists') ||
    message.includes('DATABASE_COLLECTION_ALREADY_EXIST') ||
    message.includes('ResourceExist') ||
    message.includes('Table exist')
  );
}

async function ensureTestCollection(key, event = {}) {
  if (getCollectionPrefix(event) !== 'test_' || typeof db.createCollection !== 'function') {
    return;
  }
  try {
    await db.createCollection(getResolvedCollectionName(key, event));
  } catch (err) {
    if (!isCollectionAlreadyExists(err)) {
      throw err;
    }
  }
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

async function querySettings(openid, event = {}) {
  try {
    return await collection('userSettings', event)
      .where({ _openid: openid })
      .limit(1)
      .get();
  } catch (err) {
    if (!isCollectionMissing(err) || getCollectionPrefix(event) !== 'test_') {
      throw err;
    }
    await ensureTestCollection('userSettings', event);
    return { data: [] };
  }
}

function normalizeSubscribeStatus(value) {
  const status = String(value || '');
  return SUBSCRIBE_STATUS.includes(status) ? status : 'unknown';
}

function normalizeReminder(input = {}, existing = {}) {
  const source = {
    ...DEFAULT_REMINDER,
    ...existing,
    ...input
  };
  const reminderTime = String(source.reminderTime || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
    const err = new Error('提醒时间格式必须为 HH:mm');
    err.code = 'PARAM_ERROR';
    throw err;
  }

  return {
    enabled: source.enabled === true,
    reminderTime,
    timezone: source.timezone || DEFAULT_REMINDER.timezone,
    remindIfNoCheckin: source.remindIfNoCheckin !== false,
    subscribeStatus: normalizeSubscribeStatus(source.subscribeStatus),
    subscribeGrantCount: Math.max(0, Math.floor(Number(source.subscribeGrantCount || 0))),
    lastSentDate: source.lastSentDate || '',
    lastRequestResult: source.lastRequestResult || existing.lastRequestResult || {},
    updatedAt: new Date().toISOString()
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
    const incoming = event.reminder || {};
    const currentResult = await querySettings(OPENID, event);
    const existingDoc = currentResult.data && currentResult.data[0] ? currentResult.data[0] : null;
    const reminder = normalizeReminder(incoming, existingDoc ? existingDoc.reminder : {});

    if (existingDoc) {
      await collection('userSettings', event).doc(existingDoc._id).update({
        data: {
          reminder,
          updatedAt: new Date().toISOString()
        }
      });
      return { success: true, reminder, serverTime };
    }

    await collection('userSettings', event).add({
      data: {
        _openid: OPENID,
        reminder,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
    return { success: true, reminder, serverTime };
  } catch (err) {
    if (err.code !== 'PARAM_ERROR') {
      console.error('saveReminderSettings error:', err);
    }
    return {
      success: false,
      code: err.code || 'CLOUD_ERROR',
      message: err.message || '保存提醒设置失败',
      serverTime
    };
  }
};
