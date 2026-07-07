function mockWxServerSdk(collections, options = {}) {
  const command = {
    in: jest.fn(value => ({ $in: value })),
    gte: jest.fn(value => ({ lte: jest.fn(end => ({ gte: value, lte: end })) })),
    remove: jest.fn(() => ({ $remove: true }))
  };

  const matchesQuery = (record, query = {}) => Object.keys(query).every(key => {
    const expected = query[key];
    if (expected && Object.prototype.hasOwnProperty.call(expected, '$in')) {
      return expected.$in.includes(record[key]);
    }
    if (expected && typeof expected === 'object') {
      return true;
    }
    return record[key] === expected;
  });

  const makeCollection = name => ({
    where: jest.fn(query => ({
      get: jest.fn(() => Promise.resolve({ data: (collections[name] || []).filter(record => matchesQuery(record, query)) }))
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
      addedAt: '2026-06-02T08:00:00.000Z',
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
          createdAt: '2026-06-02',
          addedAt: '2026-06-02T08:00:00.000Z'
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

  test('syncHabit updatePinned updates and removes pinnedAt on userHabit', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: [{
        _id: 'doc_uh_20',
        _openid: 'test_openid',
        userHabitId: 'uh_20',
        habitId: '20',
        status: 'active'
      }]
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const pinResult = await main({
      action: 'updatePinned',
      userHabitId: 'uh_20',
      habitId: '20',
      pinnedAt: '2026-06-01T08:00:00.000Z'
    }, {});

    expect(pinResult.success).toBe(true);
    expect(calls.updates).toContainEqual(expect.objectContaining({
      collection: 'user_habits',
      id: 'doc_uh_20',
      payload: {
        data: expect.objectContaining({
          pinnedAt: '2026-06-01T08:00:00.000Z',
          updatedAt: expect.any(Number)
        })
      }
    }));

    calls.updates = [];
    const unpinResult = await main({
      action: 'updatePinned',
      userHabitId: 'uh_20',
      habitId: '20',
      pinnedAt: null
    }, {});

    expect(unpinResult.success).toBe(true);
    expect(calls.updates).toContainEqual(expect.objectContaining({
      collection: 'user_habits',
      id: 'doc_uh_20',
      payload: {
        data: expect.objectContaining({
          pinnedAt: { $remove: true },
          updatedAt: expect.any(Number)
        })
      }
    }));
  });

  test('syncHabit addHabit rejects the 13th custom library entry for current openid', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: [
        ...Array.from({ length: 12 }, (_, index) => ({
          _id: `custom_doc_${index + 1}`,
          _openid: 'test_openid',
          userHabitId: `uh_custom_${index + 1}`,
          habitId: `custom_${index + 1}`,
          source: 'custom',
          name: `习惯${index + 1}`,
          status: index < 2 ? 'active' : 'deleted'
        })),
        {
          _id: 'other_custom_doc',
          _openid: 'other_openid',
          userHabitId: 'uh_other_custom',
          habitId: 'custom_other',
          source: 'custom',
          name: '他人习惯',
          status: 'active'
        }
      ],
      habit_policy_versions: []
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const result = await main({
      action: 'addHabit',
      userHabitId: 'uh_custom_13',
      habitId: 'custom_13',
      source: 'custom',
      name: '第十三个',
      policyVersionId: 'pv_custom_13',
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    }, {});

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'CUSTOM_HABIT_LIBRARY_LIMIT_REACHED'
    }));
    expect(calls.adds).toEqual([]);
  });

  test('syncHabit addHabit rejects the 6th active custom habit', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: Array.from({ length: 5 }, (_, index) => ({
        _id: `custom_doc_${index + 1}`,
        _openid: 'test_openid',
        userHabitId: `uh_custom_${index + 1}`,
        habitId: `custom_${index + 1}`,
        source: 'custom',
        name: `习惯${index + 1}`,
        status: 'active'
      })),
      habit_policy_versions: []
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const result = await main({
      action: 'addHabit',
      userHabitId: 'uh_custom_6',
      habitId: 'custom_6',
      source: 'custom',
      name: '第六个',
      policyVersionId: 'pv_custom_6',
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    }, {});

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'CUSTOM_ACTIVE_HABIT_LIMIT_REACHED'
    }));
    expect(calls.adds).toEqual([]);
  });

  test('syncHabit addHabit idempotency retry does not consume a new custom slot', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: [
        ...Array.from({ length: 3 }, (_, index) => ({
          _id: `custom_doc_${index + 1}`,
          _openid: 'test_openid',
          userHabitId: `uh_custom_${index + 1}`,
          habitId: `custom_${index + 1}`,
          source: 'custom',
          name: `习惯${index + 1}`,
          status: 'active'
        })),
        {
          _id: 'custom_retry_doc',
          _openid: 'test_openid',
          userHabitId: 'uh_custom_retry',
          habitId: 'custom_retry',
          source: 'custom',
          name: '重试习惯',
          status: 'active'
        }
      ],
      habit_policy_versions: []
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const result = await main({
      action: 'addHabit',
      userHabitId: 'uh_custom_retry',
      habitId: 'custom_retry',
      source: 'custom',
      name: '重试习惯',
      policyVersionId: 'pv_custom_retry',
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    }, {});

    expect(result.success).toBe(true);
    expect(calls.adds).toContainEqual(expect.objectContaining({
      collection: 'habit_policy_versions',
      payload: {
        data: expect.objectContaining({
          policyVersionId: 'pv_custom_retry',
          userHabitId: 'uh_custom_retry'
        })
      }
    }));
    expect(calls.adds).not.toContainEqual(expect.objectContaining({
      collection: 'user_habits'
    }));
  });

  test('syncHabit cleanupNamelessCustomHabits removes only nameless custom records and related data', async () => {
    const calls = { updates: [], adds: [], removes: [] };
    mockWxServerSdk({
      user_habits: [
        { _id: 'habit_empty', _openid: 'test_openid', userHabitId: 'uh_empty', habitId: 'custom_empty', source: 'custom', name: '' },
        { _id: 'habit_named', _openid: 'test_openid', userHabitId: 'uh_named', habitId: 'custom_named', source: 'custom', name: '早睡' },
        { _id: 'habit_system', _openid: 'test_openid', userHabitId: 'uh_system', habitId: '20', source: 'system' }
      ],
      habit_policy_versions: [
        { _id: 'pv_empty', _openid: 'test_openid', userHabitId: 'uh_empty' }
      ],
      daily_checkin_states: [
        { _id: 'ds_empty', _openid: 'test_openid', userHabitId: 'uh_empty' }
      ],
      checkin_operations: [
        { _id: 'op_empty', _openid: 'test_openid', userHabitId: 'uh_empty' }
      ]
    }, calls);

    const { main } = require('../../../cloudfunctions/syncHabit/index.js');
    const result = await main({
      action: 'cleanupNamelessCustomHabits'
    }, {});

    expect(result).toEqual(expect.objectContaining({
      success: true,
      action: 'cleanupNamelessCustomHabits',
      removedCount: 1,
      removedUserHabitIds: ['uh_empty']
    }));
    expect(calls.removes).toEqual(expect.arrayContaining([
      { collection: 'user_habits', id: 'habit_empty' },
      { collection: 'habit_policy_versions', id: 'pv_empty' },
      { collection: 'daily_checkin_states', id: 'ds_empty' },
      { collection: 'checkin_operations', id: 'op_empty' }
    ]));
    expect(calls.removes).not.toContainEqual({ collection: 'user_habits', id: 'habit_named' });
    expect(calls.removes).not.toContainEqual({ collection: 'user_habits', id: 'habit_system' });
  });
});
