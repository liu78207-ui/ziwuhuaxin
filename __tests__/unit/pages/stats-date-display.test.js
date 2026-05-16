describe('stats date display', () => {
  function loadStatsPage() {
    jest.resetModules();
    let pageConfig;
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
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update, cb) {
        Object.assign(this.data, update);
        if (cb) cb();
      }
    };
  }

  test('week report shows Gregorian title and lunar range subtitle', () => {
    const page = loadStatsPage();
    page.setData({
      currentTab: 'week',
      currentWeekStart: new Date(2026, 4, 4).getTime()
    });

    page.updateDateDisplay();

    expect(page.data.dateTitle).toBe('2026.05.04 - 05.10');
    expect(page.data.dateSubtitle).toBe('三月十八 - 廿四');
  });

  test('month report shows Gregorian month and lunar first-to-last-day range', () => {
    const page = loadStatsPage();
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
    const page = loadStatsPage();
    page.setData({
      currentTab: 'year',
      currentYear: 2026
    });

    page.updateDateDisplay();

    expect(page.data.dateTitle).toBe('2026');
    expect(page.data.dateSubtitle).toBe('乙巳年冬月十三 - 丙午年冬月廿三');
  });
});
