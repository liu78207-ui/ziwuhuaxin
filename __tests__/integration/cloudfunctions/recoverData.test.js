function createMockCloud(collections, wxContext = { OPENID: 'openid_1' }) {
  function matches(query, doc) {
    return Object.keys(query || {}).every(key => doc[key] === query[key])
  }

  function collectionApi(name) {
    return {
      where(query) {
        const matched = (collections[name] || []).filter(doc => matches(query, doc))
        const state = { limitValue: matched.length, skipValue: 0 }
        const queryApi = {
          skip(value) {
            state.skipValue = value
            return queryApi
          },
          limit(value) {
            state.limitValue = value
            return queryApi
          },
          get: jest.fn(() => Promise.resolve({
            data: matched.slice(state.skipValue, state.skipValue + state.limitValue)
          }))
        }
        return queryApi
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
}

describe('recoverData cloud function', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('recovers V1 collections with pagination', async () => {
    const policyVersions = Array.from({ length: 125 }, (_, index) => ({
      _id: `pv_${index}`,
      _openid: 'openid_1',
      policyVersionId: `pv_${index}`,
      userHabitId: 'uh_1',
      legacyStrategyId: 'legacy_noise'
    }))
    createMockCloud({
      user_habits: [{
        _id: 'uh_1',
        _openid: 'openid_1',
        userHabitId: 'uh_1',
        title: 'Habit One',
        legacyStrategyId: 'legacy_noise',
        migrationVersion: 1
      }],
      habit_policy_versions: policyVersions,
      daily_checkin_states: [{
        _id: 'ds_1',
        _openid: 'openid_1',
        stateId: 'ds_1',
        userHabitId: 'uh_1',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_after_checkin',
        lockReason: 'strategy_changed_after_checkin',
        migratedFrom: 'checkin_logs'
      }]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(result.data.userHabits).toHaveLength(1)
    expect(result.data.policyVersions).toHaveLength(125)
    expect(result.data.dailyStates).toHaveLength(1)
    expect(result.serverTime).toEqual(expect.any(Number))
    expect(result.data.userHabits[0]).toEqual({
      userHabitId: 'uh_1',
      title: 'Habit One'
    })
    expect(result.data.userHabits[0]._openid).toBeUndefined()
    expect(result.data.userHabits[0].legacyStrategyId).toBeUndefined()
    expect(result.data.userHabits[0].migrationVersion).toBeUndefined()
    expect(result.data.policyVersions[0]).toEqual({
      policyVersionId: 'pv_0',
      userHabitId: 'uh_1'
    })
    expect(result.data.policyVersions[0]._openid).toBeUndefined()
    expect(result.data.policyVersions[0].legacyStrategyId).toBeUndefined()
    expect(result.data.dailyStates[0]).toEqual({
      stateId: 'ds_1',
      userHabitId: 'uh_1',
      lockReason: 'strategy_changed_after_checkin',
      lockedReason: 'strategy_changed_after_checkin',
      hasPolicyChangedToday: true
    })
    expect(result.data.dailyStates[0]._openid).toBeUndefined()
    expect(result.data.dailyStates[0].migratedFrom).toBeUndefined()
  })

  test('returns NO_OPENID when wx context has no openid', async () => {
    createMockCloud({}, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({}, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'NO_OPENID'
    }))
  })
})
