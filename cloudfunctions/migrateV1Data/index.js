/**
 * migrateV1Data - V1 formal data migration cloud function
 *
 * Reads legacy collections:
 * - user_strategies
 * - user_strategy_versions
 * - checkin_logs
 *
 * Writes V1 collections idempotently:
 * - user_habits
 * - habit_policy_versions
 * - checkin_operations
 * - daily_checkin_states
 * - migration_logs
 * - conflict_logs
 *
 * This function is intentionally non-destructive: it never deletes legacy data.
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const MIGRATION_VERSION = 'v1-formal-001';
const TARGET_COLLECTIONS = [
  'user_habits',
  'habit_policy_versions',
  'checkin_operations',
  'daily_checkin_states',
  'migration_logs',
  'conflict_logs'
];

function normalizeEvent(event) {
  if (event && typeof event === 'object') {
    for (const key of ['data', 'params', 'body', 'event']) {
      if (typeof event[key] === 'string') {
        const parsed = normalizeEvent(event[key]);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return { ...event, ...parsed };
        }
      }
      if (event[key] && typeof event[key] === 'object') {
        return { ...event, ...event[key] };
      }
    }
    return event;
  }

  if (!event) {
    return event || {};
  }
  if (typeof event !== 'string') {
    return {};
  }

  try {
    return JSON.parse(event);
  } catch (err) {
    try {
      return JSON.parse(event.replace(/\\"/g, '"'));
    } catch (secondErr) {
      return {};
    }
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateStr(value) {
  if (!value) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'string') return value.split('T')[0];
  if (typeof value.toDate === 'function') return formatDate(value.toDate());
  if (typeof value.toISOString === 'function') return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function getValue(record, keys, fallback = '') {
  for (const key of keys) {
    if (record && record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }
  return fallback;
}

function isCollectionMissing(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -502005 ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('collection not exists') ||
    message.includes('Db or Table not exist')
  );
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get();
  } catch (err) {
    if (!isCollectionMissing(err)) {
      throw err;
    }
    if (typeof db.createCollection !== 'function') {
      throw err;
    }
    try {
      await db.createCollection(name);
    } catch (createErr) {
      const message = createErr && (createErr.message || createErr.errMsg || '');
      if (!message.includes('already exists') && !message.includes('collection exists')) {
        throw createErr;
      }
    }
  }
}

async function getAll(collectionName, openid) {
  try {
    const res = await db.collection(collectionName).where({ _openid: openid }).get();
    return res.data || [];
  } catch (err) {
    if (isCollectionMissing(err)) {
      return [];
    }
    throw err;
  }
}

async function getAllForAdmin(collectionName) {
  try {
    const res = await db.collection(collectionName).where({}).get();
    return res.data || [];
  } catch (err) {
    if (isCollectionMissing(err)) {
      return [];
    }
    throw err;
  }
}

async function resolveOpenid(event, wxOpenid) {
  if (wxOpenid) {
    return { success: true, openid: wxOpenid, openidSource: 'wx-context' };
  }

  if (!event.adminMigration) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  const legacySources = await Promise.all([
    getAllForAdmin('user_strategies'),
    getAllForAdmin('user_strategy_versions'),
    getAllForAdmin('checkin_logs'),
    getAllForAdmin('users')
  ]);
  const [strategies, versions, logs, users] = legacySources;
  const openids = Array.from(new Set(
    legacySources
      .flat()
      .map(item => item && item._openid)
      .filter(Boolean)
  )).sort();

  if (event.targetOpenid) {
    if (!openids.includes(event.targetOpenid)) {
      return {
        success: false,
        code: 'TARGET_OPENID_NOT_FOUND',
        message: '指定 openid 不存在于旧集合',
        data: { openids, summaries: buildOpenidSummaries(openids, strategies, versions, logs, users) }
      };
    }
    return { success: true, openid: event.targetOpenid, openidSource: 'admin-target-openid' };
  }

  if (openids.length === 1) {
    return { success: true, openid: openids[0], openidSource: 'admin-single-legacy-openid' };
  }

  return {
    success: false,
    code: 'NEED_TARGET_OPENID',
    message: '旧集合存在多个 openid，请指定 targetOpenid',
    data: { openids, summaries: buildOpenidSummaries(openids, strategies, versions, logs, users) }
  };
}

function buildOpenidSummaries(openids, strategies, versions, logs, users) {
  return openids.map(openid => {
    const user = users.find(item => item && item._openid === openid) || {};
    return {
      openid,
      userStrategies: strategies.filter(item => item && item._openid === openid).length,
      strategyVersions: versions.filter(item => item && item._openid === openid).length,
      checkinLogs: logs.filter(item => item && item._openid === openid).length,
      nickName: getValue(user, ['nickName', 'nickname', 'name'], ''),
      createdAt: getValue(user, ['createdAt', 'created_at'], '')
    };
  });
}

async function findOne(collectionName, query) {
  const res = await db.collection(collectionName).where(query).get();
  return (res.data || [])[0] || null;
}

async function upsert(collectionName, query, data, dryRun) {
  const existing = await findOne(collectionName, query);
  if (dryRun) {
    return existing ? { action: 'existing', record: existing } : { action: 'wouldCreate', record: data };
  }

  if (existing) {
    await db.collection(collectionName).doc(existing._id).update({ data });
    return { action: 'updated', record: existing };
  }

  const addResult = await db.collection(collectionName).add({ data });
  return { action: 'created', record: { ...data, _id: addResult._id } };
}

function normalizeFrequency(record) {
  const frequencyType = String(getValue(record, ['frequencyType', 'freq_type'], 'daily') || 'daily');
  const rawRules = getValue(record, ['frequencyConfig', 'freq_rules'], null);
  const rawCategory = getValue(record, ['freq_category'], '');

  if (frequencyType === 'weekly') {
    if (Array.isArray(rawRules)) return { frequencyType, frequencyConfig: { weekdays: rawRules } };
    if (Number.isFinite(Number(rawRules)) && rawRules !== null) {
      return { frequencyType, frequencyConfig: { weekdays: [Number(rawRules)] } };
    }
    if (typeof rawRules === 'string') {
      const weekdays = rawRules.split(',').map(item => Number(item.trim())).filter(Number.isFinite);
      return { frequencyType, frequencyConfig: { weekdays } };
    }
    return { frequencyType, frequencyConfig: { weekdays: [] } };
  }

  if (frequencyType === 'interval' || rawCategory === 'interval') {
    const intervalDays = Number(rawRules) > 0 ? Number(rawRules) : 1;
    return { frequencyType: 'interval', frequencyConfig: { intervalDays } };
  }

  return { frequencyType: 'daily', frequencyConfig: { intervalDays: 1 } };
}

function buildUserHabit(openid, strategy, serverTime) {
  const strategyId = getValue(strategy, ['_id', 'id'], '');
  const habitId = String(getValue(strategy, ['habitId', 'habit_id'], ''));
  const startDate = toDateStr(getValue(strategy, ['createdAt', 'plan_start_date', 'startDate'], new Date()));
  const deletedAt = getValue(strategy, ['deletedAt', 'deleted_at'], null);
  const isDeleted = strategy.isDeleted === true || strategy.is_deleted === true || Boolean(deletedAt);
  const status = getValue(strategy, ['status'], isDeleted ? 'deleted' : 'active');
  const userHabitId = getValue(
    strategy,
    ['userHabitId', 'user_habit_id'],
    `uh_${sanitizeId(strategyId || `${habitId}_${startDate}`)}`
  );

  return {
    _openid: openid,
    userHabitId,
    habitId,
    title: getValue(strategy, ['title', 'habit_title'], ''),
    category: getValue(strategy, ['category'], ''),
    status,
    isDeleted: status === 'deleted',
    createdAt: startDate,
    deletedAt: deletedAt ? toDateStr(deletedAt) : null,
    latestPolicyVersionId: '',
    syncStatus: 'synced',
    migrationVersion: MIGRATION_VERSION,
    migratedFrom: 'user_strategies',
    legacyStrategyId: strategyId,
    updatedAt: serverTime
  };
}

function buildPolicyVersion(openid, userHabit, source, serverTime, index) {
  const startDate = toDateStr(getValue(source, ['effectiveStartDate', 'start_date', 'plan_start_date', 'createdAt'], userHabit.createdAt));
  const endDate = getValue(source, ['effectiveEndDate', 'end_date', 'deletedAt'], userHabit.deletedAt || null);
  const legacyVersionId = getValue(source, ['_id', 'id'], '');
  const policyVersionId = getValue(
    source,
    ['policyVersionId', 'policy_version_id'],
    `pv_${sanitizeId(legacyVersionId || `${userHabit.userHabitId}_${startDate}_${index}`)}`
  );
  const frequency = normalizeFrequency(source);

  return {
    _openid: openid,
    policyVersionId,
    userHabitId: userHabit.userHabitId,
    habitId: userHabit.habitId,
    duration: Number(getValue(source, ['duration'], 20)) || 20,
    frequencyType: frequency.frequencyType,
    frequencyConfig: frequency.frequencyConfig,
    startDate,
    effectiveStartDate: startDate,
    effectiveEndDate: endDate ? toDateStr(endDate) : null,
    syncStatus: 'synced',
    migrationVersion: MIGRATION_VERSION,
    migratedFrom: legacyVersionId ? 'user_strategy_versions' : 'user_strategies',
    legacyVersionId,
    createdAt: serverTime,
    updatedAt: serverTime
  };
}

function getCheckinAction(log) {
  const rawAction = String(getValue(log, ['action', 'operationType', 'type'], 'checkin'));
  const rawStatus = getValue(log, ['sync_status', 'status'], null);
  if (rawAction === 'undo' || rawAction === 'cancel' || rawAction === 'canceled' || rawStatus === 2 || rawStatus === 'canceled') {
    return 'undo';
  }
  return 'checkin';
}

function buildCheckinOperation(openid, log, userHabit, policyVersion, serverTime) {
  const logId = getValue(log, ['_id', 'id'], '');
  const date = toDateStr(getValue(log, ['date', 'checkin_date', 'created_at', 'createdAt'], ''));
  const action = getCheckinAction(log);
  const operationId = getValue(log, ['operationId', 'operation_id'], `op_${sanitizeId(`${userHabit.userHabitId}_${date}_${action}`)}`);
  const idempotencyKey = getValue(
    log,
    ['idempotencyKey', 'idempotency_key'],
    `legacy:${openid}:${userHabit.userHabitId}:${date}:${action === 'undo' ? 'undo' : 'checkin'}`
  );

  return {
    _openid: openid,
    operationId,
    idempotencyKey,
    userHabitId: userHabit.userHabitId,
    habitId: userHabit.habitId,
    policyVersionId: policyVersion ? policyVersion.policyVersionId : '',
    date,
    action,
    clientTime: getValue(log, ['clientTime', 'created_at', 'createdAt'], null),
    clientSequence: Number(getValue(log, ['clientSequence', 'sequence'], 0)) || 0,
    serverTime,
    source: 'migration',
    syncStatus: 'synced',
    migrationVersion: MIGRATION_VERSION,
    migratedFrom: 'checkin_logs',
    legacyLogId: logId
  };
}

async function recordConflictLog(openid, conflict, serverTime, dryRun) {
  const conflictId = `migration_conflict_${sanitizeId(`${MIGRATION_VERSION}_${conflict.idempotencyKey}_${conflict.legacyLogId}`)}`;
  const data = {
    _openid: openid,
    conflictId,
    conflictType: 'duplicate_legacy_checkin_log',
    sourceCollection: 'checkin_logs',
    migrationVersion: MIGRATION_VERSION,
    idempotencyKey: conflict.idempotencyKey,
    legacyLogId: conflict.legacyLogId,
    existingLegacyLogId: conflict.existingLegacyLogId || '',
    resolution: 'kept_first_operation_updated_daily_state',
    createdAt: serverTime,
    updatedAt: serverTime
  };

  return upsert('conflict_logs', { _openid: openid, conflictId }, data, dryRun);
}

function buildDailyState(openid, operation, serverTime) {
  const checked = operation.action === 'checkin';
  return {
    _openid: openid,
    stateId: `ds_${sanitizeId(`${operation.userHabitId}_${operation.date}`)}`,
    userHabitId: operation.userHabitId,
    habitId: operation.habitId,
    policyVersionId: operation.policyVersionId || '',
    date: operation.date,
    status: checked ? 'checked' : 'canceled',
    checkedAt: checked ? serverTime : null,
    canceledAt: checked ? null : serverTime,
    lastOperationId: operation.operationId,
    lastOperationClientTime: operation.clientTime || null,
    lastOperationClientSequence: operation.clientSequence || 0,
    syncStatus: 'synced',
    migrationVersion: MIGRATION_VERSION,
    updatedAt: serverTime
  };
}

exports.main = async (rawEvent = {}, context = {}) => {
  const event = normalizeEvent(rawEvent);
  const wxContext = cloud.getWXContext();
  const dryRun = event.dryRun === true;
  const serverTime = Date.now();

  const counts = {
    userHabits: 0,
    policyVersions: 0,
    checkinOperations: 0,
    dailyStates: 0,
    conflictLogs: 0
  };
  const skipped = {
    orphanCheckinLogs: 0,
    invalidCheckinLogs: 0
  };

  try {
    for (const collectionName of TARGET_COLLECTIONS) {
      await ensureCollection(collectionName);
    }

    const openidResult = await resolveOpenid(event, wxContext.OPENID);
    if (!openidResult.success) {
      return { ...openidResult, serverTime };
    }
    const openid = openidResult.openid;

    const strategies = await getAll('user_strategies', openid);
    const legacyVersions = await getAll('user_strategy_versions', openid);
    const checkinLogs = await getAll('checkin_logs', openid);
    const userHabitsByHabitId = {};
    const policyByUserHabitId = {};

    for (const strategy of strategies) {
      const userHabit = buildUserHabit(openid, strategy, serverTime);
      const habitResult = await upsert(
        'user_habits',
        { _openid: openid, userHabitId: userHabit.userHabitId },
        userHabit,
        dryRun
      );
      if (habitResult.action === 'created' || habitResult.action === 'wouldCreate') {
        counts.userHabits += 1;
      }
      userHabitsByHabitId[userHabit.habitId] = userHabit;

      const matchingVersions = legacyVersions.filter(version => {
        const versionHabitId = String(getValue(version, ['habitId', 'habit_id'], ''));
        return versionHabitId === userHabit.habitId;
      });
      const versionSources = matchingVersions.length > 0 ? matchingVersions : [strategy];

      for (let i = 0; i < versionSources.length; i += 1) {
        const policyVersion = buildPolicyVersion(openid, userHabit, versionSources[i], serverTime, i);
        const policyResult = await upsert(
          'habit_policy_versions',
          { _openid: openid, policyVersionId: policyVersion.policyVersionId },
          policyVersion,
          dryRun
        );
        if (policyResult.action === 'created' || policyResult.action === 'wouldCreate') {
          counts.policyVersions += 1;
        }
        if (!policyByUserHabitId[userHabit.userHabitId] || !policyVersion.effectiveEndDate) {
          policyByUserHabitId[userHabit.userHabitId] = policyVersion;
        }
        if (!userHabit.latestPolicyVersionId || !policyVersion.effectiveEndDate) {
          userHabit.latestPolicyVersionId = policyVersion.policyVersionId;
        }
      }

      if (!dryRun && userHabit.latestPolicyVersionId) {
        const existingHabit = await findOne('user_habits', { _openid: openid, userHabitId: userHabit.userHabitId });
        if (existingHabit && existingHabit.latestPolicyVersionId !== userHabit.latestPolicyVersionId) {
          await db.collection('user_habits').doc(existingHabit._id).update({
            data: {
              latestPolicyVersionId: userHabit.latestPolicyVersionId,
              updatedAt: serverTime
            }
          });
        }
      }
    }

    const sortedLogs = checkinLogs.slice().sort((a, b) => {
      const aTime = getValue(a, ['created_at', 'createdAt', 'checkin_date', 'date'], '');
      const bTime = getValue(b, ['created_at', 'createdAt', 'checkin_date', 'date'], '');
      return String(aTime).localeCompare(String(bTime));
    });

    for (const log of sortedLogs) {
      const habitId = String(getValue(log, ['habitId', 'habit_id'], ''));
      const userHabit = userHabitsByHabitId[habitId];
      const date = toDateStr(getValue(log, ['date', 'checkin_date', 'created_at', 'createdAt'], ''));

      if (!userHabit) {
        skipped.orphanCheckinLogs += 1;
        continue;
      }
      if (!date) {
        skipped.invalidCheckinLogs += 1;
        continue;
      }

      const policyVersion = policyByUserHabitId[userHabit.userHabitId];
      const operation = buildCheckinOperation(openid, log, userHabit, policyVersion, serverTime);

      const existingOperation = await findOne('checkin_operations', {
        _openid: openid,
        idempotencyKey: operation.idempotencyKey
      });
      if (existingOperation) {
        if (existingOperation.legacyLogId && existingOperation.legacyLogId !== operation.legacyLogId) {
          const conflictResult = await recordConflictLog(openid, {
            idempotencyKey: operation.idempotencyKey,
            legacyLogId: operation.legacyLogId,
            existingLegacyLogId: existingOperation.legacyLogId
          }, serverTime, dryRun);
          if (conflictResult.action === 'created' || conflictResult.action === 'wouldCreate') {
            counts.conflictLogs += 1;
          }
        }
      } else if (dryRun) {
        counts.checkinOperations += 1;
      } else {
        await db.collection('checkin_operations').add({ data: operation });
        counts.checkinOperations += 1;
      }

      const dailyState = buildDailyState(openid, operation, serverTime);
      const stateResult = await upsert(
        'daily_checkin_states',
        { _openid: openid, userHabitId: operation.userHabitId, date: operation.date },
        dailyState,
        dryRun
      );
      if (stateResult.action === 'created' || stateResult.action === 'wouldCreate') {
        counts.dailyStates += 1;
      }
    }

    const migrationLog = {
      _openid: openid,
      migrationVersion: MIGRATION_VERSION,
      dryRun,
      counts,
      skipped,
      updatedAt: serverTime
    };
    await upsert(
      'migration_logs',
      { _openid: openid, migrationVersion: MIGRATION_VERSION },
      migrationLog,
      dryRun
    );

    return {
      success: true,
      code: dryRun ? 'MIGRATION_DRY_RUN_OK' : 'MIGRATION_OK',
      data: {
        migrationVersion: MIGRATION_VERSION,
        openidSource: openidResult.openidSource,
        dryRun,
        counts,
        skipped
      },
      serverTime
    };
  } catch (err) {
    console.error('migrateV1Data error:', err);
    return {
      success: false,
      code: 'MIGRATION_FAILED',
      message: err.message || 'V1 数据迁移失败',
      serverTime
    };
  }
};
