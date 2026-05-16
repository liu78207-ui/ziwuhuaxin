function loadInitTestData({ openid = 'manual_openid', collections = {} } = {}) {
  jest.resetModules();

  const defaultCollection = {
    where: jest.fn(() => defaultCollection),
    get: jest.fn().mockResolvedValue({ data: [] }),
    add: jest.fn().mockResolvedValue({ _id: 'new_id' }),
    remove: jest.fn().mockResolvedValue({ deleted: 0 })
  };
  const db = {
    collection: jest.fn(name => collections[name] || defaultCollection)
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: openid }))
  };

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true });
  const mod = require('../../../cloudfunctions/initTestData/index.js');
  return { main: mod.main, db, defaultCollection };
}

function makeCollection({ existing = [] } = {}) {
  const collection = {
    where: jest.fn(() => collection),
    get: jest.fn().mockResolvedValue({ data: existing }),
    add: jest.fn().mockResolvedValue({ _id: 'added_id' }),
    remove: jest.fn().mockResolvedValue({ deleted: existing.length })
  };
  return collection;
}

describe('initTestData manual strategy scenario', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    process.env.ALLOW_TEST_DATA_FUNCTIONS = 'true';
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ALLOW_TEST_DATA_FUNCTIONS;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.dontMock('wx-server-sdk');
  });

  test('is disabled by default to protect release environments', async () => {
    delete process.env.ALLOW_TEST_DATA_FUNCTIONS;
    const { main } = loadInitTestData();

    const result = await main({ scenario: 6, force: true }, {});

    expect(result.success).toBe(false);
    expect(result.message).toContain('默认禁用');
  });

  test('scenario 6 seeds fixed manual strategy data and can force clear old data', async () => {
    const collections = {
      user_strategies: makeCollection({ existing: [{ _id: 'old_strategy' }] }),
      checkin_logs: makeCollection({ existing: [{ _id: 'old_log' }] }),
      user_strategy_versions: makeCollection({ existing: [{ _id: 'old_version' }] }),
      habits: makeCollection({ existing: [{ _id: 'old_habit' }] })
    };
    const { main } = loadInitTestData({ collections });

    const result = await main({
      scenario: 6,
      force: true,
      confirmTestDataWrite: 'ALLOW_TEST_DATA_WRITE'
    }, {});

    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      scenario: '连续日期策略人工测试场景',
      totalStrategies: 12,
      totalStrategyVersions: 7,
      totalLogs: 84,
      totalHabits: 12
    });
    expect(collections.user_strategies.remove).toHaveBeenCalled();
    expect(collections.checkin_logs.remove).toHaveBeenCalled();
    expect(collections.user_strategy_versions.remove).toHaveBeenCalled();
    expect(collections.habits.remove).toHaveBeenCalled();
    expect(collections.user_strategies.add).toHaveBeenCalledTimes(12);
    expect(collections.user_strategy_versions.add).toHaveBeenCalledTimes(7);
    expect(collections.checkin_logs.add).toHaveBeenCalledTimes(84);
    expect(collections.habits.add).toHaveBeenCalledTimes(12);
  });

  test('returns a clear message when strategy version collection is missing', async () => {
    const versionsCollection = makeCollection();
    versionsCollection.get.mockRejectedValue(new Error('collection.get:fail -502005 database collection not exists: user_strategy_versions'));
    const collections = {
      user_strategies: makeCollection(),
      checkin_logs: makeCollection(),
      user_strategy_versions: versionsCollection,
      habits: makeCollection()
    };
    const { main } = loadInitTestData({ collections });

    const result = await main({
      scenario: 6,
      force: true,
      confirmTestDataWrite: 'ALLOW_TEST_DATA_WRITE'
    }, {});

    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining('user_strategy_versions')
    });
    expect(collections.user_strategies.add).not.toHaveBeenCalled();
    expect(collections.checkin_logs.add).not.toHaveBeenCalled();
  });
});
