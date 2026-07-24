function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }, options = {}) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [], sends: [], creates: [] }
  const counters = {}
  const missingCollections = new Set(options.missingCollections || [])

  function ensureCollection(name) {
    if (!collections[name]) {
      collections[name] = []
    }
    return collections[name]
  }

  function readPath(doc, path) {
    return String(path).split('.').reduce((value, key) => {
      if (!value || typeof value !== 'object') return undefined
      return value[key]
    }, doc)
  }

  function matches(query, doc) {
    return Object.keys(query || {}).every(key => readPath(doc, key) === query[key])
  }

  function collectionApi(name) {
    return {
      where(query) {
        if (missingCollections.has(name)) {
          throw new Error(`collection.get:fail -502005 database collection not exists: ${name}`)
        }
        const matched = ensureCollection(name).filter(doc => matches(query, doc))
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
      },
      skip(value) {
        return this.where({}).skip(value)
      }
    }
  }

  jest.doMock('wx-server-sdk', () => ({
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    getWXContext: jest.fn(() => wxContext),
    database: jest.fn(() => ({
      createCollection: jest.fn(name => {
        calls.creates.push(name)
        missingCollections.delete(name)
        ensureCollection(name)
        return Promise.resolve({ errMsg: 'collection.create:ok' })
      }),
      collection: jest.fn(collectionApi)
    })),
    openapi: {
      subscribeMessage: {
        send: jest.fn((payload) => {
          calls.sends.push(payload)
          if (options.sendFails) {
            return Promise.reject(new Error('send failed'))
          }
          return Promise.resolve({ errCode: 0 })
        })
      }
    }
  }), { virtual: true })

  return { collections, calls }
}

function buildScanCollections({
  grantCount = 1,
  habits,
  policies,
  states = [],
  logs = []
} = {}) {
  const defaultHabits = [{
    _id: 'habit_1',
    _openid: 'openid_1',
    userHabitId: 'user_habit_1',
    habitId: 'habit_1',
    status: 'active',
    createdAt: '2026-07-01'
  }]
  const defaultPolicies = [{
    _id: 'policy_1',
    _openid: 'openid_1',
    policyVersionId: 'policy_1',
    userHabitId: 'user_habit_1',
    frequencyType: 'daily',
    frequencyConfig: { intervalDays: 1 },
    effectiveStartDate: '2026-07-01',
    effectiveEndDate: null
  }]

  return {
    user_settings: [{
      _id: 'settings_1',
      _openid: 'openid_1',
      reminder: {
        enabled: true,
        reminderTime: '21:00',
        timezone: 'Asia/Shanghai',
        remindIfNoCheckin: true,
        subscribeGrantCount: grantCount
      }
    }],
    user_habits: habits || defaultHabits,
    habit_policy_versions: policies || defaultPolicies,
    daily_checkin_states: states,
    reminder_send_logs: logs
  }
}

describe('reminder cloud functions', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('saveReminderSettings 不信任前端 openid 并保存到当前 OPENID', async () => {
    const { collections } = createMockCloud({})
    const { main } = require('../../../cloudfunctions/saveReminderSettings/index.js')

    const result = await main({
      openid: 'evil_openid',
      reminder: {
        enabled: true,
        reminderTime: '21:00',
        subscribeStatus: 'accepted',
        subscribeGrantCount: 1
      }
    }, {})

    expect(result.success).toBe(true)
    expect(collections.user_settings[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1'
    }))
    expect(collections.user_settings[0]._openid).not.toBe('evil_openid')
  })

  test('saveReminderSettings 非法时间返回 PARAM_ERROR', async () => {
    createMockCloud({})
    const { main } = require('../../../cloudfunctions/saveReminderSettings/index.js')

    const result = await main({
      reminder: {
        enabled: true,
        reminderTime: '25:99'
      }
    }, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'PARAM_ERROR'
    }))
  })

  test('scanReminderUsers 今日应修全部完成时跳过并写 complete 日志', async () => {
    const { collections, calls } = createMockCloud(buildScanCollections({
      states: [{
        _id: 'state_1',
        _openid: 'openid_1',
        userHabitId: 'user_habit_1',
        date: '2026-07-16',
        status: 'checked'
      }]
    }))
    const { main } = require('../../../cloudfunctions/scanReminderUsers/index.js')

    const result = await main({
      todayKey: '2026-07-16',
      serverTime: Date.UTC(2026, 6, 16, 13, 0, 0),
      templateId: 'template_1'
    }, {})

    expect(result.skippedCount).toBe(1)
    expect(calls.sends).toHaveLength(0)
    expect(collections.reminder_send_logs[0]).toEqual(expect.objectContaining({
      status: 'skipped',
      reason: 'all_due_habits_checked',
      scene: 'complete',
      dueCount: 1,
      checkedCount: 1
    }))
  })

  test('scanReminderUsers 未打卡且命中时间窗口时发送并扣减授权次数', async () => {
    const { collections, calls } = createMockCloud(buildScanCollections())
    const { main } = require('../../../cloudfunctions/scanReminderUsers/index.js')

    const result = await main({
      todayKey: '2026-07-16',
      serverTime: Date.UTC(2026, 6, 16, 13, 0, 0),
      templateId: 'template_1'
    }, {})

    expect(result.successCount).toBe(1)
    expect(calls.sends).toHaveLength(1)
    expect(collections.reminder_send_logs[0]).toEqual(expect.objectContaining({
      status: 'success',
      reason: 'sent',
      scene: 'none',
      dueCount: 1,
      checkedCount: 0
    }))
    expect(collections.user_settings[0].reminder).toEqual(expect.objectContaining({
      lastSentDate: '2026-07-16',
      subscribeGrantCount: 0
    }))
  })

  test('scanReminderUsers 部分完成时发送部分完成文案', async () => {
    const habits = [
      {
        _id: 'habit_1', _openid: 'openid_1', userHabitId: 'user_habit_1',
        habitId: 'habit_1', status: 'active', createdAt: '2026-07-01'
      },
      {
        _id: 'habit_2', _openid: 'openid_1', userHabitId: 'user_habit_2',
        habitId: 'habit_2', status: 'active', createdAt: '2026-07-01'
      }
    ]
    const policies = habits.map((habit, index) => ({
      _id: `policy_${index + 1}`,
      _openid: 'openid_1',
      policyVersionId: `policy_${index + 1}`,
      userHabitId: habit.userHabitId,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      effectiveStartDate: '2026-07-01',
      effectiveEndDate: null
    }))
    const { collections, calls } = createMockCloud(buildScanCollections({
      habits,
      policies,
      states: [{
        _id: 'state_1',
        _openid: 'openid_1',
        userHabitId: 'user_habit_1',
        date: '2026-07-16',
        status: 'checked'
      }]
    }))
    const { main } = require('../../../cloudfunctions/scanReminderUsers/index.js')

    const result = await main({
      todayKey: '2026-07-16',
      serverTime: Date.UTC(2026, 6, 16, 13, 0, 0),
      templateId: 'template_1'
    }, {})

    expect(result.successCount).toBe(1)
    expect(calls.sends[0].data.thing3.value).toBe('今天的修习已完成一部分，按自己的节奏继续就好。')
    expect(collections.reminder_send_logs[0]).toEqual(expect.objectContaining({
      status: 'success',
      scene: 'partial',
      dueCount: 2,
      checkedCount: 1
    }))
  })

  test('scanReminderUsers 当天没有应修习惯时不发送', async () => {
    const { collections, calls } = createMockCloud(buildScanCollections({
      policies: [{
        _id: 'policy_1',
        _openid: 'openid_1',
        policyVersionId: 'policy_1',
        userHabitId: 'user_habit_1',
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [1] },
        effectiveStartDate: '2026-07-01',
        effectiveEndDate: null
      }]
    }))
    const { main } = require('../../../cloudfunctions/scanReminderUsers/index.js')

    const result = await main({
      todayKey: '2026-07-16',
      serverTime: Date.UTC(2026, 6, 16, 13, 0, 0),
      templateId: 'template_1'
    }, {})

    expect(result.skippedCount).toBe(1)
    expect(calls.sends).toHaveLength(0)
    expect(collections.reminder_send_logs[0]).toEqual(expect.objectContaining({
      reason: 'no_due_habits',
      scene: 'no_due_habits',
      dueCount: 0,
      checkedCount: 0
    }))
  })

  test('scanReminderUsers 同一天已有成功日志时不重复发送', async () => {
    const { calls } = createMockCloud(buildScanCollections({
      logs: [{
        _id: 'log_1',
        _openid: 'openid_1',
        date: '2026-07-16',
        templateId: 'template_1',
        status: 'success'
      }]
    }))
    const { main } = require('../../../cloudfunctions/scanReminderUsers/index.js')

    const result = await main({
      todayKey: '2026-07-16',
      serverTime: Date.UTC(2026, 6, 16, 13, 0, 0),
      templateId: 'template_1'
    }, {})

    expect(result.skippedCount).toBe(1)
    expect(result.details[0].reason).toBe('already_sent_by_log')
    expect(calls.sends).toHaveLength(0)
  })

  test('scanReminderUsers 授权额度不足时跳过并写日志', async () => {
    const { collections, calls } = createMockCloud(buildScanCollections({ grantCount: 0 }))
    const { main } = require('../../../cloudfunctions/scanReminderUsers/index.js')

    const result = await main({
      todayKey: '2026-07-16',
      serverTime: Date.UTC(2026, 6, 16, 13, 0, 0),
      templateId: 'template_1'
    }, {})

    expect(result.skippedCount).toBe(1)
    expect(calls.sends).toHaveLength(0)
    expect(collections.reminder_send_logs[0]).toEqual(expect.objectContaining({
      status: 'skipped',
      reason: 'no_subscribe_grant'
    }))
  })
})
