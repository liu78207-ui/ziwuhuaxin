const mockData = {
  myHabits: [],
  migrationMeta: {},
  policyVersions: [],
  dailyStates: [],
  checkinOperations: [],
  pendingOperations: []
}

const mockPushWithDedup = jest.fn()
const mockRequestProcessQueue = jest.fn()
const mockEmit = jest.fn()

jest.mock('../../../miniprogram/services/storageService', () => ({
  getMyHabitsWithMigration: jest.fn(() => mockData.myHabits),
  setMyHabits: jest.fn((habits) => {
    mockData.myHabits = habits
    return true
  }),
  getMigrationMeta: jest.fn(() => mockData.migrationMeta),
  setMigrationMeta: jest.fn((meta) => {
    mockData.migrationMeta = meta
    return true
  }),
  getActivePolicyVersion: jest.fn((userHabitId) =>
    mockData.policyVersions.find(policy =>
      policy.userHabitId === userHabitId && policy.effectiveEndDate === null
    ) || null
  ),
  savePolicyVersion: jest.fn((policy) => {
    mockData.policyVersions.push(policy)
    return true
  }),
  getPolicyVersions: jest.fn(() => mockData.policyVersions),
  setPolicyVersions: jest.fn((versions) => {
    mockData.policyVersions = versions
    return true
  }),
  closePolicyVersion: jest.fn(),
  getDailyState: jest.fn(() => null),
  setDailyState: jest.fn(),
  getDailyCheckinStates: jest.fn(() => mockData.dailyStates),
  setDailyCheckinStates: jest.fn((states) => {
    mockData.dailyStates = states
    return true
  }),
  getCheckinOperations: jest.fn(() => mockData.checkinOperations),
  setCheckinOperations: jest.fn((operations) => {
    mockData.checkinOperations = operations
    return true
  }),
  getPendingOperations: jest.fn(() => mockData.pendingOperations),
  setPendingOperations: jest.fn((operations) => {
    mockData.pendingOperations = operations
    return true
  })
}))

jest.mock('../../../miniprogram/services/cloudService', () => ({
  callFunction: jest.fn(() => Promise.resolve({ success: true, data: {} }))
}))

jest.mock('../../../miniprogram/services/timeService', () => ({
  getBusinessDate: jest.fn(() => '2026-06-25'),
  getNow: jest.fn(() => new Date('2026-06-25T02:30:00.000Z')),
  getSimulatedDateStr: jest.fn(() => '2026-06-25'),
  addDays: jest.fn((date) => date),
  parseDate: jest.fn((date) => new Date(`${date}T00:00:00Z`))
}))

jest.mock('../../../miniprogram/services/syncService', () => ({
  pushWithDedup: mockPushWithDedup,
  requestProcessQueue: mockRequestProcessQueue
}))

jest.mock('../../../miniprogram/services/eventBus', () => ({
  emit: mockEmit
}))

describe('habitService.addHabit', () => {
  beforeEach(() => {
    mockData.myHabits = []
    mockData.migrationMeta = {}
    mockData.policyVersions = []
    mockData.dailyStates = []
    mockData.checkinOperations = []
    mockData.pendingOperations = []
    mockPushWithDedup.mockClear()
    mockRequestProcessQueue.mockClear()
    mockEmit.mockClear()
    jest.resetModules()
  })

  test('新增习惯写入 addedAt 并同步到 pending payload 和 migrationMeta', async () => {
    const habitService = require('../../../miniprogram/services/habitService')

    const userHabit = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-26'
    })

    expect(userHabit).toEqual(expect.objectContaining({
      habitId: '20',
      status: 'active',
      createdAt: '2026-06-25',
      addedAt: '2026-06-25T02:30:00.000Z',
      pinnedAt: null
    }))
    expect(mockData.myHabits[0]).toEqual(expect.objectContaining({
      userHabitId: userHabit.userHabitId,
      addedAt: '2026-06-25T02:30:00.000Z',
      latestPolicyVersionId: expect.stringMatching(/^pv_20_/)
    }))
    expect(mockData.migrationMeta.userHabitInstances[userHabit.userHabitId]).toEqual(expect.objectContaining({
      addedAt: '2026-06-25T02:30:00.000Z',
      createdAt: '2026-06-25'
    }))
    expect(mockPushWithDedup).toHaveBeenCalledWith('habit', 'addHabit', expect.objectContaining({
      userHabitId: userHabit.userHabitId,
      habitId: '20',
      createdAt: '2026-06-25',
      addedAt: '2026-06-25T02:30:00.000Z',
      startDate: '2026-06-26'
    }))
  })

  test('新增自定义修习写入 custom 元信息并同步到 pending payload', async () => {
    const habitService = require('../../../miniprogram/services/habitService')

    const userHabit = await habitService.addCustomHabit({ name: '早睡' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })

    expect(userHabit).toEqual(expect.objectContaining({
      habitId: expect.stringMatching(/^custom_/),
      source: 'custom',
      name: '早睡',
      category: '自定义',
      themeClass: 't-purple',
      iconUrl: '/assets/icons/habit-zidingyi.png',
      status: 'active'
    }))
    expect(mockData.myHabits[0]).toEqual(expect.objectContaining({
      userHabitId: userHabit.userHabitId,
      habitId: userHabit.habitId,
      source: 'custom',
      name: '早睡',
      iconUrl: '/assets/icons/habit-zidingyi.png',
      latestPolicyVersionId: expect.stringMatching(/^pv_custom_/)
    }))
    expect(mockPushWithDedup).toHaveBeenCalledWith('habit', 'addHabit', expect.objectContaining({
      userHabitId: userHabit.userHabitId,
      habitId: userHabit.habitId,
      source: 'custom',
      name: '早睡',
      category: '自定义',
      themeClass: 't-purple',
      iconUrl: '/assets/icons/habit-zidingyi.png',
      startDate: '2026-06-25'
    }))
  })

  test('再次启用既有自定义目录时复用 custom habitId 但生成新 userHabitId', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [{
      userHabitId: 'uh_custom_old',
      habitId: 'custom_existing',
      source: 'custom',
      name: '早睡',
      category: '自定义',
      status: 'deleted',
      createdAt: '2026-06-01',
      deletedAt: '2026-06-20'
    }]
    mockData.migrationMeta = {
      userHabitInstances: {
        uh_custom_old: {
          userHabitId: 'uh_custom_old',
          habitId: 'custom_existing',
          status: 'deleted',
          deletedAt: '2026-06-20'
        }
      }
    }

    const userHabit = await habitService.addCustomHabitInstance('custom_existing', { name: '早睡' }, {
      duration: 25,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [1, 3, 5] },
      startDate: '2026-06-26'
    })

    expect(userHabit).toEqual(expect.objectContaining({
      habitId: 'custom_existing',
      source: 'custom',
      name: '早睡',
      status: 'active'
    }))
    expect(userHabit.userHabitId).not.toBe('uh_custom_old')
    expect(mockData.myHabits).toHaveLength(2)
    expect(mockData.myHabits[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_custom_old',
      status: 'deleted'
    }))
    expect(mockData.myHabits[1]).toEqual(expect.objectContaining({
      userHabitId: userHabit.userHabitId,
      habitId: 'custom_existing',
      status: 'active',
      latestPolicyVersionId: expect.stringMatching(/^pv_custom_existing_/)
    }))
    expect(mockPushWithDedup).toHaveBeenCalledWith('habit', 'addHabit', expect.objectContaining({
      userHabitId: userHabit.userHabitId,
      habitId: 'custom_existing',
      source: 'custom',
      name: '早睡',
      duration: 25,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [1, 3, 5] },
      startDate: '2026-06-26'
    }))
  })

  test('新增自定义修习命中 active 同名时阻止重复创建', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [{
      userHabitId: 'uh_custom_active',
      habitId: 'custom_active',
      source: 'custom',
      name: '早睡',
      category: '自定义',
      status: 'active'
    }]

    await expect(habitService.addCustomHabit({ name: ' 早睡 ' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })).rejects.toThrow('CUSTOM_HABIT_NAME_DUPLICATED_ACTIVE')
  })

  test('底部新增命中 deleted 同名时提示从自定义库启用', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [{
      userHabitId: 'uh_custom_deleted',
      habitId: 'custom_deleted',
      source: 'custom',
      name: '早睡',
      category: '自定义',
      status: 'deleted'
    }]

    await expect(habitService.addCustomHabit({ name: '早睡' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })).rejects.toThrow('CUSTOM_HABIT_NAME_EXISTS_DELETED')
  })

  test('自定义库已有 12 个目录时底部新增第 13 个失败', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = Array.from({ length: 12 }, (_, index) => ({
      userHabitId: `uh_custom_${index + 1}`,
      habitId: `custom_${index + 1}`,
      source: 'custom',
      name: `习惯${index + 1}`,
      category: '自定义',
      status: index < 2 ? 'active' : 'deleted'
    }))

    await expect(habitService.addCustomHabit({ name: '第十三个' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })).rejects.toThrow('CUSTOM_HABIT_LIBRARY_LIMIT_REACHED')
    expect(mockData.myHabits).toHaveLength(12)
  })

  test('活跃自定义已有 4 个时新增第 5 个自定义成功', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = Array.from({ length: 4 }, (_, index) => ({
      userHabitId: `uh_custom_${index + 1}`,
      habitId: `custom_${index + 1}`,
      source: 'custom',
      name: `习惯${index + 1}`,
      category: '自定义',
      status: 'active'
    }))

    const created = await habitService.addCustomHabit({ name: '第五个' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })

    expect(created).toEqual(expect.objectContaining({
      name: '第五个',
      status: 'active'
    }))
    expect(mockData.myHabits.filter(habit => habit.source === 'custom' && habit.status === 'active')).toHaveLength(5)
  })

  test('活跃自定义已有 5 个时新增全新自定义失败', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = Array.from({ length: 5 }, (_, index) => ({
      userHabitId: `uh_custom_${index + 1}`,
      habitId: `custom_${index + 1}`,
      source: 'custom',
      name: `习惯${index + 1}`,
      category: '自定义',
      status: 'active'
    }))

    await expect(habitService.addCustomHabit({ name: '第六个' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })).rejects.toThrow('CUSTOM_ACTIVE_HABIT_LIMIT_REACHED')
  })

  test('活跃自定义已有 5 个时再次启用 deleted 自定义目录失败', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [
      ...Array.from({ length: 5 }, (_, index) => ({
        userHabitId: `uh_custom_${index + 1}`,
        habitId: `custom_${index + 1}`,
        source: 'custom',
        name: `习惯${index + 1}`,
        category: '自定义',
        status: 'active'
      })),
      {
        userHabitId: 'uh_custom_deleted',
        habitId: 'custom_deleted',
        source: 'custom',
        name: '旧习惯',
        category: '自定义',
        status: 'deleted'
      }
    ]

    await expect(habitService.addCustomHabitInstance('custom_deleted', { name: '旧习惯' }, {
      duration: 20,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-25'
    })).rejects.toThrow('CUSTOM_ACTIVE_HABIT_LIMIT_REACHED')
  })

  test('改名为新习惯时旧实例软删除并创建新 custom habitId 和 userHabitId', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [{
      userHabitId: 'uh_custom_old',
      habitId: 'custom_old',
      source: 'custom',
      name: '跆拳道',
      category: '自定义',
      status: 'active',
      createdAt: '2026-06-01',
      latestPolicyVersionId: 'pv_custom_old'
    }]
    mockData.migrationMeta = {
      userHabitInstances: {
        uh_custom_old: {
          userHabitId: 'uh_custom_old',
          habitId: 'custom_old',
          status: 'active'
        }
      }
    }
    mockData.policyVersions = [{
      policyVersionId: 'pv_custom_old',
      userHabitId: 'uh_custom_old',
      habitId: 'custom_old',
      effectiveEndDate: null
    }]

    const created = await habitService.renameCustomHabitAsNew('uh_custom_old', { name: '击剑' }, {
      duration: 30,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [2, 4] },
      startDate: '2026-06-26'
    })

    expect(mockData.myHabits[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_custom_old',
      habitId: 'custom_old',
      name: '跆拳道',
      status: 'deleted',
      deletedAt: '2026-06-25'
    }))
    expect(created).toEqual(expect.objectContaining({
      source: 'custom',
      name: '击剑',
      status: 'active'
    }))
    expect(created.habitId).not.toBe('custom_old')
    expect(created.userHabitId).not.toBe('uh_custom_old')
    expect(mockPushWithDedup.mock.calls.map(call => call[1])).toEqual(['deleteHabit', 'addHabit'])
  })

  test('改名目标命中 deleted 同名目录时复用目标 custom habitId', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [
      {
        userHabitId: 'uh_custom_old',
        habitId: 'custom_old',
        source: 'custom',
        name: '跆拳道',
        category: '自定义',
        status: 'active',
        createdAt: '2026-06-01',
        latestPolicyVersionId: 'pv_custom_old'
      },
      {
        userHabitId: 'uh_fencing_deleted',
        habitId: 'custom_fencing',
        source: 'custom',
        name: '击剑',
        category: '自定义',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-10'
      }
    ]
    mockData.migrationMeta = { userHabitInstances: {} }
    mockData.policyVersions = [{
      policyVersionId: 'pv_custom_old',
      userHabitId: 'uh_custom_old',
      habitId: 'custom_old',
      effectiveEndDate: null
    }]

    const created = await habitService.renameCustomHabitAsNew('uh_custom_old', { name: '击剑' }, {
      duration: 30,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-26'
    })

    expect(created).toEqual(expect.objectContaining({
      habitId: 'custom_fencing',
      name: '击剑',
      status: 'active'
    }))
    expect(created.userHabitId).not.toBe('uh_fencing_deleted')
  })

  test('活跃自定义已有 5 个时作为新习惯替换当前实例成功', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = Array.from({ length: 5 }, (_, index) => ({
      userHabitId: `uh_custom_${index + 1}`,
      habitId: `custom_${index + 1}`,
      source: 'custom',
      name: index === 0 ? '跆拳道' : `习惯${index + 1}`,
      category: '自定义',
      status: 'active',
      latestPolicyVersionId: `pv_custom_${index + 1}`
    }))
    mockData.migrationMeta = { userHabitInstances: {} }
    mockData.policyVersions = [{
      policyVersionId: 'pv_custom_1',
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      effectiveEndDate: null
    }]

    const created = await habitService.renameCustomHabitAsNew('uh_custom_1', { name: '击剑' }, {
      duration: 30,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-26'
    })

    expect(created).toEqual(expect.objectContaining({
      name: '击剑',
      status: 'active'
    }))
    expect(mockData.myHabits.filter(habit => habit.source === 'custom' && habit.status === 'active')).toHaveLength(5)
    expect(mockPushWithDedup.mock.calls.map(call => call[1])).toEqual(['deleteHabit', 'addHabit'])
  })

  test('自定义库满 12 个时作为新习惯创建全新目录失败且旧实例保持 active', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = Array.from({ length: 12 }, (_, index) => ({
      userHabitId: `uh_custom_${index + 1}`,
      habitId: `custom_${index + 1}`,
      source: 'custom',
      name: index === 0 ? '跆拳道' : `习惯${index + 1}`,
      category: '自定义',
      status: index < 5 ? 'active' : 'deleted',
      latestPolicyVersionId: `pv_custom_${index + 1}`
    }))
    mockData.policyVersions = [{
      policyVersionId: 'pv_custom_1',
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      effectiveEndDate: null
    }]

    await expect(habitService.renameCustomHabitAsNew('uh_custom_1', { name: '新名字' }, {
      duration: 30,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-26'
    })).rejects.toThrow('CUSTOM_HABIT_LIBRARY_LIMIT_REACHED')
    expect(mockData.myHabits[0]).toEqual(expect.objectContaining({
      userHabitId: 'uh_custom_1',
      status: 'active'
    }))
    expect(mockPushWithDedup).not.toHaveBeenCalled()
  })

  test('自定义库满 12 个时作为新习惯复用 deleted 目录成功', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = Array.from({ length: 12 }, (_, index) => ({
      userHabitId: `uh_custom_${index + 1}`,
      habitId: `custom_${index + 1}`,
      source: 'custom',
      name: index === 0 ? '跆拳道' : (index === 11 ? '击剑' : `习惯${index + 1}`),
      category: '自定义',
      status: index < 5 ? 'active' : 'deleted',
      latestPolicyVersionId: `pv_custom_${index + 1}`
    }))
    mockData.policyVersions = [{
      policyVersionId: 'pv_custom_1',
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      effectiveEndDate: null
    }]

    const created = await habitService.renameCustomHabitAsNew('uh_custom_1', { name: '击剑' }, {
      duration: 30,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-26'
    })

    expect(created).toEqual(expect.objectContaining({
      habitId: 'custom_12',
      name: '击剑',
      status: 'active'
    }))
    expect(mockData.myHabits.filter(habit => habit.source === 'custom' && habit.status === 'active')).toHaveLength(5)
  })

  test('清理空名 custom 会删除本地记录和关联事实数据', () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [
      { userHabitId: 'uh_empty', habitId: 'custom_empty', source: 'custom', name: '', status: 'active' },
      { userHabitId: 'uh_named', habitId: 'custom_named', source: 'custom', name: '早睡', status: 'active' },
      { userHabitId: 'uh_system', habitId: '20', source: 'system', status: 'active' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv_empty', userHabitId: 'uh_empty' },
      { policyVersionId: 'pv_named', userHabitId: 'uh_named' }
    ]
    mockData.dailyStates = [
      { stateId: 'ds_empty', userHabitId: 'uh_empty' },
      { stateId: 'ds_named', userHabitId: 'uh_named' }
    ]
    mockData.checkinOperations = [
      { operationId: 'op_empty', userHabitId: 'uh_empty' },
      { operationId: 'op_named', userHabitId: 'uh_named' }
    ]
    mockData.pendingOperations = [
      { queueId: 'q_empty', entityId: 'uh_empty', payload: { userHabitId: 'uh_empty' } },
      { queueId: 'q_named', entityId: 'uh_named', payload: { userHabitId: 'uh_named' } }
    ]
    mockData.migrationMeta = {
      userHabitInstances: {
        uh_empty: { userHabitId: 'uh_empty' },
        uh_named: { userHabitId: 'uh_named' }
      }
    }

    const result = habitService.cleanupNamelessCustomHabits({ cloud: false })

    expect(result).toEqual(expect.objectContaining({
      removedCount: 1,
      userHabitIds: ['uh_empty'],
      habitIds: ['custom_empty']
    }))
    expect(mockData.myHabits.map(h => h.userHabitId)).toEqual(['uh_named', 'uh_system'])
    expect(mockData.policyVersions.map(item => item.userHabitId)).toEqual(['uh_named'])
    expect(mockData.dailyStates.map(item => item.userHabitId)).toEqual(['uh_named'])
    expect(mockData.checkinOperations.map(item => item.userHabitId)).toEqual(['uh_named'])
    expect(mockData.pendingOperations.map(item => item.entityId)).toEqual(['uh_named'])
    expect(mockData.migrationMeta.userHabitInstances.uh_empty).toBeUndefined()
  })

  test('修改自定义修习名称不改变 habitId 或 userHabitId', async () => {
    const habitService = require('../../../miniprogram/services/habitService')
    mockData.myHabits = [{
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      source: 'custom',
      name: '早睡',
      category: '自定义',
      themeClass: 't-purple',
      status: 'active',
      createdAt: '2026-06-25'
    }]
    mockData.migrationMeta = {
      userHabitInstances: {
        uh_custom_1: {
          userHabitId: 'uh_custom_1',
          habitId: 'custom_1'
        }
      }
    }

    const updated = await habitService.updateCustomHabitMeta('uh_custom_1', { name: '早睡早起' })

    expect(updated).toEqual(expect.objectContaining({
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      name: '早睡早起'
    }))
    expect(mockPushWithDedup).toHaveBeenCalledWith('habit', 'updateHabitMeta', expect.objectContaining({
      userHabitId: 'uh_custom_1',
      habitId: 'custom_1',
      source: 'custom',
      name: '早睡早起',
      iconUrl: '/assets/icons/habit-zidingyi.png'
    }))
  })
})
