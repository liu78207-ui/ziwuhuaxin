function loadStatsPage({ habits = [], logs = [], allHabitsInfo = {} } = {}) {
  jest.resetModules();

  const app = {
    globalData: {
      MyHabits: habits,
      CheckinLogs: logs,
      DEBUG_DAY_OFFSET: 0
    },
    getAllHabits: jest.fn(() => app.globalData.MyHabits)
  };

  let page;
  global.getApp = jest.fn(() => app);
  global.wx = {
    getStorageSync: jest.fn(key => {
      if (key === 'MyHabits') return app.globalData.MyHabits;
      if (key === 'CheckinLogs') return app.globalData.CheckinLogs;
      if (key === 'AllHabitsInfo') return allHabitsInfo;
      return undefined;
    }),
    nextTick: jest.fn(callback => callback()),
    showShareMenu: jest.fn(),
    navigateBack: jest.fn(),
    switchTab: jest.fn()
  };
  global.Page = jest.fn(config => {
    page = {
      ...config,
      data: JSON.parse(JSON.stringify(config.data)),
      setData(update, callback) {
        Object.assign(this.data, update);
        if (typeof callback === 'function') callback();
      },
      getTabBar: jest.fn(() => ({ setData: jest.fn() }))
    };
    Object.keys(config).forEach(key => {
      if (typeof config[key] === 'function') {
        page[key] = config[key].bind(page);
      }
    });
  });

  require('../../../miniprogram/pages/stats/stats.js');
  return { page, app };
}

const fs = require('fs');
const path = require('path');

async function loadAndExpectMay16Color(page, habits, habitId) {
  await page.loadWeekData(habits);
  const weekHabit = page.data.habitMatrix.find(item => item.habitId === habitId);
  expect(weekHabit.days[5].status).toBe('checked');
  expect(weekHabit.days[5].themeClass).toBe(weekHabit.themeClass);

  page.data.currentMonth = 4;
  page.data.currentYear = 2026;
  await page.loadMonthData(habits);
  const monthHabit = page.data.monthHabits.find(item => item.habitId === habitId);
  const monthDay = monthHabit.days.find(day => day.date === 16);
  expect(monthDay.status).toBe('checked');
  expect(monthDay.done).toBe(true);
  expect(monthDay.themeClass).toBe(monthHabit.themeClass);

  await page.loadYearData(habits);
  const yearHabit = page.data.yearHabits.find(item => item.habitId === habitId);
  const janFirst = new Date(2026, 0, 1);
  const leadingEmptyCells = janFirst.getDay() === 0 ? 6 : janFirst.getDay() - 1;
  const may16DayOfYearIndex = Math.floor((new Date(2026, 4, 16) - janFirst) / (24 * 60 * 60 * 1000));
  expect(yearHabit.heatmap[leadingEmptyCells + may16DayOfYearIndex].level).toBe('level-1');
  expect(yearHabit.heatmap[leadingEmptyCells + may16DayOfYearIndex].themeClass).toBe(yearHabit.themeClass);
}

const VALID_REPORT_THEMES = ['t-red', 't-green', 't-yellow', 't-blue', 't-purple'];

function expectValidReportTheme(themeClass) {
  expect(VALID_REPORT_THEMES).toContain(themeClass);
}

describe('stats page real report links', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  test('week report keeps deleted habit row when it only has historical checkins', async () => {
    const { page } = loadStatsPage();
    page.data.currentWeekStart = new Date(2026, 4, 11).getTime();
    page.buildPeriodReport = jest.fn(() => ({
      habitReports: [
        {
          habitId: 'deleted-1',
          habit: {
            habitId: 'deleted-1',
            name: 'Deleted habit',
            isDeleted: true,
            deletedAt: '2026-05-13'
          },
          days: [
            { date: '2026-05-11', status: 'inactive', checked: false },
            { date: '2026-05-12', status: 'inactive', checked: false },
            { date: '2026-05-13', status: 'checked', checked: true, isChecked: true, countsAsDone: true },
            { date: '2026-05-14', status: 'deleted', checked: false },
            { date: '2026-05-15', status: 'deleted', checked: false },
            { date: '2026-05-16', status: 'deleted', checked: false },
            { date: '2026-05-17', status: 'future', checked: false }
          ],
          dueCount: 0,
          doneCount: 1
        }
      ],
      stats: { checkinRate: 0, totalCount: 1, checkinDays: 1, maxStreak: 1 }
    }));

    await page.loadWeekData([]);

    expect(page.data.habitMatrix).toHaveLength(1);
    expect(page.data.habitMatrix[0].days[2].status).toBe('checked');
  });

  test('mergeWithDeletedHabits supports cloud habit_id and checkin_date logs', () => {
    const { page } = loadStatsPage({
      habits: [],
      logs: [{ habit_id: 'cloud-1', checkin_date: '2026-05-13', sync_status: 1 }],
      allHabitsInfo: {
        'cloud-1': {
          habitId: 'cloud-1',
          name: 'Baduanjin',
          category: 'sports',
          freq_type: 'daily',
          freq_rules: 1,
          freq_category: 'everyday',
          plan_start_date: '2026-05-01',
          deletedAt: '2026-05-13'
        }
      }
    });

    const merged = page.mergeWithDeletedHabits([]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(expect.objectContaining({
      habitId: 'cloud-1',
      name: 'Baduanjin',
      isDeleted: true,
      plan_start_date: '2026-05-01'
    }));
  });

  test('week month and year reports keep deleted habit colors from real logs', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const habit = {
      habitId: '16',
      name: 'Jingluo',
      category: 'therapy',
      targetMinutes: 15,
      themeClass: 't-purple',
      freq_type: 'weekly',
      freq_rules: [1],
      freq_category: 'weekly',
      plan_start_date: '2026-05-01',
      isDeleted: true,
      deletedAt: '2026-05-20T09:00:00.000Z'
    };
    const logs = [{ habitId: '16', date: '2026-05-16', sync_status: 1 }];
    const { page } = loadStatsPage({ habits: [habit], logs });
    page.onLoad();

    await loadAndExpectMay16Color(page, [habit], '16');
  });

  test('week month and year reports support cloud log fields for deleted habits', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const allHabitsInfo = {
      '16': {
        habitId: '16',
        name: 'Jingluo',
        category: 'therapy',
        targetMinutes: 15,
        themeClass: 't-purple',
        freq_type: 'weekly',
        freq_rules: [1],
        freq_category: 'weekly',
        plan_start_date: '2026-05-01',
        deletedAt: '2026-05-20T09:00:00.000Z'
      }
    };
    const logs = [{ habit_id: '16', checkin_date: '2026-05-16', sync_status: 1 }];
    const { page } = loadStatsPage({ habits: [], logs, allHabitsInfo });
    page.onLoad();
    const mergedHabits = page.mergeWithDeletedHabits([]);

    await loadAndExpectMay16Color(page, mergedHabits, '16');
  });

  test('deleted then re-added active habit keeps colors from real cloud logs', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const habit = {
      habitId: '16',
      name: 'Jingluo',
      category: 'therapy',
      targetMinutes: 15,
      themeClass: 't-purple',
      freq_type: 'weekly',
      freq_rules: [1],
      freq_category: 'weekly',
      plan_start_date: '2026-05-01',
      isDeleted: false,
      deletedAt: null,
      restoredAt: '2026-05-16T10:00:00.000Z'
    };
    const logs = [{ habit_id: '16', checkin_date: '2026-05-16', sync_status: 1 }];
    const { page } = loadStatsPage({ habits: [habit], logs });
    page.onLoad();

    await loadAndExpectMay16Color(page, [habit], '16');
  });

  test('therapy and daily-life deleted habits keep week month year colors from real logs', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const deletedHabits = [
      { habitId: 'therapy-jingluo', name: 'Jingluo', category: 'therapy', themeClass: 't-purple' },
      { habitId: 'therapy-aijiu', name: 'Aijiu', category: 'therapy', themeClass: 't-red' },
      { habitId: 'therapy-baguan', name: 'Baguan', category: 'therapy', themeClass: 't-blue' },
      { habitId: 'therapy-guasha', name: 'Guasha', category: 'therapy', themeClass: 't-green' },
      { habitId: 'life-paijiao', name: 'Foot bath', category: 'life', themeClass: 't-red' },
      { habitId: 'life-shutou', name: 'Shutou', category: 'life', themeClass: 't-yellow' },
      { habitId: 'life-roufu', name: 'Roufu', category: 'life', themeClass: 't-green' },
      { habitId: 'life-kouchi', name: 'Kouchi', category: 'life', themeClass: 't-purple' }
    ].map(habit => ({
      ...habit,
      targetMinutes: 15,
      freq_type: 'weekly',
      freq_rules: [1],
      freq_category: 'weekly',
      plan_start_date: '2026-05-01',
      isDeleted: true,
      deletedAt: '2026-05-16T09:00:00.000Z'
    }));
    const logs = deletedHabits.map(habit => ({
      habit_id: habit.habitId,
      checkin_date: '2026-05-16',
      sync_status: 1
    }));
    const { page } = loadStatsPage({ habits: deletedHabits, logs });
    page.onLoad();

    for (const habit of deletedHabits) {
      await loadAndExpectMay16Color(page, deletedHabits, habit.habitId);
    }
  });

  test('catalog habits with strategy habit_id match report logs after deletion', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const catalogHabit = {
      _id: 'catalog-16',
      title: 'Jingluo',
      name: 'Jingluo',
      category: 'therapy',
      targetMinutes: 15,
      themeClass: 't-purple',
      strategy: { habit_id: 'strategy-16' },
      freq_type: 'weekly',
      freq_rules: [1],
      freq_category: 'weekly',
      plan_start_date: '2026-05-01',
      isDeleted: true,
      deletedAt: '2026-05-16T09:00:00.000Z'
    };
    const logs = [{ habit_id: 'strategy-16', checkin_date: '2026-05-16', sync_status: 1 }];
    const { page } = loadStatsPage({ habits: [catalogHabit], logs });
    page.onLoad();

    await loadAndExpectMay16Color(page, [catalogHabit], 'strategy-16');
  });

  test('known catalog habits use habit-specific themes even when stored as default blue', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const habits = [
      { habitId: '1', name: '金刚功', category: '运动类', themeClass: 't-blue', expectedTheme: 't-red' },
      { habitId: '3', name: '八段锦', category: '运动类', themeClass: 't-blue', expectedTheme: 't-yellow' },
      { habitId: '12', name: '艾灸', category: '理疗类', themeClass: 't-blue', expectedTheme: 't-red' },
      { habitId: '14', name: '拔罐', category: '理疗类', themeClass: 't-blue', expectedTheme: 't-blue' },
      { habitId: '17', name: '晨起温水', category: '起居类', themeClass: 't-blue', expectedTheme: 't-blue' }
    ].map(habit => ({
      ...habit,
      targetMinutes: 15,
      freq_type: 'daily',
      freq_rules: 1,
      freq_category: 'everyday',
      plan_start_date: '2026-05-01'
    }));
    const logs = habits.map(habit => ({
      habit_id: habit.habitId,
      checkin_date: '2026-05-16',
      sync_status: 1
    }));
    const { page } = loadStatsPage({ habits, logs });
    page.onLoad();

    await page.loadWeekData(habits);

    habits.forEach(habit => {
      const row = page.data.habitMatrix.find(item => item.habitId === habit.habitId);
      expect(row.themeClass).toBe(habit.expectedTheme);
      expect(row.days[5].status).toBe('checked');
      expect(row.days[5].themeClass).toBe(habit.expectedTheme);
    });

    page.data.currentMonth = 4;
    page.data.currentYear = 2026;
    await page.loadMonthData(habits);
    habits.forEach(habit => {
      const card = page.data.monthHabits.find(item => item.habitId === habit.habitId);
      const day = card.days.find(item => item.date === 16);
      expect(card.themeClass).toBe(habit.expectedTheme);
      expect(day.status).toBe('checked');
      expect(day.themeClass).toBe(habit.expectedTheme);
    });

    await page.loadYearData(habits);
    const janFirst = new Date(2026, 0, 1);
    const leadingEmptyCells = janFirst.getDay() === 0 ? 6 : janFirst.getDay() - 1;
    const may16DayOfYearIndex = Math.floor((new Date(2026, 4, 16) - janFirst) / (24 * 60 * 60 * 1000));
    habits.forEach(habit => {
      const card = page.data.yearHabits.find(item => item.habitId === habit.habitId);
      const day = card.heatmap[leadingEmptyCells + may16DayOfYearIndex];
      expect(card.themeClass).toBe(habit.expectedTheme);
      expect(day.level).toBe('level-1');
      expect(day.themeClass).toBe(habit.expectedTheme);
    });
  });

  test('deleted checked habits normalize stale theme classes even when iconUrl exists', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));
    const deletedHabits = [
      {
        habitId: 'stale-jade',
        name: 'Unknown life habit',
        category: 'life',
        themeClass: 'theme-jade',
        iconUrl: '/assets/icons/custom-life.png'
      },
      {
        habitId: 'stale-orange',
        name: 'Unknown therapy habit',
        category: 'therapy',
        themeClass: 'theme-orange',
        iconUrl: '/assets/icons/custom-therapy.png'
      },
      {
        habitId: 'empty-theme',
        name: 'Unknown habit',
        category: 'unknown',
        themeClass: '',
        iconUrl: '/assets/icons/custom-unknown.png'
      }
    ].map(habit => ({
      ...habit,
      targetMinutes: 15,
      freq_type: 'daily',
      freq_rules: 1,
      freq_category: 'everyday',
      plan_start_date: '2026-05-01',
      isDeleted: true,
      deletedAt: '2026-05-16T09:00:00.000Z'
    }));
    const logs = deletedHabits.map(habit => ({
      habit_id: habit.habitId,
      checkin_date: '2026-05-16',
      sync_status: 1
    }));
    const { page } = loadStatsPage({ habits: deletedHabits, logs });
    page.onLoad();

    await page.loadWeekData(deletedHabits);

    const weekRows = page.data.habitMatrix;
    weekRows.forEach(row => {
      expect(row.days[5].status).toBe('checked');
      expectValidReportTheme(row.themeClass);
    });
    expect(weekRows.find(row => row.habitId === 'stale-jade').themeClass).toBe('t-yellow');
    expect(weekRows.find(row => row.habitId === 'stale-orange').themeClass).toBe('t-red');
    expect(weekRows.find(row => row.habitId === 'empty-theme').themeClass).toBe('t-blue');

    page.data.currentMonth = 4;
    page.data.currentYear = 2026;
    await page.loadMonthData(deletedHabits);
    page.data.monthHabits.forEach(card => {
      expect(card.days.find(day => day.date === 16).status).toBe('checked');
      expectValidReportTheme(card.themeClass);
    });

    await page.loadYearData(deletedHabits);
    page.data.yearHabits.forEach(card => {
      expect(card.heatmap.some(day => day.level === 'level-1')).toBe(true);
      expectValidReportTheme(card.themeClass);
    });
  });

  test('deleted habit styles do not override checked cells to gray', () => {
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/stats/stats.wxss'),
      'utf8'
    );

    expect(wxss).not.toMatch(/\.wt-dot\.deleted\.checked\s*\{[^}]*background:\s*#F4F6F8/s);
    expect(wxss).not.toMatch(/\.wt-row\.is-deleted\s+\.wt-dot\.checked\s*\{[^}]*background:\s*#E8E8E8/s);
  });

  test('checked report styles have theme color fallbacks', () => {
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/stats/stats.wxss'),
      'utf8'
    );

    expect(wxss).toMatch(/\.wt-dot\.checked\s*\{[^}]*background:\s*var\(--theme-color,\s*var\(--c-primary\)\)/s);
    expect(wxss).toMatch(/\.mc-cell\.checked\s*\{[^}]*background:\s*var\(--theme-color,\s*var\(--c-primary\)\)/s);
    expect(wxss).toMatch(/\.mc-cell\.done\s*\{[^}]*background:\s*var\(--theme-color,\s*var\(--c-primary\)\)/s);
    expect(wxss).toMatch(/\.yh-dot\.level-1\s*\{[^}]*background:\s*var\(--theme-color,\s*var\(--c-primary\)\)/s);
  });

  test('report cells bind each habit theme class directly', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/stats/stats.wxml'),
      'utf8'
    );

    expect(wxml).toContain('wt-dot {{day.status}} {{day.themeClass}}');
    expect(wxml).toContain('mc-cell {{day.empty ? \'empty\' : \'\'}} {{day.status}} {{day.done ? \'done\' : \'\'}} {{day.themeClass}}');
    expect(wxml).toContain('yh-dot {{dot.level}} {{dot.themeClass}}');
  });
});
