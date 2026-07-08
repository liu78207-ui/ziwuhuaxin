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
const PAGE_SIZE = 100;
const USER_HABIT_ID_QUERY_CHUNK_SIZE = 20;

const ALL_USERS_SCOPE = 'allUsers';
const TARGET_OPENID_SCOPE = 'targetOpenid';
const ALL_USERS_CONFIRM_PHRASE = 'CLEAR_ALL_USER_DATA';
const TARGET_OPENID_CONFIRM_PHRASE = 'CLEAR_TARGET_USER_DATA';
const CUSTOM_HABITS_ACTION = 'cleanupCustomHabitsForTargetOpenid';
const CUSTOM_HABITS_CONFIRM_PHRASE = 'DELETE_TARGET_CUSTOM_HABITS';
const REPAIR_CHECKINS_ACTION = 'repairTargetUserCheckins';
const REPAIR_CHECKINS_CONFIRM_PHRASE = 'REPAIR_TARGET_USER_CHECKINS';
const REPAIR_BUILTIN_CHECKINS_ACTION = 'repairTargetBuiltinCheckinsByHabitDates';
const REPAIR_BUILTIN_CHECKINS_CONFIRM_PHRASE = 'REPAIR_TARGET_BUILTIN_CHECKINS';
const INSPECT_BUILTIN_CHECKINS_ACTION = 'inspectTargetBuiltinCheckinsByHabitDates';
const INSPECT_BUILTIN_CHECKINS_CONFIRM_PHRASE = 'INSPECT_TARGET_BUILTIN_CHECKINS';
const ADMIN_TOKEN_ENV = 'CLEAR_USER_DATA_ADMIN_TOKEN';
const PROD_MAINTENANCE_CONFIRM_PHRASE = 'ALLOW_PROD_MAINTENANCE_AFTER_BACKUP';
const COLLECTIONS = {
  users: 'users',
  userHabits: 'user_habits',
  habitPolicyVersions: 'habit_policy_versions',
  checkinOperations: 'checkin_operations',
  dailyCheckinStates: 'daily_checkin_states',
  syncLogs: 'sync_logs',
  conflictLogs: 'conflict_logs',
  userSettings: 'user_settings',
  aiLogs: 'ai_logs',
  userStrategies: 'user_strategies',
  userStrategyVersions: 'user_strategy_versions',
  checkinLogs: 'checkin_logs',
  habits: 'habits'
};
const ALLOWED_COLLECTION_NAMES = new Set(Object.values(COLLECTIONS));
let activeCollectionPrefix = '';
const USER_OWNED_QUERY = { _openid: _.exists(true) };
const CUSTOM_RELATED_COLLECTIONS = [
  COLLECTIONS.habitPolicyVersions,
  COLLECTIONS.dailyCheckinStates,
  COLLECTIONS.checkinOperations
];

const USER_DATA_COLLECTIONS = [
  { name: COLLECTIONS.users },
  { name: COLLECTIONS.userHabits },
  { name: COLLECTIONS.habitPolicyVersions },
  { name: COLLECTIONS.checkinOperations },
  { name: COLLECTIONS.dailyCheckinStates },
  { name: COLLECTIONS.syncLogs },
  { name: COLLECTIONS.conflictLogs },
  { name: COLLECTIONS.userSettings },
  { name: COLLECTIONS.aiLogs },
  { name: COLLECTIONS.userStrategies },
  { name: COLLECTIONS.userStrategyVersions },
  { name: COLLECTIONS.checkinLogs },
  // `habits` may also contain global built-in rows. Only remove user/test rows.
  { name: COLLECTIONS.habits }
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

function assertKnownCollectionName(collectionName) {
  if (!ALLOWED_COLLECTION_NAMES.has(collectionName)) {
    throw new Error(`未登记的 CloudBase 集合: ${collectionName}`);
  }
}

function getCollectionPrefix(event = {}) {
  const prefix = String(event.__collectionPrefix || event.collectionPrefix || '');
  if (!prefix) return '';
  if (prefix === 'test_') return prefix;
  throw new Error(`非法集合前缀: ${prefix}`);
}

function collectionByName(collectionName) {
  assertKnownCollectionName(collectionName);
  return db.collection(`${activeCollectionPrefix}${collectionName}`);
}

function validateEnvironmentWriteGuard(event) {
  const dryRun = event.dryRun !== false;
  if (dryRun || isInspectBuiltinCheckinsAction(event)) {
    return { success: true };
  }

  if (event.runtimeEnv === 'test' || event.confirmRuntimeEnv === 'test') {
    return { success: true };
  }

  if (process.env.NODE_ENV === 'test') {
    return { success: true };
  }

  if (
    event.allowProdMaintenance === true &&
    event.backupConfirmed === true &&
    event.prodConfirmPhrase === PROD_MAINTENANCE_CONFIRM_PHRASE
  ) {
    return { success: true };
  }

  return {
    success: false,
    message: `非 dryRun 维护动作默认只允许测试环境。正式环境执行前必须先备份，并传入 allowProdMaintenance:true、backupConfirmed:true、prodConfirmPhrase:${PROD_MAINTENANCE_CONFIRM_PHRASE}。`
  };
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
  if (event && event.data && typeof event.data === 'object' && !Array.isArray(event.data)) {
    return { ...event, ...event.data };
  }
  return event || {};
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCleanupCustomHabitsAction(event) {
  return event && event.action === CUSTOM_HABITS_ACTION;
}

function isCustomHabitRecord(record) {
  return record && (record.source === 'custom' || String(record.habitId || '').indexOf('custom_') === 0);
}

function isRepairCheckinsAction(event) {
  return event && event.action === REPAIR_CHECKINS_ACTION;
}

function isRepairBuiltinCheckinsAction(event) {
  return event && event.action === REPAIR_BUILTIN_CHECKINS_ACTION;
}

function isInspectBuiltinCheckinsAction(event) {
  return event && event.action === INSPECT_BUILTIN_CHECKINS_ACTION;
}

function isCustomReference(record) {
  return String((record && record.habitId) || '').indexOf('custom_') === 0 ||
    String((record && record.userHabitId) || '').includes('custom_');
}

function isBuiltInHabitId(value) {
  return /^(?:[1-9]|1[0-9]|2[0-5])$/.test(String(value || ''));
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

  const environmentGuard = validateEnvironmentWriteGuard(event);
  if (!environmentGuard.success) {
    return environmentGuard;
  }

  if (isCleanupCustomHabitsAction(event)) {
    if (!isNonEmptyString(event.targetOpenid)) {
      return {
        success: false,
        message: `${CUSTOM_HABITS_ACTION} 需要 targetOpenid。`
      };
    }

    if (event.scope === ALL_USERS_SCOPE) {
      return {
        success: false,
        message: `${CUSTOM_HABITS_ACTION} 不支持 ${ALL_USERS_SCOPE}。`
      };
    }

    if (event.confirmPhrase !== CUSTOM_HABITS_CONFIRM_PHRASE) {
      return {
        success: false,
        message: `confirmPhrase 必须为 ${CUSTOM_HABITS_CONFIRM_PHRASE}。`
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

  if (isRepairCheckinsAction(event)) {
    if (!isNonEmptyString(event.targetOpenid)) {
      return {
        success: false,
        message: `${REPAIR_CHECKINS_ACTION} 需要 targetOpenid。`
      };
    }

    if (event.scope === ALL_USERS_SCOPE) {
      return {
        success: false,
        message: `${REPAIR_CHECKINS_ACTION} 不支持 ${ALL_USERS_SCOPE}。`
      };
    }

    if (event.confirmPhrase !== REPAIR_CHECKINS_CONFIRM_PHRASE) {
      return {
        success: false,
        message: `confirmPhrase 必须为 ${REPAIR_CHECKINS_CONFIRM_PHRASE}。`
      };
    }

    if (event.adminToken !== token) {
      return {
        success: false,
        message: 'adminToken 无效，禁止修复用户数据。'
      };
    }

    return { success: true };
  }

  if (isRepairBuiltinCheckinsAction(event)) {
    if (!isNonEmptyString(event.targetOpenid)) {
      return {
        success: false,
        message: `${REPAIR_BUILTIN_CHECKINS_ACTION} 需要 targetOpenid。`
      };
    }

    if (event.scope === ALL_USERS_SCOPE) {
      return {
        success: false,
        message: `${REPAIR_BUILTIN_CHECKINS_ACTION} 不支持 ${ALL_USERS_SCOPE}。`
      };
    }

    if (event.confirmPhrase !== REPAIR_BUILTIN_CHECKINS_CONFIRM_PHRASE) {
      return {
        success: false,
        message: `confirmPhrase 必须为 ${REPAIR_BUILTIN_CHECKINS_CONFIRM_PHRASE}。`
      };
    }

    if (event.adminToken !== token) {
      return {
        success: false,
        message: 'adminToken 无效，禁止修复用户数据。'
      };
    }

    return { success: true };
  }

  if (isInspectBuiltinCheckinsAction(event)) {
    if (!isNonEmptyString(event.targetOpenid)) {
      return {
        success: false,
        message: `${INSPECT_BUILTIN_CHECKINS_ACTION} 需要 targetOpenid。`
      };
    }

    if (event.scope === ALL_USERS_SCOPE) {
      return {
        success: false,
        message: `${INSPECT_BUILTIN_CHECKINS_ACTION} 不支持 ${ALL_USERS_SCOPE}。`
      };
    }

    if (event.confirmPhrase !== INSPECT_BUILTIN_CHECKINS_CONFIRM_PHRASE) {
      return {
        success: false,
        message: `confirmPhrase 必须为 ${INSPECT_BUILTIN_CHECKINS_CONFIRM_PHRASE}。`
      };
    }

    if (event.adminToken !== token) {
      return {
        success: false,
        message: 'adminToken 无效，禁止检查用户数据。'
      };
    }

    return { success: true };
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
  const collection = collectionByName(collectionName).where(query);
  if (typeof collection.count === 'function') {
    const res = await collection.count();
    return Number(res.total || 0);
  }
  const res = await collection.get();
  return Array.isArray(res.data) ? res.data.length : 0;
}

async function removeCollection(collectionName, query) {
  const res = await collectionByName(collectionName).where(query).remove();
  return Number(res.deleted || res.removed || (res.stats && res.stats.removed) || 0);
}

async function addCollection(collectionName, data) {
  const res = await collectionByName(collectionName).add({ data });
  return res && res._id ? res._id : '';
}

async function updateDocument(collectionName, docId, data) {
  await collectionByName(collectionName).doc(docId).update({ data });
}

function removeFieldValue() {
  return typeof _.remove === 'function' ? _.remove() : null;
}

async function listAllCollection(collectionName, query) {
  const items = [];
  let offset = 0;

  while (true) {
    const res = await collectionByName(collectionName)
      .where(query)
      .skip(offset)
      .limit(PAGE_SIZE)
      .get();
    const page = res.data || [];
    items.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return items;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildUserHabitIdQuery(openid, userHabitIds) {
  return {
    _openid: openid,
    userHabitId: typeof _.in === 'function' ? _.in(userHabitIds) : userHabitIds
  };
}

async function countRelatedCollection(collectionName, openid, userHabitIds) {
  if (!userHabitIds.length) return 0;
  const chunks = chunkArray(userHabitIds, USER_HABIT_ID_QUERY_CHUNK_SIZE);
  let total = 0;
  for (const chunk of chunks) {
    total += await countCollection(collectionName, buildUserHabitIdQuery(openid, chunk));
  }
  return total;
}

async function removeRelatedCollection(collectionName, openid, userHabitIds) {
  if (!userHabitIds.length) return 0;
  const chunks = chunkArray(userHabitIds, USER_HABIT_ID_QUERY_CHUNK_SIZE);
  let total = 0;
  for (const chunk of chunks) {
    total += await removeCollection(collectionName, buildUserHabitIdQuery(openid, chunk));
  }
  return total;
}

async function inspectOrRemoveCustomHabits(event, dryRun) {
  const targetOpenid = event.targetOpenid.trim();
  const details = {
    user_habits: {
      matched: 0,
      deleted: 0,
      skipped: false,
      reason: '',
      records: []
    }
  };

  for (const collectionName of CUSTOM_RELATED_COLLECTIONS) {
    details[collectionName] = {
      matched: 0,
      deleted: 0,
      skipped: false,
      reason: ''
    };
  }

  let customHabits = [];
  try {
    const habits = await listAllCollection('user_habits', { _openid: targetOpenid });
    customHabits = habits.filter(isCustomHabitRecord);
  } catch (err) {
    if (isCollectionMissingError(err, 'user_habits')) {
      details.user_habits.skipped = true;
      details.user_habits.reason = 'collection_missing';
      return { details, targetOpenid };
    }

    details.user_habits.skipped = true;
    details.user_habits.reason = err && err.message ? err.message : String(err || 'unknown_error');
    return { details, targetOpenid };
  }

  const userHabitIds = customHabits.map(record => record.userHabitId).filter(Boolean);
  details.user_habits.matched = customHabits.length;
  details.user_habits.records = customHabits.map(record => ({
    habitId: record.habitId || '',
    userHabitId: record.userHabitId || '',
    name: record.name || record.title || record.habitTitle || record.habit_title || '',
    status: record.status || ''
  }));

  for (const collectionName of CUSTOM_RELATED_COLLECTIONS) {
    try {
      details[collectionName].matched = await countRelatedCollection(collectionName, targetOpenid, userHabitIds);
      if (!dryRun) {
        details[collectionName].deleted = await removeRelatedCollection(collectionName, targetOpenid, userHabitIds);
      }
    } catch (err) {
      if (isCollectionMissingError(err, collectionName)) {
        details[collectionName].skipped = true;
        details[collectionName].reason = 'collection_missing';
      } else {
        details[collectionName].skipped = true;
        details[collectionName].reason = err && err.message ? err.message : String(err || 'unknown_error');
      }
    }
  }

  const hasUnexpectedRelatedFailure = CUSTOM_RELATED_COLLECTIONS.some(collectionName =>
    details[collectionName].skipped &&
    details[collectionName].reason &&
    details[collectionName].reason !== 'collection_missing'
  );

  if (!dryRun && !hasUnexpectedRelatedFailure) {
    for (const record of customHabits) {
      if (!record._id) continue;
      await collectionByName(COLLECTIONS.userHabits).doc(record._id).remove();
      details.user_habits.deleted += 1;
    }
  }

  return { details, targetOpenid };
}

function pickDefined(source, keys) {
  const result = {};
  keys.forEach(key => {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      result[key] = source[key];
    }
  });
  return result;
}

function normalizeRepairDailyState(record, targetOpenid) {
  if (!record || typeof record !== 'object') {
    return { valid: false, reason: 'invalid_record' };
  }
  if (!record.userHabitId || !record.habitId || !record.date || !record.status) {
    return { valid: false, reason: 'missing_required_fields', record };
  }
  if (isCustomReference(record)) {
    return { valid: false, reason: 'custom_record_rejected', record };
  }

  const data = {
    _openid: targetOpenid,
    ...pickDefined(record, [
      'stateId',
      'userHabitId',
      'habitId',
      'policyVersionId',
      'date',
      'status',
      'checkedAt',
      'canceledAt',
      'lastOperationId',
      'lastOperationClientTime',
      'lastOperationClientSequence',
      'isLocked',
      'lockReason',
      'hasPolicyChangedToday',
      'hasDeletionToday',
      'updatedAt'
    ])
  };
  data.habitId = String(data.habitId);
  return { valid: true, data };
}

function normalizeRepairCheckinOperation(record, targetOpenid) {
  if (!record || typeof record !== 'object') {
    return { valid: false, reason: 'invalid_record' };
  }
  if (!record.userHabitId || !record.habitId || !record.date || !record.action) {
    return { valid: false, reason: 'missing_required_fields', record };
  }
  if (!record.operationId && !record.idempotencyKey) {
    return { valid: false, reason: 'missing_operation_identity', record };
  }
  if (isCustomReference(record)) {
    return { valid: false, reason: 'custom_record_rejected', record };
  }

  const data = {
    _openid: targetOpenid,
    ...pickDefined(record, [
      'operationId',
      'idempotencyKey',
      'userHabitId',
      'habitId',
      'policyVersionId',
      'date',
      'action',
      'clientTime',
      'clientSequence',
      'serverTime',
      'source'
    ])
  };
  data.habitId = String(data.habitId);
  data.idempotencyKey = data.idempotencyKey || data.operationId;
  data.operationId = data.operationId || data.idempotencyKey;
  data.source = data.source || 'repair';
  return { valid: true, data };
}

async function dailyStateExists(state) {
  const res = await collectionByName(COLLECTIONS.dailyCheckinStates).where({
    _openid: state._openid,
    userHabitId: state.userHabitId,
    date: state.date
  }).get();
  return Boolean(res.data && res.data.length > 0);
}

async function checkinOperationExists(operation) {
  const identityQuery = operation.idempotencyKey
    ? { _openid: operation._openid, idempotencyKey: operation.idempotencyKey }
    : { _openid: operation._openid, operationId: operation.operationId };
  const res = await collectionByName(COLLECTIONS.checkinOperations).where(identityQuery).get();
  return Boolean(res.data && res.data.length > 0);
}

async function inspectOrRepairTargetUserCheckins(event, dryRun) {
  const targetOpenid = event.targetOpenid.trim();
  const dailyStatesInput = Array.isArray(event.dailyStates) ? event.dailyStates : [];
  const operationsInput = Array.isArray(event.checkinOperations) ? event.checkinOperations : [];
  const details = {
    daily_checkin_states: {
      input: dailyStatesInput.length,
      willInsert: 0,
      inserted: 0,
      skippedExisting: 0,
      rejected: []
    },
    checkin_operations: {
      input: operationsInput.length,
      willInsert: 0,
      inserted: 0,
      skippedExisting: 0,
      rejected: []
    }
  };

  for (const raw of dailyStatesInput) {
    const normalized = normalizeRepairDailyState(raw, targetOpenid);
    if (!normalized.valid) {
      details.daily_checkin_states.rejected.push({
        reason: normalized.reason,
        userHabitId: raw && raw.userHabitId || '',
        habitId: raw && raw.habitId || '',
        date: raw && raw.date || ''
      });
      continue;
    }
    if (await dailyStateExists(normalized.data)) {
      details.daily_checkin_states.skippedExisting += 1;
      continue;
    }
    details.daily_checkin_states.willInsert += 1;
    if (!dryRun) {
      await addCollection('daily_checkin_states', normalized.data);
      details.daily_checkin_states.inserted += 1;
    }
  }

  for (const raw of operationsInput) {
    const normalized = normalizeRepairCheckinOperation(raw, targetOpenid);
    if (!normalized.valid) {
      details.checkin_operations.rejected.push({
        reason: normalized.reason,
        userHabitId: raw && raw.userHabitId || '',
        habitId: raw && raw.habitId || '',
        date: raw && raw.date || ''
      });
      continue;
    }
    if (await checkinOperationExists(normalized.data)) {
      details.checkin_operations.skippedExisting += 1;
      continue;
    }
    details.checkin_operations.willInsert += 1;
    if (!dryRun) {
      await addCollection('checkin_operations', normalized.data);
      details.checkin_operations.inserted += 1;
    }
  }

  return { details, targetOpenid };
}

function getDisplayName(record) {
  return record && (record.name || record.title || record.habitTitle || record.habit_title || '') || '';
}

function compareUserHabitForRepair(a, b) {
  if (a.status === 'active' && b.status !== 'active') return -1;
  if (a.status !== 'active' && b.status === 'active') return 1;
  return String(b.addedAt || b.createdAt || '').localeCompare(String(a.addedAt || a.createdAt || ''));
}

function compareDateStr(a, b) {
  const left = String(a || '').split('T')[0];
  const right = String(b || '').split('T')[0];
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isUserHabitActiveOnDate(userHabit, date) {
  const createdAt = String(userHabit.createdAt || '').split('T')[0];
  const deletedAt = String(userHabit.deletedAt || '').split('T')[0];
  if (createdAt && compareDateStr(date, createdAt) < 0) return false;
  if (deletedAt && compareDateStr(date, deletedAt) > 0) return false;
  return true;
}

function isPolicyEffectiveOnDate(policy, date) {
  if (!policy || !policy.effectiveStartDate) return false;
  if (compareDateStr(date, policy.effectiveStartDate) < 0) return false;
  if (policy.effectiveEndDate !== null && policy.effectiveEndDate !== undefined && policy.effectiveEndDate !== '') {
    return compareDateStr(date, policy.effectiveEndDate) <= 0;
  }
  return true;
}

async function listRepairUserHabits(openid, habitId) {
  const res = await collectionByName(COLLECTIONS.userHabits).where({
    _openid: openid,
    habitId: String(habitId)
  }).get();
  return (res.data || [])
    .filter(record => !isCustomHabitRecord(record))
    .sort(compareUserHabitForRepair);
}

async function listPolicyVersions(openid, userHabitId) {
  const res = await collectionByName(COLLECTIONS.habitPolicyVersions).where({
    _openid: openid,
    userHabitId
  }).get();
  return res.data || [];
}

function choosePolicyForDate(policies, date) {
  return (policies || []).find(policy => isPolicyEffectiveOnDate(policy, date)) || null;
}

function chooseLatestPolicy(policies) {
  return (policies || []).find(policy => policy.effectiveEndDate === null) || (policies || [])
    .slice()
    .sort((a, b) => String(b.effectiveStartDate || b.createdAt || '').localeCompare(String(a.effectiveStartDate || a.createdAt || '')))[0] || null;
}

async function resolveRepairTargetForDate(openid, habitId, date) {
  const candidates = await listRepairUserHabits(openid, habitId);
  const enriched = [];
  for (const userHabit of candidates) {
    const policies = await listPolicyVersions(openid, userHabit.userHabitId);
    const policyForDate = choosePolicyForDate(policies, date);
    enriched.push({
      userHabit,
      policies,
      policyForDate,
      activeOnDate: isUserHabitActiveOnDate(userHabit, date)
    });
  }

  const effective = enriched.find(item => item.activeOnDate && item.policyForDate);
  if (effective) return { userHabit: effective.userHabit, policy: effective.policyForDate };

  const lifecycleOnly = enriched.find(item => item.activeOnDate);
  if (lifecycleOnly) return { userHabit: lifecycleOnly.userHabit, policy: chooseLatestPolicy(lifecycleOnly.policies) };

  const fallback = enriched[0];
  return fallback
    ? { userHabit: fallback.userHabit, policy: chooseLatestPolicy(fallback.policies) }
    : { userHabit: null, policy: null };
}

async function findDailyState(openid, userHabitId, date) {
  const res = await collectionByName(COLLECTIONS.dailyCheckinStates).where({
    _openid: openid,
    userHabitId,
    date
  }).get();
  return (res.data || [])[0] || null;
}

async function findOperationByIdempotencyKey(openid, idempotencyKey) {
  const res = await collectionByName(COLLECTIONS.checkinOperations).where({
    _openid: openid,
    idempotencyKey
  }).get();
  return (res.data || [])[0] || null;
}

async function inspectOrRepairBuiltinCheckins(event, dryRun) {
  const targetOpenid = event.targetOpenid.trim();
  const dates = Array.isArray(event.dates) ? event.dates.map(String).filter(Boolean) : [];
  const habitIds = Array.isArray(event.habitIds) ? event.habitIds.map(item => String(item)).filter(Boolean) : [];
  const checkedAt = event.checkedAt || Date.now();
  const serverTime = Date.now();
  const details = {
    input: { dates, habitIds },
    willAdd: 0,
    added: 0,
    willUpdate: 0,
    updated: 0,
    skippedChecked: 0,
    rejected: [],
    records: []
  };

  for (const habitId of habitIds) {
    if (!isBuiltInHabitId(habitId)) {
      details.rejected.push({ habitId, reason: 'not_builtin_habit' });
      continue;
    }

    for (const date of dates) {
      const { userHabit, policy } = await resolveRepairTargetForDate(targetOpenid, habitId, date);
      if (!userHabit || !userHabit.userHabitId) {
        details.rejected.push({ habitId, date, reason: 'user_habit_not_found' });
        continue;
      }
      const existingState = await findDailyState(targetOpenid, userHabit.userHabitId, date);
      const idempotencyKey = `repair_${date}_${userHabit.userHabitId}`;
      const operationId = `op_${idempotencyKey}`;
      const baseState = {
        _openid: targetOpenid,
        stateId: existingState && existingState.stateId || `state_${idempotencyKey}`,
        userHabitId: userHabit.userHabitId,
        habitId,
        policyVersionId: policy && policy.policyVersionId || '',
        date,
        status: 'checked',
        checkedAt,
        lastOperationId: operationId,
        lastOperationClientTime: event.clientTime || '',
        lastOperationClientSequence: event.clientSequence || 0,
        updatedAt: serverTime
      };

      if (existingState && existingState.status === 'checked') {
        details.skippedChecked += 1;
        details.records.push({
          habitId,
          userHabitId: userHabit.userHabitId,
          name: getDisplayName(userHabit),
          date,
          action: 'skip_checked'
        });
        continue;
      }

      const action = existingState ? 'update_to_checked' : 'add_checked';
      if (existingState) {
        details.willUpdate += 1;
        if (!dryRun) {
          await updateDocument('daily_checkin_states', existingState._id, {
            ...pickDefined(baseState, [
              'stateId',
              'userHabitId',
              'habitId',
              'policyVersionId',
              'date',
              'status',
              'checkedAt',
              'lastOperationId',
              'lastOperationClientTime',
              'lastOperationClientSequence',
              'updatedAt'
            ]),
            canceledAt: removeFieldValue()
          });
          details.updated += 1;
        }
      } else {
        details.willAdd += 1;
        if (!dryRun) {
          await addCollection('daily_checkin_states', pickDefined(baseState, [
            '_openid',
            'stateId',
            'userHabitId',
            'habitId',
            'policyVersionId',
            'date',
            'status',
            'checkedAt',
            'lastOperationId',
            'lastOperationClientTime',
            'lastOperationClientSequence',
            'updatedAt'
          ]));
          details.added += 1;
        }
      }

      if (!dryRun) {
        const existingOperation = await findOperationByIdempotencyKey(targetOpenid, idempotencyKey);
        if (!existingOperation) {
          await addCollection('checkin_operations', pickDefined({
            _openid: targetOpenid,
            operationId,
            idempotencyKey,
            userHabitId: userHabit.userHabitId,
            habitId,
            policyVersionId: policy && policy.policyVersionId || '',
            date,
            action: 'checkin',
            clientTime: event.clientTime || '',
            clientSequence: event.clientSequence || 0,
            serverTime,
            source: 'repair'
          }, [
            '_openid',
            'operationId',
            'idempotencyKey',
            'userHabitId',
            'habitId',
            'policyVersionId',
            'date',
            'action',
            'clientTime',
            'clientSequence',
            'serverTime',
            'source'
          ]));
        }
      }

      details.records.push({
        habitId,
        userHabitId: userHabit.userHabitId,
        name: getDisplayName(userHabit),
        date,
        previousStatus: existingState && existingState.status || '',
        action
      });
    }
  }

  return { details, targetOpenid };
}

async function inspectBuiltinCheckins(event) {
  const targetOpenid = event.targetOpenid.trim();
  const dates = Array.isArray(event.dates) ? event.dates.map(String).filter(Boolean) : [];
  const habitIds = Array.isArray(event.habitIds) ? event.habitIds.map(item => String(item)).filter(Boolean) : [];
  const details = {
    input: { dates, habitIds },
    summary: {
      checked: 0,
      missingState: 0,
      missingPolicy: 0,
      missingUserHabit: 0,
      outsideLifecycle: 0,
      notBuiltin: 0
    },
    records: []
  };

  for (const habitId of habitIds) {
    if (!isBuiltInHabitId(habitId)) {
      details.summary.notBuiltin += dates.length || 1;
      details.records.push({ habitId, reason: 'not_builtin_habit' });
      continue;
    }

    for (const date of dates) {
      const candidates = await listRepairUserHabits(targetOpenid, habitId);
      const { userHabit, policy } = await resolveRepairTargetForDate(targetOpenid, habitId, date);
      if (!userHabit || !userHabit.userHabitId) {
        details.summary.missingUserHabit += 1;
        details.records.push({ habitId, date, reason: 'user_habit_not_found', candidates: [] });
        continue;
      }

      const activeOnDate = isUserHabitActiveOnDate(userHabit, date);
      const state = await findDailyState(targetOpenid, userHabit.userHabitId, date);
      const record = {
        habitId,
        date,
        userHabitId: userHabit.userHabitId,
        userHabitStatus: userHabit.status || '',
        createdAt: userHabit.createdAt || '',
        deletedAt: userHabit.deletedAt || '',
        activeOnDate,
        policyVersionId: policy && policy.policyVersionId || '',
        policyStartDate: policy && (policy.effectiveStartDate || policy.startDate) || '',
        policyEndDate: policy && policy.effectiveEndDate || null,
        stateStatus: state && state.status || '',
        stateId: state && state.stateId || '',
        checkedAt: state && state.checkedAt || null,
        candidateUserHabitIds: candidates.map(item => ({
          userHabitId: item.userHabitId,
          status: item.status || '',
          createdAt: item.createdAt || '',
          deletedAt: item.deletedAt || ''
        }))
      };

      if (!activeOnDate) {
        details.summary.outsideLifecycle += 1;
        record.reason = 'outside_lifecycle';
      } else if (!policy) {
        details.summary.missingPolicy += 1;
        record.reason = 'policy_not_effective_on_date';
      } else if (!state) {
        details.summary.missingState += 1;
        record.reason = 'daily_state_missing';
      } else if (state.status === 'checked') {
        details.summary.checked += 1;
        record.reason = 'checked';
      } else {
        record.reason = `state_${state.status || 'unknown'}`;
      }

      details.records.push(record);
    }
  }

  return { details, targetOpenid };
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
  activeCollectionPrefix = getCollectionPrefix(event);
  const dryRun = event.dryRun !== false;
  const validation = validateRequest(event);

  if (!validation.success) {
    return {
      success: false,
      dryRun,
      action: event.action || '',
      scope: event.scope || '',
      details: {},
      message: validation.message
    };
  }

  if (isCleanupCustomHabitsAction(event)) {
    const { details, targetOpenid } = await inspectOrRemoveCustomHabits(event, dryRun);
    const hasUnexpectedFailure = Object.values(details).some(item =>
      item.skipped && item.reason && item.reason !== 'collection_missing'
    );

    return {
      success: !hasUnexpectedFailure,
      dryRun,
      action: event.action,
      targetOpenid,
      details,
      message: dryRun
        ? 'dryRun 完成：未删除任何自定义习惯数据，请确认 details 后再用 dryRun:false 执行。'
        : '指定账号自定义习惯云数据清理完成。'
    };
  }

  if (isRepairCheckinsAction(event)) {
    const { details, targetOpenid } = await inspectOrRepairTargetUserCheckins(event, dryRun);
    return {
      success: true,
      dryRun,
      action: event.action,
      targetOpenid,
      details,
      message: dryRun
        ? 'dryRun 完成：未写入任何打卡修复数据，请确认 details 后再用 dryRun:false 执行。'
        : '指定账号打卡缺失数据修复完成。'
    };
  }

  if (isRepairBuiltinCheckinsAction(event)) {
    const { details, targetOpenid } = await inspectOrRepairBuiltinCheckins(event, dryRun);
    return {
      success: true,
      dryRun,
      action: event.action,
      targetOpenid,
      details,
      message: dryRun
        ? 'dryRun 完成：未写入任何内置习惯打卡修复数据，请确认 details 后再用 dryRun:false 执行。'
        : '指定账号内置习惯打卡状态修复完成。'
    };
  }

  if (isInspectBuiltinCheckinsAction(event)) {
    const { details, targetOpenid } = await inspectBuiltinCheckins(event);
    return {
      success: true,
      dryRun: true,
      action: event.action,
      targetOpenid,
      details,
      message: '检查完成：未写入或删除任何数据。'
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
  CUSTOM_HABITS_ACTION,
  CUSTOM_HABITS_CONFIRM_PHRASE,
  REPAIR_CHECKINS_ACTION,
  REPAIR_CHECKINS_CONFIRM_PHRASE,
  REPAIR_BUILTIN_CHECKINS_ACTION,
  REPAIR_BUILTIN_CHECKINS_CONFIRM_PHRASE,
  INSPECT_BUILTIN_CHECKINS_ACTION,
  INSPECT_BUILTIN_CHECKINS_CONFIRM_PHRASE,
  CUSTOM_RELATED_COLLECTIONS,
  PAGE_SIZE,
  USER_HABIT_ID_QUERY_CHUNK_SIZE,
  ADMIN_TOKEN_ENV,
  buildTargets,
  isCollectionMissingError,
  isCustomHabitRecord,
  chunkArray
};
