describe('share menu and habits entry behavior', () => {
  let app;

  function resetRuntime(overrides = {}) {
    jest.resetModules();
    jest.clearAllMocks();

    app = {
      globalData: {
        MyHabits: [],
        CheckinLogs: [],
        ...overrides.globalData
      },
      printAllLogs: jest.fn(),
      getAllHabits: jest.fn(() => overrides.allHabits || []),
      getSimulatedDateStr: jest.fn(() => '2026-05-16')
    };

    global.getApp.mockReturnValue(app);
    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });
    wx.showShareMenu = jest.fn();
    wx.nextTick = jest.fn((callback) => callback && callback());
    wx.getStorageSync.mockImplementation((key) => {
      if (key === 'MyHabits') return overrides.myHabits || [];
      if (key === 'CheckinLogs') return [];
      if (key === 'AllHabitsInfo') return {};
      if (key === 'user_openid') return '';
      return undefined;
    });
    wx.cloud.callFunction.mockImplementation(() => {});
  }

  afterAll(() => {
    if (global.setTimeout.mockRestore) {
      global.setTimeout.mockRestore();
    }
  });

  function loadPage(pagePath) {
    require(`../../../miniprogram/pages/${pagePath}/${pagePath}.js`);
    return global.Page.mock.results[0].value;
  }

  test('home empty-state plus stores a one-shot sports tab intent before switching tabs', () => {
    resetRuntime();
    const habitService = require('../../../miniprogram/services/habitService');
    const page = loadPage('home');

    page.goToHabits();

    // Phase 6: intent stored in habitService, not app.globalData
    expect(habitService.consumePendingTabIntent()).toBe('sports');
    expect(wx.switchTab).toHaveBeenCalledWith({ url: '/pages/habits/habits' });
  });

  test('habits page consumes sports tab intent once and shows sports habits', () => {
    resetRuntime({ globalData: { pendingHabitsTab: 'sports' } });
    const habitService = require('../../../miniprogram/services/habitService');
    // Pre-set intent in service (simulating home page transition)
    habitService.requestPendingTab('sports');
    const page = loadPage('habits');

    page.onLoad();
    page.onShow();

    expect(page.data.currentTab).toBe(1);
    // Intent was consumed from service, not globalData
    expect(habitService.consumePendingTabIntent()).toBe(null);
    expect(page.data.filteredHabits.length).toBeGreaterThan(0);
    expect(page.data.filteredHabits.every((habit) => habit.category === page.data.categories[1])).toBe(true);
  });

  test('habits page keeps the default mine tab on ordinary entry', () => {
    resetRuntime();
    const page = loadPage('habits');

    page.onLoad();
    page.onShow();

    expect(page.data.currentTab).toBe(0);
  });

  test.each([
    ['home', '/pages/home/home'],
    ['habits', '/pages/habits/habits'],
    ['stats', '/pages/stats/stats'],
    ['profile', '/pages/profile/profile']
  ])('%s page enables menu sharing and exposes share payloads', (pagePath, expectedPath) => {
    resetRuntime();
    const page = loadPage(pagePath);

    if (pagePath === 'stats') {
      page.debugStorageData = jest.fn();
      page.loadRealData = jest.fn();
    }

    page.onShow();

    expect(wx.showShareMenu).toHaveBeenCalledWith({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    expect(page.onShareAppMessage()).toEqual(expect.objectContaining({
      title: expect.any(String),
      path: expectedPath
    }));
    expect(page.onShareTimeline()).toEqual(expect.objectContaining({
      title: expect.any(String),
      query: expect.any(String)
    }));
  });
});