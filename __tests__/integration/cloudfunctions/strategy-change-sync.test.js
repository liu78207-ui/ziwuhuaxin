function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }, options = {}) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [], creates: [] }
  const counters = {}
  const missingCollections = new Set(options.missingCollections || [])
  const existingCollectionCreateErrors = new Set(options.existingCollectionCreateErrors || [])

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
    return {
      where(query) {
        if (missingCollections.has(name)) {
          throw new Error(`collection.get:fail -502005 database collection not exists: ${name}`)
        }
        return {
          get: jest.fn(() => Promise.resolve({
            data: ensureCollection(name).filter(doc => matches(query, doc))
          }))
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
      command: { remove: jest.fn(() => ({ $remove: true })) },
      createCollection: jest.fn(name => {
        calls.creates.push(name)
        if (existingCollectionCreateErrors.has(name)) {
          return Promise.reject(new Error('createCollection:fail -501001 resource system error. [ResourceUnavailable.ResourceExist] Table exist. DATABASE_COLLECTION_ALREADY_EXIST'))
        }
        missingCollections.delete(name)
        ensureCollection(name)
        return Promise.resolve({ errMsg: 'collection.create:ok' })
      }),
      collection: jest.fn(collectionApi)
    }))
  }), { virtual: true })

  return { collections, calls }
}

describe('strategy change sync cloud functions', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('syncCheckin writes strategy change lock fields into daily state', async () => {
    const { collections } = createMockCloud({
      checkin_operations: [],
      daily_checkin_states: []
    })

    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const result = await main({
      idempotencyKey: 'idem_1',
      operationId: 'op_1',
      userHabitId: 'uh_1',
      habitId: '20',
      policyVersionId: 'pv_1',
      date: '2026-06-02',
      action: 'checkin',
      hasPolicyChangedToday: true,
      lockReason: 'strategy_changed_after_checkin',
      clientSequence: 1
    }, {})

    expect(result.success).toBe(true)
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      userHabitId: 'uh_1',
      date: '2026-06-02',
      status: 'checked',
      hasPolicyChangedToday: true,
      lockReason: 'strategy_changed_after_checkin'
    }))
    expect(collections.daily_checkin_states[0].lockedReason).toBeUndefined()
    expect(collections.daily_checkin_states[0].syncStatus).toBeUndefined()
    expect(collections.checkin_operations[0].syncStatus).toBeUndefined()
  })

  test('syncCheckin creates prefixed test collections before first checkin write', async () => {
    const { collections, calls } = createMockCloud({}, { OPENID: 'openid_1' }, {
      missingCollections: ['test_checkin_operations', 'test_daily_checkin_states']
    })

    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const result = await main({
      __collectionPrefix: 'test_',
      idempotencyKey: 'idem_test_1',
      operationId: 'op_test_1',
      userHabitId: 'uh_test_1',
      habitId: 'custom_test_1',
      policyVersionId: 'pv_test_1',
      date: '2026-07-07',
      action: 'checkin',
      clientSequence: 1
    }, {})

    expect(result.success).toBe(true)
    expect(calls.creates).toEqual(expect.arrayContaining([
      'test_checkin_operations',
      'test_daily_checkin_states'
    ]))
    expect(collections.test_checkin_operations[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      idempotencyKey: 'idem_test_1'
    }))
    expect(collections.test_daily_checkin_states[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      userHabitId: 'uh_test_1',
      status: 'checked'
    }))
  })

  test('syncHabit updatePolicy upserts strategy-changed daily state', async () => {
    const { collections } = createMockCloud({
      user_habits: [{
        _id: 'uh_doc',
        _openid: 'openid_1',
        userHabitId: 'uh_1',
        habitId: '20',
        status: 'active'
      }],
      habit_policy_versions: [{
        _id: 'pv_old_doc',
        _openid: 'openid_1',
        policyVersionId: 'pv_old',
        userHabitId: 'uh_1',
        habitId: '20',
        effectiveEndDate: null
      }],
      daily_checkin_states: []
    })

    const { main } = require('../../../cloudfunctions/syncHabit/index.js')
    const result = await main({
      action: 'updatePolicy',
      userHabitId: 'uh_1',
      habitId: '20',
      policyVersionId: 'pv_new',
      previousPolicyVersionId: 'pv_old',
      previousEffectiveEndDate: '2026-06-02',
      duration: 20,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [3] },
      startDate: '2026-06-02',
      effectiveStartDate: '2026-06-02',
      strategyChangedDailyState: {
        stateId: 'state_1',
        userHabitId: 'uh_1',
        habitId: '20',
        policyVersionId: 'pv_new',
        date: '2026-06-02',
        status: 'unchecked',
        hasPolicyChangedToday: true,
        lockReason: 'strategy_changed_without_checkin'
      }
    }, {})

    expect(result.success).toBe(true)
    expect(collections.habit_policy_versions.find(p => p.policyVersionId === 'pv_old')).toEqual(expect.objectContaining({
      effectiveEndDate: '2026-06-02'
    }))
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      stateId: 'state_1',
      userHabitId: 'uh_1',
      habitId: '20',
      policyVersionId: 'pv_new',
      date: '2026-06-02',
      status: 'unchecked',
      hasPolicyChangedToday: true,
      lockReason: 'strategy_changed_without_checkin'
    }))
    expect(collections.daily_checkin_states[0].lockedReason).toBeUndefined()
    expect(collections.daily_checkin_states[0].syncStatus).toBeUndefined()
  })

  test('syncHabit creates prefixed test collections before first habit write', async () => {
    const { collections, calls } = createMockCloud({}, { OPENID: 'openid_1' }, {
      missingCollections: [
        'test_user_habits',
        'test_habit_policy_versions',
        'test_daily_checkin_states',
        'test_checkin_operations'
      ]
    })

    const { main } = require('../../../cloudfunctions/syncHabit/index.js')
    const result = await main({
      __collectionPrefix: 'test_',
      action: 'addHabit',
      userHabitId: 'uh_test_1',
      habitId: 'custom_test_1',
      policyVersionId: 'pv_test_1',
      source: 'custom',
      name: '测试习惯',
      category: '自定义',
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-07-07'
    }, {})

    expect(result.success).toBe(true)
    expect(calls.creates).toEqual(expect.arrayContaining([
      'test_user_habits',
      'test_habit_policy_versions',
      'test_daily_checkin_states',
      'test_checkin_operations'
    ]))
    expect(collections.test_user_habits[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      userHabitId: 'uh_test_1',
      name: '测试习惯'
    }))
    expect(collections.test_habit_policy_versions[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      policyVersionId: 'pv_test_1'
    }))
    expect(collections.user_habits).toBeUndefined()
  })

  test('syncHabit treats CloudBase Table exist createCollection error as success', async () => {
    const { collections, calls } = createMockCloud({
      test_user_habits: [],
      test_habit_policy_versions: [],
      test_daily_checkin_states: [],
      test_checkin_operations: []
    }, { OPENID: 'openid_1' }, {
      existingCollectionCreateErrors: [
        'test_user_habits',
        'test_habit_policy_versions',
        'test_daily_checkin_states',
        'test_checkin_operations'
      ]
    })

    const { main } = require('../../../cloudfunctions/syncHabit/index.js')
    const result = await main({
      __collectionPrefix: 'test_',
      action: 'addHabit',
      userHabitId: 'uh_test_existing',
      habitId: '3',
      policyVersionId: 'pv_test_existing',
      source: 'system',
      name: '八段锦',
      category: '运动类',
      duration: 15,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-07-07'
    }, {})

    expect(result.success).toBe(true)
    expect(calls.creates).toEqual(expect.arrayContaining([
      'test_user_habits',
      'test_habit_policy_versions'
    ]))
    expect(collections.test_user_habits[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_test_existing'
    }))
    expect(collections.test_habit_policy_versions[0]).toEqual(expect.objectContaining({
      policyVersionId: 'pv_test_existing'
    }))
  })
})
