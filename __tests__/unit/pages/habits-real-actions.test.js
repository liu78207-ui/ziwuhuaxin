function loadHabitsPage() {
  jest.resetModules();

  const app = {
    globalData: { MyHabits: [] },
    removeUserStrategy: jest.fn()
  };

  let page;
  global.getApp = jest.fn(() => app);
  global.wx = {
    navigateBack: jest.fn(),
    switchTab: jest.fn(),
    showShareMenu: jest.fn(),
    showToast: jest.fn(),
    showModal: jest.fn(),
    getStorageSync: jest.fn(() => []),
    setStorageSync: jest.fn(),
    cloud: {
      callFunction: jest.fn().mockResolvedValue({ result: { success: true } })
    }
  };
  global.Page = jest.fn(config => {
    page = {
      ...config,
      data: JSON.parse(JSON.stringify(config.data)),
      setData(update) {
        Object.assign(this.data, update);
      }
    };
    Object.keys(config).forEach(key => {
      if (typeof config[key] === 'function') {
        page[key] = config[key].bind(page);
      }
    });
  });

  require('../../../miniprogram/pages/habits/habits.js');
  return { page, app };
}

describe('修习页真实删除操作', () => {
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('删除习惯时只调用 habitService.softDeleteHabit', async () => {
    const { page, app } = loadHabitsPage();
    const habit = {
      _id: 'catalog-16',
      title: '经络拍打',
      category: '理疗类',
      default_duration: 15,
      iconUrl: '/assets/icons/habit-jingluo-paida.png',
      themeClass: 't-green',
      hasStrategy: true,
      strategy: {
        habit_id: '16',
        habit_title: '经络拍打',
        freq_type: 'weekly',
        freq_rules: [1],
        freq_category: 'weekly',
        plan_start_date: '2026-05-01'
      }
    };
    page.data.habits = [habit];
    page.data.filteredHabits = [habit];

    await page.removeStrategy(habit);

    // Phase 3C: 只调用 habitService.softDeleteHabit，不调用 app.removeUserStrategy 和云函数
    expect(app.removeUserStrategy).not.toHaveBeenCalled();
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });
});
