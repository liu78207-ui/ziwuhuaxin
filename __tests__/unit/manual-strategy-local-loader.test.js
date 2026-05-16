function loadTestData() {
  jest.resetModules();
  return require('../helpers/test-data.js');
}

describe('manual strategy local loader', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-13T00:00:00'));
    wx.getStorageSync.mockReturnValue(null);
    wx.setStorageSync.mockImplementation(() => {});
    global.getCurrentPages = jest.fn(() => []);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('writes the fixed manual scenario to local storage and app globalData', () => {
    const app = { globalData: {} };
    const testData = loadTestData();

    const result = testData.initManualStrategyScenario({ targetDate: '2026-04-01', app });

    expect(result.summary).toEqual({
      habits: 12,
      logs: 82,
      targetDate: '2026-04-01',
      debugOffset: -42
    });
    expect(app.globalData.MyHabits).toHaveLength(12);
    expect(app.globalData.CheckinLogs).toHaveLength(82);
    expect(app.globalData.DEBUG_DAY_OFFSET).toBe(-42);
    expect(wx.setStorageSync).toHaveBeenCalledWith('MyHabits', expect.any(Array));
    expect(wx.setStorageSync).toHaveBeenCalledWith('CheckinLogs', expect.any(Array));
    expect(wx.setStorageSync).toHaveBeenCalledWith('ManualStrategyScenarioExpected', expect.any(Object));
  });

  test('production app does not expose the manual scenario loader', () => {
    jest.resetModules();
    let appConfig;
    global.App = jest.fn(options => {
      appConfig = options;
      return options;
    });

    require('../../miniprogram/app.js');

    expect(appConfig.loadManualStrategyScenario).toBeUndefined();
  });
});
