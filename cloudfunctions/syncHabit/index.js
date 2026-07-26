/**
 * V1 云同步：事务化习惯实例与策略版本归并。
 *
 * 正常业务操作必须携带 idempotencyKey，并在同一事务内写入
 * habit_sync_operations、user_habits、habit_policy_versions 以及必要的
 * daily_checkin_states/conflict_logs。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command || {};
const CUSTOM_ICON_URL = '/assets/icons/habit-zidingyi.png';
const CUSTOM_HABIT_LIBRARY_LIMIT = 12;
const CUSTOM_ACTIVE_HABIT_LIMIT = 5;
const COLLECTIONS = {
  userHabits: 'user_habits',
  habitPolicyVersions: 'habit_policy_versions',
  habitSyncOperations: 'habit_sync_operations',
  dailyCheckinStates: 'daily_checkin_states',
  checkinOperations: 'checkin_operations',
  conflictLogs: 'conflict_logs'
};
const MAX_TRANSACTION_ATTEMPTS = 5;

function getCollectionName(key) {
  const name = COLLECTIONS[key];
  if (!name) throw new Error(`未登记的 CloudBase 集合: ${key}`);
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

function collection(client, key, event = {}) {
  return client.collection(getResolvedCollectionName(key, event));
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

function isDuplicateKeyError(err) {
  const message = String((err && (err.message || err.errMsg)) || err || '');
  return Boolean(err) && (
    err.errCode === -502001 ||
    message.toLowerCase().includes('duplicate') ||
    message.includes('E11000')
  );
}

function isRetryableTransactionError(err) {
  const message = String((err && (err.message || err.errMsg)) || err || '');
  return Boolean(err) && (
    message.includes('TransactionBusy') ||
    message.includes('DATABASE_TRANSACTION_FAIL') ||
    message.toLowerCase().includes('transaction is busy')
  );
}

function wait(delay) {
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function runMergeWithTransactionRetry(worker) {
  let lastError;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await runTransaction(worker);
    } catch (err) {
      lastError = err;
      const retryable = isRetryableTransactionError(err) || isDuplicateKeyError(err);
      if (!retryable || attempt === MAX_TRANSACTION_ATTEMPTS - 1) {
        throw err;
      }
      const baseDelay = Math.min(50 * Math.pow(2, attempt), 500);
      const jitter = Math.floor(Math.random() * 50);
      await wait(baseDelay + jitter);
    }
  }
  throw lastError;
}

async function ensureTestCollections(keys, event = {}) {
  if (getCollectionPrefix(event) !== 'test_' || typeof db.createCollection !== 'function') return;
  for (const key of keys) {
    try {
      await db.createCollection(getResolvedCollectionName(key, event));
    } catch (err) {
      if (!isCollectionAlreadyExists(err)) throw err;
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

function cleanData(data) {
  return Object.keys(data).reduce((result, key) => {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') result[key] = value;
    return result;
  }, {});
}

function normalizeCustomName(value) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
}

function isCustomHabitRecord(record) {
  return record && (
    record.source === 'custom' ||
    String(record.habitId || '').indexOf('custom_') === 0
  );
}

function hasValidCustomName(record) {
  return normalizeCustomName(
    record.name || record.title || record.habitTitle || record.habit_title
  ).length > 0;
}

function removeFieldValue() {
  return typeof _.remove === 'function' ? _.remove() : null;
}

function nullableFieldValue(value) {
  return value === null ? removeFieldValue() : value;
}

function legacyLockedReasonFieldName() {
  return 'locked' + 'Reason';
}

function asRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : 0;
}

function buildLegacyIdempotencyKey(event) {
  const discriminator = event.policyVersionId ||
    event.deletedAt ||
    event.pinnedAt ||
    event.createdAt ||
    event.name ||
    'legacy';
  return `habit_${event.userHabitId}_${event.action}_${String(discriminator)}`;
}

async function runTransaction(worker) {
  if (typeof db.runTransaction === 'function') {
    return db.runTransaction(transaction => worker(transaction));
  }
  return worker(db);
}

async function assertCustomHabitLimits(client, openid, targetHabitId, event) {
  const result = await collection(client, 'userHabits', event).where({ _openid: openid }).get();
  const customHabits = (result.data || []).filter(
    record => isCustomHabitRecord(record) && hasValidCustomName(record)
  );
  const libraryIds = new Set(customHabits.map(record => String(record.habitId || '')).filter(Boolean));
  const activeCount = customHabits.filter(record => record.status === 'active').length;
  if (targetHabitId && !libraryIds.has(String(targetHabitId)) && libraryIds.size >= CUSTOM_HABIT_LIBRARY_LIMIT) {
    return { success: false, code: 'CUSTOM_HABIT_LIBRARY_LIMIT_REACHED', message: '自定义习惯已达 12 个上限' };
  }
  if (activeCount >= CUSTOM_ACTIVE_HABIT_LIMIT) {
    return { success: false, code: 'CUSTOM_ACTIVE_HABIT_LIMIT_REACHED', message: '最多同时启用 5 个自定义习惯' };
  }
  return null;
}

async function writeConflict(client, event, openid, data) {
  await collection(client, 'conflictLogs', event).add({
    data: cleanData({
      _openid: openid,
      type: 'habit_sync_conflict',
      resolution: 'SERVER_COMMIT_ORDER',
      createdAt: Date.now(),
      ...data
    })
  });
}

function responseFromLedger(record, serverTime) {
  return {
    success: record.success !== false,
    code: record.resultCode || 'IDEMPOTENT_SKIP',
    message: record.message || '习惯操作已处理（幂等）',
    resolution: 'IDEMPOTENT',
    stateUpdated: false,
    operationId: record.idempotencyKey,
    serverRevision: asRevision(record.serverRevision),
    latestPolicyVersionId: record.latestPolicyVersionId || null,
    serverTime
  };
}

async function saveLedger(client, event, openid, input, result) {
  await collection(client, 'habitSyncOperations', event).add({
    data: cleanData({
      _openid: openid,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      userHabitId: input.userHabitId,
      habitId: String(input.habitId || ''),
      policyVersionId: input.policyVersionId,
      serverRevision: result.serverRevision,
      latestPolicyVersionId: result.latestPolicyVersionId,
      success: result.success,
      resultCode: result.code,
      resolution: result.resolution,
      stateUpdated: result.stateUpdated,
      message: result.message,
      serverTime: input.serverTime,
      createdAt: input.serverTime
    })
  });
}

async function upsertDailyState(client, event, openid, input, rawState, kind) {
  if (!rawState) return false;
  const date = rawState.date || input.deletedAt || input.effectiveStartDate || input.startDate || toDateStr(new Date());
  const result = await collection(client, 'dailyCheckinStates', event).where({
    _openid: openid,
    userHabitId: input.userHabitId,
    date
  }).get();
  const existing = (result.data || [])[0] || null;
  const status = rawState.status || (kind === 'delete' ? 'not_required' : 'unchecked');
  const lockReason = kind === 'delete'
    ? (status === 'checked' ? 'deleted_after_checkin' : 'deleted_without_checkin')
    : (status === 'checked' ? 'strategy_changed_after_checkin' : 'strategy_changed_without_checkin');
  const nextRevision = asRevision(existing && existing.serverRevision) + 1;
  const stateData = {
    ...cleanData({
      userHabitId: input.userHabitId,
      habitId: String(input.habitId),
      policyVersionId: rawState.policyVersionId || input.policyVersionId,
      date,
      status,
      checkedAt: rawState.checkedAt,
      canceledAt: rawState.canceledAt,
      lastOperationId: rawState.lastOperationId || input.idempotencyKey,
      lastServerOperationId: input.idempotencyKey,
      serverRevision: nextRevision,
      ...(kind === 'delete'
        ? { hasDeletionToday: true, isLocked: true }
        : { hasPolicyChangedToday: true }),
      lockReason,
      updatedAt: input.serverTime
    })
  };
  if (existing) {
    await collection(client, 'dailyCheckinStates', event).doc(existing._id).update({
      data: {
        ...stateData,
        [legacyLockedReasonFieldName()]: removeFieldValue()
      }
    });
  } else {
    await collection(client, 'dailyCheckinStates', event).add({
      data: {
        ...stateData,
        _openid: openid,
        stateId: rawState.stateId || `state_${input.userHabitId}_${date}`
      }
    });
  }
  return true;
}

async function mergeHabit(client, event, openid, input) {
  const ledgerResult = await collection(client, 'habitSyncOperations', event).where({
    _openid: openid,
    idempotencyKey: input.idempotencyKey
  }).get();
  const ledger = (ledgerResult.data || [])[0] || null;
  if (ledger) return responseFromLedger(ledger, input.serverTime);

  const habitResult = await collection(client, 'userHabits', event).where({
    _openid: openid,
    userHabitId: input.userHabitId
  }).get();
  const existing = (habitResult.data || [])[0] || null;

  if (existing && existing.status === 'deleted' && input.action !== 'deleteHabit') {
    await writeConflict(client, event, openid, {
      action: input.action,
      userHabitId: input.userHabitId,
      habitId: String(input.habitId),
      losingOperationId: input.idempotencyKey,
      winningOperationId: existing.lastServerOperationId,
      serverRevision: asRevision(existing.serverRevision),
      reason: 'DELETED_INSTANCE_CANNOT_REACTIVATE'
    });
    const rejected = {
      success: false,
      code: 'USER_HABIT_DELETED',
      message: '已删除的习惯实例不能被旧操作重新激活',
      resolution: 'REJECTED_DELETED',
      stateUpdated: false,
      operationId: input.idempotencyKey,
      serverRevision: asRevision(existing.serverRevision),
      latestPolicyVersionId: existing.latestPolicyVersionId || null,
      serverTime: input.serverTime
    };
    await saveLedger(client, event, openid, input, rejected);
    return rejected;
  }

  if (!existing && input.action !== 'addHabit') {
    return {
      success: false,
      code: 'USER_HABIT_NOT_FOUND',
      message: '未找到 userHabit',
      resolution: 'REJECTED_NOT_FOUND',
      stateUpdated: false,
      serverRevision: 0,
      serverTime: input.serverTime
    };
  }

  if (input.action === 'addHabit' && isCustomHabitRecord(input)) {
    if (normalizeCustomName(input.name).length < 2) {
      return { success: false, code: 'INVALID_NAME', message: '自定义修习名称需为 2-12 个字', serverTime: input.serverTime };
    }
    if (!existing) {
      const limitError = await assertCustomHabitLimits(client, openid, String(input.habitId), event);
      if (limitError) return { ...limitError, serverTime: input.serverTime };
    }
  }
  if (input.action === 'updateHabitMeta' && normalizeCustomName(input.name).length < 2) {
    return { success: false, code: 'INVALID_NAME', message: '自定义修习名称需为 2-12 个字', serverTime: input.serverTime };
  }
  if (['addHabit', 'updatePolicy'].includes(input.action) && !input.policyVersionId) {
    return { success: false, code: 'MISSING_POLICY_VERSION', message: '缺少 policyVersionId', serverTime: input.serverTime };
  }

  const nextRevision = asRevision(existing && existing.serverRevision) + 1;
  const lastOperationFields = {
    serverRevision: nextRevision,
    lastServerOperationId: input.idempotencyKey,
    updatedAt: input.serverTime
  };
  let latestPolicyVersionId = existing && existing.latestPolicyVersionId;
  let stateUpdated = false;

  if (input.action === 'addHabit') {
    const habitData = cleanData({
      _openid: openid,
      userHabitId: input.userHabitId,
      habitId: String(input.habitId),
      source: input.source || 'system',
      name: input.name,
      category: input.category,
      remark: input.remark,
      themeClass: input.themeClass,
      iconUrl: input.iconUrl || (input.source === 'custom' ? CUSTOM_ICON_URL : ''),
      status: 'active',
      createdAt: input.createdAt || input.startDate || toDateStr(new Date()),
      addedAt: input.addedAt,
      pinnedAt: input.pinnedAt,
      latestPolicyVersionId: input.policyVersionId,
      ...lastOperationFields
    });
    if (existing) {
      const { _openid, ...habitPatch } = habitData;
      await collection(client, 'userHabits', event).doc(existing._id).update({ data: habitPatch });
    } else {
      await collection(client, 'userHabits', event).add({ data: habitData });
    }
    latestPolicyVersionId = input.policyVersionId;
  } else if (input.action === 'deleteHabit') {
    const endDate = input.deletedAt || toDateStr(new Date());
    await collection(client, 'userHabits', event).doc(existing._id).update({
      data: {
        status: 'deleted',
        deletedAt: endDate,
        ...lastOperationFields
      }
    });
    const activePolicies = await collection(client, 'habitPolicyVersions', event).where({
      _openid: openid,
      userHabitId: input.userHabitId,
      effectiveEndDate: null
    }).get();
    for (const policy of activePolicies.data || []) {
      await collection(client, 'habitPolicyVersions', event).doc(policy._id).update({
        data: { effectiveEndDate: endDate, updatedAt: input.serverTime }
      });
    }
    stateUpdated = await upsertDailyState(
      client, event, openid, input, input.deletionDailyState, 'delete'
    );
  } else if (input.action === 'updatePinned') {
    await collection(client, 'userHabits', event).doc(existing._id).update({
      data: {
        pinnedAt: nullableFieldValue(input.pinnedAt || null),
        ...lastOperationFields
      }
    });
  } else if (input.action === 'updateHabitMeta') {
    await collection(client, 'userHabits', event).doc(existing._id).update({
      data: cleanData({
        source: 'custom',
        name: normalizeCustomName(input.name),
        category: input.category || '自定义',
        remark: String(input.remark || '').trim().slice(0, 40),
        themeClass: input.themeClass || 't-purple',
        iconUrl: input.iconUrl || CUSTOM_ICON_URL,
        ...lastOperationFields
      })
    });
  }

  if (input.action === 'addHabit' || input.action === 'updatePolicy') {
    const policyStart = input.effectiveStartDate || input.startDate || toDateStr(new Date());
    const activePolicies = await collection(client, 'habitPolicyVersions', event).where({
      _openid: openid,
      userHabitId: input.userHabitId,
      effectiveEndDate: null
    }).get();
    for (const policy of activePolicies.data || []) {
      if (policy.policyVersionId === input.policyVersionId) continue;
      await collection(client, 'habitPolicyVersions', event).doc(policy._id).update({
        data: { effectiveEndDate: policyStart, updatedAt: input.serverTime }
      });
    }

    const versionResult = await collection(client, 'habitPolicyVersions', event).where({
      _openid: openid,
      policyVersionId: input.policyVersionId
    }).get();
    const existingVersion = (versionResult.data || [])[0] || null;
    const versionData = {
      ...cleanData({
        _openid: openid,
        policyVersionId: input.policyVersionId,
        userHabitId: input.userHabitId,
        habitId: String(input.habitId),
        duration: input.duration || 20,
        frequencyType: input.frequencyType || 'daily',
        frequencyConfig: input.frequencyConfig || { intervalDays: 1 },
        startDate: input.startDate || policyStart,
        effectiveStartDate: policyStart,
        createdAt: existingVersion ? existingVersion.createdAt : input.serverTime,
        updatedAt: input.serverTime
      }),
      effectiveEndDate: null
    };
    if (existingVersion) {
      const { _openid, ...versionPatch } = versionData;
      await collection(client, 'habitPolicyVersions', event).doc(existingVersion._id).update({ data: versionPatch });
    } else {
      await collection(client, 'habitPolicyVersions', event).add({ data: versionData });
    }
    latestPolicyVersionId = input.policyVersionId;
    if (input.action === 'updatePolicy') {
      await collection(client, 'userHabits', event).doc(existing._id).update({
        data: { latestPolicyVersionId, ...lastOperationFields }
      });
      stateUpdated = await upsertDailyState(
        client, event, openid, input, input.strategyChangedDailyState, 'policy'
      );
    }
  }

  const applied = {
    success: true,
    code: 'SYNC_OK',
    message: `habit ${input.action} 同步成功`,
    resolution: 'APPLIED',
    stateUpdated,
    operationId: input.idempotencyKey,
    serverRevision: nextRevision,
    latestPolicyVersionId: latestPolicyVersionId || null,
    serverTime: input.serverTime
  };
  await saveLedger(client, event, openid, input, applied);
  return applied;
}

async function cleanupNamelessCustomHabits(event, openid) {
  const habitsResult = await collection(db, 'userHabits', event).where({ _openid: openid }).get();
  const nameless = (habitsResult.data || []).filter(
    record => isCustomHabitRecord(record) && !hasValidCustomName(record)
  );
  const removedUserHabitIds = nameless.map(record => record.userHabitId).filter(Boolean);
  for (const record of nameless) {
    await collection(db, 'userHabits', event).doc(record._id).remove();
  }
  for (const userHabitId of removedUserHabitIds) {
    for (const key of ['habitPolicyVersions', 'dailyCheckinStates', 'checkinOperations']) {
      const result = await collection(db, key, event).where({ _openid: openid, userHabitId }).get();
      for (const record of result.data || []) {
        await collection(db, key, event).doc(record._id).remove();
      }
    }
  }
  return {
    success: true,
    action: 'cleanupNamelessCustomHabits',
    removedCount: nameless.length,
    removedUserHabitIds,
    serverTime: Date.now()
  };
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, code: 'NO_OPENID', message: '无法获取用户信息' };

  const action = event.action;
  const allowedActions = [
    'addHabit',
    'deleteHabit',
    'updatePolicy',
    'updatePinned',
    'updateHabitMeta',
    'cleanupNamelessCustomHabits'
  ];
  if (!allowedActions.includes(action)) {
    return { success: false, code: 'INVALID_ACTION', message: '不支持的习惯同步 action' };
  }

  try {
    await ensureTestCollections(Object.keys(COLLECTIONS), event);
    if (action === 'cleanupNamelessCustomHabits') {
      return cleanupNamelessCustomHabits(event, openid);
    }
    if (!event.userHabitId || !event.habitId) {
      return { success: false, code: 'MISSING_PARAMS', message: '缺少 userHabitId 或 habitId' };
    }
    const input = {
      ...event,
      action,
      idempotencyKey: event.idempotencyKey || buildLegacyIdempotencyKey(event),
      serverTime: Date.now()
    };
    return await runMergeWithTransactionRetry(transaction =>
      mergeHabit(transaction, event, openid, input)
    );
  } catch (err) {
    console.error('syncHabit error:', err);
    return {
      success: false,
      code: 'SYNC_FAILED',
      error: { code: 'SYNC_FAILED', message: err.message || '同步失败' },
      serverTime: Date.now()
    };
  }
};
