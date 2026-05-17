function loadHomePage(app) {
  jest.resetModules();
  let pageConfig;
  global.Page = jest.fn(config => {
    pageConfig = {
      ...config,
      data: JSON.parse(JSON.stringify(config.data || {})),
      setData(data) {
        Object.assign(this.data, data);
      },
      getTabBar: jest.fn(() => null)
    };
    Object.keys(config).forEach(key => {
      if (typeof config[key] === 'function') {
        pageConfig[key] = config[key].bind(pageConfig);
      }
    });
    return pageConfig;
  });
  global.getApp = jest.fn(() => app);
  require('../../../miniprogram/pages/home/home.js');
  return pageConfig;
}

describe('home page real core logic', () => {
  beforeEach(() => {
    wx.getStorageSync.mockReturnValue([]);
  });

  test('loadHabitsData handles Date deletedAt values without crashing', () => {
    const app = {
      globalData: {
        DEBUG_DAY_OFFSET: 0,
        isOnline: true,
        MyHabits: [
          {
            habitId: 'h1',
            name: 'Deleted Habit',
            targetMinutes: 20,
            freq_type: 'daily',
            freq_rules: 1,
            plan_start_date: '2026-05-01',
            deletedAt: new Date(2026, 4, 1, 9, 0, 0)
          }
        ],
        CheckinLogs: []
      },
      getAllHabits: jest.fn(() => app.globalData.MyHabits),
      printAllLogs: jest.fn(),
      isCheckedOnDate: jest.fn(() => false)
    };
    const page = loadHomePage(app);

    expect(() => page.loadHabitsData()).not.toThrow();
    expect(page.data.taskList).toEqual([]);
  });
});
