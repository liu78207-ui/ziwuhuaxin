const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const COLLECTIONS = {
  userSettings: 'user_settings',
  userHabits: 'user_habits',
  habitPolicyVersions: 'habit_policy_versions',
  dailyCheckinStates: 'daily_checkin_states',
  reminderSendLogs: 'reminder_send_logs'
};

const DEFAULT_TEMPLATE_ID = 'TODO_REPLACE_WITH_CHECKIN_REMINDER_TEMPLATE_ID';
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

function getCollectionName(key) {
  const name = COLLECTIONS[key];
  if (!name) {
    throw new Error(`未登记的 CloudBase 集合: ${key}`);
  }
  return name;
}

function getCollectionPrefix(event = {}) {
  const prefix = String(event.__collectionPrefix || event.collectionPrefix || '');
  if (!prefix) return '';
  if (prefix === 'test_') return prefix;
  throw new Error(`非法集合前缀: ${prefix}`);
}

function getResolvedCollectionName(key, event = {}) {
  return `${getCollectionPrefix(event)}${getCollectionName(key)}`;
}

function collection(key, event = {}) {
  return db.collection(getResolvedCollectionName(key, event));
}

function isCollectionAlreadyExists(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -501001 ||
    message.includes('already exists') ||
    message.includes('collection exists') ||
    message.includes('DATABASE_COLLECTION_ALREADY_EXIST') ||
    message.includes('ResourceExist') ||
    message.includes('Table exist')
  );
}

async function ensureTestCollection(key, event = {}) {
  if (getCollectionPrefix(event) !== 'test_' || typeof db.createCollection !== 'function') {
    return;
  }
  try {
    await db.createCollection(getResolvedCollectionName(key, event));
  } catch (err) {
    if (!isCollectionAlreadyExists(err)) {
      throw err;
    }
  }
}

async function ensureTestCollections(keys, event = {}) {
  for (const key of keys) {
    await ensureTestCollection(key, event);
  }
}

function toShanghaiDate(serverTime) {
  return new Date(serverTime + 8 * 60 * 60 * 1000);
}

function formatDate(serverTime) {
  const date = toShanghaiDate(serverTime);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getShanghaiMinuteOfDay(serverTime) {
  const date = toShanghaiDate(serverTime);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseReminderMinute(reminderTime) {
  const value = String(reminderTime || '');
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWithinWindow(reminderTime, serverTime, windowMinutes) {
  const reminderMinute = parseReminderMinute(reminderTime);
  if (reminderMinute === null) return false;
  const currentMinute = getShanghaiMinuteOfDay(serverTime);
  const diff = currentMinute - reminderMinute;
  return diff >= 0 && diff < windowMinutes;
}

function normalizeGrantCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function isTemplateConfigured(templateId) {
  return Boolean(templateId) && !String(templateId).startsWith('TODO_');
}

async function listEnabledSettings(event) {
  const pageSize = 100;
  let skip = 0;
  const all = [];

  while (true) {
    const result = await collection('userSettings', event)
      .where({ 'reminder.enabled': true })
      .skip(skip)
      .limit(pageSize)
      .get();
    const data = result.data || [];
    all.push(...data);
    if (data.length < pageSize) break;
    skip += pageSize;
  }

  return all;
}

async function listByQuery(key, query, event) {
  const pageSize = 100;
  let skip = 0;
  const all = [];

  while (true) {
    const result = await collection(key, event)
      .where(query)
      .skip(skip)
      .limit(pageSize)
      .get();
    const data = result.data || [];
    all.push(...data);
    if (data.length < pageSize) break;
    skip += pageSize;
  }

  return all;
}

function listByOpenid(key, openid, event) {
  return listByQuery(key, { _openid: openid }, event);
}

function parseDateKey(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function compareDate(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function dateDiff(endDate, startDate) {
  const end = parseDateKey(endDate);
  const start = parseDateKey(startDate);
  if (end === null || start === null) return null;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

function getIsoWeekday(date) {
  const timestamp = parseDateKey(date);
  if (timestamp === null) return null;
  const weekday = new Date(timestamp).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function isHabitActiveOnDate(userHabit, date) {
  const createdAt = userHabit.createdAt || userHabit.addedAt;
  if (createdAt && compareDate(date, String(createdAt).slice(0, 10)) < 0) return false;
  if (userHabit.status === 'deleted') {
    if (!userHabit.deletedAt) return false;
    return compareDate(date, String(userHabit.deletedAt).slice(0, 10)) <= 0;
  }
  return userHabit.status === 'active';
}

function resolveEffectivePolicyVersion(policyVersions, date) {
  return (policyVersions || [])
    .filter(policy => {
      const startDate = policy.effectiveStartDate || policy.startDate;
      if (!startDate || compareDate(date, startDate) < 0) return false;
      return !policy.effectiveEndDate || compareDate(date, policy.effectiveEndDate) <= 0;
    })
    .sort((a, b) => compareDate(
      b.effectiveStartDate || b.startDate,
      a.effectiveStartDate || a.startDate
    ))[0] || null;
}

function isDueOnDateByFrequency(policyVersion, date) {
  if (!policyVersion) return false;
  const frequencyType = policyVersion.frequencyType || 'daily';
  const frequencyConfig = policyVersion.frequencyConfig || {};
  const anchorDate = policyVersion.effectiveStartDate || policyVersion.startDate;
  if (!anchorDate || compareDate(date, anchorDate) < 0) return false;

  if (frequencyType === 'daily') return true;
  if (frequencyType === 'weekly') {
    const weekdays = frequencyConfig.weekdays;
    if (!Array.isArray(weekdays) || weekdays.length === 0) return true;
    return weekdays.map(Number).includes(getIsoWeekday(date));
  }
  if (frequencyType === 'interval') {
    const intervalDays = Number(frequencyConfig.intervalDays);
    const diff = dateDiff(date, anchorDate);
    return Number.isInteger(intervalDays) && intervalDays >= 1 && diff !== null && diff >= 0 && diff % intervalDays === 0;
  }
  return false;
}

async function getTodayCompletion(openid, date, event) {
  const [habitResult, policyResult, stateResult] = await Promise.all([
    listByOpenid('userHabits', openid, event),
    listByOpenid('habitPolicyVersions', openid, event),
    listByQuery('dailyCheckinStates', { _openid: openid, date }, event)
  ]);
  const habits = habitResult || [];
  const policies = policyResult || [];
  const states = stateResult || [];
  const policiesByUserHabitId = new Map();
  const statesByUserHabitId = new Map();

  policies.forEach(policy => {
    if (!policiesByUserHabitId.has(policy.userHabitId)) {
      policiesByUserHabitId.set(policy.userHabitId, []);
    }
    policiesByUserHabitId.get(policy.userHabitId).push(policy);
  });
  states.forEach(state => {
    statesByUserHabitId.set(state.userHabitId, state);
  });

  const dueHabits = habits.filter(userHabit => {
    if (!userHabit.userHabitId || !isHabitActiveOnDate(userHabit, date)) return false;
    const state = statesByUserHabitId.get(userHabit.userHabitId);
    if (userHabit.status === 'deleted' && state?.status !== 'checked') return false;
    const policy = resolveEffectivePolicyVersion(
      policiesByUserHabitId.get(userHabit.userHabitId) || [],
      date
    );
    return isDueOnDateByFrequency(policy, date);
  });
  const checkedCount = dueHabits.filter(userHabit => (
    statesByUserHabitId.get(userHabit.userHabitId)?.status === 'checked'
  )).length;
  const dueCount = dueHabits.length;
  const scene = dueCount === 0
    ? 'no_due_habits'
    : checkedCount === 0
      ? 'none'
      : checkedCount < dueCount
        ? 'partial'
        : 'complete';

  return { dueCount, checkedCount, scene };
}

async function hasSuccessLog(openid, date, templateId, event) {
  const result = await collection('reminderSendLogs', event)
    .where({
      _openid: openid,
      date,
      templateId,
      status: 'success'
    })
    .limit(1)
    .get();
  return Boolean(result.data && result.data.length > 0);
}

async function writeLog(openid, data, event) {
  await collection('reminderSendLogs', event).add({
    data: {
      _openid: openid,
      ...data,
      createdAt: new Date().toISOString()
    }
  });
}

function buildMessageData(reminderTime, scene) {
  const message = scene === 'partial'
    ? '今天的修习已完成一部分，按自己的节奏继续就好。'
    : '今天还没有留下修习记录，记得给身体一点时间。';
  return {
    thing1: { value: '今日修习提醒' },
    time2: { value: reminderTime },
    thing3: { value: message }
  };
}

async function sendSubscribeMessage(openid, templateId, reminderTime, scene, event) {
  if (!cloud.openapi || !cloud.openapi.subscribeMessage) {
    throw new Error('当前云环境不支持 subscribeMessage.send');
  }

  return cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId,
    page: 'pages/home/home',
    data: event.messageData || buildMessageData(reminderTime, scene),
    miniprogramState: event.miniprogramState || 'formal'
  });
}

async function updateReminderAfterSuccess(settingDoc, reminder, todayKey, event) {
  const nextReminder = {
    ...reminder,
    subscribeGrantCount: Math.max(0, normalizeGrantCount(reminder.subscribeGrantCount) - 1),
    lastSentDate: todayKey,
    updatedAt: new Date().toISOString()
  };

  await collection('userSettings', event).doc(settingDoc._id).update({
    data: {
      reminder: nextReminder,
      updatedAt: new Date().toISOString()
    }
  });
}

async function processSetting(settingDoc, context) {
  const { event, todayKey, serverTime, templateId, windowMinutes } = context;
  const openid = settingDoc._openid;
  const reminder = settingDoc.reminder || {};
  const scheduledTime = reminder.reminderTime || '21:00';
  const baseLog = {
    date: todayKey,
    scheduledTime,
    templateId
  };

  if (!openid) {
    return { status: 'skipped', reason: 'missing_openid' };
  }
  if (reminder.enabled !== true) {
    return { status: 'skipped', reason: 'disabled' };
  }
  if (reminder.timezone && reminder.timezone !== DEFAULT_TIMEZONE) {
    await writeLog(openid, { ...baseLog, status: 'skipped', reason: 'unsupported_timezone' }, event);
    return { status: 'skipped', reason: 'unsupported_timezone' };
  }
  if (reminder.remindIfNoCheckin === false) {
    await writeLog(openid, { ...baseLog, status: 'skipped', reason: 'remind_if_no_checkin_disabled' }, event);
    return { status: 'skipped', reason: 'remind_if_no_checkin_disabled' };
  }
  if (!isTemplateConfigured(templateId)) {
    await writeLog(openid, { ...baseLog, status: 'skipped', reason: 'template_not_configured' }, event);
    return { status: 'skipped', reason: 'template_not_configured' };
  }
  if (!isWithinWindow(scheduledTime, serverTime, windowMinutes)) {
    return { status: 'skipped', reason: 'not_in_time_window' };
  }
  if (reminder.lastSentDate === todayKey) {
    return { status: 'skipped', reason: 'already_sent_by_settings' };
  }
  if (await hasSuccessLog(openid, todayKey, templateId, event)) {
    return { status: 'skipped', reason: 'already_sent_by_log' };
  }
  const completion = await getTodayCompletion(openid, todayKey, event);
  const completionLog = {
    scene: completion.scene,
    dueCount: completion.dueCount,
    checkedCount: completion.checkedCount
  };
  if (completion.scene === 'no_due_habits') {
    await writeLog(openid, {
      ...baseLog,
      ...completionLog,
      status: 'skipped',
      reason: 'no_due_habits'
    }, event);
    return { status: 'skipped', reason: 'no_due_habits', ...completionLog };
  }
  if (completion.scene === 'complete') {
    await writeLog(openid, {
      ...baseLog,
      ...completionLog,
      status: 'skipped',
      reason: 'all_due_habits_checked'
    }, event);
    return { status: 'skipped', reason: 'all_due_habits_checked', ...completionLog };
  }
  if (normalizeGrantCount(reminder.subscribeGrantCount) <= 0 && event.longTermSubscribeEnabled !== true) {
    await writeLog(openid, {
      ...baseLog,
      ...completionLog,
      status: 'skipped',
      reason: 'no_subscribe_grant'
    }, event);
    return { status: 'skipped', reason: 'no_subscribe_grant', ...completionLog };
  }

  try {
    await sendSubscribeMessage(openid, templateId, scheduledTime, completion.scene, event);
    await writeLog(openid, {
      ...baseLog,
      ...completionLog,
      status: 'success',
      reason: 'sent'
    }, event);
    if (event.longTermSubscribeEnabled !== true) {
      await updateReminderAfterSuccess(settingDoc, reminder, todayKey, event);
    }
    return { status: 'success', reason: 'sent', ...completionLog };
  } catch (err) {
    await writeLog(openid, {
      ...baseLog,
      ...completionLog,
      status: 'failed',
      reason: err.message || 'send_failed'
    }, event);
    return { status: 'failed', reason: err.message || 'send_failed', ...completionLog };
  }
}

exports.main = async (event = {}, context) => {
  const serverTime = Number(event.serverTime || Date.now());
  const todayKey = event.todayKey || formatDate(serverTime);
  const templateId = event.templateId || process.env.CHECKIN_REMINDER_TEMPLATE_ID || DEFAULT_TEMPLATE_ID;
  const windowMinutes = Math.max(1, Math.min(120, Number(event.windowMinutes || 30)));
  const summary = {
    success: true,
    scanned: 0,
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
    details: [],
    serverTime
  };

  try {
    await ensureTestCollections([
      'userSettings',
      'userHabits',
      'habitPolicyVersions',
      'dailyCheckinStates',
      'reminderSendLogs'
    ], event);
    const settings = await listEnabledSettings(event);
    summary.scanned = settings.length;

    for (const setting of settings) {
      const result = await processSetting(setting, {
        event,
        todayKey,
        serverTime,
        templateId,
        windowMinutes
      });
      if (result.status === 'success') summary.successCount += 1;
      if (result.status === 'failed') summary.failedCount += 1;
      if (result.status === 'skipped') summary.skippedCount += 1;
      summary.details.push({
        status: result.status,
        reason: result.reason,
        scene: result.scene,
        dueCount: result.dueCount,
        checkedCount: result.checkedCount
      });
    }

    return summary;
  } catch (err) {
    console.error('scanReminderUsers error:', err);
    return {
      ...summary,
      success: false,
      error: {
        code: 'SCAN_REMINDER_FAILED',
        message: err.message || '扫描提醒用户失败'
      }
    };
  }
};
