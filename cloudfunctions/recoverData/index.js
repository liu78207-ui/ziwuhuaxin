const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  try {
    // 查询 user_habits
    const userHabitsRes = await db.collection('user_habits')
      .where({ _openid: OPENID })
      .get();

    // 查询 habit_policy_versions
    const policyVersionsRes = await db.collection('habit_policy_versions')
      .where({ _openid: OPENID })
      .get();

    // 查询 daily_checkin_states
    const dailyStatesRes = await db.collection('daily_checkin_states')
      .where({ _openid: OPENID })
      .get();

    return {
      success: true,
      data: {
        userHabits: userHabitsRes.data || [],
        policyVersions: policyVersionsRes.data || [],
        dailyStates: dailyStatesRes.data || []
      }
    };
  } catch (e) {
    console.error('recoverData 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};