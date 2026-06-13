const START_DATE = '2026-06-11';
const END_DATE = '2026-06-13';

const HABITS = {
  '2': { habitId: '2', name: '站桩', category: '运动类', targetMinutes: 20, themeClass: 't-green' },
  '7': { habitId: '7', name: '瑜伽', category: '运动类', targetMinutes: 45, themeClass: 't-green' },
  '8': { habitId: '8', name: '普拉提', category: '运动类', targetMinutes: 40, themeClass: 't-green' },
  '12': { habitId: '12', name: '艾灸', category: '理疗类', targetMinutes: 30, themeClass: 't-red' },
  '17': { habitId: '17', name: '晨起温水', category: '起居类', targetMinutes: 5, themeClass: 't-blue' }
};

const SCENARIO_EXPECTED = {
  name: '三天动态打卡人工测试场景',
  startDate: START_DATE,
  endDate: END_DATE,
  dates: ['2026-06-11', '2026-06-12', '2026-06-13'],
  flows: [
    {
      name: '普拉提',
      habitId: '8',
      userHabitId: 'uh_dyn_pilates_1',
      description: '11/12 已打卡，13 打卡后修改策略、取消打卡、删除；11/12 历史必须保留。'
    },
    {
      name: '瑜伽',
      habitId: '7',
      userHabitId: 'uh_dyn_yoga_1',
      description: '12 新增，13 已打卡后修改策略，最终 checked 按策略修改当天锁定。'
    },
    {
      name: '艾灸',
      habitId: '12',
      userHabitId: 'uh_dyn_moxa_1',
      description: '12 打卡后取消，13 未打卡删除，删除当天不计分母。'
    },
    {
      name: '站桩',
      habitId: '2',
      userHabitId: 'uh_dyn_standing_1',
      description: '11/12 已打卡，12 删除后保留删除当天 checked。'
    },
    {
      name: '站桩',
      habitId: '2',
      userHabitId: 'uh_dyn_standing_2',
      description: '13 重新添加同一 habitId，生成新 userHabitId 并独立打卡。'
    },
    {
      name: '晨起温水',
      habitId: '17',
      userHabitId: 'uh_dyn_water_1',
      description: '11/12/13 稳定每日打卡，作为基准对照。'
    }
  ],
  summary: {
    totalUserHabits: 6,
    totalPolicyVersions: 8,
    totalOperations: 14,
    totalDailyStates: 13,
    activeUserHabits: 3,
    deletedUserHabits: 3
  }
};

function iso(date, time = '08:00:00') {
  return `${date}T${time}+08:00`;
}

function ts(date, time = '08:00:00') {
  return new Date(iso(date, time)).getTime();
}

function habitInfo(habitId) {
  return HABITS[habitId];
}

function makeUserHabit(openid, {
  userHabitId,
  habitId,
  status = 'active',
  createdAt,
  deletedAt = null,
  latestPolicyVersionId
}) {
  const habit = habitInfo(habitId);
  return {
    _openid: openid,
    userHabitId,
    habitId,
    name: habit.name,
    category: habit.category,
    duration: habit.targetMinutes,
    targetMinutes: habit.targetMinutes,
    themeClass: habit.themeClass,
    status,
    createdAt,
    deletedAt,
    latestPolicyVersionId,
    syncStatus: 'synced',
    updatedAt: ts(deletedAt || END_DATE, '21:30:00')
  };
}

function makePolicy(openid, {
  policyVersionId,
  userHabitId,
  habitId,
  duration,
  frequencyType,
  frequencyConfig,
  startDate,
  effectiveStartDate,
  effectiveEndDate
}) {
  return {
    _openid: openid,
    policyVersionId,
    userHabitId,
    habitId,
    duration,
    frequencyType,
    frequencyConfig,
    startDate,
    effectiveStartDate,
    effectiveEndDate,
    syncStatus: 'synced',
    createdAt: iso(effectiveStartDate, '07:00:00'),
    updatedAt: ts(effectiveEndDate || END_DATE, '21:00:00')
  };
}

function makeOperation(openid, {
  operationId,
  userHabitId,
  habitId,
  policyVersionId,
  date,
  action,
  sequence,
  time
}) {
  return {
    _openid: openid,
    operationId,
    idempotencyKey: operationId,
    userHabitId,
    habitId,
    policyVersionId,
    date,
    action,
    clientTime: iso(date, time),
    clientSequence: sequence,
    serverTime: ts(date, time),
    source: 'manual_dynamic_three_day',
    syncStatus: 'synced'
  };
}

function makeDailyState(openid, {
  stateId,
  userHabitId,
  habitId,
  policyVersionId,
  date,
  status,
  lastOperationId = null,
  checkedAt = null,
  canceledAt = null,
  sequence = 0,
  hasPolicyChangedToday = false,
  hasDeletionToday = false,
  lockedReason = null
}) {
  return {
    _openid: openid,
    stateId,
    userHabitId,
    habitId,
    policyVersionId,
    date,
    status,
    checkedAt: checkedAt ? ts(date, checkedAt) : null,
    canceledAt: canceledAt ? ts(date, canceledAt) : null,
    lastOperationId,
    lastOperationClientTime: lastOperationId ? iso(date, canceledAt || checkedAt || '20:00:00') : null,
    lastOperationClientSequence: sequence,
    ...(hasPolicyChangedToday ? { hasPolicyChangedToday: true } : {}),
    ...(hasDeletionToday ? { hasDeletionToday: true, isLocked: true } : {}),
    ...(lockedReason ? { lockedReason, lockReason: lockedReason } : {}),
    syncStatus: 'synced',
    updatedAt: ts(date, canceledAt || checkedAt || '20:00:00')
  };
}

function makeHabitInfo(openid, habit) {
  return {
    _openid: openid,
    habit_id: habit.habitId,
    name: habit.name,
    category: habit.category,
    target_minutes: habit.targetMinutes,
    theme_class: habit.themeClass
  };
}

function createDynamicThreeDayScenario(openid = 'dynamic_three_day_openid') {
  const userHabits = [
    makeUserHabit(openid, {
      userHabitId: 'uh_dyn_pilates_1',
      habitId: '8',
      status: 'deleted',
      createdAt: '2026-06-11',
      deletedAt: '2026-06-13',
      latestPolicyVersionId: 'pv_dyn_pilates_weekly_13'
    }),
    makeUserHabit(openid, {
      userHabitId: 'uh_dyn_yoga_1',
      habitId: '7',
      createdAt: '2026-06-12',
      latestPolicyVersionId: 'pv_dyn_yoga_weekly_13'
    }),
    makeUserHabit(openid, {
      userHabitId: 'uh_dyn_moxa_1',
      habitId: '12',
      status: 'deleted',
      createdAt: '2026-06-12',
      deletedAt: '2026-06-13',
      latestPolicyVersionId: 'pv_dyn_moxa_daily_12'
    }),
    makeUserHabit(openid, {
      userHabitId: 'uh_dyn_standing_1',
      habitId: '2',
      status: 'deleted',
      createdAt: '2026-06-11',
      deletedAt: '2026-06-12',
      latestPolicyVersionId: 'pv_dyn_standing_daily_11'
    }),
    makeUserHabit(openid, {
      userHabitId: 'uh_dyn_standing_2',
      habitId: '2',
      createdAt: '2026-06-13',
      latestPolicyVersionId: 'pv_dyn_standing_daily_13'
    }),
    makeUserHabit(openid, {
      userHabitId: 'uh_dyn_water_1',
      habitId: '17',
      createdAt: '2026-06-11',
      latestPolicyVersionId: 'pv_dyn_water_daily_11'
    })
  ];

  const policyVersions = [
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_pilates_daily_11',
      userHabitId: 'uh_dyn_pilates_1',
      habitId: '8',
      duration: 40,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-11',
      effectiveStartDate: '2026-06-11',
      effectiveEndDate: '2026-06-13'
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_pilates_weekly_13',
      userHabitId: 'uh_dyn_pilates_1',
      habitId: '8',
      duration: 30,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [1] },
      startDate: '2026-06-13',
      effectiveStartDate: '2026-06-13',
      effectiveEndDate: '2026-06-13'
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_yoga_daily_12',
      userHabitId: 'uh_dyn_yoga_1',
      habitId: '7',
      duration: 45,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-12',
      effectiveStartDate: '2026-06-12',
      effectiveEndDate: '2026-06-13'
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_yoga_weekly_13',
      userHabitId: 'uh_dyn_yoga_1',
      habitId: '7',
      duration: 30,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [6] },
      startDate: '2026-06-13',
      effectiveStartDate: '2026-06-13',
      effectiveEndDate: null
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_moxa_daily_12',
      userHabitId: 'uh_dyn_moxa_1',
      habitId: '12',
      duration: 30,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-12',
      effectiveStartDate: '2026-06-12',
      effectiveEndDate: '2026-06-13'
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_standing_daily_11',
      userHabitId: 'uh_dyn_standing_1',
      habitId: '2',
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-11',
      effectiveStartDate: '2026-06-11',
      effectiveEndDate: '2026-06-12'
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_standing_daily_13',
      userHabitId: 'uh_dyn_standing_2',
      habitId: '2',
      duration: 25,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-13',
      effectiveStartDate: '2026-06-13',
      effectiveEndDate: null
    }),
    makePolicy(openid, {
      policyVersionId: 'pv_dyn_water_daily_11',
      userHabitId: 'uh_dyn_water_1',
      habitId: '17',
      duration: 5,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-11',
      effectiveStartDate: '2026-06-11',
      effectiveEndDate: null
    })
  ];

  const operations = [
    makeOperation(openid, { operationId: 'op_dyn_pilates_11_checkin', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-11', action: 'checkin', sequence: 1, time: '08:10:00' }),
    makeOperation(openid, { operationId: 'op_dyn_pilates_12_checkin', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-12', action: 'checkin', sequence: 2, time: '08:10:00' }),
    makeOperation(openid, { operationId: 'op_dyn_pilates_13_checkin', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-13', action: 'checkin', sequence: 3, time: '08:10:00' }),
    makeOperation(openid, { operationId: 'op_dyn_pilates_13_undo', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_weekly_13', date: '2026-06-13', action: 'undo', sequence: 4, time: '20:30:00' }),
    makeOperation(openid, { operationId: 'op_dyn_yoga_12_checkin', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_daily_12', date: '2026-06-12', action: 'checkin', sequence: 5, time: '09:00:00' }),
    makeOperation(openid, { operationId: 'op_dyn_yoga_13_checkin', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_daily_12', date: '2026-06-13', action: 'checkin', sequence: 6, time: '09:00:00' }),
    makeOperation(openid, { operationId: 'op_dyn_moxa_12_checkin', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-12', action: 'checkin', sequence: 7, time: '10:00:00' }),
    makeOperation(openid, { operationId: 'op_dyn_moxa_12_undo', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-12', action: 'undo', sequence: 8, time: '10:20:00' }),
    makeOperation(openid, { operationId: 'op_dyn_standing_11_checkin', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-11', action: 'checkin', sequence: 9, time: '07:30:00' }),
    makeOperation(openid, { operationId: 'op_dyn_standing_12_checkin', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-12', action: 'checkin', sequence: 10, time: '07:30:00' }),
    makeOperation(openid, { operationId: 'op_dyn_standing_13_checkin', userHabitId: 'uh_dyn_standing_2', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_13', date: '2026-06-13', action: 'checkin', sequence: 11, time: '07:30:00' }),
    makeOperation(openid, { operationId: 'op_dyn_water_11_checkin', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-11', action: 'checkin', sequence: 12, time: '06:30:00' }),
    makeOperation(openid, { operationId: 'op_dyn_water_12_checkin', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-12', action: 'checkin', sequence: 13, time: '06:30:00' }),
    makeOperation(openid, { operationId: 'op_dyn_water_13_checkin', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-13', action: 'checkin', sequence: 14, time: '06:30:00' })
  ];

  const dailyStates = [
    makeDailyState(openid, { stateId: 'state_dyn_pilates_11', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-11', status: 'checked', checkedAt: '08:10:00', lastOperationId: 'op_dyn_pilates_11_checkin', sequence: 1 }),
    makeDailyState(openid, { stateId: 'state_dyn_pilates_12', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-12', status: 'checked', checkedAt: '08:10:00', lastOperationId: 'op_dyn_pilates_12_checkin', sequence: 2 }),
    makeDailyState(openid, { stateId: 'state_dyn_pilates_13', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_weekly_13', date: '2026-06-13', status: 'not_required', canceledAt: '20:30:00', lastOperationId: 'op_dyn_pilates_13_undo', sequence: 4, hasPolicyChangedToday: true, hasDeletionToday: true, lockedReason: 'deleted_without_checkin' }),
    makeDailyState(openid, { stateId: 'state_dyn_yoga_12', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_daily_12', date: '2026-06-12', status: 'checked', checkedAt: '09:00:00', lastOperationId: 'op_dyn_yoga_12_checkin', sequence: 5 }),
    makeDailyState(openid, { stateId: 'state_dyn_yoga_13', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_weekly_13', date: '2026-06-13', status: 'checked', checkedAt: '09:00:00', lastOperationId: 'op_dyn_yoga_13_checkin', sequence: 6, hasPolicyChangedToday: true, lockedReason: 'strategy_changed_after_checkin' }),
    makeDailyState(openid, { stateId: 'state_dyn_moxa_12', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-12', status: 'canceled', canceledAt: '10:20:00', lastOperationId: 'op_dyn_moxa_12_undo', sequence: 8 }),
    makeDailyState(openid, { stateId: 'state_dyn_moxa_13', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-13', status: 'not_required', lastOperationId: null, sequence: 0, hasDeletionToday: true, lockedReason: 'deleted_without_checkin' }),
    makeDailyState(openid, { stateId: 'state_dyn_standing_11', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-11', status: 'checked', checkedAt: '07:30:00', lastOperationId: 'op_dyn_standing_11_checkin', sequence: 9 }),
    makeDailyState(openid, { stateId: 'state_dyn_standing_12', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-12', status: 'checked', checkedAt: '07:30:00', lastOperationId: 'op_dyn_standing_12_checkin', sequence: 10, hasDeletionToday: true, lockedReason: 'deleted_after_checkin' }),
    makeDailyState(openid, { stateId: 'state_dyn_standing_13', userHabitId: 'uh_dyn_standing_2', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_13', date: '2026-06-13', status: 'checked', checkedAt: '07:30:00', lastOperationId: 'op_dyn_standing_13_checkin', sequence: 11 }),
    makeDailyState(openid, { stateId: 'state_dyn_water_11', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-11', status: 'checked', checkedAt: '06:30:00', lastOperationId: 'op_dyn_water_11_checkin', sequence: 12 }),
    makeDailyState(openid, { stateId: 'state_dyn_water_12', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-12', status: 'checked', checkedAt: '06:30:00', lastOperationId: 'op_dyn_water_12_checkin', sequence: 13 }),
    makeDailyState(openid, { stateId: 'state_dyn_water_13', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-13', status: 'checked', checkedAt: '06:30:00', lastOperationId: 'op_dyn_water_13_checkin', sequence: 14 })
  ];

  const habits = Object.values(HABITS).map(habit => makeHabitInfo(openid, habit));

  return {
    name: SCENARIO_EXPECTED.name,
    startDate: START_DATE,
    endDate: END_DATE,
    userHabits,
    policyVersions,
    operations,
    dailyStates,
    habits,
    expected: SCENARIO_EXPECTED
  };
}

module.exports = {
  createDynamicThreeDayScenario,
  DYNAMIC_THREE_DAY_EXPECTED: SCENARIO_EXPECTED,
  HABITS
};
