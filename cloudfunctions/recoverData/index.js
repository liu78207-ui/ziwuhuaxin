const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const PAGE_SIZE = 100;

function pickDefined(source, keys) {
  const result = {};
  keys.forEach(key => {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  });
  return result;
}

function slimUserHabit(habit) {
  return pickDefined(habit, [
    'userHabitId',
    'habitId',
    'name',
    'title',
    'habitTitle',
    'category',
    'duration',
    'targetMinutes',
    'themeClass',
    'iconUrl',
    'status',
    'isDeleted',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'latestPolicyVersionId',
    'syncStatus'
  ]);
}

function slimPolicyVersion(policy) {
  return pickDefined(policy, [
    'policyVersionId',
    'userHabitId',
    'habitId',
    'duration',
    'frequencyType',
    'frequencyConfig',
    'startDate',
    'effectiveStartDate',
    'effectiveEndDate',
    'createdAt',
    'updatedAt',
    'syncStatus'
  ]);
}

function slimDailyState(state) {
  return pickDefined(state, [
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
    'lockedReason',
    'hasPolicyChangedToday',
    'syncStatus',
    'updatedAt'
  ]);
}

async function listAllByOpenid(collectionName, openid) {
  const items = [];
  let offset = 0;

  while (true) {
    const res = await db.collection(collectionName)
      .where({ _openid: openid })
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

/**
 * recoverData - V1 数据恢复云函数
 *
 * 恢复 V1 核心数据结构：
 * - user_habits（用户习惯实例）
 * - habit_policy_versions（策略版本）
 * - daily_checkin_states（每日打卡状态）
 *
 * 旧集合（user_strategies/checkin_logs）仅作为兼容迁移来源，
 * 不作为 V1 正式恢复输出。
 *
 * 入参: {}
 * 返回: { success, data: { userHabits, policyVersions, dailyStates } }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;
  const serverTime = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份', serverTime };
  }

  try {
    const userHabits = await listAllByOpenid('user_habits', OPENID);
    const policyVersions = await listAllByOpenid('habit_policy_versions', OPENID);
    const dailyStates = await listAllByOpenid('daily_checkin_states', OPENID);

    return {
      success: true,
      data: {
        userHabits: userHabits.map(slimUserHabit),
        policyVersions: policyVersions.map(slimPolicyVersion),
        dailyStates: dailyStates.map(slimDailyState)
      },
      serverTime
    };
  } catch (e) {
    console.error('recoverData 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message, serverTime };
  }
};
