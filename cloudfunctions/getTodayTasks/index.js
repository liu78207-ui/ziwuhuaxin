const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function parseDate(dateStr) {
  const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
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
  const deletedDate = (strategy.deleted_at || strategy.deletedAt || '').split('T')[0];
  if (deletedDate && dateStr >= deletedDate) {
    return false;
  }

  const planStartDate = getPlanStartDate(strategy) || dateStr;
  if (dateStr < String(planStartDate).split('T')[0]) {
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
    return diff >= intervalDays && (diff - intervalDays) % cycleDays === 0;
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
      segmentStart: (version.start_date || version.startDate || getPlanStartDate(version) || getPlanStartDate(strategy) || '').split('T')[0],
      segmentEnd: (version.end_date || version.endDate || '').split('T')[0] || null,
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

    const todayTasksRaw = allStrategies.filter(strategy =>
      isDueByStrategy(strategy, dateStr, dayOfWeek)
    );

    if (todayTasksRaw.length === 0) {
      return { success: true, data: [] };
    }

    const habitIds = todayTasksRaw.map(task => task.habit_id);

    const habitsRes = await db.collection('habits')
      .where({ _id: _.in(habitIds) })
      .get();
    const habitsData = habitsRes.data;

    let versionsByHabitId = {};
    try {
      const versionsRes = await db.collection('user_strategy_versions')
        .where({
          _openid: openid,
          habit_id: _.in(habitIds.map(id => String(id)))
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
    }

    const checkinLogsRes = await db.collection('checkin_logs')
      .where({
        _openid: openid,
        checkin_date: dateStr
      })
      .get();
    const todayLogs = checkinLogsRes.data.filter(log => log.sync_status !== 2);
    const finishedHabitIds = todayLogs.map(log => String(log.habit_id));

    const finalTasks = await Promise.all(todayTasksRaw.map(async (strategy) => {
      const habitInfo = habitsData.find(h => h._id === strategy.habit_id) || {};
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
