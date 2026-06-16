describe('storageService legacy migration', () => {
  let storage
  let storageService

  beforeEach(() => {
    jest.resetModules()
    storage = {
      MyHabits: [{
        habitId: '8',
        name: '普拉提',
        createdAt: '2026-06-01',
        isDeleted: true,
        deletedAt: '2026-06-13'
      }],
      CheckinLogs: [
        { habitId: '8', date: '2026-06-12', sync_status: 1, created_at: '2026-06-12T08:00:00.000Z' },
        { habitId: '8', date: '2026-06-13', sync_status: 1, created_at: '2026-06-13T08:00:00.000Z' }
      ],
      policyVersions: [],
      dailyCheckinStates: [],
      migrationMeta: {}
    }
    wx.getStorageSync.mockImplementation(key => storage[key])
    wx.setStorageSync.mockImplementation((key, value) => {
      storage[key] = value
    })
    storageService = require('../../../miniprogram/services/storageService')
  })

  test('generates dailyCheckinStates from legacy CheckinLogs including deletion day', () => {
    const habits = storageService.getMyHabitsWithMigration()
    const userHabitId = habits[0].userHabitId

    expect(userHabitId).toBeTruthy()
    expect(storage.CheckinLogs).toEqual([
      expect.objectContaining({ date: '2026-06-12', userHabitId }),
      expect.objectContaining({ date: '2026-06-13', userHabitId })
    ])
    expect(storage.dailyCheckinStates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userHabitId,
        habitId: '8',
        date: '2026-06-12',
        status: 'checked',
        migratedFrom: 'CheckinLogs'
      }),
      expect.objectContaining({
        userHabitId,
        habitId: '8',
        date: '2026-06-13',
        status: 'checked',
        migratedFrom: 'CheckinLogs'
      })
    ]))
  })

  test('migrates legacy pending-delete logs to canceled daily state without deleting evidence', () => {
    storage.CheckinLogs = [
      { habitId: '8', date: '2026-06-13', sync_status: 2, deleted_at: '2026-06-13T09:00:00.000Z' }
    ]

    const habits = storageService.getMyHabitsWithMigration()
    const userHabitId = habits[0].userHabitId

    expect(storage.CheckinLogs).toEqual([
      expect.objectContaining({ habitId: '8', date: '2026-06-13', sync_status: 2, userHabitId })
    ])
    expect(storage.dailyCheckinStates).toEqual([
      expect.objectContaining({
        userHabitId,
        date: '2026-06-13',
        status: 'canceled',
        canceledAt: '2026-06-13T09:00:00.000Z'
      })
    ])
  })

  test('clearUserDataCache removes user data keys and phase3 backups', () => {
    storage = {
      MyHabits: [{ userHabitId: 'uh_1' }],
      CheckinLogs: [{ date: '2026-06-01' }],
      AllHabitsInfo: { h1: {} },
      userInfo: { nickname: 'test' },
      operationLogs: [{ action: 'debug' }],
      userStrategies: [{ habit_id: 'h1' }],
      checkin_records: [{ habit_id: 'h1' }],
      dailyCheckinStates: [{ stateId: 's1' }],
      policyVersions: [{ policyVersionId: 'pv1' }],
      checkinOperations: [{ operationId: 'op1' }],
      migrationMeta: { status: 'completed' },
      pendingOperations: [{ queueId: 'q1' }],
      clientSequenceCounter: 12,
      allHabitIds: ['1'],
      DynamicThreeDayScenarioSummary: { total: 1 },
      MyHabits_backup_phase3_123: [],
      CheckinLogs_backup_phase3_456: [],
      policyVersions_backup_phase3_789: [],
      unrelatedKey: 'keep'
    }
    wx.getStorageSync.mockImplementation(key => storage[key])
    wx.setStorageSync.mockImplementation((key, value) => {
      storage[key] = value
    })
    wx.getStorageInfoSync = jest.fn(() => ({ keys: Object.keys(storage) }))
    wx.removeStorageSync.mockImplementation(key => {
      delete storage[key]
    })
    storageService = require('../../../miniprogram/services/storageService')

    const result = storageService.clearUserDataCache()

    expect(result.success).toBe(true)
    expect(result.failedKeys).toEqual([])
    expect(storage.unrelatedKey).toBe('keep')
    expect(storage.MyHabits).toBeUndefined()
    expect(storage.CheckinLogs).toBeUndefined()
    expect(storage.dailyCheckinStates).toBeUndefined()
    expect(storage.MyHabits_backup_phase3_123).toBeUndefined()
    expect(storage.CheckinLogs_backup_phase3_456).toBeUndefined()
    expect(storage.policyVersions_backup_phase3_789).toBeUndefined()
    expect(wx.removeStorageSync).toHaveBeenCalledWith('DynamicThreeDayScenarioSummary')
  })
})
