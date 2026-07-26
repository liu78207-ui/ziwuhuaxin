function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }, options = {}) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [], creates: [], transactions: 0 }
  const counters = {}
  const missingCollections = new Set(options.missingCollections || [])
  const existingCollectionCreateErrors = new Set(options.existingCollectionCreateErrors || [])
  const transactionErrors = [...(options.transactionErrors || [])]

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

  const databaseApi = {
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
  }
  databaseApi.runTransaction = jest.fn(async worker => {
    calls.transactions += 1
    if (transactionErrors.length > 0) {
      throw transactionErrors.shift()
    }
    return worker(databaseApi)
  })

  jest.doMock('wx-server-sdk', () => ({
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    getWXContext: jest.fn(() => wxContext),
    database: jest.fn(() => databaseApi)
  }), { virtual: true })

  return { collections, calls }
}

describe('strategy change sync cloud functions', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('syncCheckin writes strategy change lock fields into daily state', async () => {
    const { collections, calls } = createMockCloud({
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
    expect(calls.transactions).toBe(1)
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

  test('syncCheckin accepts a fresh operation after another device resets clientSequence', async () => {
    const { collections } = createMockCloud({
      checkin_operations: [],
      daily_checkin_states: [{
        _id: 'state_doc',
        _openid: 'openid_1',
        stateId: 'state_14',
        userHabitId: 'uh_14',
        habitId: '14',
        date: '2026-07-24',
        status: 'canceled',
        lastOperationId: 'op_previous_device',
        lastOperationClientSequence: 9,
        lastOperationServerTime: 100
      }]
    })

    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const result = await main({
      idempotencyKey: 'idem_fresh_device',
      operationId: 'op_fresh_device',
      userHabitId: 'uh_14',
      habitId: '14',
      policyVersionId: 'pv_14',
      date: '2026-07-24',
      action: 'checkin',
      clientSequence: 1,
      clientCreatedAt: '2026-07-24T12:00:00.000Z'
    }, {})

    expect(result.success).toBe(true)
    expect(result.code).toBe('SYNC_OK')
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      status: 'checked',
      lastOperationId: 'op_fresh_device',
      lastOperationClientSequence: 1
    }))
    expect(collections.daily_checkin_states[0].lastOperationServerTime).toEqual(expect.any(Number))
  })

  test('syncCheckin retries TransactionBusy with the original idempotency key', async () => {
    const transactionBusy = new Error('collection.get:fail -501001 [ResourceUnavailable.TransactionBusy] Transaction is busy')
    transactionBusy.errCode = -501001
    const { collections, calls } = createMockCloud({
      checkin_operations: [],
      daily_checkin_states: [],
      sync_logs: []
    }, { OPENID: 'openid_1' }, {
      transactionErrors: [transactionBusy, transactionBusy]
    })

    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const result = await main({
      idempotencyKey: 'idem_transaction_busy',
      operationId: 'op_transaction_busy',
      userHabitId: 'uh_transaction_busy',
      habitId: '20',
      policyVersionId: 'pv_transaction_busy',
      date: '2026-07-25',
      action: 'checkin'
    }, {})

    expect(result).toMatchObject({
      success: true,
      serverRevision: 1
    })
    expect(calls.transactions).toBe(3)
    expect(collections.checkin_operations).toHaveLength(1)
    expect(collections.checkin_operations[0]).toEqual(expect.objectContaining({
      idempotencyKey: 'idem_transaction_busy',
      operationId: 'op_transaction_busy',
      serverRevision: 1
    }))
  })

  test('syncCheckin applies opposite operations by transaction commit order and records conflict', async () => {
    const { collections, calls } = createMockCloud({
      checkin_operations: [],
      daily_checkin_states: [],
      conflict_logs: [],
      sync_logs: []
    })
    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const base = {
      userHabitId: 'uh_multi_device',
      habitId: '20',
      policyVersionId: 'pv_multi_device',
      date: '2026-07-24'
    }

    const checked = await main({
      ...base,
      action: 'checkin',
      operationId: 'op_device_a',
      idempotencyKey: 'idem_device_a'
    }, {})
    const canceled = await main({
      ...base,
      action: 'undo',
      operationId: 'op_device_b',
      idempotencyKey: 'idem_device_b'
    }, {})

    expect(checked).toMatchObject({ success: true, serverRevision: 1, resolution: 'APPLIED' })
    expect(canceled).toMatchObject({ success: true, serverRevision: 2, resolution: 'APPLIED' })
    expect(calls.transactions).toBe(2)
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      status: 'canceled',
      serverRevision: 2,
      lastServerOperationId: 'op_device_b'
    }))
    expect(collections.conflict_logs).toHaveLength(1)
    expect(collections.conflict_logs[0]).toEqual(expect.objectContaining({
      previousStatus: 'checked',
      nextStatus: 'canceled',
      serverRevision: 2
    }))
  })

  test('syncCheckin skips only an existing operation retry older than the current cloud state', async () => {
    const { collections } = createMockCloud({
      checkin_operations: [{
        _id: 'op_doc_old',
        _openid: 'openid_1',
        operationId: 'op_old',
        idempotencyKey: 'idem_old',
        userHabitId: 'uh_14',
        date: '2026-07-24',
        action: 'checkin',
        serverTime: 100
      }],
      daily_checkin_states: [{
        _id: 'state_doc',
        _openid: 'openid_1',
        stateId: 'state_14',
        userHabitId: 'uh_14',
        habitId: '14',
        date: '2026-07-24',
        status: 'canceled',
        lastOperationId: 'op_newer',
        lastOperationServerTime: 200
      }]
    })

    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const result = await main({
      idempotencyKey: 'idem_old',
      operationId: 'op_old',
      userHabitId: 'uh_14',
      habitId: '14',
      date: '2026-07-24',
      action: 'checkin',
      clientSequence: 99
    }, {})

    expect(result).toEqual(expect.objectContaining({
      success: true,
      code: 'STALE_OPERATION',
      stateUpdated: false
    }))
    expect(result.dailyState._openid).toBeUndefined()
    expect(result.dailyState._id).toBeUndefined()
    expect(collections.daily_checkin_states[0].status).toBe('canceled')
    expect(collections.daily_checkin_states[0].lastOperationId).toBe('op_newer')
  })

  test('syncCheckin heals a partially applied existing operation when it is newer than state', async () => {
    const { collections } = createMockCloud({
      checkin_operations: [{
        _id: 'op_doc_pending_state',
        _openid: 'openid_1',
        operationId: 'op_pending_state',
        idempotencyKey: 'idem_pending_state',
        userHabitId: 'uh_14',
        date: '2026-07-24',
        action: 'checkin',
        serverTime: 300
      }],
      daily_checkin_states: [{
        _id: 'state_doc',
        _openid: 'openid_1',
        stateId: 'state_14',
        userHabitId: 'uh_14',
        habitId: '14',
        date: '2026-07-24',
        status: 'canceled',
        lastOperationId: 'op_older_state',
        lastOperationServerTime: 200
      }]
    })

    const { main } = require('../../../cloudfunctions/syncCheckin/index.js')
    const result = await main({
      idempotencyKey: 'idem_pending_state',
      operationId: 'op_pending_state',
      userHabitId: 'uh_14',
      habitId: '14',
      date: '2026-07-24',
      action: 'checkin',
      clientSequence: 1
    }, {})

    expect(result.success).toBe(true)
    expect(result.code).toBe('IDEMPOTENT_SKIP')
    expect(result.stateUpdated).toBe(true)
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      status: 'checked',
      lastOperationId: 'op_pending_state',
      lastOperationServerTime: 300
    }))
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

  test('syncHabit does not let an old update reactivate a deleted userHabitId', async () => {
    const { collections, calls } = createMockCloud({
      user_habits: [{
        _id: 'uh_deleted_doc',
        _openid: 'openid_1',
        userHabitId: 'uh_deleted',
        habitId: '20',
        status: 'deleted',
        serverRevision: 4,
        lastServerOperationId: 'habit_uh_deleted_delete'
      }],
      habit_policy_versions: [],
      habit_sync_operations: [],
      conflict_logs: []
    })
    const { main } = require('../../../cloudfunctions/syncHabit/index.js')

    const result = await main({
      action: 'updatePolicy',
      idempotencyKey: 'habit_uh_deleted_policy_old',
      userHabitId: 'uh_deleted',
      habitId: '20',
      policyVersionId: 'pv_old_retry',
      startDate: '2026-07-20'
    }, {})

    expect(result).toMatchObject({
      success: false,
      code: 'USER_HABIT_DELETED',
      resolution: 'REJECTED_DELETED',
      serverRevision: 4
    })
    expect(calls.transactions).toBe(1)
    expect(collections.user_habits[0].status).toBe('deleted')
    expect(collections.habit_policy_versions).toHaveLength(0)
    expect(collections.conflict_logs).toHaveLength(1)
    expect(collections.habit_sync_operations).toHaveLength(1)
  })

  test('syncHabit retries TransactionBusy without duplicating the habit operation', async () => {
    const transactionBusy = new Error('transaction.get:fail -501001 DATABASE_TRANSACTION_FAIL TransactionBusy')
    transactionBusy.errCode = -501001
    const { collections, calls } = createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      habit_sync_operations: [],
      daily_checkin_states: [],
      conflict_logs: []
    }, { OPENID: 'openid_1' }, {
      transactionErrors: [transactionBusy]
    })

    const { main } = require('../../../cloudfunctions/syncHabit/index.js')
    const result = await main({
      action: 'addHabit',
      idempotencyKey: 'idem_habit_transaction_busy',
      userHabitId: 'uh_habit_transaction_busy',
      habitId: '3',
      policyVersionId: 'pv_habit_transaction_busy',
      source: 'system',
      name: '八段锦',
      category: '运动类',
      duration: 15,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-07-25'
    }, {})

    expect(result.success).toBe(true)
    expect(calls.transactions).toBe(2)
    expect(collections.habit_sync_operations).toHaveLength(1)
    expect(collections.habit_sync_operations[0]).toEqual(expect.objectContaining({
      idempotencyKey: 'idem_habit_transaction_busy',
      userHabitId: 'uh_habit_transaction_busy'
    }))
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
