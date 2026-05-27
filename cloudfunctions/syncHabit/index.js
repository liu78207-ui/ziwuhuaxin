/**
 * cloudfunctions/syncHabit/index.js
 * Phase 4: 同步用户习惯和策略版本到云端
 *
 * 职责：
 * - 同步 userHabit（addHabit / deleteHabit）
 * - 同步 habit_policy_versions（addHabit / updatePolicy）
 * - 幂等写入（按 userHabitId 唯一）
 *
 * 数据隔离：_openid 由云端自动写入，禁止前端传入
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const {
    action, // 'addHabit' | 'deleteHabit' | 'updatePolicy'
    userHabitId,
    habitId,
    policyVersionId,
    status, // 'active' | 'deleted'
    duration,
    frequencyType,
    frequencyConfig,
    startDate,
    effectiveStartDate,
    idempotencyKey
  } = event;

  if (!openid) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户信息' };
  }

  if (!userHabitId || !habitId) {
    return { success: false, code: 'MISSING_PARAMS', message: '缺少 userHabitId 或 habitId' };
  }

  if (!action || !['addHabit', 'deleteHabit', 'updatePolicy'].includes(action)) {
    return { success: false, code: 'INVALID_ACTION', message: 'action 必须为 addHabit、deleteHabit 或 updatePolicy' };
  }

  const serverTime = Date.now();

  try {
    // ========== userHabit 同步 ==========

    if (action === 'addHabit') {
      // 检查是否已存在（幂等）
      const existingHabit = await db.collection('user_habits').where({
        _openid: openid,
        userHabitId: userHabitId
      }).get();

      if (existingHabit.data && existingHabit.data.length > 0) {
        return {
          success: true,
          code: 'IDEMPOTENT_SKIP',
          message: 'userHabit 已存在（幂等）',
          serverTime
        };
      }

      // 写入 user_habits
      await db.collection('user_habits').add({
        data: {
          _openid: openid,
          userHabitId,
          habitId: String(habitId),
          status: status || 'active',
          createdAt: startDate || toDateStr(new Date()),
          deletedAt: null,
          latestPolicyVersionId: policyVersionId || '',
          syncStatus: 'synced',
          updatedAt: serverTime
        }
      });
    } else if (action === 'deleteHabit') {
      // 软删除 userHabit（按 userHabitId 查找并更新）
      const existingHabit = await db.collection('user_habits').where({
        _openid: openid,
        userHabitId: userHabitId
      }).get();

      if (existingHabit.data && existingHabit.data.length > 0) {
        await db.collection('user_habits').doc(existingHabit.data[0]._id).update({
          data: {
            status: 'deleted',
            deletedAt: toDateStr(new Date()),
            syncStatus: 'synced',
            updatedAt: serverTime
          }
        });
      }
    }

    // ========== policyVersion 同步 ==========

    if (action === 'addHabit' || action === 'updatePolicy') {
      if (!policyVersionId) {
        return { success: false, code: 'MISSING_POLICY_VERSION', message: '缺少 policyVersionId' };
      }

      // 检查是否已存在
      const existingPv = await db.collection('habit_policy_versions').where({
        _openid: openid,
        policyVersionId: policyVersionId
      }).get();

      if (existingPv.data && existingPv.data.length > 0) {
        // 已存在，幂等跳过
        return {
          success: true,
          code: 'IDEMPOTENT_SKIP',
          message: 'policyVersion 已存在（幂等）',
          serverTime
        };
      }

      // 写入 habit_policy_versions
      await db.collection('habit_policy_versions').add({
        data: {
          _openid: openid,
          policyVersionId,
          userHabitId,
          habitId: String(habitId),
          duration: duration || 20,
          frequencyType: frequencyType || 'daily',
          frequencyConfig: frequencyConfig || { intervalDays: 1 },
          startDate: startDate || toDateStr(new Date()),
          effectiveStartDate: effectiveStartDate || startDate || toDateStr(new Date()),
          effectiveEndDate: null,
          syncStatus: 'synced',
          createdAt: serverTime,
          updatedAt: serverTime
        }
      });
    } else if (action === 'deleteHabit') {
      // 关闭该 userHabitId 下所有 policyVersion
      const versionsToClose = await db.collection('habit_policy_versions').where({
        _openid: openid,
        userHabitId: userHabitId,
        effectiveEndDate: null
      }).get();

      const businessDate = toDateStr(new Date());
      for (const pv of versionsToClose.data || []) {
        await db.collection('habit_policy_versions').doc(pv._id).update({
          data: {
            effectiveEndDate: businessDate,
            syncStatus: 'synced',
            updatedAt: serverTime
          }
        });
      }
    }

    return {
      success: true,
      code: 'SYNC_OK',
      message: `habit ${action} 同步成功`,
      serverTime
    };
  } catch (err) {
    console.error('syncHabit error:', err);
    return {
      success: false,
      error: { code: 'SYNC_FAILED', message: err.message || '同步失败' },
      serverTime
    };
  }
};