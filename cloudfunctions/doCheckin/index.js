const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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
  if (!value) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'string') return value.split('T')[0];
  if (typeof value.toDate === 'function') return formatDate(value.toDate());
  if (typeof value.toISOString === 'function') return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function dateDiff(endDateStr, startDateStr) {
  return Math.floor((parseDate(endDateStr) - parseDate(startDateStr)) / (24 * 60 * 60 * 1000));
}

function getPlanStartDate(strategy) {
  const freqRules = strategy.freq_rules;
  return (
    strategy.plan_start_date ||
    strategy.planStartDate ||
    (freqRules && typeof freqRules === 'object' && !Array.isArray(freqRules) && freqRules.startDate) ||
    strategy.created_at ||
    strategy.createdAt ||
    null
  );
}

function getIntervalDays(freqRules) {
  if (freqRules && typeof freqRules === 'object' && !Array.isArray(freqRules)) {
    return Math.max(1, Number(freqRules.intervalDays || freqRules.interval_days || 1));
  }
  return Math.max(1, Number(freqRules || 1));
}

function getEffectiveFreqType(strategy) {
  if (strategy.freq_category === 'daily-interval' && strategy.freq_type === 'daily') {
    return 'interval';
  }
  return strategy.freq_type || 'daily';
}

function getDayOfWeek(dateStr) {
  const day = parseDate(dateStr).getDay();
  return day === 0 ? 7 : day;
}

function isDeletedSegment(strategy) {
  return Boolean(
    strategy.deleted ||
    strategy.isDeleted ||
    strategy.is_deleted ||
    strategy.type === 'deleted' ||
    strategy.status === 'deleted'
  );
}

function isDueByStrategy(strategy, dateStr) {
  if (!strategy || isDeletedSegment(strategy)) return false;

  const deletedDate = toDateStr(strategy.deleted_at || strategy.deletedAt);
  if (deletedDate && dateStr >= deletedDate) return false;

  const planStartDate = toDateStr(getPlanStartDate(strategy));
  if (!planStartDate || dateStr < planStartDate) return false;

  const diff = dateDiff(dateStr, planStartDate);
  if (Number.isNaN(diff) || diff < 0) return false;

  const freqType = getEffectiveFreqType(strategy);
  if (freqType === 'daily') return true;

  if (freqType === 'weekly') {
    const targetDays = Array.isArray(strategy.freq_rules) ? strategy.freq_rules : [];
    if (targetDays.length === 0) return true;
    return targetDays.includes(getDayOfWeek(dateStr));
  }

  if (freqType === 'interval') {
    const cycleDays = getIntervalDays(strategy.freq_rules) + 1;
    return diff % cycleDays === 0;
  }

  return true;
}

function normalizeSegments(strategy, versions) {
  const normalizedVersions = Array.isArray(versions) ? versions : [];
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

function getEffectiveStrategyForDate(strategy, versions, dateStr) {
  const segments = normalizeSegments(strategy, versions);
  return segments.find(segment => {
    if (dateStr < segment.segmentStart) return false;
    if (segment.segmentEnd && dateStr >= segment.segmentEnd) return false;
    return true;
  }) || strategy;
}

async function getStrategyVersions(openid, habitId) {
  try {
    const versionsRes = await db.collection('user_strategy_versions').where({
      _openid: openid,
      habit_id: habitId
    }).get();
    return versionsRes.data || [];
  } catch (err) {
    console.error('doCheckin read versions failed:', err);
    return [];
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { habit_id, checkin_date } = event;

  if (!openid) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, code: 'MISSING_HABIT_ID', message: '缺少习惯ID' };
  }

  const targetDate = checkin_date || formatDate(new Date());
  const habitIdStr = String(habit_id);

  try {
    const strategyRes = await db.collection('user_strategies').where({
      _openid: openid,
      $or: [
        { habit_id: habitIdStr },
        { habit_id: habit_id },
        { habit_id: Number(habit_id) }
      ]
    }).get();

    if (!strategyRes.data || strategyRes.data.length === 0) {
      return { success: false, code: 'STRATEGY_NOT_FOUND', message: '未找到该习惯策略' };
    }

    const strategy = strategyRes.data[0];
    const versions = await getStrategyVersions(openid, habitIdStr);
    const effectiveStrategy = getEffectiveStrategyForDate(strategy, versions, targetDate);

    if (isDeletedSegment(effectiveStrategy) || toDateStr(strategy.deleted_at || strategy.deletedAt)) {
      if (!isDueByStrategy(effectiveStrategy, targetDate)) {
        return { success: false, code: 'STRATEGY_INACTIVE', message: '该习惯策略已停用' };
      }
    }

    if (!isDueByStrategy(effectiveStrategy, targetDate)) {
      return { success: false, code: 'NOT_DUE_TODAY', message: '今天不是该习惯的打卡日' };
    }

    const existingLog = await db.collection('checkin_logs').where({
      _openid: openid,
      habit_id: habitIdStr,
      checkin_date: targetDate
    }).get();

    if (existingLog.data && existingLog.data.length > 0) {
      return { success: false, code: 'ALREADY_CHECKED', message: '今日已打卡' };
    }

    try {
      const addResult = await db.collection('checkin_logs').add({
        data: {
          _openid: openid,
          habit_id: habitIdStr,
          checkin_date: targetDate,
          created_at: new Date(),
          created_at_str: formatDate(new Date())
        }
      });

      return { success: true, code: 'CHECKIN_CREATED', message: '打卡成功', logId: addResult._id };
    } catch (addErr) {
      if (addErr.errCode === -502001 || (addErr.message || '').includes('duplicate key')) {
        return { success: false, code: 'ALREADY_CHECKED', message: '今日已打卡' };
      }
      throw addErr;
    }
  } catch (err) {
    console.error('doCheckin error:', err);
    return { success: false, code: 'CHECKIN_FAILED', message: err.message || '打卡失败' };
  }
};
