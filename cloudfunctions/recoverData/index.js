const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const PAGE_SIZE = 100;
const DEFAULT_DAILY_STATE_DAYS = 90;
const RECOVERY_PROTOCOL_VERSION = 2;
// 腾讯云同步响应上限为 6MB；业务层限制为 5MB，预留平台封装开销。
const MAX_RECOVERY_RESPONSE_BYTES = 5 * 1024 * 1024;
const COLLECTIONS = {
  userHabits: 'user_habits',
  habitPolicyVersions: 'habit_policy_versions',
  dailyCheckinStates: 'daily_checkin_states'
};
const FUNCTION_COLLECTION_PREFIXES = Object.freeze({
  recoverData: '',
  recoverDataV2Test: 'test_'
});

function getCollectionName(key) {
  const name = COLLECTIONS[key];
  if (!name) {
    throw new Error(`未登记的 CloudBase 集合: ${key}`);
  }
  return name;
}

function getServerFunctionName(context = {}) {
  return String(
    process.env.SCF_FUNCTIONNAME ||
    context.function_name ||
    context.functionName ||
    ''
  ).trim();
}

function getCollectionPrefix(context = {}) {
  const functionName = getServerFunctionName(context);
  if (!Object.prototype.hasOwnProperty.call(FUNCTION_COLLECTION_PREFIXES, functionName)) {
    throw new Error(`未授权的恢复函数入口: ${functionName || 'unknown'}`);
  }
  return FUNCTION_COLLECTION_PREFIXES[functionName];
}

function collection(key, context = {}) {
  return db.collection(`${getCollectionPrefix(context)}${getCollectionName(key)}`);
}

function isCollectionMissing(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -502005 ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('Table not exist')
  );
}

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
  '21': { name: '睡前泡脚', category: '起居类', targetMinutes: 20 },
  '22': { name: '点穴', category: '理疗类', targetMinutes: 15 },
  '23': { name: '舞蹈', category: '运动类', targetMinutes: 30 },
  '24': { name: '健体', category: '运动类', targetMinutes: 20 },
  '25': { name: '易筋经', category: '运动类', targetMinutes: 20 }
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

function normalizeHabitId(value) {
  const raw = String(value || '').trim();
  if (/^(?:[1-9]|1[0-9]|2[0-5])$/.test(raw)) return raw;
  return raw;
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
    'source',
    'name',
    'title',
    'habitTitle',
    'category',
    'remark',
    'duration',
    'targetMinutes',
    'themeClass',
    'iconUrl',
    'status',
    'createdAt',
    'addedAt',
    'updatedAt',
    'pinnedAt',
    'deletedAt'
  ]);
  result.userHabitId = habit.userHabitId;
  result.userHabitId = result.userHabitId ? String(result.userHabitId) : result.userHabitId;
  if (habit.habitId !== undefined) {
    result.habitId = normalizeHabitId(habit.habitId);
  }
  const builtIn = BUILT_IN_HABITS[result.habitId] || {};
  setDefined(result, 'name', result.name || builtIn.name);
  setDefined(result, 'category', result.category || builtIn.category);
  setDefined(result, 'targetMinutes', result.targetMinutes || result.duration || builtIn.targetMinutes);
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
    'updatedAt'
  ]);
  result.userHabitId = policy.userHabitId;
  result.userHabitId = result.userHabitId ? String(result.userHabitId) : result.userHabitId;
  if (policy.habitId !== undefined) {
    result.habitId = normalizeHabitId(policy.habitId);
  }
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
    'hasPolicyChangedToday',
    'hasDeletionToday',
    'updatedAt'
  ]);
  result.userHabitId = state.userHabitId;
  result.userHabitId = result.userHabitId ? String(result.userHabitId) : result.userHabitId;
  if (state.habitId !== undefined) {
    result.habitId = normalizeHabitId(state.habitId);
  }
  return result;
}

async function listAllByOpenid(collectionKey, openid, context) {
  const items = [];
  let offset = 0;

  while (true) {
    let res;
    try {
      res = await collection(collectionKey, context)
        .where({ _openid: openid })
        .skip(offset)
        .limit(PAGE_SIZE)
        .get();
    } catch (err) {
      if (isCollectionMissing(err) && getCollectionPrefix(context) === 'test_') {
        return [];
      }
      throw err;
    }
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
  if (event.historyScope === 'all') {
    return {
      startDate: '',
      endDate: ''
    };
  }

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

function getDailyStateSortId(state) {
  return String(state._id || state.stateId || '');
}

function compareDailyStateForRecovery(a, b) {
  const dateOrder = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateOrder !== 0) return dateOrder;
  return getDailyStateSortId(a).localeCompare(getDailyStateSortId(b));
}

function encodeDailyStateCursor(state) {
  return Buffer.from(JSON.stringify({
    date: String(state.date || ''),
    id: getDailyStateSortId(state)
  }), 'utf8').toString('base64');
}

function decodeDailyStateCursor(value) {
  if (value === undefined || value === null || value === '') return null;

  // 兼容已经持有旧数字 offset 游标的客户端；新响应只返回稳定游标。
  if (/^\d+$/.test(String(value))) {
    return { offset: Number(value) };
  }

  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.date !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid cursor shape');
    }
    return { date: parsed.date, id: parsed.id };
  } catch (error) {
    throw new Error('recoverData cursor 无效');
  }
}

function isStateAfterCursor(state, cursor) {
  const dateOrder = String(state.date || '').localeCompare(cursor.date);
  if (dateOrder !== 0) return dateOrder > 0;
  return getDailyStateSortId(state).localeCompare(cursor.id) > 0;
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
  const limit = normalizePositiveInt(event.limit, PAGE_SIZE, PAGE_SIZE);
  const cursor = decodeDailyStateCursor(event.cursor);
  const remaining = cursor && cursor.offset === undefined
    ? states.filter(state => isStateAfterCursor(state, cursor))
    : states.slice(cursor && cursor.offset || 0);
  const page = remaining.slice(0, limit);
  return {
    page,
    nextCursor: page.length > 0 && page.length < remaining.length
      ? encodeDailyStateCursor(page[page.length - 1])
      : null
  };
}

function buildSnapshotToken(userHabits, policyVersions, dailyStates, range) {
  const normalize = (items, fields) => items
    .map(item => fields.map(field => item[field] === undefined ? null : item[field]))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const identity = {
    range,
    userHabits: normalize(userHabits, [
      'userHabitId', 'habitId', 'status', 'updatedAt', 'deletedAt', 'pinnedAt'
    ]),
    policyVersions: normalize(policyVersions, [
      'policyVersionId', 'userHabitId', 'effectiveStartDate', 'effectiveEndDate', 'updatedAt'
    ]),
    dailyStates: normalize(dailyStates, [
      'stateId', 'userHabitId', 'date', 'status', 'updatedAt', 'lastOperationId'
    ])
  };
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

function assertRecoveryResponseSize(response) {
  const responseBytes = Buffer.byteLength(JSON.stringify(response), 'utf8');
  if (responseBytes > MAX_RECOVERY_RESPONSE_BYTES) {
    const error = new Error('recoverData 响应超过 5MB 安全上限，请联系维护人员处理');
    error.code = 'RECOVERY_RESPONSE_TOO_LARGE';
    throw error;
  }
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
 * - 新客户端全量恢复 { historyScope: "all", recoveryProtocolVersion: 2 }
 * - 可选 { startDate, endDate, cursor, limit } 分页恢复指定周期 daily states
 * 返回: { success, data: { userHabits, policyVersions, dailyStates, nextCursor, snapshotMeta } }
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
    const userHabits = await listAllByOpenid('userHabits', OPENID, context);
    const policyVersions = await listAllByOpenid('habitPolicyVersions', OPENID, context);
    const allDailyStates = await listAllByOpenid('dailyCheckinStates', OPENID, context);
    const range = resolveDailyStateRange(event, serverTime);
    const filteredDailyStates = filterDailyStates(allDailyStates, range)
      .sort(compareDailyStateForRecovery);
    const { page: dailyStates, nextCursor } = paginateDailyStates(filteredDailyStates, event);
    const snapshotMeta = {
      protocolVersion: RECOVERY_PROTOCOL_VERSION,
      scope: event.historyScope === 'all' ? 'all' : 'range',
      token: buildSnapshotToken(userHabits, policyVersions, filteredDailyStates, range),
      totalUserHabits: userHabits.length,
      totalPolicyVersions: policyVersions.length,
      totalDailyStates: filteredDailyStates.length
    };

    const response = {
      success: true,
      data: {
        userHabits: userHabits.map(slimUserHabit),
        policyVersions: policyVersions.map(slimPolicyVersion),
        dailyStates: dailyStates.map(slimDailyState),
        nextCursor,
        snapshotMeta
      },
      serverTime
    };
    assertRecoveryResponseSize(response);
    return response;
  } catch (e) {
    console.error('recoverData 云函数异常:', e);
    return {
      success: false,
      code: e.code || 'CLOUD_ERROR',
      message: e.message,
      serverTime
    };
  }
};
