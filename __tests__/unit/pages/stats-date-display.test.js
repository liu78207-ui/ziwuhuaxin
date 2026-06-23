describe('stats date display', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function loadStatsPage() {
    jest.resetModules();
    let pageConfig;
    const emptyReport = {
      habitReports: [],
      stats: { checkinRate: 0, totalCount: 0, checkinDays: 0, maxStreak: 0 }
    };
    const mockReportService = {
      getWeeklyReport: jest.fn(async () => emptyReport),
      getMonthlyReport: jest.fn(async () => emptyReport),
      getYearlyReport: jest.fn(async () => emptyReport)
    };

    jest.doMock('../../../miniprogram/services/shareService', () => ({
      enableShareMenu: jest.fn(),
      getShareMessage: jest.fn(),
      getShareTimeline: jest.fn()
    }));
    jest.doMock('../../../miniprogram/services/reportService', () => mockReportService);

    global.wx = {
      nextTick: jest.fn(cb => cb()),
      getStorageSync: jest.fn(() => null)
    };
    global.getApp = jest.fn(() => ({
      globalData: { DEBUG_DAY_OFFSET: 0, MyHabits: [], CheckinLogs: [] },
      getAllHabits: jest.fn(() => [])
    }));
    global.Page = jest.fn(config => {
      pageConfig = config;
      return config;
    });

    require('../../../miniprogram/pages/stats/stats.js');

    return {
      page: {
        ...pageConfig,
        data: JSON.parse(JSON.stringify(pageConfig.data)),
        setData(update, cb) {
          Object.assign(this.data, update);
          if (cb) cb();
        }
      },
      mockReportService
    };
  }

  test('week report shows Gregorian title and lunar range subtitle', () => {
    const { page } = loadStatsPage();
    page.setData({
      currentTab: 'week',
      currentWeekStart: new Date(2026, 4, 4).getTime()
    });

    page.updateDateDisplay();

    expect(page.data.dateTitle).toBe('2026.05.04 - 05.10');
    expect(page.data.dateSubtitle).toBe('三月十八 - 廿四');
  });

  test('month report shows Gregorian month and lunar first-to-last-day range', () => {
    const { page } = loadStatsPage();
    page.setData({
      currentTab: 'month',
      currentYear: 2026,
      currentMonth: 4
    });

    page.updateDateDisplay();

    expect(page.data.dateTitle).toBe('2026.05');
    expect(page.data.dateSubtitle).toBe('三月十五 - 四月十五');
  });

  test('year report shows Gregorian year and lunar year-spanning subtitle', () => {
    const { page } = loadStatsPage();
    page.setData({
      currentTab: 'year',
      currentYear: 2026
    });

    page.updateDateDisplay();

    expect(page.data.dateTitle).toBe('2026');
    expect(page.data.dateSubtitle).toBe('乙巳年冬月十三 - 丙午年冬月廿三');
  });

  test('onShow resets week report to the current week without changing report type', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 21, 16, 30));
    const { page, mockReportService } = loadStatsPage();
    page.setData({
      currentTab: 'week',
      currentWeekStart: '2026-06-15'
    });

    page.onShow();
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.currentTab).toBe('week');
    expect(page.data.currentWeekStart).toBe('2026-06-22');
    expect(mockReportService.getWeeklyReport).toHaveBeenCalledWith('2026-06-22');
  });

  test('onShow keeps month tab but resets it to the current month', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 21, 16, 30));
    const { page, mockReportService } = loadStatsPage();
    page.setData({
      currentTab: 'month',
      currentYear: 2026,
      currentMonth: 4
    });

    page.onShow();
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.currentTab).toBe('month');
    expect(page.data.currentYear).toBe(2026);
    expect(page.data.currentMonth).toBe(5);
    expect(mockReportService.getMonthlyReport).toHaveBeenCalledWith('2026-06');
    expect(mockReportService.getWeeklyReport).not.toHaveBeenCalled();
  });

  test('onShow keeps year tab but resets it to the current year', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 21, 16, 30));
    const { page, mockReportService } = loadStatsPage();
    page.setData({
      currentTab: 'year',
      currentYear: 2025
    });

    page.onShow();
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.currentTab).toBe('year');
    expect(page.data.currentYear).toBe(2026);
    expect(mockReportService.getYearlyReport).toHaveBeenCalledWith('2026');
    expect(mockReportService.getWeeklyReport).not.toHaveBeenCalled();
  });
});
