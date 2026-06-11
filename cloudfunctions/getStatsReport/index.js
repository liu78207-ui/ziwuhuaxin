const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function parseDate(dateStr) {
  if (!dateStr) return null;
  const normalized = String(dateStr).split('T')[0];
  const [year, month, day] = normalized.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function minDate(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return compareDate(a, b) <= 0 ? a : b;
}

function dateDiff(endDateStr, startDateStr) {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (!start || !end) return NaN;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

function buildDateRange(startDate, endDate) {
  const current = parseDate(startDate);
  const end = parseDate(endDate);
  const dates = [];
  if (!current || !end || current > end) return dates;
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getHabitId(habit) {
  return String((habit.strategy && habit.strategy.habit_id) || habit.habitId || habit.habit_id || habit._id || '');
}

function getLogHabitId(log) {
  return String(log.habitId || log.habit_id || log._habitId || '');
}

function getLogDate(log) {
  return log.date || log.checkin_date || log.checkinDate || '';
}

function isDeletedHabit(habit) {
  return Boolean(habit && (habit.isDeleted || habit.is_deleted || habit.deleted || habit.deletedAt || habit.deleted_at));
}

function normalizeLogs(logs) {
  const seen = new Set();
  const result = [];
  (logs || []).forEach(log => {
    if (!log || log.sync_status === 2) return;
    const habitId = getLogHabitId(log);
    const date = String(getLogDate(log)).split('T')[0];
    if (!habitId || !date) return;
    const key = `${habitId}_${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ ...log, habitId, date });
  });
  return result;
}

function getDeletedDate(habit) {
  const value = habit.deletedAt || habit.deleted_at;
  if (!value) return null;
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'string') return value.split('T')[0] || null;
  if (typeof value.toDate === 'function') return formatDate(value.toDate());
  if (typeof value.toISOString === 'function') return value.toISOString().split('T')[0] || null;
  return String(value).split('T')[0] || null;
}

function getPlanStartDate(source) {
  if (!source) return null;
  const freqRules = source.freq_rules;
  return (
    source.plan_start_date ||
    source.planStartDate ||
    (freqRules && typeof freqRules === 'object' && !Array.isArray(freqRules) && freqRules.startDate) ||
    source.createdAt ||
    source.created_at ||
    null
  );
}

function getEffectiveFreqType(source) {
  if (source.freq_category === 'daily-interval' && source.freq_type === 'daily') {
    return 'interval';
  }
  return source.freq_type || 'daily';
}

function getIntervalDays(freqRules) {
  if (freqRules && typeof freqRules === 'object' && !Array.isArray(freqRules)) {
    return Math.max(1, Number(freqRules.intervalDays || freqRules.interval_days || 1));
  }
  return Math.max(1, Number(freqRules || 1));
}

function isDueByStrategy(source, dateStr) {
  const planStartDate = getPlanStartDate(source);
  if (!planStartDate || compareDate(dateStr, planStartDate) < 0) return false;

  const diff = dateDiff(dateStr, planStartDate);
  if (Number.isNaN(diff) || diff < 0) return false;

  const freqType = getEffectiveFreqType(source);
  if (freqType === 'daily') return true;

  if (freqType === 'weekly') {
    const targetDays = Array.isArray(source.freq_rules) ? source.freq_rules : [];
    if (targetDays.length === 0) return true;
    const date = parseDate(dateStr);
    const day = date.getDay();
    const normalizedDay = day === 0 ? 7 : day;
    return targetDays.includes(normalizedDay);
  }

  if (freqType === 'interval') {
    const intervalDays = getIntervalDays(source.freq_rules);
    const cycleDays = intervalDays + 1;
    return diff % cycleDays === 0;
  }

  return true;
}

function normalizeSegments(habit) {
  const versions = Array.isArray(habit.strategyVersions || habit.strategy_versions || habit.versions)
    ? (habit.strategyVersions || habit.strategy_versions || habit.versions)
    : [];

  if (versions.length === 0) {
    return [{
      ...habit,
      segmentStart: getPlanStartDate(habit),
      segmentEnd: getDeletedDate(habit),
      isDeletedSegment: false
    }];
  }

  return versions
    .map(version => {
      const isDeletedSegment = Boolean(
        version.deleted ||
        version.isDeleted ||
        version.is_deleted ||
        version.type === 'deleted' ||
        version.status === 'deleted'
      );
      return {
        ...habit,
        ...version,
        segmentStart: version.start_date || version.startDate || getPlanStartDate(version),
        segmentEnd: version.end_date || version.endDate || null,
        plan_start_date: getPlanStartDate(version) || version.start_date || habit.plan_start_date,
        isDeletedSegment
      };
    })
    .filter(segment => segment.segmentStart)
    .sort((a, b) => compareDate(a.segmentStart, b.segmentStart));
}

function getSegmentForDate(habit, dateStr) {
  return normalizeSegments(habit).find(segment => {
    if (!segment.segmentStart || compareDate(dateStr, segment.segmentStart) < 0) return false;
    if (segment.segmentEnd && compareDate(dateStr, segment.segmentEnd) >= 0) return false;
    return true;
  }) || null;
}

function getDayStatus(habit, dateStr, checked, todayStr) {
  if (todayStr && compareDate(dateStr, todayStr) > 0) {
    return { isDue: false, shouldShow: false, status: 'future' };
  }

  if (checked) {
    return { isDue: true, shouldShow: true, status: 'checked' };
  }

  const segment = getSegmentForDate(habit, dateStr);
  if (segment && segment.isDeletedSegment) {
    return { isDue: false, shouldShow: false, status: 'inactive' };
  }

  const deletedDate = getDeletedDate(habit);
  if (deletedDate && compareDate(dateStr, deletedDate) >= 0) {
    return { isDue: false, shouldShow: false, status: 'inactive' };
  }

  const isDue = segment ? isDueByStrategy(segment, dateStr) : false;
  return {
    isDue,
    shouldShow: isDue,
    status: isDue ? (checked ? 'checked' : 'unchecked') : 'inactive'
  };
}

function buildHabitPeriodReport(habit, logs, startDate, endDate, todayStr) {
  const habitId = getHabitId(habit);
  const effectiveEndDate = todayStr ? minDate(endDate, todayStr) : endDate;
  const normalizedLogs = normalizeLogs(logs);
  const logDates = new Set(
    normalizedLogs
      .filter(log =>
        log.habitId === habitId &&
        log.date >= startDate &&
        log.date <= endDate &&
        (!todayStr || log.date <= todayStr)
      )
      .map(log => log.date)
  );

  let reportHabit = habit;
  if (isDeletedHabit(habit) && !getDeletedDate(habit)) {
    const lastLogDateInPeriod = [...logDates].sort().pop();
    reportHabit = {
      ...habit,
      deletedAt: lastLogDateInPeriod || startDate
    };
  }

  let dueCount = 0;
  let doneCount = 0;
  const days = buildDateRange(startDate, endDate).map(date => {
    const checked = logDates.has(date);
    const { isDue, shouldShow, status } = getDayStatus(reportHabit, date, checked, todayStr);
    const inEffectiveRange = !effectiveEndDate || date <= effectiveEndDate;
    const countsInDueDenominator = Boolean(isDue && inEffectiveRange);
    const countsAsDone = Boolean(checked && isDue && inEffectiveRange);

    if (countsInDueDenominator) dueCount++;
    if (countsAsDone) doneCount++;

    return {
      date,
      isDue,
      isChecked: checked,
      checked,
      shouldShow,
      status,
      countsInDueDenominator,
      countsAsDone
    };
  });

  return {
    habitId,
    habit: reportHabit,
    days,
    dueCount,
    doneCount,
    visible: dueCount > 0 || doneCount > 0
  };
}

function calculateNaturalMaxStreak(dates, startDate, endDate) {
  const dateSet = new Set(dates.filter(date => date >= startDate && date <= endDate));
  let maxStreak = 0;
  let currentStreak = 0;
  buildDateRange(startDate, endDate).forEach(date => {
    if (dateSet.has(date)) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });
  return maxStreak;
}

function calculatePeriodReport(habits, logs, startDate, endDate, todayStr) {
  const effectiveEndDate = todayStr ? minDate(endDate, todayStr) : endDate;
  const habitReports = (habits || [])
    .map(habit => buildHabitPeriodReport(habit, logs, startDate, endDate, todayStr))
    .filter(report => report.visible);
  const dueCount = habitReports.reduce((sum, report) => sum + report.dueCount, 0);
  const doneCount = habitReports.reduce((sum, report) => sum + report.doneCount, 0);
  const uniqueCheckinDates = [...new Set(
    habitReports.flatMap(report =>
      report.days.filter(day => day.countsAsDone).map(day => day.date)
    )
  )];

  return {
    habitReports,
    stats: {
      checkinRate: dueCount > 0 ? Math.round((doneCount / dueCount) * 100) : 0,
      totalCount: doneCount,
      checkinDays: uniqueCheckinDates.length,
      maxStreak: effectiveEndDate ? calculateNaturalMaxStreak(uniqueCheckinDates, startDate, effectiveEndDate) : 0
    }
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { startDate, endDate } = event;
  const todayStr = formatDate(new Date());
  const reportEndDate = endDate && todayStr && endDate > todayStr ? todayStr : endDate;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!startDate || !endDate) {
    return { success: false, message: '缺少日期参数' };
  }

  try {
    const strategiesRes = await db.collection('user_strategies').where({ _openid: openid }).get();
    const strategies = strategiesRes.data || [];

    const versionsRes = await db.collection('user_strategy_versions').where({ _openid: openid }).get();
    const versions = versionsRes.data || [];
    const versionMap = {};
    versions.forEach(version => {
      const habitId = String(version.habit_id);
      if (!versionMap[habitId]) versionMap[habitId] = [];
      versionMap[habitId].push(version);
    });

    const logsRes = await db.collection('checkin_logs').where({
      _openid: openid,
      checkin_date: _.gte(startDate).lte(reportEndDate)
    }).get();

    const habits = strategies.map(strategy => {
      const habitId = String(strategy.habit_id);
      return {
        ...strategy,
        habitId,
        habit_id: habitId,
        name: strategy.habit_title || strategy.name || habitId,
        deletedAt: strategy.deletedAt || strategy.deleted_at || null,
        strategyVersions: versionMap[habitId] || []
      };
    });
    const logs = normalizeLogs(logsRes.data || []);
    const report = calculatePeriodReport(habits, logs, startDate, endDate, todayStr);
    const matrix = report.habitReports.map(habitReport => ({
      habit_id: habitReport.habitId,
      habit_name: habitReport.habit.name,
      dueCount: habitReport.dueCount,
      doneCount: habitReport.doneCount,
      days: habitReport.days.map((day, index) => ({
        date: day.date,
        status: day.status,
        isDue: day.isDue,
        isChecked: day.isChecked,
        countsInDueDenominator: day.countsInDueDenominator,
        countsAsDone: day.countsAsDone,
        dayIndex: index
      }))
    }));

    return {
      success: true,
      data: {
        matrix,
        checkinRate: report.stats.checkinRate,
        totalCount: report.stats.totalCount,
        checkinDays: report.stats.checkinDays,
        maxStreak: report.stats.maxStreak
      }
    };
  } catch (err) {
    console.error('getStatsReport error:', err);
    return { success: false, message: err.message };
  }
};
