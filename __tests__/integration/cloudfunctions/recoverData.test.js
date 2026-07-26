function createMockCloud(collections, wxContext = { OPENID: 'openid_1' }, options = {}) {
  const missingCollections = new Set(options.missingCollections || [])

  function matches(query, doc) {
    return Object.keys(query || {}).every(key => doc[key] === query[key])
  }

  function collectionApi(name) {
    return {
      where(query) {
        if (missingCollections.has(name)) {
          throw new Error(`collection.get:fail -502005 database collection not exists: ${name}`)
        }
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
    jest.restoreAllMocks()
    delete process.env.TARGET_RECOVERY_OPENID_SHA256
    delete process.env.TARGET_RECOVERY_EXPIRES_AT
  })

  afterEach(() => {
    delete process.env.TARGET_RECOVERY_OPENID_SHA256
    delete process.env.TARGET_RECOVERY_EXPIRES_AT
  })

  function enableTargetRecovery(openid = 'openid_1', expiresAt = '2099-01-01T00:00:00.000Z') {
    const crypto = require('crypto')
    process.env.TARGET_RECOVERY_OPENID_SHA256 = crypto
      .createHash('sha256')
      .update(openid)
      .digest('hex')
    process.env.TARGET_RECOVERY_EXPIRES_AT = expiresAt
  }

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
        name: 'Habit One',
        addedAt: '2026-05-31T08:00:00.000Z',
        pinnedAt: '2026-06-01T08:00:00.000Z',
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
      name: 'Habit One',
      addedAt: '2026-05-31T08:00:00.000Z',
      pinnedAt: '2026-06-01T08:00:00.000Z'
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

  test('returns empty snapshot when prefixed test collections do not exist yet', async () => {
    createMockCloud({}, { OPENID: 'openid_1' }, {
      missingCollections: [
        'test_user_habits',
        'test_habit_policy_versions',
        'test_daily_checkin_states'
      ]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({ __collectionPrefix: 'test_' }, {})

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      userHabits: [],
      policyVersions: [],
      dailyStates: [],
      nextCursor: null
    })
  })

  test('preserves custom habit metadata for cache recovery', async () => {
    createMockCloud({
      user_habits: [{
        _id: 'uh_custom_1',
        _openid: 'openid_1',
        userHabitId: 'uh_custom_1',
        habitId: 'custom_1',
        source: 'custom',
        name: '早睡',
        category: '自定义',
        remark: '十点前',
        themeClass: 't-purple',
        iconUrl: ''
      }],
      habit_policy_versions: [],
      daily_checkin_states: []
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(result.data.userHabits[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      source: 'custom',
      name: '早睡',
      category: '自定义',
      remark: '十点前',
      themeClass: 't-purple'
    }))
    expect(result.data.userHabits[0]._openid).toBeUndefined()
  })

  test('returns only current openid data and recent 90 days daily states by default', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-16T00:00:00.000Z').getTime())
    createMockCloud({
      user_habits: [
        { _openid: 'openid_1', userHabitId: 'uh_1', habitId: '1' },
        { _openid: 'openid_1', userHabitId: 'uh_25', habitId: '25' },
        { _openid: 'openid_2', userHabitId: 'uh_other', habitId: '2' }
      ],
      habit_policy_versions: [
        { _openid: 'openid_1', policyVersionId: 'pv_1', userHabitId: 'uh_1' },
        { _openid: 'openid_1', policyVersionId: 'pv_25', userHabitId: 'uh_25' },
        { _openid: 'openid_2', policyVersionId: 'pv_other', userHabitId: 'uh_other' }
      ],
      daily_checkin_states: [
        { _openid: 'openid_1', stateId: 'recent', userHabitId: 'uh_1', date: '2026-06-01' },
        { _openid: 'openid_1', stateId: 'old', userHabitId: 'uh_1', date: '2026-01-01' },
        { _openid: 'openid_2', stateId: 'other', userHabitId: 'uh_other', date: '2026-06-01' }
      ]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(result.data.userHabits).toEqual([{
      userHabitId: 'uh_1',
      habitId: '1',
      name: '金刚功',
      category: '运动类',
      targetMinutes: 15
    }, {
      userHabitId: 'uh_25',
      habitId: '25',
      name: '易筋经',
      category: '运动类',
      targetMinutes: 20
    }])
    expect(result.data.policyVersions).toEqual([
      { policyVersionId: 'pv_1', userHabitId: 'uh_1' },
      { policyVersionId: 'pv_25', userHabitId: 'uh_25' }
    ])
    expect(result.data.dailyStates).toEqual([{ stateId: 'recent', userHabitId: 'uh_1', date: '2026-06-01' }])
  })

  test('returns only canonical V1 fields and ignores legacy aliases', async () => {
    createMockCloud({
      user_habits: [{
        _openid: 'openid_1',
        userHabitId: 'uh_clean',
        habitId: '3',
        name: '八段锦',
        targetMinutes: 15,
        themeClass: 't-yellow',
        iconUrl: '/clean.png',
        habit_id: 'h001',
        user_habit_id: 'uh_legacy'
      }],
      habit_policy_versions: [{
        _openid: 'openid_1',
        policyVersionId: 'pv_clean',
        userHabitId: 'uh_clean',
        habitId: '3',
        frequencyType: 'daily',
        startDate: '2026-06-01',
        freq_type: 'daily',
        policy_version_id: 'pv_legacy'
      }],
      daily_checkin_states: [{
        _openid: 'openid_1',
        stateId: 'state_clean',
        userHabitId: 'uh_clean',
        habitId: '3',
        policyVersionId: 'pv_clean',
        date: '2026-06-15',
        status: 'checked',
        lockedReason: 'legacy_noise'
      }]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({}, {})

    expect(result.success).toBe(true)
    expect(result.data.userHabits).toEqual([expect.objectContaining({
      userHabitId: 'uh_clean',
      habitId: '3',
      name: '八段锦',
      category: '运动类',
      targetMinutes: 15,
      themeClass: 't-yellow',
      iconUrl: '/clean.png'
    })])
    expect(result.data.userHabits[0].habit_id).toBeUndefined()
    expect(result.data.userHabits[0].user_habit_id).toBeUndefined()
    expect(result.data.policyVersions).toEqual([expect.objectContaining({
      policyVersionId: 'pv_clean',
      userHabitId: 'uh_clean',
      habitId: '3',
      frequencyType: 'daily',
      startDate: '2026-06-01'
    })])
    expect(result.data.policyVersions[0].freq_type).toBeUndefined()
    expect(result.data.policyVersions[0].policy_version_id).toBeUndefined()
    expect(result.data.dailyStates).toEqual([expect.objectContaining({
      stateId: 'state_clean',
      userHabitId: 'uh_clean',
      habitId: '3',
      policyVersionId: 'pv_clean',
      status: 'checked'
    })])
    expect(result.data.dailyStates[0].lockedReason).toBeUndefined()
  })

  test('supports historical daily state range and cursor pagination', async () => {
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: [
        { _openid: 'openid_1', stateId: 'ds_1', userHabitId: 'uh_1', date: '2026-01-01' },
        { _openid: 'openid_1', stateId: 'ds_2', userHabitId: 'uh_1', date: '2026-01-02' },
        { _openid: 'openid_1', stateId: 'ds_3', userHabitId: 'uh_1', date: '2026-01-03' },
        { _openid: 'openid_1', stateId: 'ds_4', userHabitId: 'uh_1', date: '2026-02-01' }
      ]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const firstPage = await main({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      limit: 2
    }, {})
    const secondPage = await main({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      cursor: firstPage.data.nextCursor,
      limit: 2
    }, {})

    expect(firstPage.data.dailyStates.map(item => item.stateId)).toEqual(['ds_1', 'ds_2'])
    expect(firstPage.data.nextCursor).toEqual(expect.any(String))
    expect(firstPage.data.nextCursor).not.toBe('2')
    expect(secondPage.data.dailyStates.map(item => item.stateId)).toEqual(['ds_3'])
    expect(secondPage.data.nextCursor).toBeNull()
  })

  test('stable cursor does not repeat or skip states when an earlier record is added concurrently', async () => {
    const collections = {
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: [
        { _openid: 'openid_1', _id: 'id_1', stateId: 'ds_1', userHabitId: 'uh_1', date: '2026-01-01' },
        { _openid: 'openid_1', _id: 'id_2', stateId: 'ds_2', userHabitId: 'uh_1', date: '2026-01-02' },
        { _openid: 'openid_1', _id: 'id_3', stateId: 'ds_3', userHabitId: 'uh_1', date: '2026-01-03' }
      ]
    }
    createMockCloud(collections)

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const firstPage = await main({ historyScope: 'all', limit: 2 }, {})
    collections.daily_checkin_states.unshift({
      _openid: 'openid_1',
      _id: 'id_0',
      stateId: 'ds_0',
      userHabitId: 'uh_1',
      date: '2025-12-31'
    })
    const secondPage = await main({
      historyScope: 'all',
      cursor: firstPage.data.nextCursor,
      limit: 2
    }, {})

    expect(firstPage.data.dailyStates.map(item => item.stateId)).toEqual(['ds_1', 'ds_2'])
    expect(secondPage.data.dailyStates.map(item => item.stateId)).toEqual(['ds_3'])
    expect(secondPage.data.nextCursor).toBeNull()
  })

  test('accepts the former numeric offset cursor for backward compatibility', async () => {
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: [
        { _openid: 'openid_1', stateId: 'ds_1', userHabitId: 'uh_1', date: '2026-01-01' },
        { _openid: 'openid_1', stateId: 'ds_2', userHabitId: 'uh_1', date: '2026-01-02' },
        { _openid: 'openid_1', stateId: 'ds_3', userHabitId: 'uh_1', date: '2026-01-03' }
      ]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const page = await main({ historyScope: 'all', cursor: '2', limit: 2 }, {})

    expect(page.data.dailyStates.map(item => item.stateId)).toEqual(['ds_3'])
    expect(page.data.nextCursor).toBeNull()
  })

  test('paginates more than 500 historical states with stable opaque cursors', async () => {
    const dailyStates = Array.from({ length: 501 }, (_, index) => ({
      _openid: 'openid_1',
      _id: `id_${String(index).padStart(3, '0')}`,
      stateId: `ds_${String(index).padStart(3, '0')}`,
      userHabitId: 'uh_1',
      date: new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString().slice(0, 10)
    }))
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: dailyStates
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const recovered = []
    let cursor = ''
    do {
      const result = await main({ historyScope: 'all', cursor, limit: 100 }, {})
      expect(result.success).toBe(true)
      recovered.push(...result.data.dailyStates)
      cursor = result.data.nextCursor || ''
    } while (cursor)

    expect(recovered).toHaveLength(501)
    expect(new Set(recovered.map(state => state.stateId)).size).toBe(501)
    expect(recovered[0].stateId).toBe('ds_000')
    expect(recovered[500].stateId).toBe('ds_500')
  })

  test('historyScope all includes states older than the default 90 day window', async () => {
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: [
        { _openid: 'openid_1', _id: 'old', stateId: 'ds_old', userHabitId: 'uh_1', date: '2025-01-01' },
        { _openid: 'openid_1', _id: 'new', stateId: 'ds_new', userHabitId: 'uh_1', date: '2026-07-22' }
      ]
    })

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({ historyScope: 'all' }, {})

    expect(result.success).toBe(true)
    expect(result.data.dailyStates.map(item => item.stateId)).toEqual(['ds_old', 'ds_new'])
    expect(result.data.nextCursor).toBeNull()
  })

  test('target legacy account receives the complete first response without changing other accounts', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-26T00:00:00.000Z').getTime())
    const dailyStates = Array.from({ length: 296 }, (_, index) => ({
      _openid: 'openid_1',
      _id: `id_${String(index).padStart(3, '0')}`,
      stateId: `state_${index}`,
      userHabitId: `uh_${index % 10}`,
      date: new Date(Date.UTC(2026, 5, 21) + (index % 36) * 86400000).toISOString().slice(0, 10),
      status: 'checked'
    }))
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: dailyStates
    })
    enableTargetRecovery()

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({ dailyStateDays: 90 }, {})

    expect(result.success).toBe(true)
    expect(result.data.dailyStates).toHaveLength(296)
    expect(result.data.nextCursor).toBeNull()
  })

  test('non-target account response remains on the original 100-record pagination path', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-26T00:00:00.000Z').getTime())
    const dailyStates = Array.from({ length: 150 }, (_, index) => ({
      _openid: 'openid_1',
      _id: `id_${String(index).padStart(3, '0')}`,
      stateId: `state_${index}`,
      userHabitId: `uh_${index % 10}`,
      date: '2026-07-01',
      status: 'checked'
    }))
    const collections = {
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: dailyStates
    }
    createMockCloud(collections)
    enableTargetRecovery('different_openid')

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({ dailyStateDays: 90 }, {})

    expect(result.success).toBe(true)
    expect(result.data.dailyStates).toHaveLength(100)
    expect(result.data.nextCursor).toEqual(expect.any(String))
  })

  test('expired target recovery switch follows the original pagination path', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-26T00:00:00.000Z').getTime())
    const dailyStates = Array.from({ length: 150 }, (_, index) => ({
      _openid: 'openid_1',
      _id: `id_${String(index).padStart(3, '0')}`,
      stateId: `state_${index}`,
      userHabitId: 'uh_1',
      date: '2026-07-01',
      status: 'checked'
    }))
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: dailyStates
    })
    enableTargetRecovery('openid_1', '2026-07-25T00:00:00.000Z')

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({ dailyStateDays: 90 }, {})

    expect(result.success).toBe(true)
    expect(result.data.dailyStates).toHaveLength(100)
    expect(result.data.nextCursor).toEqual(expect.any(String))
  })

  test('target recovery refuses an oversized response instead of returning a partial snapshot', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-26T00:00:00.000Z').getTime())
    createMockCloud({
      user_habits: [],
      habit_policy_versions: [],
      daily_checkin_states: [{
        _openid: 'openid_1',
        _id: 'oversized',
        stateId: 'oversized',
        userHabitId: 'uh_1',
        date: '2026-07-01',
        status: 'checked',
        lockReason: 'x'.repeat(5 * 1024 * 1024)
      }]
    })
    enableTargetRecovery()

    const { main } = require('../../../cloudfunctions/recoverData/index.js')
    const result = await main({ dailyStateDays: 90 }, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'TARGET_RECOVERY_RESPONSE_TOO_LARGE'
    }))
  })
})
