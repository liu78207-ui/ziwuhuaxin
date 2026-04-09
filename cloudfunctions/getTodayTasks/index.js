const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { dateStr, dayOfWeek } = event;

  try {
    const strategiesRes = await db.collection('user_strategies')
      .where({ _openid: openid })
      .get();
    
    const allStrategies = strategiesRes.data;

    const todayTasksRaw = allStrategies.filter(strategy => {
      if (strategy.freq_type === 'daily') {
        return true;
      }
      if (strategy.freq_type === 'weekly') {
        return strategy.freq_rules.includes(dayOfWeek);
      }
      if (strategy.freq_type === 'interval') {
        const createdAt = new Date(strategy.created_at);
        const targetDate = new Date(dateStr);
        const daysDiff = Math.floor((targetDate - createdAt) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff % strategy.freq_rules === 0;
      }
      return false;
    });

    if (todayTasksRaw.length === 0) {
      return { success: true, data: [] };
    }

    const habitIds = todayTasksRaw.map(task => task.habit_id);

    const habitsRes = await db.collection('habits')
      .where({ _id: _.in(habitIds) })
      .get();
    const habitsData = habitsRes.data;

    const checkinLogsRes = await db.collection('checkin_logs')
      .where({
        _openid: openid,
        checkin_date: dateStr
      })
      .get();
    const todayLogs = checkinLogsRes.data;
    const finishedHabitIds = todayLogs.map(log => log.habit_id);

    const finalTasks = await Promise.all(todayTasksRaw.map(async (strategy) => {
      const habitInfo = habitsData.find(h => h._id === strategy.habit_id) || {};
      const isDone = finishedHabitIds.includes(strategy.habit_id);

      const logsRes = await db.collection('checkin_logs').where({
        _openid: openid,
        habit_id: strategy.habit_id
      }).orderBy('checkin_date', 'desc').get();

      let streakDays = 0;
      if (logsRes.data.length > 0) {
        const dates = logsRes.data.map(log => log.checkin_date).sort().reverse();
        const todayStr = dateStr;
        const yesterday = new Date(dateStr);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (dates[0] === todayStr || dates[0] === yesterdayStr) {
          const dateSet = new Set(dates);
          let current = new Date(dates[0] === todayStr ? todayStr : yesterdayStr);
          const maxCheck = 365;

          for (let i = 0; i < maxCheck; i++) {
            const checkStr = current.toISOString().split('T')[0];
            if (dateSet.has(checkStr)) {
              streakDays++;
              current.setDate(current.getDate() - 1);
            } else {
              break;
            }
          }
        }
      }

      return {
        strategy_id: strategy._id,
        habit_id: strategy.habit_id,
        title: habitInfo.title,
        icon_url: habitInfo.icon_url,
        duration: strategy.duration,
        is_done: isDone,
        streak_days: streakDays
      };
    }));

    return {
      success: true,
      data: finalTasks
    };

  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
};
