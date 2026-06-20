function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [], creates: [] }
  const counters = {}

  function ensureCollection(name) {
    if (!collections[name]) {
      collections[name] = []
    }
    return collections[name]
  }

  function matches(query, doc) {
    return Object.keys(query || {}).every(key => doc[key] === query[key])
  }

  function collectionApi(name) {
    ensureCollection(name)
    return {
      where(query) {
        return {
          get: jest.fn(() => Promise.resolve({
            data: ensureCollection(name).filter(doc => matches(query, doc))
          }))
        }
      },
      limit() {
        return {
          get: jest.fn(() => Promise.resolve({ data: ensureCollection(name).slice(0, 1) }))
        }
      },
      add(payload) {
        counters[name] = (counters[name] || 0) + 1
        const record = {
          ...(payload.data || {}),
          _id: `${name}_${counters[name]}`
        }
        ensureCollection(name).push(record)
        calls.adds.push({ collection: name, payload })
        return Promise.resolve({ _id: record._id })
      },
      doc(id) {
        return {
          update(payload) {
            const record = ensureCollection(name).find(item => item._id === id)
            if (record) {
              Object.assign(record, payload.data || {})
            }
            calls.updates.push({ collection: name, id, payload })
            return Promise.resolve({ updated: record ? 1 : 0 })
          }
        }
      }
    }
  }

  jest.doMock('wx-server-sdk', () => ({
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    getWXContext: jest.fn(() => wxContext),
    database: jest.fn(() => ({
      createCollection: jest.fn(name => {
        ensureCollection(name)
        calls.creates.push(name)
        return Promise.resolve({ errMsg: 'ok' })
      }),
      collection: jest.fn(collectionApi)
    }))
  }), { virtual: true })

  return { collections, calls }
}

describe('migrateV1Data cloud function', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('migrates legacy strategies, policy versions and checkin logs into V1 target collections idempotently', async () => {
    const { collections, calls } = createMockCloud({
      user_strategies: [{
        _id: 'strategy_1',
        _openid: 'openid_1',
        habit_id: 'h1',
        habit_title: 'Habit One',
        category: '运动类',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        freq_category: 'everyday',
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [{
        _id: 'version_1',
        _openid: 'openid_1',
        habit_id: 'h1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        freq_category: 'everyday',
        start_date: '2026-05-01',
        end_date: null
      }],
      checkin_logs: [
        {
          _id: 'log_1',
          _openid: 'openid_1',
          habit_id: 'h1',
          checkin_date: '2026-05-03',
          created_at: '2026-05-03T01:00:00.000Z'
        },
        {
          _id: 'log_2',
          _openid: 'openid_1',
          habit_id: 'h1',
          checkin_date: '2026-05-03',
          created_at: '2026-05-03T02:00:00.000Z'
        }
      ]
    })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const first = await main({}, {})
    const addCountAfterFirstRun = calls.adds.length
    const second = await main({}, {})

    expect(first.success).toBe(true)
    expect(first.data.counts).toEqual(expect.objectContaining({
      userHabits: 1,
      policyVersions: 1,
      checkinOperations: 1,
      dailyStates: 1,
      conflictLogs: 1
    }))
    expect(second.success).toBe(true)
    expect(calls.adds).toHaveLength(addCountAfterFirstRun)
    expect(collections.user_habits[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      habitId: 'h1',
      status: 'active'
    }))
    expect(collections.habit_policy_versions[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      habitId: 'h1',
      frequencyType: 'daily',
      effectiveStartDate: '2026-05-01'
    }))
    expect(collections.checkin_operations.map(item => item.idempotencyKey)).toEqual([
      'legacy:openid_1:uh_strategy_1:2026-05-03:checkin'
    ])
    expect(collections.conflict_logs[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      conflictType: 'duplicate_legacy_checkin_log',
      sourceCollection: 'checkin_logs'
    }))
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_strategy_1',
      date: '2026-05-03',
      status: 'checked'
    }))
  })

  test('normalizes legacy built-in habit ids across migrated V1 collections', async () => {
    const { collections } = createMockCloud({
      user_strategies: [
        {
          _id: 'strategy_jingang',
          _openid: 'openid_1',
          habit_id: 'h001',
          habit_title: '金刚功',
          category: '运动类',
          duration: 20,
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-05-01'
        },
        {
          _id: 'strategy_baduanjin',
          _openid: 'openid_1',
          habit_id: 'h002',
          habit_title: '八段锦',
          category: '运动类',
          duration: 15,
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-05-01'
        },
        {
          _id: 'strategy_zhanzhuang',
          _openid: 'openid_1',
          habit_id: 'h003',
          habit_title: '站桩',
          category: '运动类',
          duration: 30,
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-05-01'
        }
      ],
      user_strategy_versions: [
        {
          _id: 'version_jingang',
          _openid: 'openid_1',
          habit_id: 'h_001',
          duration: 20,
          freq_type: 'daily',
          start_date: '2026-05-01'
        },
        {
          _id: 'version_baduanjin',
          _openid: 'openid_1',
          habit_id: 'h_002',
          duration: 15,
          freq_type: 'daily',
          start_date: '2026-05-01'
        },
        {
          _id: 'version_zhanzhuang',
          _openid: 'openid_1',
          habit_id: 'h_003',
          duration: 30,
          freq_type: 'daily',
          start_date: '2026-05-01'
        }
      ],
      checkin_logs: [
        {
          _id: 'log_jingang',
          _openid: 'openid_1',
          habit_id: 'h001',
          checkin_date: '2026-05-03',
          created_at: '2026-05-03T01:00:00.000Z'
        },
        {
          _id: 'log_baduanjin',
          _openid: 'openid_1',
          habit_id: 'h002',
          checkin_date: '2026-05-03',
          created_at: '2026-05-03T01:10:00.000Z'
        },
        {
          _id: 'log_zhanzhuang',
          _openid: 'openid_1',
          habit_id: 'h003',
          checkin_date: '2026-05-03',
          created_at: '2026-05-03T01:20:00.000Z'
        }
      ]
    })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(collections.user_habits.map(item => item.habitId).sort()).toEqual(['1', '2', '3'])
    expect(collections.habit_policy_versions.map(item => item.habitId).sort()).toEqual(['1', '2', '3'])
    expect(collections.checkin_operations.map(item => item.habitId).sort()).toEqual(['1', '2', '3'])
    expect(collections.daily_checkin_states.map(item => item.habitId).sort()).toEqual(['1', '2', '3'])
    expect(collections.user_habits.find(item => item.userHabitId === 'uh_strategy_baduanjin')).toEqual(
      expect.objectContaining({ habitId: '3', title: '八段锦' })
    )
    expect(collections.user_habits.find(item => item.userHabitId === 'uh_strategy_zhanzhuang')).toEqual(
      expect.objectContaining({ habitId: '2', title: '站桩' })
    )
  })

  test('repairs existing V1 target collection habit ids without deleting records', async () => {
    const { collections, calls } = createMockCloud({
      user_strategies: [],
      user_strategy_versions: [],
      checkin_logs: [],
      user_habits: [{
        _id: 'target_user_habit',
        _openid: 'openid_1',
        userHabitId: 'uh_existing_jingang',
        habitId: 'h001',
        name: '金刚功',
        status: 'active'
      }, {
        _id: 'target_numeric_habit',
        _openid: 'openid_1',
        userHabitId: 'uh_existing_numeric',
        habitId: 1,
        name: '金刚功',
        status: 'active'
      }],
      habit_policy_versions: [{
        _id: 'target_policy',
        _openid: 'openid_1',
        policyVersionId: 'pv_existing_baduanjin',
        userHabitId: 'uh_existing_baduanjin',
        habitId: 'h_002'
      }],
      checkin_operations: [{
        _id: 'target_operation',
        _openid: 'openid_1',
        operationId: 'op_existing_zhanzhuang',
        userHabitId: 'uh_existing_zhanzhuang',
        habitId: 'h003'
      }],
      daily_checkin_states: [{
        _id: 'target_state',
        _openid: 'openid_1',
        stateId: 'ds_existing_running',
        userHabitId: 'uh_existing_running',
        habitId: 'h_running'
      }]
    })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(result.data.counts.targetHabitIdRepairs).toBe(5)
    expect(collections.user_habits).toHaveLength(2)
    expect(collections.habit_policy_versions).toHaveLength(1)
    expect(collections.checkin_operations).toHaveLength(1)
    expect(collections.daily_checkin_states).toHaveLength(1)
    expect(collections.user_habits[0].habitId).toBe('1')
    expect(collections.user_habits[1].habitId).toBe('1')
    expect(collections.habit_policy_versions[0].habitId).toBe('3')
    expect(collections.checkin_operations[0].habitId).toBe('2')
    expect(collections.daily_checkin_states[0].habitId).toBe('10')
    expect(calls.updates.map(call => call.collection).sort()).toEqual([
      'checkin_operations',
      'daily_checkin_states',
      'habit_policy_versions',
      'user_habits',
      'user_habits'
    ])
  })

  test('returns a clear error when openid is missing', async () => {
    createMockCloud({}, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({}, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'NO_OPENID'
    }))
  })

  test('allows admin migration without wx openid when exactly one legacy openid exists', async () => {
    const { collections } = createMockCloud({
      user_strategies: [{
        _id: 'strategy_admin',
        _openid: 'openid_admin',
        habit_id: 'h_admin',
        duration: 20,
        freq_type: 'daily',
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [],
      checkin_logs: []
    }, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({ adminMigration: true }, {})

    expect(result.success).toBe(true)
    expect(result.data.openidSource).toBe('admin-single-legacy-openid')
    expect(collections.user_habits[0]).toEqual(expect.objectContaining({
      _openid: 'openid_admin',
      userHabitId: 'uh_strategy_admin'
    }))
  })

  test('accepts admin migration payload when CLI passes event as a JSON string', async () => {
    const { collections } = createMockCloud({
      user_strategies: [{
        _id: 'strategy_cli',
        _openid: 'openid_cli',
        habit_id: 'h_cli',
        freq_type: 'daily',
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [],
      checkin_logs: []
    }, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main('{\\"adminMigration\\":true}', {})

    expect(result.success).toBe(true)
    expect(collections.user_habits[0]._openid).toBe('openid_cli')
  })

  test('accepts admin migration payload when CLI passes event as plain JSON text', async () => {
    const { collections } = createMockCloud({
      user_strategies: [{
        _id: 'strategy_plain',
        _openid: 'openid_plain',
        habit_id: 'h_plain',
        freq_type: 'daily',
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [],
      checkin_logs: []
    }, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main('{"adminMigration":true}', {})

    expect(result.success).toBe(true)
    expect(collections.user_habits[0]._openid).toBe('openid_plain')
  })

  test('accepts admin migration payload when CLI wraps JSON text in data field', async () => {
    const { collections } = createMockCloud({
      user_strategies: [{
        _id: 'strategy_wrapped',
        _openid: 'openid_wrapped',
        habit_id: 'h_wrapped',
        freq_type: 'daily',
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [],
      checkin_logs: []
    }, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({ data: '{\\"adminMigration\\":true}' }, {})

    expect(result.success).toBe(true)
    expect(collections.user_habits[0]._openid).toBe('openid_wrapped')
  })

  test('requires targetOpenid for admin migration when multiple legacy openids exist', async () => {
    createMockCloud({
      user_strategies: [
        { _id: 'strategy_a', _openid: 'openid_a', habit_id: 'h1' },
        { _id: 'strategy_b', _openid: 'openid_b', habit_id: 'h2' }
      ],
      checkin_logs: [],
      user_strategy_versions: []
    }, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({ adminMigration: true }, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'NEED_TARGET_OPENID'
    }))
    expect(result.data.openids).toEqual(['openid_a', 'openid_b'])
  })

  test('marks deleted legacy strategies and closes the migrated policy version at deleted date', async () => {
    const { collections } = createMockCloud({
      user_strategies: [{
        _id: 'strategy_deleted',
        _openid: 'openid_1',
        habit_id: 'h_deleted',
        isDeleted: true,
        deleted_at: '2026-05-06',
        duration: 15,
        freq_type: 'weekly',
        freq_rules: 3,
        plan_start_date: '2026-05-01'
      }],
      user_strategy_versions: [],
      checkin_logs: []
    })

    const { main } = require('../../../cloudfunctions/migrateV1Data/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(collections.user_habits[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_strategy_deleted',
      status: 'deleted',
      deletedAt: '2026-05-06',
      isDeleted: true
    }))
    expect(collections.habit_policy_versions[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_strategy_deleted',
      effectiveEndDate: '2026-05-06',
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [3] }
    }))
  })
})
