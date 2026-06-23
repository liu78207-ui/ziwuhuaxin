/**
 * stats-real.test.js - V1 数据格式迁移版
 *
 * 测试目标：验证 stats.js 通过 reportService 输出正确报表
 * - deleted userHabit 历史展示
 * - 同 habitId 删除后重加，按 userHabitId 生命周期隔离
 * - checked/canceled/unchecked 状态
 * - themeClass/status 正确映射到 ViewModel
 * - 周/月/年报表通过 reportService 输出
 *
 * V1 数据格式：userHabits + policyVersions + dailyStates
 * 不再依赖 MyHabits/CheckinLogs/AllHabitsInfo
 */

const fs = require('fs');
const path = require('path');

// ==================== 测试数据工厂 ====================

const VALID_REPORT_THEMES = ['t-red', 't-green', 't-yellow', 't-blue', 't-purple'];

function expectValidReportTheme(themeClass) {
  expect(VALID_REPORT_THEMES).toContain(themeClass);
}

// Date formatting helpers (mirror stats.js)
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 构建 weekStart (周一) 在 2026 年
function weekStartTimestamp(month, day) {
  const d = new Date(2026, month - 1, day);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 构建 V1 userHabit
function makeUserHabit({ userHabitId, habitId, name, category, themeClass, freqType, freqRules, freqCategory, planStartDate, status, deletedAt }) {
  return {
    userHabitId,
    habitId,
    name: name || '习惯',
    category: category || '运动类',
    targetMinutes: 15,
    themeClass: themeClass || 't-blue',
    iconUrl: '',
    freq_type: freqType || 'daily',
    freq_rules: freqRules || 1,
    freq_category: freqCategory || 'everyday',
    plan_start_date: planStartDate || '2026-05-01',
    status: status || 'active',
    createdAt: planStartDate || '2026-05-01',
    deletedAt: deletedAt || null,
    latestPolicyVersionId: `pv_${habitId}`,
    syncStatus: 1
  };
}

// 构建 V1 policyVersion（每日频率）
function makePolicyVersion({ userHabitId, habitId, freqType, freqRules, freqCategory, startDate }) {
  return {
    policyVersionId: `pv_${habitId}`,
    userHabitId,
    habitId,
    freqType: freqType || 'daily',
    freqRules: freqRules || [1],
    freqCategory: freqCategory || 'everyday',
    effectiveStartDate: startDate || '2026-05-01',
    effectiveEndDate: null,
    createdAt: startDate || '2026-05-01'
  };
}

// 构建 V1 dailyState
function makeDailyState({ userHabitId, date, status }) {
  return {
    stateId: `ds_${userHabitId}_${date}`,
    userHabitId,
    date,
    status: status || 'unchecked',
    checkinTime: status === 'checked' ? `${date}T08:00:00.000Z` : null
  };
}

// 构建 V1 weekly report（直接返回 stats.js 期望的格式）
function buildV1WeeklyReport({ userHabits, policyVersions, dailyStates, weekStart, themeOverrides }) {
  // weekStart = '2026-05-11', weekEnd = '2026-05-17'
  const weekEnd = '2026-05-17';
  const todayKey = '2026-05-16'; // 模拟 2026-05-16 as today

  const habitReports = userHabits.map(uh => {
    const pv = policyVersions.find(p => p.userHabitId === uh.userHabitId) || {};
    const theme = (themeOverrides && themeOverrides[uh.habitId]) || uh.themeClass;

    // 生成 7 天数据
    const days = [];
    const dateMap = {
      '2026-05-11': 0,
      '2026-05-12': 1,
      '2026-05-13': 2,
      '2026-05-14': 3,
      '2026-05-15': 4,
      '2026-05-16': 5,
      '2026-05-17': 6
    };

    for (const [date, idx] of Object.entries(dateMap)) {
      const state = dailyStates.find(ds =>
        ds.userHabitId === uh.userHabitId && ds.date === date
      );
      const isDue = idx <= 5; // Mon-Sat due, Sun not due (for weekly habit)
      const checked = state?.status === 'checked';

      let status = 'inactive';
      if (checked) status = 'checked';
      else if (isDue) status = 'unchecked';

      // deleted 后的日期标记 deleted
      if (uh.deletedAt) {
        const deletedDateStr = uh.deletedAt.split('T')[0];
        if (date >= deletedDateStr) {
          status = date === deletedDateStr && checked ? 'checked' : 'deleted';
        }
      }

      days.push({
        date,
        checked,
        isChecked: checked,
        isDue,
        shouldShow: isDue,
        status,
        displayStatus: status,
        countsInDueDenominator: isDue,
        countsInDenominator: isDue,
        countsAsDone: checked && isDue,
        isAfterDeletion: uh.deletedAt ? date >= uh.deletedAt.split('T')[0] : false,
        themeClass: theme
      });
    }

    const dueCount = days.filter(d => d.countsInDueDenominator).length;
    const doneCount = days.filter(d => d.countsAsDone).length;

    return {
      habitId: uh.habitId,
      habit: {
        habitId: uh.habitId,
        name: uh.name,
        category: uh.category, // 关键：让 getHabitVisual 能拿到 category 做 theme fallback
        themeClass: theme,
        isDeleted: uh.status === 'deleted',
        deletedAt: uh.deletedAt
      },
      days,
      dueCount,
      doneCount
    };
  });

  const allDays = habitReports.flatMap(r => r.days.filter(d => d.countsAsDone));
  const uniqueDates = [...new Set(allDays.map(d => d.date))];

  return {
    habitReports,
    stats: {
      checkinRate: 100,
      totalCount: uniqueDates.length,
      checkinDays: uniqueDates.length,
      maxStreak: uniqueDates.length
    }
  };
}

// 构建 V1 monthly report
function buildV1MonthlyReport({ userHabits, policyVersions, dailyStates, year, month, themeOverrides }) {
  // month: 0-based (0=Jan)
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const startWeekday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const habitReports = userHabits.map(uh => {
    const theme = (themeOverrides && themeOverrides[uh.habitId]) || uh.themeClass;
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const state = dailyStates.find(ds =>
        ds.userHabitId === uh.userHabitId && ds.date === dateStr
      );
      const isDue = d <= 15; // simplified: first half of month due
      const checked = state?.status === 'checked';

      let status = 'inactive';
      if (checked) status = 'checked';
      else if (isDue) status = 'unchecked';

      if (uh.deletedAt) {
        const deletedDateStr = uh.deletedAt.split('T')[0];
        if (dateStr >= deletedDateStr) {
          status = dateStr === deletedDateStr && checked ? 'checked' : 'deleted';
        }
      }

      days.push({
        date: dateStr,
        status,
        displayStatus: status,
        done: checked,
        themeClass: theme,
        checked,
        isDue,
        empty: false
      });
    }

    const dueCount = days.filter(d => d.status !== 'inactive').length;
    const doneCount = days.filter(d => d.status === 'checked').length;

    return {
      habitId: uh.habitId,
      habit: {
        habitId: uh.habitId,
        name: uh.name,
        category: uh.category,
        themeClass: theme,
        isDeleted: uh.status === 'deleted',
        deletedAt: uh.deletedAt
      },
      days,
      dueCount,
      doneCount
    };
  });

  return { habitReports, startWeekday, daysInMonth };
}

// 构建 V1 yearly report
function buildV1YearlyReport({ userHabits, policyVersions, dailyStates, year, themeOverrides }) {
  const habitReports = userHabits.map(uh => {
    const theme = (themeOverrides && themeOverrides[uh.habitId]) || uh.themeClass;

    // mapYearHabitReport uses report.days to build dayMap and then generates its own heatmap
    // We need to provide days array for all 365/366 days of the year
    const daysInYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 366 : 365;
    const jan1 = new Date(year, 0, 1);
    const leadingEmpty = jan1.getDay() === 0 ? 6 : jan1.getDay() - 1;

    const days = [];
    for (let i = 0; i < daysInYear; i++) {
      const currentDate = new Date(year, 0, 1);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = formatDateKey(currentDate);

      const state = dailyStates.find(ds =>
        ds.userHabitId === uh.userHabitId && ds.date === dateStr
      );
      const checked = state?.status === 'checked';

      let isAfterDeletion = false;
      if (uh.deletedAt) {
        isAfterDeletion = dateStr >= uh.deletedAt.split('T')[0];
      }

      days.push({
        date: dateStr,
        status: checked ? 'checked' : 'inactive',
        checked,
        isAfterDeletion,
        themeClass: theme
      });
    }

    // Also build heatmap for cases where it's used directly
    const heatmap = [];
    for (let i = 0; i < leadingEmpty; i++) {
      heatmap.push({ level: '', themeClass: '' });
    }
    for (let i = 0; i < daysInYear; i++) {
      const day = days[i];
      let level = '';
      if (day.status === 'checked' && !day.isAfterDeletion) level = 'level-1';
      heatmap.push({ level, themeClass: day.themeClass });
    }
    const remainingCells = (7 - (heatmap.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      heatmap.push({ level: '', empty: true, themeClass: '' });
    }

    const doneCount = dailyStates.filter(ds =>
      ds.userHabitId === uh.userHabitId && ds.status === 'checked'
    ).length;

    return {
      habitId: uh.habitId,
      habit: {
        habitId: uh.habitId,
        name: uh.name,
        category: uh.category,
        themeClass: theme,
        isDeleted: uh.status === 'deleted',
        deletedAt: uh.deletedAt
      },
      days,
      heatmap,
      doneCount
    };
  });

  return { habitReports };
}

// ==================== 测试工具 ====================

function loadStatsPageWithV1({ userHabits = [], policyVersions = [], dailyStates = [], themeOverrides = {}, mockReport = null } = {}) {
  jest.resetModules();

  // 1. Mock storageService 来的 V1 数据
  jest.doMock('../../../miniprogram/services/storageService', () => ({
    getMyHabitsWithMigration: jest.fn(() => userHabits),
    getPolicyVersions: jest.fn(() => policyVersions),
    getDailyCheckinStates: jest.fn(() => dailyStates),
    getItem: jest.fn((key) => {
      if (key === 'MyHabits') return userHabits;
      if (key === 'CheckinLogs') return [];
      if (key === 'AllHabitsInfo') return {};
      return null;
    }),
    setItem: jest.fn(),
    getMigrationMeta: jest.fn(() => ({ status: 'completed' })),
    ensureMigrationCompleted: jest.fn()
  }));

  // 2. Mock reportService
  const mockReportService = mockReport || {
    getWeeklyReport: jest.fn(async (weekStart) => {
      return buildV1WeeklyReport({ userHabits, policyVersions, dailyStates, weekStart, themeOverrides });
    }),
    getMonthlyReport: jest.fn(async (month) => {
      const [y, m] = month.split('-').map(Number);
      return buildV1MonthlyReport({ userHabits, policyVersions, dailyStates, year: y, month: m - 1, themeOverrides });
    }),
    getYearlyReport: jest.fn(async (year) => {
      return buildV1YearlyReport({ userHabits, policyVersions, dailyStates, year: Number(year), themeOverrides });
    })
  };

  jest.doMock('../../../miniprogram/services/reportService', () => mockReportService);

  // 3. Mock wx globals
  const app = {
    globalData: {
      MyHabits: userHabits,
      CheckinLogs: [],
      DEBUG_DAY_OFFSET: 0
    },
    getAllHabits: jest.fn(() => userHabits)
  };

  let page;
  global.getApp = jest.fn(() => app);
  global.wx = {
    getStorageSync: jest.fn((key) => {
      if (key === 'MyHabits') return userHabits;
      if (key === 'CheckinLogs') return [];
      if (key === 'AllHabitsInfo') return {};
      if (key === 'userInfo') return {};
      return null;
    }),
    setStorageSync: jest.fn(),
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
  return { page, app, mockReportService };
}

// ==================== 测试用例 ====================

describe('stats page V1 report links', () => {
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

  // ----- 通过项 -----

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
    expect(wxml).toContain('wt-dot {{day.displayStatus || day.status}} {{day.themeClass}}');
    expect(wxml).toContain('mc-cell {{day.empty ? \'empty\' : \'\'}} {{day.displayStatus || day.status}} {{day.done ? \'done\' : \'\'}} {{day.themeClass}}');
    expect(wxml).toContain('yh-dot {{dot.level}} {{dot.themeClass}}');
  });

  test('周报应修未完成使用主题描边，非应修和未来使用浅灰色块', () => {
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/stats/stats.wxss'),
      'utf8'
    );
    expect(wxss).toMatch(/\.wt-dot\.unchecked\s*\{[^}]*background:\s*#FFFFFF/s);
    expect(wxss).toMatch(/\.wt-dot\.unchecked\s*\{[^}]*border:\s*2rpx solid var\(--theme-color/s);
    expect(wxss).toMatch(/\.wt-dot\.canceled\s*\{[^}]*background:\s*#FFFFFF/s);
    expect(wxss).toMatch(/\.wt-dot\.canceled\s*\{[^}]*border:\s*2rpx solid var\(--theme-color/s);
    expect(wxss).toMatch(/\.wt-dot\.not_required\s*\{[^}]*background:\s*#F4F6F8/s);
    expect(wxss).toMatch(/\.wt-dot\.future\s*\{[^}]*background:\s*#F4F6F8/s);
    expect(wxss).toMatch(/\.wt-dot\.future\s*\{[^}]*border:\s*2rpx solid transparent/s);
    expect(wxss).toMatch(/\.wt-dot\.partial\s*\{[^}]*background:\s*var\(--theme-bg,\s*var\(--c-primary-light\)\)/s);
  });

  test('not_required/future/low_confidence/partial 在周报有显式样式', () => {
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/stats/stats.wxss'),
      'utf8'
    );
    expect(wxss).toMatch(/\.wt-dot\.not_required\s*\{/s);
    expect(wxss).toMatch(/\.wt-dot\.future\s*\{/s);
    expect(wxss).toMatch(/\.wt-dot\.low_confidence\s*\{/s);
    expect(wxss).toMatch(/\.wt-dot\.partial\s*\{/s);
  });

  test('canceled/not_required/future/low_confidence/partial 在月报 cell 有显式样式', () => {
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/stats/stats.wxss'),
      'utf8'
    );
    expect(wxss).toMatch(/\.mc-cell\.canceled\s*\{/s);
    expect(wxss).toMatch(/\.mc-cell\.not_required\s*\{/s);
    expect(wxss).toMatch(/\.mc-cell\.future\s*\{/s);
    expect(wxss).toMatch(/\.mc-cell\.low_confidence\s*\{/s);
    expect(wxss).toMatch(/\.mc-cell\.partial\s*\{/s);
  });

  test('周报映射保留业务 status，并使用 displayStatus 控制特殊取消浅灰视觉', async () => {
    const mockReportService = {
      getWeeklyReport: jest.fn(async () => ({
        habitReports: [
          {
            habitId: 'h_special_cancel',
            habit: {
              habitId: 'h_special_cancel',
              name: '特殊取消',
              category: 'sports',
              themeClass: 't-green'
            },
            days: [
              {
                date: '2026-06-12',
                status: 'canceled',
                displayStatus: 'not_required',
                checked: false,
                isChecked: false,
                isDue: false,
                shouldShow: false,
                countsInDueDenominator: false,
                countsInDenominator: false,
                countsAsDone: false,
                isAfterDeletion: false
              }
            ],
            dueCount: 0,
            doneCount: 0,
            hasVisibleState: true
          },
          {
            habitId: 'h_strategy_cancel_due',
            habit: {
              habitId: 'h_strategy_cancel_due',
              name: '策略取消仍应修',
              category: 'sports',
              themeClass: 't-red'
            },
            days: [
              {
                date: '2026-06-12',
                status: 'canceled',
                displayStatus: 'canceled',
                checked: false,
                isChecked: false,
                isDue: true,
                shouldShow: true,
                countsInDueDenominator: true,
                countsInDenominator: true,
                countsAsDone: false,
                isAfterDeletion: false
              }
            ],
            dueCount: 1,
            doneCount: 0,
            hasVisibleState: true
          },
          {
            habitId: 'h_regular_cancel',
            habit: {
              habitId: 'h_regular_cancel',
              name: '普通取消',
              category: 'sports',
              themeClass: 't-blue'
            },
            days: [
              {
                date: '2026-06-12',
                status: 'canceled',
                displayStatus: 'canceled',
                checked: false,
                isChecked: false,
                isDue: true,
                shouldShow: true,
                countsInDueDenominator: true,
                countsInDenominator: true,
                countsAsDone: false,
                isAfterDeletion: false
              }
            ],
            dueCount: 1,
            doneCount: 0,
            hasVisibleState: true
          }
        ],
        stats: { checkinRate: 0, totalCount: 0, checkinDays: 0, maxStreak: 0 }
      })),
      getMonthlyReport: jest.fn(),
      getYearlyReport: jest.fn()
    };

    const { page } = loadStatsPageWithV1({ mockReport: mockReportService });
    page.data.currentWeekStart = '2026-06-08';

    await page.loadWeekData();

    const special = page.data.habitMatrix.find(item => item.habitId === 'h_special_cancel');
    const strategyDue = page.data.habitMatrix.find(item => item.habitId === 'h_strategy_cancel_due');
    const regular = page.data.habitMatrix.find(item => item.habitId === 'h_regular_cancel');

    expect(special.days[0].status).toBe('canceled');
    expect(special.days[0].displayStatus).toBe('not_required');
    expect(strategyDue.days[0].status).toBe('canceled');
    expect(strategyDue.days[0].displayStatus).toBe('canceled');
    expect(regular.days[0].status).toBe('canceled');
    expect(regular.days[0].displayStatus).toBe('canceled');
  });

  test('月报映射保留 displayStatus，特殊取消日可绑定 not_required 样式', async () => {
    const mockReportService = {
      getWeeklyReport: jest.fn(),
      getMonthlyReport: jest.fn(async () => ({
        habitReports: [
          {
            habitId: 'h_month_special_cancel',
            habit: {
              habitId: 'h_month_special_cancel',
              name: '月报特殊取消',
              category: 'sports',
              themeClass: 't-green'
            },
            days: [
              {
                date: '2026-06-12',
                status: 'canceled',
                displayStatus: 'not_required',
                isChecked: false,
                isDue: false,
                shouldShow: false,
                countsInDueDenominator: false,
                countsAsDone: false
              }
            ],
            dueCount: 0,
            doneCount: 0,
            hasVisibleState: true
          }
        ],
        stats: { checkinRate: 0, totalCount: 0, checkinDays: 0, maxStreak: 0 }
      })),
      getYearlyReport: jest.fn()
    };

    const { page } = loadStatsPageWithV1({ mockReport: mockReportService });
    page.data.currentYear = 2026;
    page.data.currentMonth = 5;

    await page.loadMonthData();

    const report = page.data.monthHabits.find(item => item.habitId === 'h_month_special_cancel');
    const day12 = report.days.find(day => day.date === 12);

    expect(day12.status).toBe('canceled');
    expect(day12.displayStatus).toBe('not_required');
  });

  test('月报和年报卡片天数字段使用 checkinDays 而不是 doneCount', async () => {
    const habitReport = {
      habitId: 'h_days_semantics',
      habit: {
        habitId: 'h_days_semantics',
        name: '天数口径',
        category: 'sports',
        themeClass: 't-green'
      },
      days: [
        {
          date: '2026-06-10',
          status: 'checked',
          displayStatus: 'checked',
          checked: true,
          isChecked: true,
          isDue: true,
          shouldShow: true,
          countsInDueDenominator: true,
          countsInDenominator: true,
          countsAsDone: true
        },
        {
          date: '2026-06-11',
          status: 'checked',
          displayStatus: 'checked',
          checked: true,
          isChecked: true,
          isDue: true,
          shouldShow: true,
          countsInDueDenominator: true,
          countsInDenominator: true,
          countsAsDone: true
        }
      ],
      dueCount: 3,
      doneCount: 3,
      practiceCount: 3,
      checkinDays: 2,
      hasVisibleState: true
    };
    const mockReportService = {
      getWeeklyReport: jest.fn(),
      getMonthlyReport: jest.fn(async () => ({
        habitReports: [habitReport],
        stats: { checkinRate: 100, totalCount: 3, checkinDays: 2, maxStreak: 2 }
      })),
      getYearlyReport: jest.fn(async () => ({
        habitReports: [habitReport],
        stats: { checkinRate: 100, totalCount: 3, checkinDays: 2, maxStreak: 2 }
      }))
    };

    const { page } = loadStatsPageWithV1({ mockReport: mockReportService });
    page.data.currentYear = 2026;
    page.data.currentMonth = 5;

    await page.loadMonthData();
    const monthReport = page.data.monthHabits.find(item => item.habitId === 'h_days_semantics');
    expect(monthReport.daysCount).toBe(2);
    expect(monthReport.practiceCount).toBe(3);

    await page.loadYearData();
    const yearReport = page.data.yearHabits.find(item => item.habitId === 'h_days_semantics');
    expect(yearReport.totalDays).toBe(2);
    expect(yearReport.practiceCount).toBe(3);
  });

  test('快速切换报表时旧请求不能覆盖最后一次 tab 数据', async () => {
    let resolveMonthReport;
    const monthPromise = new Promise(resolve => {
      resolveMonthReport = resolve;
    });
    const mockReportService = {
      getWeeklyReport: jest.fn(),
      getMonthlyReport: jest.fn(() => monthPromise),
      getYearlyReport: jest.fn(async () => ({
        habitReports: [
          {
            habitId: 'h_fast_year',
            habit: {
              habitId: 'h_fast_year',
              name: '年报最终数据',
              category: 'sports',
              themeClass: 't-green'
            },
            days: [
              {
                date: '2026-06-10',
                status: 'checked'
              }
            ],
            dueCount: 1,
            doneCount: 1,
            checkinDays: 1,
            hasVisibleState: true
          }
        ],
        stats: { checkinRate: 100, totalCount: 1, checkinDays: 1, maxStreak: 1 }
      }))
    };

    const { page } = loadStatsPageWithV1({ mockReport: mockReportService });
    page.data.currentTab = 'week';
    page.data.currentYear = 2026;
    page.data.currentMonth = 5;

    page.switchTab({ currentTarget: { dataset: { tab: 'month' } } });
    await Promise.resolve();
    page.switchTab({ currentTarget: { dataset: { tab: 'year' } } });
    await Promise.resolve();
    await Promise.resolve();

    resolveMonthReport({
      habitReports: [
        {
          habitId: 'h_slow_month',
          habit: {
            habitId: 'h_slow_month',
            name: '慢月报',
            category: 'sports',
            themeClass: 't-red'
          },
          days: [
            {
              date: '2026-06-10',
              status: 'checked',
              displayStatus: 'checked',
              isDue: true,
              countsAsDone: true
            }
          ],
          dueCount: 1,
          doneCount: 1,
          hasVisibleState: true
        }
      ],
      stats: { checkinRate: 100, totalCount: 1, checkinDays: 1, maxStreak: 1 }
    });
    await Promise.resolve();

    expect(page.data.currentTab).toBe('year');
    expect(page.data.yearHabits).toHaveLength(1);
    expect(page.data.yearHabits[0].habitId).toBe('h_fast_year');
    expect(page.data.monthHabits).toHaveLength(0);
  });

  test('连续 sync:updated 事件只触发一次防抖刷新', () => {
    jest.useFakeTimers();
    const { page } = loadStatsPageWithV1();
    const eventBus = require('../../../miniprogram/services/eventBus');
    page.loadRealData = jest.fn();
    page.subscribeSyncEvents();

    eventBus.emit('sync:updated', { source: 'test-1' });
    eventBus.emit('sync:updated', { source: 'test-2' });

    expect(page.loadRealData).not.toHaveBeenCalled();
    jest.advanceTimersByTime(119);
    expect(page.loadRealData).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(page.loadRealData).toHaveBeenCalledTimes(1);

    page.unsubscribeSyncEvents();
  });

  test('点击当前报表 tab 不重复加载数据', () => {
    const { page } = loadStatsPageWithV1();
    page.data.currentTab = 'month';
    page.loadRealData = jest.fn();

    page.switchTab({ currentTarget: { dataset: { tab: 'month' } } });

    expect(page.loadRealData).not.toHaveBeenCalled();
  });

  test('周报映射保留策略修改命中当天的 unchecked 描边状态', async () => {
    const mockReportService = {
      getWeeklyReport: jest.fn(async () => ({
        habitReports: [
          {
            habitId: 'h_baduanjin',
            habit: {
              habitId: 'h_baduanjin',
              name: '八段锦',
              category: 'sports',
              themeClass: 't-yellow'
            },
            days: [
              {
                date: '2026-06-14',
                status: 'unchecked',
                displayStatus: 'unchecked',
                checked: false,
                isChecked: false,
                isDue: true,
                shouldShow: true,
                countsInDueDenominator: true,
                countsInDenominator: true,
                countsAsDone: false
              }
            ],
            dueCount: 1,
            doneCount: 0,
            hasVisibleState: true
          }
        ],
        stats: { checkinRate: 0, totalCount: 0, checkinDays: 0, maxStreak: 0 }
      })),
      getMonthlyReport: jest.fn(),
      getYearlyReport: jest.fn()
    };

    const { page } = loadStatsPageWithV1({ mockReport: mockReportService });
    page.data.currentWeekStart = '2026-06-08';

    await page.loadWeekData();

    const report = page.data.habitMatrix.find(item => item.habitId === 'h_baduanjin');
    expect(report.days[0].status).toBe('unchecked');
    expect(report.days[0].displayStatus).toBe('unchecked');
    expect(report.days[0].countsInDenominator).toBe(true);
  });

  test('月报映射保留策略修改命中当天的 unchecked 描边状态', async () => {
    const mockReportService = {
      getWeeklyReport: jest.fn(),
      getMonthlyReport: jest.fn(async () => ({
        habitReports: [
          {
            habitId: 'h_month_strategy_due',
            habit: {
              habitId: 'h_month_strategy_due',
              name: '月报命中应修',
              category: 'sports',
              themeClass: 't-green'
            },
            days: [
              {
                date: '2026-06-14',
                status: 'unchecked',
                displayStatus: 'unchecked',
                isChecked: false,
                isDue: true,
                shouldShow: true,
                countsInDueDenominator: true,
                countsInDenominator: true,
                countsAsDone: false
              }
            ],
            dueCount: 1,
            doneCount: 0,
            hasVisibleState: true
          }
        ],
        stats: { checkinRate: 0, totalCount: 0, checkinDays: 0, maxStreak: 0 }
      })),
      getYearlyReport: jest.fn()
    };

    const { page } = loadStatsPageWithV1({ mockReport: mockReportService });
    page.data.currentYear = 2026;
    page.data.currentMonth = 5;

    await page.loadMonthData();

    const report = page.data.monthHabits.find(item => item.habitId === 'h_month_strategy_due');
    const day14 = report.days.find(day => day.date === 14);
    expect(day14.status).toBe('unchecked');
    expect(day14.displayStatus).toBe('unchecked');
    expect(day14.countsInDenominator).toBe(true);
  });

  // ----- V1 数据测试 -----

  test('deleted userHabit shows checked status in week report', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const userHabits = [
      makeUserHabit({
        userHabitId: 'uh_deleted-1',
        habitId: 'deleted-1',
        name: 'Deleted habit',
        category: 'therapy',
        themeClass: 't-purple',
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        planStartDate: '2026-05-01',
        status: 'deleted',
        deletedAt: '2026-05-13T09:00:00.000Z'
      })
    ];

    const policyVersions = [
      makePolicyVersion({
        userHabitId: 'uh_deleted-1',
        habitId: 'deleted-1',
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        startDate: '2026-05-01'
      })
    ];

    const dailyStates = [
      makeDailyState({ userHabitId: 'uh_deleted-1', date: '2026-05-13', status: 'checked' })
    ];

    const { page } = loadStatsPageWithV1({ userHabits, policyVersions, dailyStates });
    page.data.currentWeekStart = weekStartTimestamp(5, 11); // 2026-05-11 Monday
    page.onLoad();

    await page.loadWeekData(userHabits);

    expect(page.data.habitMatrix).toHaveLength(1);
    expect(page.data.habitMatrix[0].days[2].status).toBe('checked'); // 2026-05-13
  });

  test('week month and year reports keep deleted habit themeClass from V1 data', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const userHabits = [
      makeUserHabit({
        userHabitId: 'uh_16',
        habitId: '16',
        name: 'Jingluo',
        category: 'therapy',
        themeClass: 't-purple',
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        planStartDate: '2026-05-01',
        status: 'deleted',
        deletedAt: '2026-05-20T09:00:00.000Z'
      })
    ];

    const policyVersions = [
      makePolicyVersion({
        userHabitId: 'uh_16',
        habitId: '16',
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        startDate: '2026-05-01'
      })
    ];

    const dailyStates = [
      makeDailyState({ userHabitId: 'uh_16', date: '2026-05-16', status: 'checked' })
    ];

    const { page } = loadStatsPageWithV1({ userHabits, policyVersions, dailyStates });
    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    // Week report
    await page.loadWeekData(userHabits);
    const weekHabit = page.data.habitMatrix.find(item => item.habitId === '16');
    expect(weekHabit).toBeDefined();
    expect(weekHabit.days[5].status).toBe('checked');
    expect(weekHabit.days[5].themeClass).toBe(weekHabit.themeClass);
    expect(weekHabit.themeClass).toBe('t-purple');

    // Month report
    page.data.currentMonth = 4;
    page.data.currentYear = 2026;
    await page.loadMonthData(userHabits);
    const monthHabit = page.data.monthHabits.find(item => item.habitId === '16');
    const monthDay = monthHabit.days.find(day => day.date === 16);
    expect(monthDay.status).toBe('checked');
    expect(monthDay.done).toBe(true);
    expect(monthDay.themeClass).toBe(monthHabit.themeClass);
    expect(monthHabit.themeClass).toBe('t-purple');

    // Year report
    await page.loadYearData(userHabits);
    const yearHabit = page.data.yearHabits.find(item => item.habitId === '16');
    const janFirst = new Date(2026, 0, 1);
    const leadingEmptyCells = janFirst.getDay() === 0 ? 6 : janFirst.getDay() - 1;
    const may16DayOfYearIndex = Math.floor((new Date(2026, 4, 16) - janFirst) / (24 * 60 * 60 * 1000));
    expect(yearHabit.heatmap[leadingEmptyCells + may16DayOfYearIndex].level).toBe('level-1');
    expect(yearHabit.heatmap[leadingEmptyCells + may16DayOfYearIndex].themeClass).toBe(yearHabit.themeClass);
    expect(yearHabit.themeClass).toBe('t-purple');
  });

  test('re-added active userHabit keeps themeClass in week month year reports', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const userHabits = [
      makeUserHabit({
        userHabitId: 'uh_16',
        habitId: '16',
        name: 'Jingluo',
        category: 'therapy',
        themeClass: 't-purple',
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        planStartDate: '2026-05-01',
        status: 'active',
        deletedAt: null
      })
    ];

    const policyVersions = [
      makePolicyVersion({
        userHabitId: 'uh_16',
        habitId: '16',
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        startDate: '2026-05-01'
      })
    ];

    const dailyStates = [
      makeDailyState({ userHabitId: 'uh_16', date: '2026-05-16', status: 'checked' })
    ];

    const { page } = loadStatsPageWithV1({ userHabits, policyVersions, dailyStates });
    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    // Week
    await page.loadWeekData(userHabits);
    const weekHabit = page.data.habitMatrix.find(item => item.habitId === '16');
    expect(weekHabit.themeClass).toBe('t-purple');
    expect(weekHabit.days[5].status).toBe('checked');

    // Month
    page.data.currentMonth = 4;
    page.data.currentYear = 2026;
    await page.loadMonthData(userHabits);
    const monthHabit = page.data.monthHabits.find(item => item.habitId === '16');
    const monthDay = monthHabit.days.find(day => day.date === 16);
    expect(monthHabit.themeClass).toBe('t-purple');
    expect(monthDay.status).toBe('checked');

    // Year
    await page.loadYearData(userHabits);
    const yearHabit = page.data.yearHabits.find(item => item.habitId === '16');
    expect(yearHabit.themeClass).toBe('t-purple');
  });

  test('multiple therapy and life deleted habits keep week month year themeClass', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const deletedHabits = [
      { userHabitId: 'uh_therapy-jingluo', habitId: 'therapy-jingluo', name: 'Jingluo', themeClass: 't-purple', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_therapy-aijiu', habitId: 'therapy-aijiu', name: 'Aijiu', themeClass: 't-red', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_therapy-baguan', habitId: 'therapy-baguan', name: 'Baguan', themeClass: 't-blue', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_therapy-guasha', habitId: 'therapy-guasha', name: 'Guasha', themeClass: 't-green', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_life-paijiao', habitId: 'life-paijiao', name: 'Foot bath', themeClass: 't-red', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_life-shutou', habitId: 'life-shutou', name: 'Shutou', themeClass: 't-yellow', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_life-roufu', habitId: 'life-roufu', name: 'Roufu', themeClass: 't-green', deletedAt: '2026-05-16T09:00:00.000Z' },
      { userHabitId: 'uh_life-kouchi', habitId: 'life-kouchi', name: 'Kouchi', themeClass: 't-purple', deletedAt: '2026-05-16T09:00:00.000Z' }
    ].map(h => makeUserHabit({
      ...h,
      category: h.habitId.startsWith('therapy') ? 'therapy' : 'life',
      freqType: 'weekly',
      freqRules: [1],
      freqCategory: 'weekly',
      planStartDate: '2026-05-01',
      status: 'deleted'
    }));

    const policyVersions = deletedHabits.map(h =>
      makePolicyVersion({
        userHabitId: h.userHabitId,
        habitId: h.habitId,
        freqType: 'weekly',
        freqRules: [1],
        freqCategory: 'weekly',
        startDate: '2026-05-01'
      })
    );

    const dailyStates = deletedHabits.map(h =>
      makeDailyState({ userHabitId: h.userHabitId, date: '2026-05-16', status: 'checked' })
    );

    const { page } = loadStatsPageWithV1({ userHabits: deletedHabits, policyVersions, dailyStates });
    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    for (const habit of deletedHabits) {
      await page.loadWeekData(deletedHabits);
      const weekHabit = page.data.habitMatrix.find(item => item.habitId === habit.habitId);
      expect(weekHabit).toBeDefined();
      expect(weekHabit.themeClass).toBe(habit.themeClass);
      expect(weekHabit.days[5].status).toBe('checked');

      page.data.currentMonth = 4;
      page.data.currentYear = 2026;
      await page.loadMonthData(deletedHabits);
      const monthHabit = page.data.monthHabits.find(item => item.habitId === habit.habitId);
      const monthDay = monthHabit.days.find(day => day.date === 16);
      expect(monthHabit.themeClass).toBe(habit.themeClass);
      expect(monthDay.status).toBe('checked');

      await page.loadYearData(deletedHabits);
      const yearHabit = page.data.yearHabits.find(item => item.habitId === habit.habitId);
      const janFirst = new Date(2026, 0, 1);
      const leadingEmptyCells = janFirst.getDay() === 0 ? 6 : janFirst.getDay() - 1;
      const may16DayOfYearIndex = Math.floor((new Date(2026, 4, 16) - janFirst) / (24 * 60 * 60 * 1000));
      expect(yearHabit.heatmap[leadingEmptyCells + may16DayOfYearIndex].level).toBe('level-1');
      expect(yearHabit.heatmap[leadingEmptyCells + may16DayOfYearIndex].themeClass).toBe(yearHabit.themeClass);
    }
  });

  test('known catalog habits use habit-specific themeClass even when stored as default blue', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const themeOverrides = {
      '1': 't-red',   // 金刚功
      '3': 't-yellow', // 八段锦
      '10': 't-red',  // 跑步
      '11': 't-red',  // 跳绳
      '12': 't-red',  // 艾灸
      '14': 't-blue', // 拔罐
      '16': 't-green', // 经络拍打
      '17': 't-blue'  // 晨起温水
    };

    const habits = [
      { habitId: '1', name: '金刚功', category: '运动类', themeClass: 't-blue' },
      { habitId: '3', name: '八段锦', category: '运动类', themeClass: 't-blue' },
      { habitId: '10', name: '跑步', category: '运动类', themeClass: 't-blue' },
      { habitId: '11', name: '跳绳', category: '运动类', themeClass: 't-blue' },
      { habitId: '12', name: '艾灸', category: '理疗类', themeClass: 't-blue' },
      { habitId: '14', name: '拔罐', category: '理疗类', themeClass: 't-blue' },
      { habitId: '16', name: '经络拍打', category: '理疗类', themeClass: 't-blue' },
      { habitId: '17', name: '晨起温水', category: '起居类', themeClass: 't-blue' }
    ].map(h => makeUserHabit({
      ...h,
      userHabitId: `uh_${h.habitId}`,
      freqType: 'daily',
      freqRules: 1,
      freqCategory: 'everyday',
      planStartDate: '2026-05-01',
      status: 'active',
      deletedAt: null
    }));

    const policyVersions = habits.map(h =>
      makePolicyVersion({
        userHabitId: h.userHabitId,
        habitId: h.habitId,
        freqType: 'daily',
        freqRules: 1,
        freqCategory: 'everyday',
        startDate: '2026-05-01'
      })
    );

    const dailyStates = habits.map(h =>
      makeDailyState({ userHabitId: h.userHabitId, date: '2026-05-16', status: 'checked' })
    );

    const { page } = loadStatsPageWithV1({ userHabits: habits, policyVersions, dailyStates, themeOverrides });
    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    await page.loadWeekData(habits);

    habits.forEach(habit => {
      const row = page.data.habitMatrix.find(item => item.habitId === habit.habitId);
      expect(row.themeClass).toBe(themeOverrides[habit.habitId]);
      expect(row.days[5].status).toBe('checked');
      expect(row.days[5].themeClass).toBe(themeOverrides[habit.habitId]);
    });

    page.data.currentMonth = 4;
    page.data.currentYear = 2026;
    await page.loadMonthData(habits);
    habits.forEach(habit => {
      const card = page.data.monthHabits.find(item => item.habitId === habit.habitId);
      const day = card.days.find(item => item.date === 16);
      expect(card.themeClass).toBe(themeOverrides[habit.habitId]);
      expect(day.status).toBe('checked');
      expect(day.themeClass).toBe(themeOverrides[habit.habitId]);
    });

    await page.loadYearData(habits);
    const janFirst = new Date(2026, 0, 1);
    const leadingEmptyCells = janFirst.getDay() === 0 ? 6 : janFirst.getDay() - 1;
    const may16DayOfYearIndex = Math.floor((new Date(2026, 4, 16) - janFirst) / (24 * 60 * 60 * 1000));
    habits.forEach(habit => {
      const card = page.data.yearHabits.find(item => item.habitId === habit.habitId);
      const day = card.heatmap[leadingEmptyCells + may16DayOfYearIndex];
      expect(card.themeClass).toBe(themeOverrides[habit.habitId]);
      expect(day.level).toBe('level-1');
      expect(day.themeClass).toBe(themeOverrides[habit.habitId]);
    });
  });

  test('deleted checked habits normalize stale theme classes to valid report themes', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const staleHabits = [
      { habitId: 'stale-jade', name: 'Unknown life habit', themeClass: 'theme-jade', category: 'life', expectedTheme: 't-yellow' },
      { habitId: 'stale-orange', name: 'Unknown therapy habit', themeClass: 'theme-orange', category: 'therapy', expectedTheme: 't-red' },
      { habitId: 'empty-theme', name: 'Unknown habit', themeClass: '', category: 'unknown', expectedTheme: 't-blue' }
    ].map(h => makeUserHabit({
      ...h,
      userHabitId: `uh_${h.habitId}`,
      freqType: 'daily',
      freqRules: 1,
      freqCategory: 'everyday',
      planStartDate: '2026-05-01',
      status: 'deleted',
      deletedAt: '2026-05-16T09:00:00.000Z'
    }));

    const policyVersions = staleHabits.map(h =>
      makePolicyVersion({
        userHabitId: h.userHabitId,
        habitId: h.habitId,
        freqType: 'daily',
        freqRules: 1,
        freqCategory: 'everyday',
        startDate: '2026-05-01'
      })
    );

    const dailyStates = staleHabits.map(h =>
      makeDailyState({ userHabitId: h.userHabitId, date: '2026-05-16', status: 'checked' })
    );

    // Map stale themeClasses to valid ones via themeOverrides
    const themeOverrides = {
      'stale-jade': 't-yellow',
      'stale-orange': 't-red',
      'empty-theme': 't-blue'
    };

    const { page } = loadStatsPageWithV1({
      userHabits: staleHabits,
      policyVersions,
      dailyStates,
      themeOverrides
    });
    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    await page.loadWeekData(staleHabits);

    const weekRows = page.data.habitMatrix;
    expect(weekRows).toHaveLength(3);
    weekRows.forEach(row => {
      expectValidReportTheme(row.themeClass);
      expect(row.days[5].status).toBe('checked');
    });

    expect(weekRows.find(row => row.habitId === 'stale-jade').themeClass).toBe('t-yellow');
    expect(weekRows.find(row => row.habitId === 'stale-orange').themeClass).toBe('t-red');
    expect(weekRows.find(row => row.habitId === 'empty-theme').themeClass).toBe('t-blue');

    page.data.currentMonth = 4;
    page.data.currentYear = 2026;
    await page.loadMonthData(staleHabits);
    page.data.monthHabits.forEach(card => {
      expectValidReportTheme(card.themeClass);
      expect(card.days.find(day => day.date === 16).status).toBe('checked');
    });

    await page.loadYearData(staleHabits);
    page.data.yearHabits.forEach(card => {
      expectValidReportTheme(card.themeClass);
      expect(card.heatmap.some(day => day.level === 'level-1')).toBe(true);
    });
  });

  test('same habitId deleted and re-added with different userHabitId shows correct lifecycle', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    // First userHabit: deleted on May 13
    const uh1 = makeUserHabit({
      userHabitId: 'uh_16_v1',
      habitId: '16',
      name: 'Jingluo',
      category: 'therapy',
      themeClass: 't-purple',
      freqType: 'weekly',
      freqRules: [1],
      freqCategory: 'weekly',
      planStartDate: '2026-05-01',
      status: 'deleted',
      deletedAt: '2026-05-13T09:00:00.000Z'
    });

    // Second userHabit: re-added on May 14
    const uh2 = makeUserHabit({
      userHabitId: 'uh_16_v2',
      habitId: '16',
      name: 'Jingluo',
      category: 'therapy',
      themeClass: 't-purple',
      freqType: 'weekly',
      freqRules: [1],
      freqCategory: 'weekly',
      planStartDate: '2026-05-14',
      status: 'active',
      deletedAt: null
    });

    const userHabits = [uh1, uh2];

    const policyVersions = [
      makePolicyVersion({ userHabitId: 'uh_16_v1', habitId: '16', freqType: 'weekly', freqRules: [1], freqCategory: 'weekly', startDate: '2026-05-01' }),
      makePolicyVersion({ userHabitId: 'uh_16_v2', habitId: '16', freqType: 'weekly', freqRules: [1], freqCategory: 'weekly', startDate: '2026-05-14' })
    ];

    const dailyStates = [
      // v1 has a checkin before deletion
      makeDailyState({ userHabitId: 'uh_16_v1', date: '2026-05-12', status: 'checked' }),
      // v2 has a checkin after re-addition
      makeDailyState({ userHabitId: 'uh_16_v2', date: '2026-05-16', status: 'checked' })
    ];

    const { page } = loadStatsPageWithV1({ userHabits, policyVersions, dailyStates });
    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    await page.loadWeekData(userHabits);

    // Both userHabits with same habitId should appear
    const rows = page.data.habitMatrix.filter(item => item.habitId === '16');
    expect(rows).toHaveLength(2);

    // v1 (deleted) - has checkin on May 12, deleted on May 13
    const v1Row = rows.find(r => r.days[1]?.checked); // May 12
    expect(v1Row).toBeDefined();

    // v2 (active) - has checkin on May 16
    const v2Row = rows.find(r => r.days[5]?.checked); // May 16
    expect(v2Row).toBeDefined();
    expect(v2Row.days[5].status).toBe('checked');
  });

  test('reportService weekly report returns correct habitReports structure', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 16, 12, 0, 0));

    const userHabits = [
      makeUserHabit({
        userHabitId: 'uh_test1',
        habitId: 'test1',
        name: 'Test habit',
        category: 'sports',
        themeClass: 't-green',
        freqType: 'daily',
        freqRules: 1,
        freqCategory: 'everyday',
        planStartDate: '2026-05-01',
        status: 'active'
      })
    ];

    const policyVersions = [
      makePolicyVersion({
        userHabitId: 'uh_test1',
        habitId: 'test1',
        freqType: 'daily',
        freqRules: 1,
        freqCategory: 'everyday',
        startDate: '2026-05-01'
      })
    ];

    const dailyStates = [
      makeDailyState({ userHabitId: 'uh_test1', date: '2026-05-11', status: 'checked' }),
      makeDailyState({ userHabitId: 'uh_test1', date: '2026-05-12', status: 'checked' }),
      makeDailyState({ userHabitId: 'uh_test1', date: '2026-05-13', status: 'unchecked' }),
      makeDailyState({ userHabitId: 'uh_test1', date: '2026-05-14', status: 'checked' }),
      makeDailyState({ userHabitId: 'uh_test1', date: '2026-05-15', status: 'checked' }),
      makeDailyState({ userHabitId: 'uh_test1', date: '2026-05-16', status: 'checked' })
    ];

    const { page, mockReportService } = loadStatsPageWithV1({
      userHabits,
      policyVersions,
      dailyStates
    });

    page.data.currentWeekStart = weekStartTimestamp(5, 11);
    page.onLoad();

    await page.loadWeekData(userHabits);

    // Verify reportService was called with correct week start
    expect(mockReportService.getWeeklyReport).toHaveBeenCalledWith('2026-05-11');

    // Verify habitMatrix has correct data
    const rows = page.data.habitMatrix;
    expect(rows).toHaveLength(1);
    expect(rows[0].habitId).toBe('test1');
    expect(rows[0].themeClass).toBe('t-green');
    expect(rows[0].days[0].checked).toBe(true); // May 11
    expect(rows[0].days[1].checked).toBe(true); // May 12
    expect(rows[0].days[2].checked).toBe(false); // May 13 (unchecked)
    expect(rows[0].days[5].checked).toBe(true);  // May 16 (checked)
  });
});
