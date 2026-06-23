/**
 * cloudfunctions/syncCheckin/index.js
 * Phase 4: 同步打卡操作到云端
 *
 * 职责：
 * - 幂等写入 checkin_operations（按 idempotencyKey）
 * - 按 userHabitId + date 更新/创建 daily_checkin_states
 * - 根据 action 字段（checkin/undo）决定写入 checked 还是 canceled
 * - 确保所有目标集合（checkin_operations, daily_checkin_states）都达到目标状态后再返回成功
 *
 * 数据隔离：_openid 由云端自动写入，禁止前端传入
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command || {};

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
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }
    return result;
  }, {});
}

function removeFieldValue() {
  return typeof _.remove === 'function' ? _.remove() : null;
}

function legacyLockedReasonFieldName() {
  return 'locked' + 'Reason';
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 云端自动写入 _openid，禁止前端传入
  const {
    idempotencyKey,
    operationId,
    userHabitId,
    habitId,
    policyVersionId,
    date,
    action, // 'checkin' | 'undo'
    hasPolicyChangedToday,
    lockReason,
    clientCreatedAt: rawClientCreatedAt,
    clientSequence: rawClientSequence
  } = event;

  if (!openid) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户信息' };
  }

  if (!idempotencyKey) {
    return { success: false, code: 'MISSING_IDEMPOTENCY_KEY', message: '缺少幂等键' };
  }

  if (!userHabitId || !date) {
    return { success: false, code: 'MISSING_PARAMS', message: '缺少 userHabitId 或 date' };
  }

  if (!action || !['checkin', 'undo'].includes(action)) {
    return { success: false, code: 'INVALID_ACTION', message: 'action 必须为 checkin 或 undo' };
  }

  const targetDate = date.includes('T') ? date.split('T')[0] : date;
  const serverTime = Date.now();
  const dailyStateStatus = action === 'checkin' ? 'checked' : 'canceled';
  const checkedAt = action === 'checkin' ? serverTime : null;
  const canceledAt = action === 'undo' ? serverTime : null;
  const clientCreatedAt = rawClientCreatedAt || event.clientTime || null;
  const clientSequence = typeof rawClientSequence === 'number' ? rawClientSequence : 0;
  const strategyLockReason = lockReason || (
    hasPolicyChangedToday
      ? (dailyStateStatus === 'checked'
        ? 'strategy_changed_after_checkin'
        : 'strategy_changed_without_checkin')
      : undefined
  );

  let opRecordId = null;
  let opAlreadyExisted = false;

  try {
    // Step 1: 写入或检查 checkin_operations
    const existingOp = await db.collection('checkin_operations').where({
      _openid: openid,
      idempotencyKey: idempotencyKey
    }).get();

    if (existingOp.data && existingOp.data.length > 0) {
      opAlreadyExisted = true;
      opRecordId = existingOp.data[0]._id;
    } else {
      // 写入 checkin_operations（操作流水）
      const opData = cleanData({
        _openid: openid,
        operationId: operationId || idempotencyKey,
        idempotencyKey,
        userHabitId,
        habitId: String(habitId),
        policyVersionId,
        date: targetDate,
        action,
        clientTime: event.clientTime || new Date().toISOString(),
        clientSequence: clientSequence,
        serverTime,
        source: 'miniprogram'
      });

      try {
        const opResult = await db.collection('checkin_operations').add({ data: opData });
        opRecordId = opResult._id;
      } catch (addErr) {
        // 唯一索引冲突（duplicate key）= 幂等跳过，但仍需保证 daily_checkin_states
        if (addErr.errCode === -502001 || (addErr.message || '').includes('duplicate')) {
          opAlreadyExisted = true;
        } else {
          throw addErr;
        }
      }
    }

    // Step 2: 更新/创建 daily_checkin_states（按 userHabitId + date 唯一索引）
    // 不管 operation 是否已存在，都要确保 daily_checkin_states 达到目标状态
    // 但如果已有状态的 lastOperationClientTime 比当前 clientCreatedAt 更新，则跳过更新
    // （防止旧操作重试覆盖新状态）
    const existingState = await db.collection('daily_checkin_states').where({
      _openid: openid,
      userHabitId: userHabitId,
      date: targetDate
    }).get();

    let stateUpdated = false;
    if (existingState.data && existingState.data.length > 0) {
      const existing = existingState.data[0];
      const existingClientTime = existing.lastOperationClientTime;
      const existingSeq = existing.lastOperationClientSequence || 0;

      // 判断是否为过期操作：
      // 1. 先比较 clientSequence（主键，精确判断）：如果云端序列号 >= 当前操作序列号，说明云端已有更新的操作
      // 2. 再比较 clientCreatedAt（辅助键，同序列号时比较时间）：如果时间更晚也说明云端更新
      // 两者满足其一即认为是过期操作，跳过更新
      const isStale = existingSeq >= clientSequence ||
        (existingSeq === clientSequence && existingClientTime && clientCreatedAt &&
          new Date(existingClientTime).getTime() > new Date(clientCreatedAt).getTime());

      if (isStale) {
        // 跳过更新，保持云端现有状态
        return {
          success: true,
          code: 'STALE_OPERATION',
          message: '云端已有更新操作，跳过本次更新',
          operationId: opRecordId,
          stateUpdated: false,
          serverTime
        };
      }

      // 更新现有状态
      const clearOppositeTimeField = dailyStateStatus === 'checked'
        ? { canceledAt: removeFieldValue() }
        : { checkedAt: removeFieldValue() };
      await db.collection('daily_checkin_states').doc(existing._id).update({
        data: {
          ...cleanData({
          status: dailyStateStatus,
          checkedAt: checkedAt,
          canceledAt: canceledAt,
          lastOperationId: operationId || idempotencyKey,
          lastOperationClientTime: clientCreatedAt || null,
          lastOperationClientSequence: clientSequence,
          ...(hasPolicyChangedToday !== undefined ? { hasPolicyChangedToday: hasPolicyChangedToday === true } : {}),
          ...(strategyLockReason ? { lockReason: strategyLockReason } : {}),
          updatedAt: serverTime
          }),
          ...clearOppositeTimeField,
          [legacyLockedReasonFieldName()]: removeFieldValue()
        }
      });
      stateUpdated = true;
    } else {
      // 创建新状态
      await db.collection('daily_checkin_states').add({
        data: cleanData({
          _openid: openid,
          userHabitId,
          habitId: String(habitId),
          policyVersionId,
          date: targetDate,
          status: dailyStateStatus,
          checkedAt: checkedAt,
          canceledAt: canceledAt,
          lastOperationId: operationId || idempotencyKey,
          lastOperationClientTime: clientCreatedAt || null,
          lastOperationClientSequence: clientSequence,
          ...(hasPolicyChangedToday !== undefined ? { hasPolicyChangedToday: hasPolicyChangedToday === true } : {}),
          ...(strategyLockReason ? { lockReason: strategyLockReason } : {}),
          updatedAt: serverTime
        })
      });
      stateUpdated = true;
    }

    // 所有集合都已达到目标状态，返回成功
    return {
      success: true,
      code: opAlreadyExisted ? 'IDEMPOTENT_SKIP' : 'SYNC_OK',
      message: action === 'checkin'
        ? (opAlreadyExisted ? '打卡已存在（幂等），状态已同步' : '打卡同步成功')
        : (opAlreadyExisted ? '取消打卡已存在（幂等），状态已同步' : '取消打卡同步成功'),
      operationId: opRecordId,
      stateUpdated,
      serverTime
    };
  } catch (err) {
    console.error('syncCheckin error:', err);
    return {
      success: false,
      error: { code: 'SYNC_FAILED', message: err.message || '同步失败' },
      serverTime
    };
  }
};
