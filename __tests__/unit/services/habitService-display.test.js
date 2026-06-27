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
})
