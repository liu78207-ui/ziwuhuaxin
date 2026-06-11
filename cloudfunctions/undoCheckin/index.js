const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const {
    habit_id,
    checkin_date,
    userHabitId,
    policyVersionId = '',
    operationId,
    idempotencyKey,
    clientCreatedAt,
    clientSequence = 0
  } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  const targetDate = checkin_date || formatDate(new Date());
  const serverTime = Date.now();

  // 统一使用字符串类型的 habit_id
  const habitIdStr = String(habit_id);
  const targetUserHabitId = String(userHabitId || habitIdStr);
  const targetOperationId = operationId || `legacy_undo_${targetUserHabitId}_${targetDate}`;
  const targetIdempotencyKey = idempotencyKey || `legacy:${targetUserHabitId}:${targetDate}:undo`;

  try {
    // 查找今日打卡记录（同时匹配字符串和数字类型）
    const existingLog = await db.collection('checkin_logs').where({
      _openid: openid,
      $or: [
        { habit_id: habitIdStr, checkin_date: targetDate },
        { habit_id: habit_id, checkin_date: targetDate },
        { habit_id: Number(habit_id), checkin_date: targetDate }
      ]
    }).get();

    if (!existingLog.data || existingLog.data.length === 0) {
      return { success: false, code: 'CHECKIN_NOT_FOUND', message: '今日未打卡，无需取消' };
    }

    const logId = existingLog.data[0]._id;

    // 兼容旧集合：不再物理删除唯一历史记录，改为取消标记。
    await db.collection('checkin_logs').doc(logId).update({
      data: {
        sync_status: 2,
        canceled_at: serverTime,
        canceledAt: new Date(serverTime).toISOString(),
        cancel_operation_id: targetOperationId
      }
    });

    // 新模型补写：旧函数仍被调用时，也要保留 operation -> daily state 语义。
    const existingOp = await db.collection('checkin_operations').where({
      _openid: openid,
      idempotencyKey: targetIdempotencyKey
    }).get();

    if (!existingOp.data || existingOp.data.length === 0) {
      await db.collection('checkin_operations').add({
        data: {
          _openid: openid,
          operationId: targetOperationId,
          idempotencyKey: targetIdempotencyKey,
          userHabitId: targetUserHabitId,
          habitId: habitIdStr,
          policyVersionId,
          date: targetDate,
          action: 'undo',
          clientTime: clientCreatedAt || new Date(serverTime).toISOString(),
          clientSequence,
          serverTime,
          source: 'legacy_undoCheckin',
          syncStatus: 'synced'
        }
      });
    }

    const existingState = await db.collection('daily_checkin_states').where({
      _openid: openid,
      userHabitId: targetUserHabitId,
      date: targetDate
    }).get();

    const stateData = {
      status: 'canceled',
      checkedAt: null,
      canceledAt: serverTime,
      lastOperationId: targetOperationId,
      lastOperationClientTime: clientCreatedAt || null,
      lastOperationClientSequence: clientSequence,
      syncStatus: 'synced',
      updatedAt: serverTime
    };

    if (existingState.data && existingState.data.length > 0) {
      await db.collection('daily_checkin_states').doc(existingState.data[0]._id).update({
        data: stateData
      });
    } else {
      await db.collection('daily_checkin_states').add({
        data: {
          _openid: openid,
          userHabitId: targetUserHabitId,
          habitId: habitIdStr,
          policyVersionId,
          date: targetDate,
          ...stateData
        }
      });
    }

    return { success: true, code: 'CHECKIN_CANCELED', message: '取消打卡成功' };

  } catch (err) {
    console.error('undoCheckin error:', err);
    return { success: false, code: 'UNDO_CHECKIN_FAILED', message: err.message };
  }
};
