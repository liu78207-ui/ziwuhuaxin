function parseDate(dateStr) {
  if (!dateStr) return null;
  const normalized = String(dateStr).split('T')[0];
  const parts = normalized.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function dateDiff(endDateStr, startDateStr) {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (!start || !end) return NaN;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
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

function getHabitId(habit) {
  return String(habit.habitId || habit.habit_id || habit._id || '');
}

function getLogHabitId(log) {
  return String(log.habitId || log.habit_id || log._habitId || '');
}

function getLogDate(log) {
  return log.date || log.checkin_date || log.checkinDate || '';
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
  return (habit.deletedAt || habit.deleted_at || '').split('T')[0] || null;
}

function isDeletedHabit(habit) {
  return Boolean(habit && (habit.isDeleted || habit.is_deleted || habit.deleted || habit.deletedAt || habit.deleted_at));
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
  if (!planStartDate || compareDate(dateStr, planStartDate) < 0) {
    return false;
  }

  const freqType = getEffectiveFreqType(source);
  const diff = dateDiff(dateStr, planStartDate);
  if (Number.isNaN(diff) || diff < 0) {
    return false;
  }

  if (freqType === 'daily') {
    return true;
  }

  if (freqType === 'weekly') {
    const targetDays = Array.isArray(source.freq_rules) ? source.freq_rules : [];
    if (targetDays.length === 0) {
      return true;
    }
    const date = parseDate(dateStr);
    const day = date.getDay();
    const normalizedDay = day === 0 ? 7 : day;
    return targetDays.includes(normalizedDay);
  }

  if (freqType === 'interval') {
    const intervalDays = getIntervalDays(source.freq_rules);
    const cycleDays = intervalDays + 1;
    return diff >= intervalDays && (diff - intervalDays) % cycleDays === 0;
  }

  return true;
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  const current = parseDate(startDate);
  const end = parseDate(endDate);
  if (!current || !end || current > end) return dates;

  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function normalizeSegments(habit) {
  const rawVersions = habit.strategyVersions || habit.strategy_versions || habit.versions || [];
  const versions = Array.isArray(rawVersions) ? rawVersions : [];

  if (versions.length === 0) {
    const deletedDate = getDeletedDate(habit);
    return [{
      ...habit,
      segmentStart: getPlanStartDate(habit),
      segmentEnd: deletedDate,
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
  const segments = normalizeSegments(habit);
  return segments.find(segment => {
    if (!segment.segmentStart || compareDate(dateStr, segment.segmentStart) < 0) {
      return false;
    }
    if (segment.segmentEnd && compareDate(dateStr, segment.segmentEnd) >= 0) {
      return false;
    }
    return true;
  }) || null;
}

function isDueDate(habit, dateStr, hasLogOnDate) {
  const segment = getSegmentForDate(habit, dateStr);

  if (segment) {
    if (segment.isDeletedSegment) {
      return false;
    }
    return isDueByStrategy(segment, dateStr);
  }

  const deletedDate = getDeletedDate(habit);
  if (deletedDate && compareDate(dateStr, deletedDate) >= 0) {
    return Boolean(hasLogOnDate && compareDate(dateStr, deletedDate) === 0);
  }

  return false;
}

function getDayStatus(habit, dateStr, checked, todayStr) {
  if (todayStr && compareDate(dateStr, todayStr) > 0) {
    return {
      isDue: false,
      shouldShow: false,
      status: 'future'
    };
  }

  const segment = getSegmentForDate(habit, dateStr);
  if (segment && segment.isDeletedSegment) {
    return {
      isDue: false,
      shouldShow: false,
      status: 'deleted'
    };
  }

  const deletedDate = getDeletedDate(habit);
  if (deletedDate && compareDate(dateStr, deletedDate) >= 0) {
    if (checked && compareDate(dateStr, deletedDate) === 0) {
      return {
        isDue: true,
        shouldShow: true,
        status: 'checked'
      };
    }
    return {
      isDue: false,
      shouldShow: false,
      status: 'deleted'
    };
  }

  const isDue = segment ? isDueByStrategy(segment, dateStr) : isDueDate(habit, dateStr, false);
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
  const deletedDate = getDeletedDate(reportHabit);

  let dueCount = 0;
  let doneCount = 0;
  const days = buildDateRange(startDate, endDate).map(date => {
    const checked = logDates.has(date);
    const { isDue, shouldShow, status } = getDayStatus(reportHabit, date, checked, todayStr);
    const inEffectiveRange = !effectiveEndDate || date <= effectiveEndDate;
    const countsInDueDenominator = Boolean(isDue && inEffectiveRange);
    const countsAsDone = Boolean(checked && isDue && inEffectiveRange);

    if (countsInDueDenominator) {
      dueCount++;
    }
    if (countsAsDone) {
      doneCount++;
    }

    return {
      date,
      checked,
      isChecked: checked,
      isDue,
      shouldShow,
      status,
      countsInDueDenominator,
      countsInDenominator: countsInDueDenominator,
      countsAsDone,
      isAfterDeletion: Boolean(deletedDate && compareDate(date, deletedDate) >= 0),
      isFuture: Boolean(todayStr && compareDate(date, todayStr) > 0)
    };
  });

  return {
    habitId,
    habit: reportHabit,
    days,
    dueCount,
    doneCount,
    checkinDays: doneCount,
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
  const normalizedLogs = normalizeLogs(logs);
  const habitReports = (habits || [])
    .map(habit => buildHabitPeriodReport(habit, normalizedLogs, startDate, endDate, todayStr))
    .filter(report => report.visible);

  const uniqueCheckinDates = [...new Set(
    habitReports.flatMap(report =>
      report.days
        .filter(day => day.countsAsDone)
        .map(day => day.date)
    )
  )];
  const dueCount = habitReports.reduce((sum, report) => sum + report.dueCount, 0);
  const doneCount = habitReports.reduce((sum, report) => sum + report.doneCount, 0);

  return {
    habitReports,
    stats: {
      checkinRate: dueCount > 0 ? Math.round((doneCount / dueCount) * 100) : 0,
      totalCount: doneCount,
      checkinDays: uniqueCheckinDates.length,
      maxStreak: effectiveEndDate
        ? calculateNaturalMaxStreak(uniqueCheckinDates, startDate, effectiveEndDate)
        : 0
    }
  };
}

function getEarliestStrategyStartDate(habit) {
  const segmentStarts = normalizeSegments(habit)
    .map(segment => segment.segmentStart)
    .filter(Boolean)
    .sort();
  return segmentStarts[0] || getPlanStartDate(habit);
}

function getLatestEffectiveEndDate(logs, todayStr) {
  if (todayStr) return todayStr;
  const dates = normalizeLogs(logs)
    .map(log => log.date)
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || null;
}

function calculateEffectivePracticeDays(habit, logs, startDate, endDate, todayStr) {
  if (!habit || !startDate || !endDate) {
    return 0;
  }

  return buildHabitPeriodReport(habit, logs, startDate, endDate, todayStr).doneCount;
}

function calculateLifetimeEffectivePracticeDays(habit, logs, todayStr) {
  if (!habit) {
    return 0;
  }

  const startDate = getEarliestStrategyStartDate(habit);
  const endDate = getLatestEffectiveEndDate(logs, todayStr);
  if (!startDate || !endDate || compareDate(endDate, startDate) < 0) {
    return 0;
  }

  return calculateEffectivePracticeDays(habit, logs, startDate, endDate, todayStr || endDate);
}

function calculateHabitHistoryDays(habitId, logs) {
  const habitIdStr = String(habitId);
  const dates = normalizeLogs(logs)
    .filter(log => log.habitId === habitIdStr)
    .map(log => log.date);
  return new Set(dates).size;
}

module.exports = {
  parseDate,
  formatDate,
  addDays,
  dateDiff,
  isDueDate,
  isDueByStrategy,
  buildDateRange,
  buildHabitPeriodReport,
  calculatePeriodReport,
  calculateEffectivePracticeDays,
  calculateLifetimeEffectivePracticeDays,
  calculateHabitHistoryDays,
  normalizeLogs,
  isDeletedHabit
};
