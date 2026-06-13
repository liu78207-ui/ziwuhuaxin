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

  test('scenario 7 seeds dynamic three-day V1 checkin state data', async () => {
    const collections = {
      user_habits: makeCollection({ existing: [{ _id: 'old_user_habit' }] }),
      habit_policy_versions: makeCollection({ existing: [{ _id: 'old_policy' }] }),
      checkin_operations: makeCollection({ existing: [{ _id: 'old_operation' }] }),
      daily_checkin_states: makeCollection({ existing: [{ _id: 'old_state' }] }),
      habits: makeCollection({ existing: [{ _id: 'old_habit' }] })
    };
    const { main } = loadInitTestData({ collections });

    const result = await main({
      scenario: 7,
      force: true,
      confirmTestDataWrite: 'ALLOW_TEST_DATA_WRITE'
    }, {});

    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      scenario: '三天动态打卡人工测试场景',
      totalUserHabits: 6,
      totalPolicyVersions: 8,
      totalOperations: 14,
      totalDailyStates: 13,
      totalHabits: 5,
      startDate: '2026-06-11',
      endDate: '2026-06-13'
    });
    expect(collections.user_habits.remove).toHaveBeenCalled();
    expect(collections.habit_policy_versions.remove).toHaveBeenCalled();
    expect(collections.checkin_operations.remove).toHaveBeenCalled();
    expect(collections.daily_checkin_states.remove).toHaveBeenCalled();
    expect(collections.user_habits.add).toHaveBeenCalledTimes(6);
    expect(collections.habit_policy_versions.add).toHaveBeenCalledTimes(8);
    expect(collections.checkin_operations.add).toHaveBeenCalledTimes(14);
    expect(collections.daily_checkin_states.add).toHaveBeenCalledTimes(13);
    expect(collections.habits.add).toHaveBeenCalledTimes(5);

    expect(collections.daily_checkin_states.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stateId: 'state_dyn_pilates_13',
        userHabitId: 'uh_dyn_pilates_1',
        date: '2026-06-13',
        status: 'not_required',
        hasPolicyChangedToday: true,
        hasDeletionToday: true,
        lockedReason: 'deleted_without_checkin'
      })
    });
    expect(collections.user_habits.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        habitId: '2',
        userHabitId: 'uh_dyn_standing_2',
        status: 'active',
        createdAt: '2026-06-13'
      })
    });
  });
});
