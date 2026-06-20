const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const PAGE_SIZE = 100;
const DEFAULT_DAILY_STATE_DAYS = 90;
const BUILT_IN_HABITS = {
  '1': { name: '金刚功', category: '运动类', targetMinutes: 15 },
  '2': { name: '站桩', category: '运动类', targetMinutes: 20 },
  '3': { name: '八段锦', category: '运动类', targetMinutes: 15 },
  '4': { name: '五禽戏', category: '运动类', targetMinutes: 20 },
  '5': { name: '太极拳', category: '运动类', targetMinutes: 30 },
  '6': { name: '快走', category: '运动类', targetMinutes: 30 },
  '7': { name: '瑜伽', category: '运动类', targetMinutes: 45 },
  '8': { name: '普拉提', category: '运动类', targetMinutes: 40 },
  '9': { name: '游泳', category: '运动类', targetMinutes: 45 },
  '10': { name: '跑步', category: '运动类', targetMinutes: 30 },
  '11': { name: '跳绳', category: '运动类', targetMinutes: 15 },
  '12': { name: '艾灸', category: '理疗类', targetMinutes: 30 },
  '13': { name: '刮痧', category: '理疗类', targetMinutes: 20 },
  '14': { name: '拔罐', category: '理疗类', targetMinutes: 15 },
  '15': { name: '推拿', category: '理疗类', targetMinutes: 30 },
  '16': { name: '经络拍打', category: '理疗类', targetMinutes: 15 },
  '17': { name: '晨起温水', category: '起居类', targetMinutes: 5 },
  '18': { name: '梳头', category: '起居类', targetMinutes: 5 },
  '19': { name: '叩齿', category: '起居类', targetMinutes: 5 },
  '20': { name: '揉腹', category: '起居类', targetMinutes: 10 },
  '21': { name: '睡前泡脚', category: '起居类', targetMinutes: 20 }
};
const LEGACY_HABIT_ID_ALIASES = {
  h001: '1',
  h002: '3',
  h003: '2',
  h004: '6',
  h005: '12',
  h006: '13',
  h007: '15',
  h008: '21',
  h009: '20',
  h010: '16',
  hrunning: '10',
  hpaobu: '10'
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function getShanghaiDateKey(timestamp) {
  const shanghaiTime = new Date(timestamp + 8 * 60 * 60 * 1000);
  return formatDateKey(shanghaiTime);
}

function addDays(dateKey, delta) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return formatDateKey(date);
}

function normalizePositiveInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  const integer = Math.floor(number);
  return max ? Math.min(integer, max) : integer;
}

function pickDefined(source, keys) {
  const result = {};
  keys.forEach(key => {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  });
  return result;
}

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return undefined;
}

function normalizeAliasKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeHabitId(value) {
  const raw = String(value || '').trim();
  if (/^(?:[1-9]|1[0-9]|2[0-1])$/.test(raw)) return raw;
  return LEGACY_HABIT_ID_ALIASES[normalizeAliasKey(raw)] || raw;
}

function setDefined(target, key, value) {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
}

function slimUserHabit(habit) {
  const result = pickDefined(habit, [
    'userHabitId',
    'habitId',
    'name',
    'title',
    'habitTitle',
    'category',
    'duration',
    'targetMinutes',
    'themeClass',
    'iconUrl',
    'status',
    'isDeleted',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'latestPolicyVersionId',
    'syncStatus'
  ]);
  result.userHabitId = firstDefined(habit, ['userHabitId', 'user_habit_id', 'userHabit_Id']);
  result.userHabitId = result.userHabitId ? String(result.userHabitId) : result.userHabitId;
  const rawHabitId = firstDefined(habit, ['habitId', 'habit_id', 'habit_Id']);
  if (rawHabitId !== undefined) {
    result.habitId = normalizeHabitId(rawHabitId);
  }
  const builtIn = BUILT_IN_HABITS[result.habitId] || {};
  setDefined(result, 'name', firstDefined(habit, ['name', 'title', 'habitTitle', 'habit_title']) || builtIn.name || result.name);
  setDefined(result, 'category', result.category || builtIn.category);
  setDefined(result, 'targetMinutes', firstDefined(habit, ['targetMinutes', 'target_minutes', 'duration']) || builtIn.targetMinutes || result.targetMinutes);
  setDefined(result, 'themeClass', firstDefined(habit, ['themeClass', 'theme_class']) || result.themeClass);
  setDefined(result, 'iconUrl', firstDefined(habit, ['iconUrl', 'icon_url']) || result.iconUrl);
  if (!result.status && result.isDeleted === true) {
    result.status = 'deleted';
  }
  return result;
}

function slimPolicyVersion(policy) {
  const result = pickDefined(policy, [
    'policyVersionId',
    'userHabitId',
    'habitId',
    'duration',
    'frequencyType',
    'frequencyConfig',
    'startDate',
    'effectiveStartDate',
    'effectiveEndDate',
    'createdAt',
    'updatedAt',
    'syncStatus'
  ]);
  result.userHabitId = firstDefined(policy, ['userHabitId', 'user_habit_id', 'userHabit_Id']);
  result.userHabitId = result.userHabitId ? String(result.userHabitId) : result.userHabitId;
  const rawHabitId = firstDefined(policy, ['habitId', 'habit_id', 'habit_Id']);
  if (rawHabitId !== undefined) {
    result.habitId = normalizeHabitId(rawHabitId);
  }
  result.policyVersionId = firstDefined(policy, ['policyVersionId', 'policy_version_id']) || result.policyVersionId;
  result.frequencyType = firstDefined(policy, ['frequencyType', 'freq_type']) || result.frequencyType;
  result.frequencyConfig = firstDefined(policy, ['frequencyConfig', 'freq_rules']) || result.frequencyConfig;
  result.startDate = firstDefined(policy, ['startDate', 'start_date', 'plan_start_date']) || result.startDate;
  return result;
}

function slimDailyState(state) {
  const result = pickDefined(state, [
    'stateId',
    'userHabitId',
    'habitId',
    'policyVersionId',
    'date',
    'status',
    'checkedAt',
    'canceledAt',
    'lastOperationId',
    'lastOperationClientTime',
    'lastOperationClientSequence',
    'isLocked',
    'lockReason',
    'lockedReason',
    'hasPolicyChangedToday',
    'hasDeletionToday',
    'syncStatus',
    'updatedAt'
  ]);
  result.userHabitId = firstDefined(state, ['userHabitId', 'user_habit_id', 'userHabit_Id']);
  result.userHabitId = result.userHabitId ? String(result.userHabitId) : result.userHabitId;
  const rawHabitId = firstDefined(state, ['habitId', 'habit_id', 'habit_Id']);
  if (rawHabitId !== undefined) {
    result.habitId = normalizeHabitId(rawHabitId);
  }
  result.policyVersionId = firstDefined(state, ['policyVersionId', 'policy_version_id']) || result.policyVersionId;
  return result;
}

async function listAllByOpenid(collectionName, openid) {
  const items = [];
  let offset = 0;

  while (true) {
    const res = await db.collection(collectionName)
      .where({ _openid: openid })
      .skip(offset)
      .limit(PAGE_SIZE)
      .get();
    const page = res.data || [];
    items.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return items;
}

function resolveDailyStateRange(event, serverTime) {
  if (event.startDate || event.endDate) {
    return {
      startDate: event.startDate || '',
      endDate: event.endDate || ''
    };
  }

  const dailyStateDays = normalizePositiveInt(event.dailyStateDays, DEFAULT_DAILY_STATE_DAYS, 3660);
  const endDate = getShanghaiDateKey(serverTime);
  return {
    startDate: addDays(endDate, -(dailyStateDays - 1)),
    endDate
  };
}

function filterDailyStates(states, range) {
  return states.filter(state => {
    if (!state.date) return true;
    if (range.startDate && state.date < range.startDate) return false;
    if (range.endDate && state.date > range.endDate) return false;
    return true;
  });
}

function paginateDailyStates(states, event) {
  const limit = normalizePositiveInt(event.limit, PAGE_SIZE, 500);
  const offset = normalizePositiveInt(event.cursor, 0, null);
  const page = states.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    page,
    nextCursor: nextOffset < states.length ? String(nextOffset) : null
  };
}

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
 * 入参:
 * - 默认 { dailyStateDays: 90 }
 * - 可选 { startDate, endDate, cursor, limit } 分页恢复指定周期 daily states
 * 返回: { success, data: { userHabits, policyVersions, dailyStates, nextCursor } }
 */
exports.main = async (event, context) => {
  event = event || {};
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;
  const serverTime = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份', serverTime };
  }

  try {
    const userHabits = await listAllByOpenid('user_habits', OPENID);
    const policyVersions = await listAllByOpenid('habit_policy_versions', OPENID);
    const allDailyStates = await listAllByOpenid('daily_checkin_states', OPENID);
    const range = resolveDailyStateRange(event, serverTime);
    const filteredDailyStates = filterDailyStates(allDailyStates, range)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const { page: dailyStates, nextCursor } = paginateDailyStates(filteredDailyStates, event);

    return {
      success: true,
      data: {
        userHabits: userHabits.map(slimUserHabit),
        policyVersions: policyVersions.map(slimPolicyVersion),
        dailyStates: dailyStates.map(slimDailyState),
        nextCursor
      },
      serverTime
    };
  } catch (e) {
    console.error('recoverData 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message, serverTime };
  }
};
