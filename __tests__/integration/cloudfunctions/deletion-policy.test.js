function mockWxServerSdk(collections, options = {}) {
  const command = {
    in: jest.fn(value => ({ $in: value })),
    gte: jest.fn(value => ({ lte: jest.fn(end => ({ gte: value, lte: end })) })),
    remove: jest.fn(() => ({ $remove: true }))
  };

  const makeCollection = name => ({
    where: jest.fn(query => ({
      get: jest.fn(() => Promise.resolve({ data: collections[name] || [] }))
    })),
    doc: jest.fn(id => ({
      update: jest.fn(payload => {
        options.updates.push({ collection: name, id, payload });
        return Promise.resolve({ updated: 1 });
      }),
      remove: jest.fn(() => {
        options.removes.push({ collection: name, id });
        return Promise.resolve({ removed: 1 });
      })
    })),
    add: jest.fn(payload => {
      options.adds.push({ collection: name, payload });
      return Promise.resolve({ _id: `${name}_new` });
    })
  });

  jest.doMock('wx-server-sdk', () => ({
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
    database: jest.fn(() => ({
      command,
      collection: jest.fn(makeCollection)
    })),
    Cloud: {
      callFunction: jest.fn(() => Promise.resolve({ result: { success: true } }))
    }
  }), { virtual: true });
}

describe('cloud deletion policy', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('saveStrategy reactivates a soft-deleted strategy when the habit is added again', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_strategies: [{
        _id: 'strategy_1',
        _openid: 'test_openid',
        habit_id: 'h1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-05-01',
        deleted_at: '2026-05-05T09:00:00.000Z'
      }]
    }, calls);

    const { main } = require('../../../cloudfunctions/saveStrategy/index.js');
    const result = await main({
      habit_id: 'h1',
      duration: 20,
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-05-10'
    }, {});

    expect(result.success).toBe(true);
    expect(calls.updates).toContainEqual(expect.objectContaining({
      collection: 'user_strategies',
      id: 'strategy_1',
      payload: {
        data: expect.objectContaining({
          deleted_at: null,
          deletedAt: null
        })
      }
    }));
  });

  test('removeStrategy closes the active strategy version and opens a deleted segment', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_strategies: [{
        _id: 'strategy_1',
        _openid: 'test_openid',
        habit_id: 'h1',
        habit_title: 'Habit One',
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [{
        _id: 'version_1',
        _openid: 'test_openid',
        habit_id: 'h1',
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-05-01',
        start_date: '2026-05-01',
        end_date: null
      }]
    }, calls);

    const { main } = require('../../../cloudfunctions/removeStrategy/index.js');
    const result = await main({ habit_id: 'h1', habit_title: 'Habit One' }, {});

    expect(result.success).toBe(true);
    expect(calls.updates).toContainEqual(expect.objectContaining({
      collection: 'user_strategy_versions',
      id: 'version_1',
      payload: {
        data: expect.objectContaining({
          end_date: expect.any(String)
        })
      }
    }));
    expect(calls.adds).toContainEqual(expect.objectContaining({
      collection: 'user_strategy_versions',
      payload: {
        data: expect.objectContaining({
          habit_id: 'h1',
          deleted: true,
          type: 'deleted',
          status: 'deleted',
          start_date: expect.any(String),
          end_date: null
        })
      }
    }));
  });

  test('syncHabit deleteHabit upserts deletion-day daily state', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: [{
        _id: 'uh_doc_1',
        _openid: 'test_openid',
        userHabitId: 'uh_8',
        habitId: '8',
        status: 'active'
      }],
      habit_policy_versions: [{
        _id: 'pv_doc_1',
        _openid: 'test_openid',
        policyVersionId: 'pv_8',
        userHabitId: 'uh_8',
        habitId: '8',
        effectiveEndDate: null
      }],
      daily_checkin_states: []
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const result = await main({
      action: 'deleteHabit',
      userHabitId: 'uh_8',
      habitId: '8',
      deletedAt: '2026-06-13',
      deletionDailyState: {
        stateId: 'state_uh_8_2026-06-13',
        userHabitId: 'uh_8',
        habitId: '8',
        date: '2026-06-13',
        status: 'checked',
        policyVersionId: 'pv_8',
        lockReason: 'deleted_after_checkin'
      }
    }, {});

    expect(result.success).toBe(true);
    expect(calls.updates).toContainEqual(expect.objectContaining({
      collection: 'user_habits',
      id: 'uh_doc_1',
      payload: {
        data: expect.objectContaining({
          status: 'deleted',
          deletedAt: '2026-06-13'
        })
      }
    }));
    expect(calls.adds).toContainEqual(expect.objectContaining({
      collection: 'daily_checkin_states',
      payload: {
        data: expect.objectContaining({
          stateId: 'state_uh_8_2026-06-13',
          userHabitId: 'uh_8',
          date: '2026-06-13',
          status: 'checked',
          hasDeletionToday: true,
          lockReason: 'deleted_after_checkin'
        })
      }
    }));
  });

  test('syncHabit addHabit preserves userHabit createdAt separately from policy startDate', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: [],
      habit_policy_versions: []
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const result = await main({
      action: 'addHabit',
      userHabitId: 'uh_20',
      habitId: '20',
      createdAt: '2026-06-02',
      policyVersionId: 'pv_20',
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-03',
      effectiveStartDate: '2026-06-03'
    }, {});

    expect(result.success).toBe(true);
    expect(calls.adds).toContainEqual(expect.objectContaining({
      collection: 'user_habits',
      payload: {
        data: expect.objectContaining({
          userHabitId: 'uh_20',
          habitId: '20',
          createdAt: '2026-06-02'
        })
      }
    }));
    const addedHabit = calls.adds.find(call => call.collection === 'user_habits').payload.data;
    expect(addedHabit.latestPolicyVersionId).toBeUndefined();
    expect(addedHabit.syncStatus).toBeUndefined();
    expect(calls.adds).toContainEqual(expect.objectContaining({
      collection: 'habit_policy_versions',
      payload: {
        data: expect.objectContaining({
          policyVersionId: 'pv_20',
          userHabitId: 'uh_20',
          startDate: '2026-06-03',
          effectiveStartDate: '2026-06-03'
        })
      }
    }));
  });
});
