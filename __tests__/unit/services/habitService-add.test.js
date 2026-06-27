const mockData = {
  myHabits: [],
  migrationMeta: {},
  policyVersions: []
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
  closePolicyVersion: jest.fn(),
  getDailyState: jest.fn(() => null),
  setDailyState: jest.fn()
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
})
