const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * recoverData - 从云端恢复用户数据
 * 用于 V1 正式版数据恢复路径
 *
 * 入参: {}
 * 返回: { success, data: { MyHabits, CheckinLogs, AllHabitsInfo } }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  try {
    // 查询用户习惯（user_strategies 集合）
    const strategiesRes = await db.collection('user_strategies')
      .where({ _openid: OPENID })
      .get();

    // 查询打卡记录（checkin_logs 集合）
    const logsRes = await db.collection('checkin_logs')
      .where({ _openid: OPENID })
      .get();

    // 查询策略版本（user_strategy_versions 集合）
    let strategyVersions = [];
    try {
      const versionsRes = await db.collection('user_strategy_versions')
        .where({ _openid: OPENID })
        .get();
      strategyVersions = versionsRes.data || [];
    } catch (e) {
      console.error('读取策略版本失败:', e);
    }

    // 查询内置习惯信息（habits 集合，用于恢复已删除习惯的名称）
    let habitsMap = {};
    try {
      const habitsRes = await db.collection('habits')
        .where({ _openid: OPENID })
        .get();
      habitsRes.data.forEach(h => {
        habitsMap[String(h.habit_id)] = {
          habitId: String(h.habit_id),
          name: h.name || '',
          category: h.category || '运动类',
          targetMinutes: h.target_minutes || 20,
          themeClass: h.theme_class || 't-default',
          iconUrl: h.icon_url || ''
        };
      });
    } catch (e) {
      console.error('读取习惯信息失败:', e);
    }

    // 转换 CheckinLogs 格式
    const CheckinLogs = logsRes.data.map(l => ({
      logId: l._id,
      habitId: String(l.habit_id),
      date: l.checkin_date,
      timestamp: new Date(l.checkin_date).getTime(),
      sync_status: 1,
      cloud_id: l._id
    }));

    // 按 habitId 分组策略版本
    const versionsByHabitId = {};
    strategyVersions.forEach(v => {
      const habitId = String(v.habit_id);
      if (!versionsByHabitId[habitId]) {
        versionsByHabitId[habitId] = [];
      }
      versionsByHabitId[habitId].push(v);
    });

    // 转换 MyHabits 格式
    const MyHabits = strategiesRes.data.map(s => {
      const habitId = String(s.habit_id);
      return {
        habitId,
        name: s.habit_title || '',
        category: s.category || '运动类',
        targetMinutes: s.duration || 20,
        themeClass: s.theme_class || 't-default',
        iconUrl: s.icon_url || '',
        freq_type: s.freq_type || 'daily',
        freq_rules: s.freq_rules || 1,
        freq_category: s.freq_category || 'everyday',
        createdAt: s.plan_start_date || '',
        plan_start_date: s.plan_start_date || '',
        deletedAt: s.deleted_at || null,
        isDeleted: s.deleted_at ? true : false,
        status: s.deleted_at ? 'deleted' : 'active',
        strategyVersions: versionsByHabitId[habitId] || []
      };
    });

    // 构建 AllHabitsInfo（包含已删除习惯，用于历史数据展示）
    const AllHabitsInfo = {};

    // 从 strategies 添加已有习惯
    strategiesRes.data.forEach(s => {
      const habitId = String(s.habit_id);
      AllHabitsInfo[habitId] = {
        habitId,
        name: s.habit_title || '',
        category: s.category || '运动类',
        targetMinutes: s.duration || 20,
        themeClass: s.theme_class || 't-default',
        iconUrl: s.icon_url || '',
        deletedAt: s.deleted_at || null
      };
    });

    // 合并 habits 集合中的信息（补充已删除习惯的名称）
    Object.keys(habitsMap).forEach(habitId => {
      if (!AllHabitsInfo[habitId]) {
        AllHabitsInfo[habitId] = {
          ...habitsMap[habitId],
          deletedAt: null
        };
      }
    });

    return {
      success: true,
      data: {
        MyHabits,
        CheckinLogs,
        AllHabitsInfo
      }
    };
  } catch (e) {
    console.error('recoverData 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};