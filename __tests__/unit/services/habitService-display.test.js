const mockData = {
  myHabits: [],
  policyVersions: []
}

jest.mock('../../../miniprogram/services/storageService', () => ({
  getMyHabitsWithMigration: jest.fn(() => mockData.myHabits),
  getActivePolicyVersion: jest.fn((userHabitId) =>
    mockData.policyVersions.find(policy =>
      policy.userHabitId === userHabitId && policy.effectiveEndDate === null
    ) || null
  ),
  getDailyStatesByDate: jest.fn(() => [])
}))

jest.mock('../../../miniprogram/services/timeService', () => ({
  getBusinessDate: jest.fn(() => '2026-06-11'),
  getSimulatedDateStr: jest.fn(() => '2026-06-11'),
  addDays: jest.fn((date) => date),
  parseDate: jest.fn((date) => new Date(`${date}T00:00:00Z`))
}))

jest.mock('../../../miniprogram/services/syncService', () => ({
  pushWithDedup: jest.fn()
}))

describe('habitService.buildHabitDisplayList', () => {
  beforeEach(() => {
    mockData.myHabits = []
    mockData.policyVersions = []
    jest.resetModules()
  })

  test('保留每周策略的上次时长和星期选择', () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_20',
        habitId: '20',
        status: 'active',
        createdAt: '2026-05-01',
        addedAt: '2026-05-01T08:00:00.000Z',
        pinnedAt: '2026-06-01T08:00:00.000Z'
      }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_20',
        userHabitId: 'uh_20',
        habitId: '20',
        duration: 45,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2, 4, 6] },
        startDate: '2026-05-01',
        effectiveEndDate: null
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const [habit] = habitService.buildHabitDisplayList([
      { _id: '20', title: '揉腹', category: '起居类', default_duration: 10 }
    ])

    expect(habit.strategy).toMatchObject({
      userHabitId: 'uh_20',
      duration: 45,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [2, 4, 6] },
      startDate: '2026-05-01'
    })
    expect(habit.strategyText).toBe('每周二、四、六 · 45分钟')
    expect(habit.addedAt).toBe('2026-05-01T08:00:00.000Z')
    expect(habit.pinnedAt).toBe('2026-06-01T08:00:00.000Z')
  })

  test('保留间隔天数策略的上次时长和天数', () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_16',
        habitId: '16',
        status: 'active',
        createdAt: '2026-05-01'
      }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_16',
        userHabitId: 'uh_16',
        habitId: '16',
        duration: 30,
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 3 },
        startDate: '2026-05-01',
        effectiveEndDate: null
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const [habit] = habitService.buildHabitDisplayList([
      { _id: '16', title: '经络拍打', category: '理疗类', default_duration: 15 }
    ])

    expect(habit.strategy).toMatchObject({
      userHabitId: 'uh_16',
      duration: 30,
      frequencyType: 'interval',
      frequencyConfig: { intervalDays: 3 },
      startDate: '2026-05-01'
    })
    expect(habit.strategyText).toBe('每4天 · 30分钟')
  })

  test('展示列表追加 active 自定义修习且不混入官方分类', () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_custom_1',
        habitId: 'custom_1',
        source: 'custom',
        name: '早睡',
        category: '自定义',
        themeClass: 't-purple',
        status: 'active',
        createdAt: '2026-06-11'
      }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_custom_1',
        userHabitId: 'uh_custom_1',
        habitId: 'custom_1',
        duration: 20,
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-11',
        effectiveEndDate: null
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const habits = habitService.buildHabitDisplayList([
      { _id: '20', title: '揉腹', category: '起居类', default_duration: 10 }
    ])

    expect(habits).toHaveLength(2)
    expect(habits[0]).toMatchObject({
      _id: '20',
      source: 'system',
      hasStrategy: false
    })
    expect(habits[1]).toMatchObject({
      _id: 'custom_1',
      userHabitId: 'uh_custom_1',
      source: 'custom',
      title: '早睡',
      name: '早睡',
      category: '自定义',
      themeClass: 't-purple',
      iconUrl: '/assets/icons/habit-zidingyi.png',
      hasStrategy: true,
      strategyText: '每天 · 20分钟'
    })
  })

  test('停用后的自定义修习仍作为库条目展示但不复用旧策略', () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_custom_old',
        habitId: 'custom_1',
        source: 'custom',
        name: '早睡',
        category: '自定义',
        themeClass: 't-purple',
        status: 'deleted',
        createdAt: '2026-06-01',
        addedAt: '2026-06-01T08:00:00.000Z',
        deletedAt: '2026-06-10'
      }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_custom_old',
        userHabitId: 'uh_custom_old',
        habitId: 'custom_1',
        duration: 20,
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-01',
        effectiveEndDate: '2026-06-10'
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const habits = habitService.buildHabitDisplayList([])

    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({
      _id: 'custom_1',
      userHabitId: '',
      source: 'custom',
      title: '早睡',
      hasStrategy: false,
      strategy: null,
      strategyText: '',
      deletedAt: '2026-06-10'
    })
  })

  test('同一自定义目录存在新旧生命周期时优先展示 active 实例', () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_custom_old',
        habitId: 'custom_1',
        source: 'custom',
        name: '早睡',
        category: '自定义',
        status: 'deleted',
        createdAt: '2026-06-01',
        addedAt: '2026-06-01T08:00:00.000Z',
        deletedAt: '2026-06-10'
      },
      {
        userHabitId: 'uh_custom_new',
        habitId: 'custom_1',
        source: 'custom',
        name: '早睡',
        category: '自定义',
        status: 'active',
        createdAt: '2026-06-11',
        addedAt: '2026-06-11T08:00:00.000Z'
      }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_custom_new',
        userHabitId: 'uh_custom_new',
        habitId: 'custom_1',
        duration: 30,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [1, 3] },
        startDate: '2026-06-11',
        effectiveEndDate: null
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const habits = habitService.buildHabitDisplayList([])

    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({
      _id: 'custom_1',
      userHabitId: 'uh_custom_new',
      hasStrategy: true,
      strategyText: '每周一、三 · 30分钟'
    })
  })
})
