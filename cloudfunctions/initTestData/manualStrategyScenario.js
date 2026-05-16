const START_DATE = '2026-04-01';
const END_DATE = '2026-04-15';

const HABITS = {
  '1': { habitId: '1', name: '金刚功', category: '运动类', targetMinutes: 15, themeClass: 't-red' },
  '2': { habitId: '2', name: '站桩', category: '运动类', targetMinutes: 20, themeClass: 't-green' },
  '3': { habitId: '3', name: '八段锦', category: '运动类', targetMinutes: 15, themeClass: 't-yellow' },
  '5': { habitId: '5', name: '太极拳', category: '运动类', targetMinutes: 30, themeClass: 't-green' },
  '11': { habitId: '11', name: '跳绳', category: '运动类', targetMinutes: 15, themeClass: 't-green' },
  '12': { habitId: '12', name: '艾灸', category: '理疗类', targetMinutes: 30, themeClass: 't-red' },
  '13': { habitId: '13', name: '刮痧', category: '理疗类', targetMinutes: 20, themeClass: 't-purple' },
  '15': { habitId: '15', name: '推拿', category: '理疗类', targetMinutes: 30, themeClass: 't-red' },
  '17': { habitId: '17', name: '晨起温水', category: '起居类', targetMinutes: 5, themeClass: 't-blue' },
  '19': { habitId: '19', name: '叩齿', category: '起居类', targetMinutes: 5, themeClass: 't-yellow' },
  '20': { habitId: '20', name: '揉腹', category: '起居类', targetMinutes: 10, themeClass: 't-yellow' },
  '21': { habitId: '21', name: '睡前泡脚', category: '起居类', targetMinutes: 20, themeClass: 't-blue' }
};

const MANUAL_SCENARIO_EXPECTED = {
  name: '连续日期策略人工测试场景',
  startDate: START_DATE,
  endDate: END_DATE,
  dailyRows: [
    {       date: '2026-04-01',       weekday: '周三',       offset: -42,       dueCount: 8,       doneCount: 8,       habits: ['金刚功', '晨起温水', '艾灸', '八段锦', '揉腹', '跳绳', '睡前泡脚', '推拿'] },
    {       date: '2026-04-02',       weekday: '周四',       offset: -41,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '刮痧', '睡前泡脚', '站桩'] },
    {       date: '2026-04-03',       weekday: '周五',       offset: -40,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '艾灸', '揉腹', '睡前泡脚'] },
    {       date: '2026-04-04',       weekday: '周六',       offset: -39,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '刮痧', '八段锦', '睡前泡脚'] },
    {       date: '2026-04-05',       weekday: '周日',       offset: -38,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '揉腹', '跳绳', '睡前泡脚'] },
    {       date: '2026-04-06',       weekday: '周一',       offset: -37,       dueCount: 4,       doneCount: 4,       habits: ['金刚功', '晨起温水', '艾灸', '站桩'] },
    {       date: '2026-04-07',       weekday: '周二',       offset: -36,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '刮痧', '八段锦', '揉腹'] },
    {       date: '2026-04-08',       weekday: '周三',       offset: -35,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '艾灸', '站桩', '推拿'] },
    {       date: '2026-04-09',       weekday: '周四',       offset: -34,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '刮痧', '揉腹', '跳绳'] },
    {       date: '2026-04-10',       weekday: '周五',       offset: -33,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '艾灸', '八段锦', '睡前泡脚'] },
    {       date: '2026-04-11',       weekday: '周六',       offset: -32,       dueCount: 6,       doneCount: 6,       habits: ['金刚功', '晨起温水', '刮痧', '揉腹', '太极拳', '推拿'] },
    {       date: '2026-04-12',       weekday: '周日',       offset: -31,       dueCount: 7,       doneCount: 7,       habits: ['金刚功', '晨起温水', '睡前泡脚', '站桩', '叩齿', '太极拳', '推拿'] },
    {       date: '2026-04-13',       weekday: '周一',       offset: -30,       dueCount: 8,       doneCount: 8,       habits: ['金刚功', '晨起温水', '艾灸', '八段锦', '揉腹', '跳绳', '太极拳', '推拿'] },
    {       date: '2026-04-14',       weekday: '周二',       offset: -29,       dueCount: 5,       doneCount: 5,       habits: ['金刚功', '晨起温水', '刮痧', '太极拳', '推拿'] },
    {       date: '2026-04-15',       weekday: '周三',       offset: -28,       dueCount: 6,       doneCount: 6,       habits: ['金刚功', '晨起温水', '艾灸', '揉腹', '太极拳', '推拿'] }
  ],
  periods: [
    {       label: '4月1日至4月7日',       startDate: '2026-04-01',       endDate: '2026-04-07',       dueCount: 37,       doneCount: 37,       checkinRate: 100 },
    {       label: '4月8日至4月15日',       startDate: '2026-04-08',       endDate: '2026-04-15',       dueCount: 47,       doneCount: 47,       checkinRate: 100 },
    {       label: '第一周',       startDate: '2026-04-01',       endDate: '2026-04-07',       dueCount: 37,       doneCount: 37,       checkinRate: 100 },
    {       label: '第二周',       startDate: '2026-04-08',       endDate: '2026-04-14',       dueCount: 41,       doneCount: 41,       checkinRate: 100 },
    {       label: '全场景累计',       startDate: '2026-04-01',       endDate: '2026-04-15',       dueCount: 84,       doneCount: 84,       checkinRate: 100 }
  ],
  habitRows: [
    {       name: '金刚功',       dueDates: ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15'],       dueCount: 15 },
    {       name: '晨起温水',       dueDates: ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15'],       dueCount: 15 },
    {       name: '艾灸',       dueDates: ['2026-04-01', '2026-04-03', '2026-04-06', '2026-04-08', '2026-04-10', '2026-04-13', '2026-04-15'],       dueCount: 7 },
    {       name: '刮痧',       dueDates: ['2026-04-02', '2026-04-04', '2026-04-07', '2026-04-09', '2026-04-11', '2026-04-14'],       dueCount: 6 },
    {       name: '八段锦',       dueDates: ['2026-04-01', '2026-04-04', '2026-04-07', '2026-04-10', '2026-04-13'],       dueCount: 5 },
    {       name: '揉腹',       dueDates: ['2026-04-01', '2026-04-03', '2026-04-05', '2026-04-07', '2026-04-09', '2026-04-11', '2026-04-13', '2026-04-15'],       dueCount: 8 },
    {       name: '跳绳',       dueDates: ['2026-04-01', '2026-04-05', '2026-04-09', '2026-04-13'],       dueCount: 4 },
    {       name: '睡前泡脚',       dueDates: ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-10', '2026-04-12'],       dueCount: 7 },
    {       name: '站桩',       dueDates: ['2026-04-02', '2026-04-06', '2026-04-08', '2026-04-12'],       dueCount: 4 },
    {       name: '叩齿',       dueDates: ['2026-04-12'],       dueCount: 1 },
    {       name: '太极拳',       dueDates: ['2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15'],       dueCount: 5 },
    {       name: '推拿',       dueDates: ['2026-04-01', '2026-04-08', '2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15'],       dueCount: 7 }
  ]
};

function makeDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function makeStrategy(openid, habitId, freqType, freqRules, freqCategory, planStartDate) {
  const habit = HABITS[habitId];
  return {
    _openid: openid,
    habit_id: habitId,
    habit_title: habit.name,
    category: habit.category,
    duration: habit.targetMinutes,
    freq_type: freqType,
    freq_rules: freqRules,
    freq_category: freqCategory,
    plan_start_date: planStartDate,
    created_at: makeDate(planStartDate),
    updated_at: makeDate(planStartDate)
  };
}

function makeVersion(openid, habitId, freqType, freqRules, freqCategory, planStartDate, startDate, endDate, extra = {}) {
  return {
    _openid: openid,
    habit_id: habitId,
    freq_type: freqType,
    freq_rules: freqRules,
    freq_category: freqCategory,
    plan_start_date: planStartDate,
    start_date: startDate,
    end_date: endDate,
    created_at: makeDate(startDate),
    ...extra
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

function makeCheckinLog(openid, habitId, date) {
  return {
    _openid: openid,
    habit_id: habitId,
    checkin_date: date,
    created_at: makeDate(date),
    created_at_str: date
  };
}

function getHabitIdByName(name) {
  const entry = Object.values(HABITS).find(habit => habit.name === name);
  return entry ? entry.habitId : null;
}

function buildStrategies(openid) {
  return [
    makeStrategy(openid, '1', 'daily', 1, 'everyday', '2026-04-01'),
    makeStrategy(openid, '17', 'daily', 1, 'everyday', '2026-04-01'),
    makeStrategy(openid, '12', 'weekly', [1, 3, 5], 'weekly', '2026-04-01'),
    makeStrategy(openid, '13', 'weekly', [2, 4, 6], 'weekly', '2026-04-01'),
    makeStrategy(openid, '3', 'interval', 2, 'daily-interval', '2026-04-01'),
    makeStrategy(openid, '20', 'interval', 1, 'daily-interval', '2026-04-01'),
    makeStrategy(openid, '11', 'interval', 3, 'daily-interval', '2026-04-01'),
    makeStrategy(openid, '21', 'weekly', [5, 7], 'weekly', '2026-04-05'),
    makeStrategy(openid, '2', 'interval', 3, 'daily-interval', '2026-04-08'),
    makeStrategy(openid, '19', 'weekly', [7], 'weekly', '2026-04-07'),
    makeStrategy(openid, '5', 'daily', 1, 'everyday', '2026-04-11'),
    makeStrategy(openid, '15', 'daily', 1, 'everyday', '2026-04-11')
  ];
}

function buildStrategyVersions(openid) {
  return [
    makeVersion(openid, '21', 'daily', 1, 'everyday', '2026-04-01', '2026-04-01', '2026-04-05'),
    makeVersion(openid, '21', 'weekly', [5, 7], 'weekly', '2026-04-05', '2026-04-05', null),
    makeVersion(openid, '2', 'weekly', [1, 4], 'weekly', '2026-04-01', '2026-04-01', '2026-04-08'),
    makeVersion(openid, '2', 'interval', 3, 'daily-interval', '2026-04-08', '2026-04-08', null),
    makeVersion(openid, '15', 'weekly', [3], 'weekly', '2026-04-01', '2026-04-01', '2026-04-10'),
    makeVersion(openid, '15', 'daily', 1, 'everyday', '2026-04-10', '2026-04-10', '2026-04-11', {
      deleted: true,
      type: 'deleted'
    }),
    makeVersion(openid, '15', 'daily', 1, 'everyday', '2026-04-11', '2026-04-11', null)
  ];
}

function buildCheckinLogs(openid) {
  const logs = [];
  MANUAL_SCENARIO_EXPECTED.dailyRows.forEach(row => {
    row.habits.forEach(name => {
      const habitId = getHabitIdByName(name);
      logs.push(makeCheckinLog(openid, habitId, row.date));
    });
  });
  return logs;
}

function buildLocalData(strategies, strategyVersions, logs, habits) {
  const versionsByHabitId = strategyVersions.reduce((map, version) => {
    if (!map[version.habit_id]) {
      map[version.habit_id] = [];
    }
    map[version.habit_id].push(version);
    return map;
  }, {});

  const MyHabits = strategies.map(strategy => ({
    habitId: String(strategy.habit_id),
    name: strategy.habit_title,
    category: strategy.category,
    targetMinutes: strategy.duration,
    themeClass: HABITS[strategy.habit_id].themeClass,
    freq_type: strategy.freq_type,
    freq_rules: strategy.freq_rules,
    freq_category: strategy.freq_category,
    createdAt: strategy.plan_start_date,
    plan_start_date: strategy.plan_start_date,
    strategyVersions: versionsByHabitId[strategy.habit_id] || []
  }));

  const CheckinLogs = logs.map((log, index) => ({
    logId: `manual_${index + 1}`,
    habitId: String(log.habit_id),
    date: log.checkin_date,
    timestamp: new Date(log.checkin_date).getTime(),
    sync_status: 1
  }));

  const AllHabitsInfo = {};
  habits.forEach(habit => {
    AllHabitsInfo[habit.habit_id] = {
      habitId: habit.habit_id,
      name: habit.name,
      category: habit.category,
      targetMinutes: habit.target_minutes,
      themeClass: habit.theme_class
    };
  });

  return {
    MyHabits,
    CheckinLogs,
    AllHabitsInfo,
    allHabitIds: [...new Set(logs.map(log => String(log.habit_id)))]
  };
}

function createManualStrategyScenario(openid = 'manual_strategy_openid') {
  const strategies = buildStrategies(openid);
  const strategyVersions = buildStrategyVersions(openid);
  const logs = buildCheckinLogs(openid);
  const habits = Object.values(HABITS).map(habit => makeHabitInfo(openid, habit));

  return {
    name: MANUAL_SCENARIO_EXPECTED.name,
    strategies,
    strategyVersions,
    logs,
    habits,
    expected: MANUAL_SCENARIO_EXPECTED,
    local: buildLocalData(strategies, strategyVersions, logs, habits)
  };
}

module.exports = {
  createManualStrategyScenario,
  MANUAL_SCENARIO_EXPECTED,
  HABITS
};
