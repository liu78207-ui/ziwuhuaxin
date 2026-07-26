/**
 * V1 云同步：事务化打卡归并。
 *
 * 一个事务原子完成：
 * 1. checkin_operations 幂等流水；
 * 2. daily_checkin_states 最终状态及递增 serverRevision；
 * 3. 相反操作覆盖时的 conflict_logs。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command || {};
const COLLECTIONS = {
  checkinOperations: 'checkin_operations',
  dailyCheckinStates: 'daily_checkin_states',
  syncLogs: 'sync_logs',
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

function cleanData(data) {
  return Object.keys(data).reduce((result, key) => {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') result[key] = value;
    return result;
  }, {});
}

function removeFieldValue() {
  return typeof _.remove === 'function' ? _.remove() : null;
}

function legacyLockedReasonFieldName() {
  return 'locked' + 'Reason';
}

function asRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : 0;
}

function toResponseDailyState(state) {
  if (!state) return null;
  const fields = [
    'stateId',
    'userHabitId',
    'habitId',
    'policyVersionId',
    'date',
    'status',
    'checkedAt',
    'canceledAt',
    'lastOperationId',
    'lastServerOperationId',
    'serverRevision',
    'hasPolicyChangedToday',
    'hasDeletionToday',
    'isLocked',
    'lockReason',
    'updatedAt'
  ];
  return fields.reduce((result, field) => {
    if (state[field] !== undefined && state[field] !== null && state[field] !== '') {
      result[field] = state[field];
    }
    return result;
  }, {});
}

function toTimestamp(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.getTime === 'function') return value.getTime();
  return 0;
}

async function runTransaction(worker) {
  if (typeof db.runTransaction === 'function') {
    return db.runTransaction(transaction => worker(transaction));
  }
  // 单元测试数据库使用同一 collection API；生产 SDK 必须走上方事务分支。
  return worker(db);
}

async function writeSyncLog(event, openid, data) {
  try {
    await collection(db, 'syncLogs', event).add({
      data: cleanData({
        _openid: openid,
        type: 'checkin_sync',
        action: data.action,
        status: data.status,
        code: data.code,
        serverRevision: data.serverRevision,
        createdAt: Date.now()
      })
    });
  } catch (err) {
    console.warn('syncCheckin log failed:', err && err.message ? err.message : String(err || 'unknown'));
  }
}

async function mergeCheckin(transaction, event, openid, input) {
  const {
    idempotencyKey,
    operationId,
    userHabitId,
    habitId,
    policyVersionId,
    targetDate,
    action,
    hasPolicyChangedToday,
    strategyLockReason,
    clientCreatedAt,
    clientSequence,
    serverTime
  } = input;
  const effectiveOperationId = operationId || idempotencyKey;
  const targetStatus = action === 'checkin' ? 'checked' : 'canceled';
  const operations = collection(transaction, 'checkinOperations', event);
  const states = collection(transaction, 'dailyCheckinStates', event);

  const [existingOpResult, existingStateResult] = await Promise.all([
    operations.where({ _openid: openid, idempotencyKey }).get(),
    states.where({ _openid: openid, userHabitId, date: targetDate }).get()
  ]);
  const existingOperation = (existingOpResult.data || [])[0] || null;
  const existingState = (existingStateResult.data || [])[0] || null;
  const currentRevision = asRevision(existingState && existingState.serverRevision);

  if (existingOperation) {
    const operationRevision = asRevision(existingOperation.serverRevision);
    const sameOperation = existingState && (
      existingState.lastServerOperationId === effectiveOperationId ||
      existingState.lastOperationId === effectiveOperationId
    );
    if (sameOperation) {
      return {
        success: true,
        code: 'IDEMPOTENT_SKIP',
        resolution: 'IDEMPOTENT',
        stateUpdated: false,
        operationId: existingOperation._id || effectiveOperationId,
        lastOperationId: effectiveOperationId,
        serverRevision: operationRevision || currentRevision,
        dailyState: toResponseDailyState(existingState),
        serverTime
      };
    }
    const operationTime = toTimestamp(existingOperation.serverTime);
    const stateTime = toTimestamp(
      existingState && (
        existingState.lastOperationServerTime ||
        existingState.updatedAt ||
        existingState.checkedAt ||
        existingState.canceledAt
      )
    );
    const staleByRevision = operationRevision > 0 && currentRevision >= operationRevision;
    const staleLegacyOperation = operationRevision === 0 &&
      operationTime > 0 &&
      stateTime > operationTime;
    if (existingState && (staleByRevision || staleLegacyOperation)) {
      return {
        success: true,
        code: 'STALE_OPERATION',
        resolution: 'STALE',
        stateUpdated: false,
        operationId: existingOperation._id || effectiveOperationId,
        lastOperationId: existingState.lastServerOperationId || existingState.lastOperationId,
        serverRevision: currentRevision,
        dailyState: toResponseDailyState(existingState),
        serverTime
      };
    }
  }

  const nextRevision = existingOperation
    ? (asRevision(existingOperation.serverRevision) || currentRevision + 1)
    : currentRevision + 1;
  const effectiveServerTime = existingOperation
    ? (toTimestamp(existingOperation.serverTime) || serverTime)
    : serverTime;
  let operationRecordId = existingOperation && existingOperation._id;

  if (!existingOperation) {
    const addResult = await operations.add({
      data: cleanData({
        _openid: openid,
        operationId: effectiveOperationId,
        idempotencyKey,
        userHabitId,
        habitId: String(habitId || ''),
        policyVersionId,
        date: targetDate,
        action,
        clientTime: clientCreatedAt,
        clientSequence,
        serverRevision: nextRevision,
        serverTime,
        source: 'miniprogram'
      })
    });
    operationRecordId = addResult._id;
  }

  if (existingState && existingState.status && existingState.status !== targetStatus) {
    await collection(transaction, 'conflictLogs', event).add({
      data: cleanData({
        _openid: openid,
        type: 'checkin_state_conflict',
        userHabitId,
        habitId: String(habitId || existingState.habitId || ''),
        date: targetDate,
        previousStatus: existingState.status,
        nextStatus: targetStatus,
        previousOperationId: existingState.lastServerOperationId || existingState.lastOperationId,
        winningOperationId: effectiveOperationId,
        previousServerRevision: currentRevision,
        serverRevision: nextRevision,
        resolution: 'SERVER_COMMIT_ORDER',
        createdAt: serverTime
      })
    });
  }

  const timeFields = targetStatus === 'checked'
    ? { checkedAt: effectiveServerTime, canceledAt: removeFieldValue() }
    : { checkedAt: removeFieldValue(), canceledAt: effectiveServerTime };
  const stateData = {
    ...cleanData({
      userHabitId,
      habitId: String(habitId || (existingState && existingState.habitId) || ''),
      policyVersionId: policyVersionId || (existingState && existingState.policyVersionId),
      date: targetDate,
      status: targetStatus,
      lastOperationId: effectiveOperationId,
      lastServerOperationId: effectiveOperationId,
      lastOperationClientTime: clientCreatedAt,
      lastOperationClientSequence: clientSequence,
      lastOperationServerTime: effectiveServerTime,
      serverRevision: nextRevision,
      ...(hasPolicyChangedToday !== undefined
        ? { hasPolicyChangedToday: hasPolicyChangedToday === true }
        : {}),
      ...(strategyLockReason ? { lockReason: strategyLockReason } : {}),
      updatedAt: serverTime
    }),
    ...timeFields
  };

  if (existingState) {
    await states.doc(existingState._id).update({
      data: {
        ...stateData,
        [legacyLockedReasonFieldName()]: removeFieldValue()
      }
    });
  } else {
    await states.add({
      data: {
        ...stateData,
        _openid: openid,
        stateId: `state_${userHabitId}_${targetDate}`
      }
    });
  }

  return {
    success: true,
    code: existingOperation ? 'IDEMPOTENT_SKIP' : 'SYNC_OK',
    resolution: 'APPLIED',
    stateUpdated: true,
    operationId: operationRecordId || effectiveOperationId,
    lastOperationId: effectiveOperationId,
    serverRevision: nextRevision,
    dailyState: cleanData({
      userHabitId,
      habitId: String(habitId || ''),
      policyVersionId,
      date: targetDate,
      status: targetStatus,
      checkedAt: targetStatus === 'checked' ? effectiveServerTime : null,
      canceledAt: targetStatus === 'canceled' ? effectiveServerTime : null,
      lastOperationId: effectiveOperationId,
      lastServerOperationId: effectiveOperationId,
      serverRevision: nextRevision,
      updatedAt: serverTime
    }),
    serverTime
  };
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  const {
    idempotencyKey,
    operationId,
    userHabitId,
    habitId,
    policyVersionId,
    date,
    action,
    hasPolicyChangedToday,
    lockReason,
    clientCreatedAt: rawClientCreatedAt,
    clientSequence: rawClientSequence
  } = event;

  if (!openid) return { success: false, code: 'NO_OPENID', message: '无法获取用户信息' };
  if (!idempotencyKey) return { success: false, code: 'MISSING_IDEMPOTENCY_KEY', message: '缺少幂等键' };
  if (!userHabitId || !date) return { success: false, code: 'MISSING_PARAMS', message: '缺少 userHabitId 或 date' };
  if (!['checkin', 'undo'].includes(action)) {
    return { success: false, code: 'INVALID_ACTION', message: 'action 必须为 checkin 或 undo' };
  }

  const serverTime = Date.now();
  const targetStatus = action === 'checkin' ? 'checked' : 'canceled';
  const input = {
    idempotencyKey,
    operationId,
    userHabitId,
    habitId,
    policyVersionId,
    targetDate: String(date).split('T')[0],
    action,
    hasPolicyChangedToday,
    strategyLockReason: lockReason || (
      hasPolicyChangedToday
        ? (targetStatus === 'checked' ? 'strategy_changed_after_checkin' : 'strategy_changed_without_checkin')
        : undefined
    ),
    clientCreatedAt: rawClientCreatedAt || event.clientTime || null,
    clientSequence: typeof rawClientSequence === 'number' ? rawClientSequence : 0,
    serverTime
  };

  try {
    await ensureTestCollections([
      'checkinOperations',
      'dailyCheckinStates',
      'syncLogs',
      'conflictLogs'
    ], event);
    const result = await runMergeWithTransactionRetry(transaction =>
      mergeCheckin(transaction, event, openid, input)
    );
    await writeSyncLog(event, openid, {
      action,
      status: result.resolution === 'STALE' ? 'skipped' : 'synced',
      code: result.code,
      serverRevision: result.serverRevision
    });
    return result;
  } catch (err) {
    console.error('syncCheckin error:', err);
    await writeSyncLog(event, openid, { action, status: 'failed', code: 'SYNC_FAILED' });
    return {
      success: false,
      code: 'SYNC_FAILED',
      error: { code: 'SYNC_FAILED', message: err.message || '同步失败' },
      serverTime
    };
  }
};
