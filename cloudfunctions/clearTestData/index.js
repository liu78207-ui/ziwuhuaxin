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

const ALL_USERS_SCOPE = 'allUsers';
const TARGET_OPENID_SCOPE = 'targetOpenid';
const ALL_USERS_CONFIRM_PHRASE = 'CLEAR_ALL_USER_DATA';
const TARGET_OPENID_CONFIRM_PHRASE = 'CLEAR_TARGET_USER_DATA';
const ADMIN_TOKEN_ENV = 'CLEAR_USER_DATA_ADMIN_TOKEN';
const USER_OWNED_QUERY = { _openid: _.exists(true) };

const USER_DATA_COLLECTIONS = [
  { name: 'users' },
  { name: 'user_habits' },
  { name: 'habit_policy_versions' },
  { name: 'checkin_operations' },
  { name: 'daily_checkin_states' },
  { name: 'sync_logs' },
  { name: 'conflict_logs' },
  { name: 'user_settings' },
  { name: 'ai_logs' },
  { name: 'user_strategies' },
  { name: 'user_strategy_versions' },
  { name: 'checkin_logs' },
  // `habits` may also contain global built-in rows. Only remove user/test rows.
  { name: 'habits' }
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getConfirmPhrase(scope) {
  return scope === TARGET_OPENID_SCOPE
    ? TARGET_OPENID_CONFIRM_PHRASE
    : ALL_USERS_CONFIRM_PHRASE;
}

function validateRequest(event) {
  const token = process.env[ADMIN_TOKEN_ENV];
  if (!token) {
    return {
      success: false,
      message: `${ADMIN_TOKEN_ENV} 未配置，禁止清理用户数据。`
    };
  }

  if (![ALL_USERS_SCOPE, TARGET_OPENID_SCOPE].includes(event.scope)) {
    return {
      success: false,
      message: `scope 必须为 ${ALL_USERS_SCOPE} 或 ${TARGET_OPENID_SCOPE}。`
    };
  }

  if (event.scope === TARGET_OPENID_SCOPE && !isNonEmptyString(event.targetOpenid)) {
    return {
      success: false,
      message: `scope 为 ${TARGET_OPENID_SCOPE} 时 targetOpenid 必填。`
    };
  }

  const expectedConfirmPhrase = getConfirmPhrase(event.scope);
  if (event.confirmPhrase !== expectedConfirmPhrase) {
    return {
      success: false,
      message: `confirmPhrase 必须为 ${expectedConfirmPhrase}。`
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

function buildTargets(event) {
  if (event.scope === TARGET_OPENID_SCOPE) {
    const targetOpenid = event.targetOpenid.trim();
    return USER_DATA_COLLECTIONS.map(target => ({
      name: target.name,
      query: { _openid: targetOpenid }
    }));
  }

  return USER_DATA_COLLECTIONS.map(target => ({
    name: target.name,
    query: USER_OWNED_QUERY
  }));
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
  return Number(res.deleted || res.removed || (res.stats && res.stats.removed) || 0);
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
  const targets = buildTargets(event);
  for (const target of targets) {
    details[target.name] = await inspectOrRemoveCollection(target, dryRun);
  }

  const hasUnexpectedFailure = Object.values(details).some(item =>
    item.skipped && item.reason && item.reason !== 'collection_missing'
  );

  return {
    success: !hasUnexpectedFailure,
    dryRun,
    scope: event.scope,
    targetOpenid: event.scope === TARGET_OPENID_SCOPE ? event.targetOpenid.trim() : '',
    details,
    message: dryRun
      ? 'dryRun 完成：未删除任何数据，请确认 details 后再用 dryRun:false 执行。'
      : '用户数据清理完成。'
  };
};

exports._private = {
  USER_DATA_COLLECTIONS,
  USER_OWNED_QUERY,
  ALL_USERS_SCOPE,
  TARGET_OPENID_SCOPE,
  ALL_USERS_CONFIRM_PHRASE,
  TARGET_OPENID_CONFIRM_PHRASE,
  ADMIN_TOKEN_ENV,
  buildTargets,
  isCollectionMissingError
};
