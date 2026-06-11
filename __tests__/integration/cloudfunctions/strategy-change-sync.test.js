function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [] }
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
      lockedReason: 'strategy_changed_after_checkin',
      clientSequence: 1
    }, {})

    expect(result.success).toBe(true)
    expect(collections.daily_checkin_states[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      userHabitId: 'uh_1',
      date: '2026-06-02',
      status: 'checked',
      hasPolicyChangedToday: true,
      lockedReason: 'strategy_changed_after_checkin',
      lockReason: 'strategy_changed_after_checkin'
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
        lockedReason: 'strategy_changed_without_checkin'
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
      lockedReason: 'strategy_changed_without_checkin',
      lockReason: 'strategy_changed_without_checkin'
    }))
  })
})
