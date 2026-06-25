const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  try {
    // 获取云端策略
    const strategies = await db.collection('user_strategies').where({
      _openid: openid
    }).get();

    // 获取云端打卡记录
    const logs = await db.collection('checkin_logs').where({
      _openid: openid
    }).get();

    let strategyVersions = [];
    try {
      const versionsRes = await db.collection('user_strategy_versions').where({
        _openid: openid
      }).get();
      strategyVersions = versionsRes.data || [];
    } catch (versionErr) {
      console.error('读取策略版本失败:', versionErr);
    }

    // 转换为 CheckinLogs 格式
    const CheckinLogs = logs.data.map(l => ({
      logId: l._id,
      habitId: l.habit_id,
      date: l.checkin_date,
      timestamp: new Date(l.checkin_date).getTime(),
      sync_status: 1
    }));

    // 获取所有有打卡记录的习惯ID（用于恢复已删除习惯的名称）
    const allHabitIdsFromLogs = [...new Set(logs.data.map(l => l.habit_id))];

    // 获取习惯信息（用于恢复已删除习惯的名称）
    const habits = await db.collection('habits').where({
      _openid: openid
    }).get();

    const habitsMap = {};
    habits.data.forEach(h => {
      habitsMap[h.habit_id] = {
        habitId: h.habit_id,
        name: h.name,
        category: h.category || '运动类',
        targetMinutes: h.target_minutes || 20,
        themeClass: h.theme_class || 't-default'
      };
    });

    // 转换为 MyHabits 格式
    const versionsByHabitId = strategyVersions.reduce((map, version) => {
      const habitId = String(version.habit_id);
      if (!map[habitId]) {
        map[habitId] = [];
      }
      map[habitId].push(version);
      return map;
    }, {});

    const MyHabits = strategies.data.map(s => {
      const habitId = String(s.habit_id);
      return {
        habitId,
        name: s.habit_title,
        category: s.category || '运动类',
        targetMinutes: s.duration || 20,
        themeClass: s.theme_class || 't-default',
        iconUrl: s.icon_url || '',
        freq_type: s.freq_type,
        freq_rules: s.freq_rules,
        freq_category: s.freq_category || 'everyday',
        createdAt: s.plan_start_date,
        pinnedAt: s.pinnedAt || s.pinned_at || null,
        plan_start_date: s.plan_start_date,
        deletedAt: s.deleted_at || null,
        strategyVersions: versionsByHabitId[habitId] || []
      };
    });

    const AllHabitsInfo = {};
    strategies.data.forEach(s => {
      AllHabitsInfo[s.habit_id] = {
        habitId: s.habit_id,
        name: s.habit_title,
        category: s.category || '运动类',
        targetMinutes: s.duration || 20,
        themeClass: s.theme_class || 't-default',
        iconUrl: s.icon_url || ''
      };
    });

    // 合并 habits 集合中的信息到 AllHabitsInfo（用于恢复已删除习惯）
    Object.keys(habitsMap).forEach(habitId => {
      if (!AllHabitsInfo[habitId]) {
        AllHabitsInfo[habitId] = habitsMap[habitId];
      }
    });

    return {
      success: true,
      data: {
        MyHabits,
        CheckinLogs,
        AllHabitsInfo,
        allHabitIds: allHabitIdsFromLogs
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
};
