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
const CUSTOM_ICON_URL = '/assets/icons/habit-zidingyi.png';
const CUSTOM_HABIT_LIBRARY_LIMIT = 12;
const CUSTOM_ACTIVE_HABIT_LIMIT = 5;

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

function normalizeCustomName(value) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
}

function isCustomHabitRecord(record) {
  return record && (record.source === 'custom' || String(record.habitId || '').indexOf('custom_') === 0);
}

function hasValidCustomName(record) {
  return normalizeCustomName(record.name || record.title || record.habitTitle || record.habit_title).length > 0;
}

function getCustomHabitId(record) {
  return String(record && record.habitId || '');
}

async function assertCustomHabitLimits(openid, targetHabitId) {
  const habitsRes = await db.collection('user_habits').where({ _openid: openid }).get();
  const customHabits = (habitsRes.data || []).filter(record => isCustomHabitRecord(record) && hasValidCustomName(record));
  const libraryHabitIds = new Set(customHabits.map(getCustomHabitId).filter(Boolean));
  const activeCount = customHabits.filter(record => record.status === 'active').length;
  const willCreateLibraryEntry = targetHabitId && !libraryHabitIds.has(String(targetHabitId));

  if (willCreateLibraryEntry && libraryHabitIds.size >= CUSTOM_HABIT_LIBRARY_LIMIT) {
    return { success: false, code: 'CUSTOM_HABIT_LIBRARY_LIMIT_REACHED', message: '自定义习惯已达 12 个上限' };
  }
  if (activeCount >= CUSTOM_ACTIVE_HABIT_LIMIT) {
    return { success: false, code: 'CUSTOM_ACTIVE_HABIT_LIMIT_REACHED', message: '最多同时启用 5 个自定义习惯' };
  }
  return null;
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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const {
    action, // 'addHabit' | 'deleteHabit' | 'updatePolicy'
    userHabitId,
    habitId,
    policyVersionId,
    source,
    name,
    category,
    remark,
    themeClass,
    iconUrl,
    status, // 'active' | 'deleted'
    duration,
    frequencyType,
    frequencyConfig,
    startDate,
    effectiveStartDate,
    createdAt,
    addedAt,
    pinnedAt,
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

  if (action === 'cleanupNamelessCustomHabits') {
    try {
      const habitsRes = await db.collection('user_habits').where({ _openid: openid }).get();
      const namelessCustomHabits = (habitsRes.data || []).filter(record =>
        isCustomHabitRecord(record) && !hasValidCustomName(record)
      );
      const removedUserHabitIds = namelessCustomHabits.map(record => record.userHabitId).filter(Boolean);

      for (const record of namelessCustomHabits) {
        await db.collection('user_habits').doc(record._id).remove();
      }

      for (const targetUserHabitId of removedUserHabitIds) {
        const policyRes = await db.collection('habit_policy_versions').where({
          _openid: openid,
          userHabitId: targetUserHabitId
        }).get();
        for (const record of policyRes.data || []) {
          await db.collection('habit_policy_versions').doc(record._id).remove();
        }

        const stateRes = await db.collection('daily_checkin_states').where({
          _openid: openid,
          userHabitId: targetUserHabitId
        }).get();
        for (const record of stateRes.data || []) {
          await db.collection('daily_checkin_states').doc(record._id).remove();
        }

        const opRes = await db.collection('checkin_operations').where({
          _openid: openid,
          userHabitId: targetUserHabitId
        }).get();
        for (const record of opRes.data || []) {
          await db.collection('checkin_operations').doc(record._id).remove();
        }
      }

      return {
        success: true,
        action,
        removedCount: namelessCustomHabits.length,
        removedUserHabitIds,
        serverTime: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        code: 'CLEANUP_FAILED',
        message: error && error.message ? error.message : String(error || '清理失败')
      };
    }
  }

  if (!userHabitId || !habitId) {
    return { success: false, code: 'MISSING_PARAMS', message: '缺少 userHabitId 或 habitId' };
  }

  if (!action || !['addHabit', 'deleteHabit', 'updatePolicy', 'updatePinned', 'updateHabitMeta', 'cleanupNamelessCustomHabits'].includes(action)) {
    return { success: false, code: 'INVALID_ACTION', message: 'action 必须为 addHabit、deleteHabit、updatePolicy、updatePinned、updateHabitMeta 或 cleanupNamelessCustomHabits' };
  }

  const serverTime = Date.now();

  try {
    // ========== userHabit 同步 ==========

    if (action === 'addHabit') {
      if ((source === 'custom' || String(habitId || '').indexOf('custom_') === 0) && normalizeCustomName(name).length < 2) {
        return { success: false, code: 'INVALID_NAME', message: '自定义修习名称需为 2-12 个字' };
      }
      const isCustomAdd = source === 'custom' || String(habitId || '').indexOf('custom_') === 0;
      // 检查是否已存在（幂等）
      const existingHabit = await db.collection('user_habits').where({
        _openid: openid,
        userHabitId: userHabitId
      }).get();

      if (existingHabit.data && existingHabit.data.length > 0) {
        // 已存在，检查状态是否已为目标状态
        const existing = existingHabit.data[0];
        const habitCreatedAt = createdAt || existing.createdAt || startDate || toDateStr(new Date());
        const habitAddedAt = addedAt || existing.addedAt || null;
        const needsMetaUpdate = Boolean(
          (source && existing.source !== source) ||
          (name && existing.name !== name) ||
          (category && existing.category !== category) ||
          (remark && existing.remark !== remark) ||
          (themeClass && existing.themeClass !== themeClass) ||
          (iconUrl && existing.iconUrl !== iconUrl)
        );
        if (existing.status !== (status || 'active') || !existing.createdAt || (addedAt && !existing.addedAt) || needsMetaUpdate) {
          // 状态不一致，需要更新
          await db.collection('user_habits').doc(existing._id).update({
            data: cleanData({
              status: status || 'active',
              source: source || existing.source || 'system',
              name: name || existing.name,
              category: category || existing.category,
              remark: remark || existing.remark,
              themeClass: themeClass || existing.themeClass,
              iconUrl: iconUrl || existing.iconUrl || (source === 'custom' ? CUSTOM_ICON_URL : ''),
              createdAt: habitCreatedAt,
              addedAt: habitAddedAt,
              pinnedAt,
              updatedAt: serverTime
            })
          });
        }
        // 注意：不直接 return，必须继续执行 policyVersion 同步
        // 以确保 userHabit 和 policyVersion 都达到目标状态
      } else {
        if (isCustomAdd) {
          const limitError = await assertCustomHabitLimits(openid, String(habitId));
          if (limitError) return limitError;
        }
        // 写入 user_habits
        await db.collection('user_habits').add({
          data: cleanData({
            _openid: openid,
            userHabitId,
            habitId: String(habitId),
            source: source || 'system',
            name,
            category,
            remark,
            themeClass,
            iconUrl: iconUrl || (source === 'custom' ? CUSTOM_ICON_URL : ''),
            status: status || 'active',
            createdAt: createdAt || startDate || toDateStr(new Date()),
            addedAt: addedAt || null,
            pinnedAt,
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
    } else if (action === 'updatePinned') {
      const existingHabit = await db.collection('user_habits').where({
        _openid: openid,
        userHabitId: userHabitId
      }).get();

      if (!existingHabit.data || existingHabit.data.length === 0) {
        return { success: false, code: 'USER_HABIT_NOT_FOUND', message: '未找到 userHabit' };
      }

      await db.collection('user_habits').doc(existingHabit.data[0]._id).update({
        data: {
          pinnedAt: nullableFieldValue(pinnedAt || null),
          updatedAt: serverTime
        }
      });
    } else if (action === 'updateHabitMeta') {
      const existingHabit = await db.collection('user_habits').where({
        _openid: openid,
        userHabitId: userHabitId
      }).get();

      if (!existingHabit.data || existingHabit.data.length === 0) {
        return { success: false, code: 'USER_HABIT_NOT_FOUND', message: '未找到 userHabit' };
      }

      const normalizedName = String(name || '').trim().slice(0, 12);
      if (normalizedName.length < 2) {
        return { success: false, code: 'INVALID_NAME', message: '自定义修习名称需为 2-12 个字' };
      }

      await db.collection('user_habits').doc(existingHabit.data[0]._id).update({
        data: cleanData({
          source: 'custom',
          name: normalizedName,
          category: category || '自定义',
          remark: String(remark || '').trim().slice(0, 40),
          themeClass: themeClass || 't-purple',
          iconUrl: iconUrl || CUSTOM_ICON_URL,
          updatedAt: serverTime
        })
      });
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
