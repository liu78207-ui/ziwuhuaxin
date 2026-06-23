/**
 * cloudfunctions/syncHabit/index.js
 * Phase 4: 同步用户习惯和策略版本到云端
 *
 * 职责：
 * - 同步 userHabit（addHabit / deleteHabit）
 * - 同步 habit_policy_versions（addHabit / updatePolicy）
 * - 幂等写入（按 userHabitId 唯一）
 * - deleteHabit 时使用 payload 中的 deletedAt，而非云端同步日期
 * - updatePolicy 时关闭旧版本再写入新版本
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
    createdAt,
    // 以下字段用于 close 旧版本
    previousPolicyVersionId,
    previousEffectiveEndDate,
    strategyChangedDailyState,
    deletionDailyState,
    // 用于 deleteHabit 的本地业务日期
    deletedAt,
    // 用于 idempotent retry
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
        // 已存在，检查状态是否已为目标状态
        const existing = existingHabit.data[0];
        const habitCreatedAt = createdAt || existing.createdAt || startDate || toDateStr(new Date());
        if (existing.status !== (status || 'active') || !existing.createdAt) {
          // 状态不一致，需要更新
          await db.collection('user_habits').doc(existing._id).update({
            data: cleanData({
              status: status || 'active',
              createdAt: habitCreatedAt,
              updatedAt: serverTime
            })
          });
        }
        // 注意：不直接 return，必须继续执行 policyVersion 同步
        // 以确保 userHabit 和 policyVersion 都达到目标状态
      } else {
        // 写入 user_habits
        await db.collection('user_habits').add({
          data: cleanData({
            _openid: openid,
            userHabitId,
            habitId: String(habitId),
            status: status || 'active',
            createdAt: createdAt || startDate || toDateStr(new Date()),
            updatedAt: serverTime
          })
        });
      }
      // 继续执行 policyVersion 同步（见下方 if 块）
    } else if (action === 'deleteHabit') {
      // 软删除 userHabit，使用 payload 中的 deletedAt（本地业务日期）
      const existingHabit = await db.collection('user_habits').where({
        _openid: openid,
        userHabitId: userHabitId
      }).get();

      if (existingHabit.data && existingHabit.data.length > 0) {
        await db.collection('user_habits').doc(existingHabit.data[0]._id).update({
          data: {
            status: 'deleted',
            // 使用 payload 中的 deletedAt，不可用云端同步日期
            deletedAt: deletedAt || toDateStr(new Date()),
            updatedAt: serverTime
          }
        });
      }

      // 关闭该 userHabitId 下所有 policyVersion，使用 payload 中的日期
      const versionsToClose = await db.collection('habit_policy_versions').where({
        _openid: openid,
        userHabitId: userHabitId,
        effectiveEndDate: null
      }).get();

      const endDate = deletedAt || toDateStr(new Date());
      for (const pv of versionsToClose.data || []) {
        await db.collection('habit_policy_versions').doc(pv._id).update({
          data: {
            effectiveEndDate: endDate,
            updatedAt: serverTime
          }
        });
      }

      if (deletionDailyState) {
        const dailyStateDate = deletionDailyState.date || endDate;
        const dailyStateStatus = deletionDailyState.status || 'not_required';
        const lockReason = dailyStateStatus === 'checked'
          ? 'deleted_after_checkin'
          : 'deleted_without_checkin';
        const stateData = cleanData({
          userHabitId,
          habitId: String(habitId),
          policyVersionId: deletionDailyState.policyVersionId || policyVersionId,
          date: dailyStateDate,
          status: dailyStateStatus,
          checkedAt: deletionDailyState.checkedAt,
          canceledAt: deletionDailyState.canceledAt,
          lastOperationId: deletionDailyState.lastOperationId,
          hasDeletionToday: true,
          isLocked: true,
          lockReason,
          updatedAt: serverTime
        });

        const existingState = await db.collection('daily_checkin_states').where({
          _openid: openid,
          userHabitId,
          date: dailyStateDate
        }).get();

        if (existingState.data && existingState.data.length > 0) {
          await db.collection('daily_checkin_states').doc(existingState.data[0]._id).update({
            data: {
              ...stateData,
              [legacyLockedReasonFieldName()]: removeFieldValue()
            }
          });
        } else {
          await db.collection('daily_checkin_states').add({
            data: cleanData({
              _openid: openid,
              stateId: deletionDailyState.stateId || `state_${userHabitId}_${dailyStateDate}`,
              ...stateData
            })
          });
        }
      }
    }

    // ========== policyVersion 同步 ==========

    if (action === 'addHabit' || action === 'updatePolicy') {
      if (!policyVersionId) {
        return { success: false, code: 'MISSING_POLICY_VERSION', message: '缺少 policyVersionId' };
      }

      // Step 1: 如果有 previousPolicyVersionId，先关闭旧版本
      if (previousPolicyVersionId && previousEffectiveEndDate) {
        const oldVersion = await db.collection('habit_policy_versions').where({
          _openid: openid,
          policyVersionId: previousPolicyVersionId
        }).get();

        if (oldVersion.data && oldVersion.data.length > 0) {
          await db.collection('habit_policy_versions').doc(oldVersion.data[0]._id).update({
            data: {
              effectiveEndDate: previousEffectiveEndDate,
              updatedAt: serverTime
            }
          });
        }
      }

      // Step 2: 写入/更新 habit_policy_versions（幂等 upsert）
      const existingPv = await db.collection('habit_policy_versions').where({
        _openid: openid,
        policyVersionId: policyVersionId
      }).get();

      if (existingPv.data && existingPv.data.length > 0) {
        // 已存在但可能状态不一致，确保达到目标状态
        const existing = existingPv.data[0];
        const needsUpdate = existing.effectiveEndDate !== null;
        if (needsUpdate) {
          await db.collection('habit_policy_versions').doc(existing._id).update({
            data: {
              ...cleanData({
                duration: duration || existing.duration,
                frequencyType: frequencyType || existing.frequencyType,
                frequencyConfig: frequencyConfig || existing.frequencyConfig,
                startDate: startDate || existing.startDate,
                effectiveStartDate: effectiveStartDate || existing.effectiveStartDate,
                updatedAt: serverTime
              }),
              effectiveEndDate: null,
            }
          });
        }
      } else {
        // 写入新版本
        await db.collection('habit_policy_versions').add({
          data: {
            ...cleanData({
              _openid: openid,
              policyVersionId,
              userHabitId,
              habitId: String(habitId),
              duration: duration || 20,
              frequencyType: frequencyType || 'daily',
              frequencyConfig: frequencyConfig || { intervalDays: 1 },
              startDate: startDate || toDateStr(new Date()),
              effectiveStartDate: effectiveStartDate || startDate || toDateStr(new Date()),
              createdAt: serverTime,
              updatedAt: serverTime
            }),
            effectiveEndDate: null,
          }
        });
      }

      if (action === 'updatePolicy' && strategyChangedDailyState) {
        const dailyStateDate = strategyChangedDailyState.date || toDateStr(new Date());
        const dailyStateStatus = strategyChangedDailyState.status || 'unchecked';
        const lockReason = dailyStateStatus === 'checked'
          ? 'strategy_changed_after_checkin'
          : 'strategy_changed_without_checkin';
        const stateData = cleanData({
          userHabitId,
          habitId: String(habitId),
          policyVersionId,
          date: dailyStateDate,
          status: dailyStateStatus,
          checkedAt: strategyChangedDailyState.checkedAt,
          canceledAt: strategyChangedDailyState.canceledAt,
          lastOperationId: strategyChangedDailyState.lastOperationId,
          hasPolicyChangedToday: true,
          lockReason,
          updatedAt: serverTime
        });

        const existingState = await db.collection('daily_checkin_states').where({
          _openid: openid,
          userHabitId,
          date: dailyStateDate
        }).get();

        if (existingState.data && existingState.data.length > 0) {
          await db.collection('daily_checkin_states').doc(existingState.data[0]._id).update({
            data: {
              ...stateData,
              [legacyLockedReasonFieldName()]: removeFieldValue()
            }
          });
        } else {
          await db.collection('daily_checkin_states').add({
            data: cleanData({
              _openid: openid,
              stateId: strategyChangedDailyState.stateId || `state_${userHabitId}_${dailyStateDate}`,
              ...stateData
            })
          });
        }
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
