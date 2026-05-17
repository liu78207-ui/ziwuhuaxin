const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function parseDate(dateStr) {
  const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateStr(value) {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return formatDate(value);
  }
  return String(value).split('T')[0];
}

function dateDiff(endDateStr, startDateStr) {
  return Math.floor((parseDate(endDateStr) - parseDate(startDateStr)) / (24 * 60 * 60 * 1000));
}

function getPlanStartDate(strategy) {
  return strategy.plan_start_date || strategy.created_at || strategy.createdAt || null;
}

function getIntervalDays(freqRules) {
  if (freqRules && typeof freqRules === 'object' && !Array.isArray(freqRules)) {
    return Math.max(1, Number(freqRules.intervalDays || freqRules.interval_days || 1));
  }
  return Math.max(1, Number(freqRules || 1));
}

function isDueByStrategy(strategy, dateStr, dayOfWeek) {
  if (strategy.deleted || strategy.type === 'deleted') {
    return false;
  }

  const deletedDate = toDateStr(strategy.deleted_at || strategy.deletedAt);
  if (deletedDate && dateStr >= deletedDate) {
    return false;
  }

  const planStartDate = toDateStr(getPlanStartDate(strategy)) || dateStr;
  if (dateStr < planStartDate) {
    return false;
  }

  if (strategy.freq_type === 'daily') {
    return true;
  }

  if (strategy.freq_type === 'weekly') {
    const targetDays = Array.isArray(strategy.freq_rules) ? strategy.freq_rules : [];
    if (targetDays.length === 0) {
      return true;
    }
    return targetDays.includes(dayOfWeek);
  }

  if (strategy.freq_type === 'interval') {
    const diff = dateDiff(dateStr, String(planStartDate).split('T')[0]);
    const intervalDays = getIntervalDays(strategy.freq_rules);
    const cycleDays = intervalDays + 1;
    return diff >= 0 && diff % cycleDays === 0;
  }

  return true;
}

function getDayOfWeek(dateStr) {
  const day = parseDate(dateStr).getDay();
  return day === 0 ? 7 : day;
}

function normalizeLogDate(log) {
  return String(log.checkin_date || log.date || '').split('T')[0];
}

function normalizeSegments(strategy, versions) {
  const normalizedVersions = Array.isArray(versions) ? versions : [];
  if (normalizedVersions.length === 0) {
    return [];
  }

  return normalizedVersions
    .map(version => ({
      ...strategy,
      ...version,
      segmentStart: toDateStr(version.start_date || version.startDate || getPlanStartDate(version) || getPlanStartDate(strategy)),
      segmentEnd: toDateStr(version.end_date || version.endDate) || null,
      plan_start_date: getPlanStartDate(version) || version.start_date || getPlanStartDate(strategy)
    }))
    .filter(segment => segment.segmentStart)
    .sort((a, b) => a.segmentStart.localeCompare(b.segmentStart));
}

function getSegmentForDate(strategy, versions, dateStr) {
  const segments = normalizeSegments(strategy, versions);
  return segments.find(segment => {
    if (dateStr < segment.segmentStart) {
      return false;
    }
    if (segment.segmentEnd && dateStr >= segment.segmentEnd) {
      return false;
    }
    return true;
  }) || null;
}

function getEffectiveStrategyForDate(strategy, versions, dateStr) {
  return getSegmentForDate(strategy, versions, dateStr) || strategy;
}

function getHabitKey(habit) {
  return String(habit._id || habit.habit_id || habit.habitId || '');
}

function getHabitTitle(habitInfo, strategy) {
  return habitInfo.title || habitInfo.name || strategy.habit_title || strategy.name;
}

function calculateLifetimeEffectivePracticeDays(strategy, logs, todayStr, versions) {
  const habitId = String(strategy.habit_id);
  const seenDates = new Set();

  (logs || []).forEach(log => {
    if (!log || log.sync_status === 2 || String(log.habit_id) !== habitId) {
      return;
    }

    const dateStr = normalizeLogDate(log);
    if (!dateStr || dateStr > todayStr || seenDates.has(dateStr)) {
      return;
    }

    const effectiveStrategy = getSegmentForDate(strategy, versions, dateStr) || strategy;
    if (isDueByStrategy(effectiveStrategy, dateStr, getDayOfWeek(dateStr))) {
      seenDates.add(dateStr);
    }
  });

  return seenDates.size;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { dateStr, dayOfWeek } = event;

  try {
    const strategiesRes = await db.collection('user_strategies')
      .where({ _openid: openid })
      .get();
    
    const allStrategies = strategiesRes.data;
    const allHabitIds = allStrategies.map(strategy => String(strategy.habit_id));

    let versionsByHabitId = {};
    try {
      const versionsRes = await db.collection('user_strategy_versions')
        .where({
          _openid: openid,
          habit_id: _.in(allHabitIds)
        })
        .get();
      versionsByHabitId = (versionsRes.data || []).reduce((map, version) => {
        const habitId = String(version.habit_id);
        if (!map[habitId]) {
          map[habitId] = [];
        }
        map[habitId].push(version);
        return map;
      }, {});
    } catch (versionErr) {
      console.error('get strategy versions failed:', versionErr);
      return {
        success: false,
        message: `user_strategy_versions collection is required: ${versionErr.message}`,
        error: versionErr.message
      };
    }

    const todayTasksRaw = allStrategies
      .map(strategy => {
        const effectiveStrategy = getEffectiveStrategyForDate(
          strategy,
          versionsByHabitId[String(strategy.habit_id)] || [],
          dateStr
        );
        return {
          strategy,
          effectiveStrategy
        };
      })
      .filter(item => isDueByStrategy(item.effectiveStrategy, dateStr, dayOfWeek));

    if (todayTasksRaw.length === 0) {
      return { success: true, data: [] };
    }

    const habitIds = todayTasksRaw.map(task => String(task.strategy.habit_id));

    const habitsRes = await db.collection('habits')
      .where({ habit_id: _.in(habitIds) })
      .get();
    let habitsData = habitsRes.data || [];
    const missingIds = habitIds.filter(id => !habitsData.some(habit => getHabitKey(habit) === id));
    if (missingIds.length > 0) {
      const habitsByIdRes = await db.collection('habits')
        .where({ _id: _.in(missingIds) })
        .get();
      habitsData = habitsData.concat(habitsByIdRes.data || []);
    }

    const checkinLogsRes = await db.collection('checkin_logs')
      .where({
        _openid: openid,
        checkin_date: dateStr
      })
      .get();
    const todayLogs = checkinLogsRes.data.filter(log => log.sync_status !== 2);
    const finishedHabitIds = todayLogs.map(log => String(log.habit_id));

    const finalTasks = await Promise.all(todayTasksRaw.map(async ({ strategy, effectiveStrategy }) => {
      const habitInfo = habitsData.find(h => getHabitKey(h) === String(strategy.habit_id)) || {};
      const isDone = finishedHabitIds.includes(String(strategy.habit_id));

      const logsRes = await db.collection('checkin_logs').where({
        _openid: openid,
        habit_id: strategy.habit_id
      }).orderBy('checkin_date', 'desc').get();

      const streakDays = calculateLifetimeEffectivePracticeDays(
        strategy,
        logsRes.data || [],
        dateStr,
        versionsByHabitId[String(strategy.habit_id)] || []
      );

      return {
        strategy_id: strategy._id,
        habit_id: strategy.habit_id,
        title: getHabitTitle(habitInfo, strategy),
        icon_url: habitInfo.icon_url,
        duration: effectiveStrategy.duration || strategy.duration,
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
    return { success: false, message: err.message, error: err.message };
  }
};
