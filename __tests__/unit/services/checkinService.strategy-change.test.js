let mockStorage

jest.mock('../../../miniprogram/services/storageService', () => ({
  getDailyState: jest.fn((userHabitId, date) =>
    mockStorage.dailyStates.find(s => s.userHabitId === userHabitId && s.date === date) || null
  ),
  setDailyState: jest.fn((state) => {
    const index = mockStorage.dailyStates.findIndex(s =>
      s.userHabitId === state.userHabitId && s.date === state.date
    )
    if (index >= 0) mockStorage.dailyStates[index] = state
    else mockStorage.dailyStates.push(state)
  }),
  getDailyStatesByDate: jest.fn((date) => mockStorage.dailyStates.filter(s => s.date === date)),
  getDailyCheckinStates: jest.fn(() => mockStorage.dailyStates),
  getCheckinOperationsByUserHabitId: jest.fn((userHabitId) =>
    mockStorage.operations.filter(op => op.userHabitId === userHabitId)
  ),
  getNextClientSequence: jest.fn(() => 1),
  saveCheckinOperation: jest.fn((operation) => {
    mockStorage.operations.push(operation)
  })
}))

jest.mock('../../../miniprogram/services/habitService', () => ({
  getHabitByUserHabitId: jest.fn((userHabitId) => mockStorage.habits[userHabitId] || null)
}))

jest.mock('../../../miniprogram/services/syncService', () => ({
  pushWithDedup: jest.fn()
}))

const checkinService = require('../../../miniprogram/services/checkinService')
const syncService = require('../../../miniprogram/services/syncService')

describe('checkinService 策略修改当天锁定字段', () => {
  beforeEach(() => {
    mockStorage = {
      dailyStates: [],
      operations: [],
      habits: {
        uh1: {
          userHabitId: 'uh1',
          habitId: '20',
          status: 'active',
          latestPolicyVersionId: 'pv_latest'
        }
      }
    }
  })

  test('编辑策略后再打卡，重算为 strategy_changed_after_checkin', async () => {
    mockStorage.dailyStates.push({
      stateId: 'state1',
      userHabitId: 'uh1',
      habitId: '20',
      date: '2026-06-02',
      status: 'unchecked',
      hasPolicyChangedToday: true,
      lockedReason: 'strategy_changed_without_checkin'
    })

    const state = await checkinService.checkin('uh1', '2026-06-02')

    expect(state.status).toBe('checked')
    expect(state.hasPolicyChangedToday).toBe(true)
    expect(state.lockedReason).toBe('strategy_changed_after_checkin')
    expect(state.lockReason).toBe('strategy_changed_after_checkin')
    expect(state.policyVersionId).toBe('pv_latest')
    expect(syncService.pushWithDedup).toHaveBeenLastCalledWith(
      'checkin',
      'checkin',
      expect.objectContaining({
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_after_checkin',
        lockReason: 'strategy_changed_after_checkin'
      })
    )
  })

  test('编辑策略后取消打卡，重算为 strategy_changed_without_checkin', async () => {
    mockStorage.dailyStates.push({
      stateId: 'state1',
      userHabitId: 'uh1',
      habitId: '20',
      date: '2026-06-02',
      status: 'checked',
      hasPolicyChangedToday: true,
      lockedReason: 'strategy_changed_after_checkin'
    })

    const state = await checkinService.undoCheckin('uh1', '2026-06-02')

    expect(state.status).toBe('canceled')
    expect(state.hasPolicyChangedToday).toBe(true)
    expect(state.lockedReason).toBe('strategy_changed_without_checkin')
    expect(state.lockReason).toBe('strategy_changed_without_checkin')
    expect(state.policyVersionId).toBe('pv_latest')
    expect(syncService.pushWithDedup).toHaveBeenLastCalledWith(
      'checkin',
      'undoCheckin',
      expect.objectContaining({
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin',
        lockReason: 'strategy_changed_without_checkin'
      })
    )
  })
})
