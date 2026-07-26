describe('storageService.clearUserDataCache', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    wx.getStorageInfoSync = jest.fn(() => ({
      keys: [
        'MyHabits',
        'CheckinLogs_backup_phase3_1710000000000',
        'policyVersions_backup_phase3_1710000000001',
        'unrelatedKey'
      ]
    }))
    wx.removeStorageSync = jest.fn()
    wx.cloud.callFunction = jest.fn()
  })

  test('只删除治理白名单和 Phase 3 备份键，不调用云端能力', () => {
    const storageService = require('../../miniprogram/services/storageService')

    const result = storageService.clearUserDataCache()

    expect(result.success).toBe(true)
    expect(result.failedKeys).toEqual([])
    expect(wx.removeStorageSync).toHaveBeenCalledWith('MyHabits')
    expect(wx.removeStorageSync).toHaveBeenCalledWith('CheckinLogs')
    expect(wx.removeStorageSync).toHaveBeenCalledWith('userInfo')
    expect(wx.removeStorageSync).toHaveBeenCalledWith('pendingOperations')
    expect(wx.removeStorageSync).toHaveBeenCalledWith('CheckinLogs_backup_phase3_1710000000000')
    expect(wx.removeStorageSync).toHaveBeenCalledWith('policyVersions_backup_phase3_1710000000001')
    expect(wx.removeStorageSync).not.toHaveBeenCalledWith('unrelatedKey')
    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
  })

  test('删除部分 key 失败时返回 failedKeys', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    wx.removeStorageSync = jest.fn((key) => {
      if (key === 'dailyCheckinStates') {
        throw new Error('remove failed')
      }
    })
    const storageService = require('../../miniprogram/services/storageService')

    const result = storageService.clearUserDataCache()

    expect(result.success).toBe(false)
    expect(result.failedKeys).toContain('dailyCheckinStates')
    expect(result.removedKeys).toContain('MyHabits')
  })
})

describe('storageService recovery snapshot transaction', () => {
  let storage

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    storage = {
      MyHabits: [{ userHabitId: 'uh_old' }],
      policyVersions: [{ policyVersionId: 'pv_old', userHabitId: 'uh_old' }],
      dailyCheckinStates: [
        { userHabitId: 'uh_old', date: '2026-01-01', status: 'checked' }
      ],
      pendingOperations: [{ queueId: 'q_keep', status: 'synced' }],
      checkinOperations: [{ operationId: 'op_keep' }],
      clientSequenceCounter: 7,
      CheckinLogs: [{ legacy: true }]
    }
    wx.getStorageSync = jest.fn(key => storage[key])
    wx.setStorageSync = jest.fn((key, value) => {
      storage[key] = value
    })
    wx.removeStorageSync = jest.fn(key => {
      delete storage[key]
    })
    wx.getStorageInfoSync = jest.fn(() => ({ keys: Object.keys(storage) }))
  })

  function getSnapshot() {
    return {
      userHabits: [{ userHabitId: 'uh_new' }],
      policyVersions: [{ policyVersionId: 'pv_new', userHabitId: 'uh_new' }],
      dailyStates: [
        { userHabitId: 'uh_new', date: '2026-07-26', status: 'checked' }
      ]
    }
  }

  test('完整快照提交后才清理 legacy，并保留同步安全状态', () => {
    const storageService = require('../../miniprogram/services/storageService')

    expect(storageService.stageRecoverySnapshot(getSnapshot())).toBe(true)
    expect(storageService.replaceUserDataCacheFromRecoverySnapshot()).toMatchObject({
      success: true,
      cleared: true
    })

    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_new' }])
    expect(storage.policyVersions).toEqual([
      { policyVersionId: 'pv_new', userHabitId: 'uh_new' }
    ])
    expect(storage.dailyCheckinStates).toEqual([
      { userHabitId: 'uh_new', date: '2026-07-26', status: 'checked' }
    ])
    expect(storage.CheckinLogs).toBeUndefined()
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_keep', status: 'synced' }])
    expect(storage.checkinOperations).toEqual([{ operationId: 'op_keep' }])
    expect(storage.clientSequenceCounter).toBe(7)
    expect(storage.recoveryStaging).toBeUndefined()
    expect(storage.recoveryTransaction).toBeUndefined()
  })

  test('任一核心写入失败时回滚旧缓存', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    let failedOnce = false
    wx.setStorageSync = jest.fn((key, value) => {
      if (key === 'dailyCheckinStates' && !failedOnce) {
        failedOnce = true
        throw new Error('quota exceeded')
      }
      storage[key] = value
    })
    const storageService = require('../../miniprogram/services/storageService')

    expect(storageService.stageRecoverySnapshot(getSnapshot())).toBe(true)
    expect(storageService.commitRecoverySnapshot()).toMatchObject({
      success: false,
      reason: 'RECOVERY_COMMIT_FAILED',
      failedKey: 'dailyCheckinStates'
    })

    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_old' }])
    expect(storage.policyVersions).toEqual([
      { policyVersionId: 'pv_old', userHabitId: 'uh_old' }
    ])
    expect(storage.dailyCheckinStates).toEqual([
      { userHabitId: 'uh_old', date: '2026-01-01', status: 'checked' }
    ])
  })

  test('启动时完成被中断但已暂存的恢复事务', () => {
    const storageService = require('../../miniprogram/services/storageService')
    expect(storageService.stageRecoverySnapshot(getSnapshot())).toBe(true)

    const result = storageService.recoverInterruptedRecoveryTransaction()

    expect(result).toEqual({ success: true, recovered: true })
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_new' }])
    expect(storage.dailyCheckinStates).toHaveLength(1)
    expect(storage.recoveryTransaction).toBeUndefined()
  })
})
