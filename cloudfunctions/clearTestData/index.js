/**
 * clearTestData
 *
 * Strongly guarded maintenance function for clearing user-owned data in the
 * current CloudBase environment. It defaults to dryRun and never removes global
 * built-in catalog data.
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const REQUIRED_SCOPE = 'allUsers';
const CONFIRM_PHRASE = 'CLEAR_ALL_USER_DATA';
const ADMIN_TOKEN_ENV = 'CLEAR_USER_DATA_ADMIN_TOKEN';

const USER_DATA_COLLECTIONS = [
  { name: 'users', query: {} },
  { name: 'user_habits', query: {} },
  { name: 'habit_policy_versions', query: {} },
  { name: 'checkin_operations', query: {} },
  { name: 'daily_checkin_states', query: {} },
  { name: 'sync_logs', query: {} },
  { name: 'conflict_logs', query: {} },
  { name: 'user_settings', query: {} },
  { name: 'ai_logs', query: {} },
  { name: 'user_strategies', query: {} },
  { name: 'user_strategy_versions', query: {} },
  { name: 'checkin_logs', query: {} },
  // `habits` may also contain global built-in rows. Only remove user/test rows.
  { name: 'habits', query: { _openid: _.exists(true) } }
];

function isCollectionMissingError(err, collectionName) {
  const message = String((err && (err.message || err.errMsg)) || err || '');
  return message.includes(collectionName) && (
    message.includes('-502005') ||
    message.includes('collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST')
  );
}

function normalizeEvent(event = {}) {
  if (typeof event === 'string') {
    try {
      return JSON.parse(event);
    } catch (e) {
      return {};
    }
  }
  if (event && typeof event.data === 'string') {
    try {
      return { ...event, ...JSON.parse(event.data) };
    } catch (e) {
      return event;
    }
  }
  return event || {};
}

function validateRequest(event) {
  const token = process.env[ADMIN_TOKEN_ENV];
  if (!token) {
    return {
      success: false,
      message: `${ADMIN_TOKEN_ENV} 未配置，禁止清理用户数据。`
    };
  }

  if (event.scope !== REQUIRED_SCOPE) {
    return {
      success: false,
      message: `scope 必须为 ${REQUIRED_SCOPE}。`
    };
  }

  if (event.confirmPhrase !== CONFIRM_PHRASE) {
    return {
      success: false,
      message: `confirmPhrase 必须为 ${CONFIRM_PHRASE}。`
    };
  }

  if (event.adminToken !== token) {
    return {
      success: false,
      message: 'adminToken 无效，禁止清理用户数据。'
    };
  }

  return { success: true };
}

async function countCollection(collectionName, query) {
  const collection = db.collection(collectionName).where(query);
  if (typeof collection.count === 'function') {
    const res = await collection.count();
    return Number(res.total || 0);
  }
  const res = await collection.get();
  return Array.isArray(res.data) ? res.data.length : 0;
}

async function removeCollection(collectionName, query) {
  const res = await db.collection(collectionName).where(query).remove();
  return Number(res.deleted || res.removed || 0);
}

async function inspectOrRemoveCollection(target, dryRun) {
  const base = {
    matched: 0,
    deleted: 0,
    skipped: false,
    reason: ''
  };

  try {
    const matched = await countCollection(target.name, target.query);
    if (dryRun) {
      return { ...base, matched };
    }

    const deleted = await removeCollection(target.name, target.query);
    return { ...base, matched, deleted };
  } catch (err) {
    if (isCollectionMissingError(err, target.name)) {
      return {
        ...base,
        skipped: true,
        reason: 'collection_missing'
      };
    }

    return {
      ...base,
      skipped: true,
      reason: err && err.message ? err.message : String(err || 'unknown_error')
    };
  }
}

exports.main = async (rawEvent = {}, context = {}) => {
  const event = normalizeEvent(rawEvent);
  const dryRun = event.dryRun !== false;
  const validation = validateRequest(event);

  if (!validation.success) {
    return {
      success: false,
      dryRun,
      scope: event.scope || '',
      details: {},
      message: validation.message
    };
  }

  const details = {};
  for (const target of USER_DATA_COLLECTIONS) {
    details[target.name] = await inspectOrRemoveCollection(target, dryRun);
  }

  const hasUnexpectedFailure = Object.values(details).some(item =>
    item.skipped && item.reason && item.reason !== 'collection_missing'
  );

  return {
    success: !hasUnexpectedFailure,
    dryRun,
    scope: REQUIRED_SCOPE,
    details,
    message: dryRun
      ? 'dryRun 完成：未删除任何数据，请确认 details 后再用 dryRun:false 执行。'
      : '用户数据清理完成。'
  };
};

exports._private = {
  USER_DATA_COLLECTIONS,
  CONFIRM_PHRASE,
  ADMIN_TOKEN_ENV,
  isCollectionMissingError
};
