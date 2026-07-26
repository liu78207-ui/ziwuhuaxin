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

describe('storageService recovery staging', () => {
  let storage

  beforeEach(() => {
    jest.resetModules()
    storage = {
      MyHabits: [{ userHabitId: 'uh_local' }],
      policyVersions: [{ policyVersionId: 'pv_local' }],
      dailyCheckinStates: [{ userHabitId: 'uh_local', date: '2026-07-01' }],
      pendingOperations: [{ queueId: 'q_keep', status: 'synced' }]
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

  test('commits a validated snapshot without clearing pending operations', () => {
    const storageService = require('../../miniprogram/services/storageService')
    const snapshot = {
      userHabits: [{ userHabitId: 'uh_cloud' }],
      policyVersions: [{ policyVersionId: 'pv_cloud' }],
      dailyStates: [{ userHabitId: 'uh_cloud', date: '2026-07-22' }]
    }

    expect(storageService.stageRecoverySnapshot(snapshot)).toBe(true)
    expect(storageService.commitRecoverySnapshot()).toEqual({ success: true })
    expect(storage.MyHabits).toEqual(snapshot.userHabits)
    expect(storage.policyVersions).toEqual(snapshot.policyVersions)
    expect(storage.dailyCheckinStates).toEqual(snapshot.dailyStates)
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_keep', status: 'synced' }])
    expect(storage.recoveryStaging).toBeUndefined()
  })

  test('rolls back the three core caches when a staged commit fails', () => {
    const storageService = require('../../miniprogram/services/storageService')
    const snapshot = {
      userHabits: [{ userHabitId: 'uh_cloud' }],
      policyVersions: [{ policyVersionId: 'pv_cloud' }],
      dailyStates: [{ userHabitId: 'uh_cloud', date: '2026-07-22' }]
    }
    storageService.stageRecoverySnapshot(snapshot)
    let failed = false
    wx.setStorageSync.mockImplementation((key, value) => {
      if (key === 'dailyCheckinStates' && !failed) {
        failed = true
        throw new Error('quota exceeded')
      }
      storage[key] = value
    })

    const result = storageService.commitRecoverySnapshot()

    expect(result).toMatchObject({
      success: false,
      reason: 'RECOVERY_COMMIT_FAILED',
      failedKey: 'dailyCheckinStates'
    })
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_local' }])
    expect(storage.dailyCheckinStates).toEqual([{ userHabitId: 'uh_local', date: '2026-07-01' }])
  })

  test('safe cache replacement preserves login while removing only confirmed queue data', () => {
    const storageService = require('../../miniprogram/services/storageService')
    const userInfo = { _userId: 'user_1', createdAt: '2026-01-01', nickName: '用户' }
    storage.userInfo = userInfo
    storage.CheckinLogs = [{ legacy: true }]
    const snapshot = {
      userHabits: [{ userHabitId: 'uh_cloud' }],
      policyVersions: [{ policyVersionId: 'pv_cloud', userHabitId: 'uh_cloud' }],
      dailyStates: [{ userHabitId: 'uh_cloud', date: '2026-07-22' }]
    }

    expect(storageService.stageRecoverySnapshot(snapshot)).toBe(true)
    const result = storageService.replaceUserDataCacheFromRecoverySnapshot()

    expect(result).toMatchObject({ success: true, cleared: true, failedKeys: [] })
    expect(storage.userInfo).toEqual(userInfo)
    expect(storage.MyHabits).toEqual(snapshot.userHabits)
    expect(storage.policyVersions).toEqual(snapshot.policyVersions)
    expect(storage.dailyCheckinStates).toEqual(snapshot.dailyStates)
    expect(storage.pendingOperations).toBeUndefined()
    expect(storage.CheckinLogs).toBeUndefined()
    expect(storage.recoveryStaging).toBeUndefined()
  })
})

describe('storageService cache identity binding', () => {
  let storage

  beforeEach(() => {
    jest.resetModules()
    storage = {}
    wx.getStorageSync = jest.fn(key => storage[key])
    wx.setStorageSync = jest.fn((key, value) => {
      storage[key] = value
    })
    wx.removeStorageSync = jest.fn(key => {
      delete storage[key]
    })
    wx.getStorageInfoSync = jest.fn(() => ({ keys: Object.keys(storage) }))
  })

  test('claims an unowned legacy queue only after identity is confirmed', () => {
    storage.pendingOperations = [{
      queueId: 'q_legacy',
      operationId: 'op_legacy',
      idempotencyKey: 'idem_legacy',
      status: 'pending'
    }]
    const storageService = require('../../miniprogram/services/storageService')

    const result = storageService.bindCacheIdentity('user_1', 'test')

    expect(result).toMatchObject({ success: true, mismatch: false })
    expect(storage.pendingOperations[0]).toEqual(expect.objectContaining({
      ownerUserId: 'user_1',
      runtimeEnv: 'test',
      operationId: 'op_legacy',
      idempotencyKey: 'idem_legacy'
    }))
    expect(storage.cacheMeta).toEqual(expect.objectContaining({
      ownerUserId: 'user_1',
      runtimeEnv: 'test',
      cacheVersion: 2,
      migrationVersion: 2
    }))
  })

  test('quarantines pending and clears user data when account identity changes', () => {
    storage.cacheMeta = { ownerUserId: 'old_user', runtimeEnv: 'test' }
    storage.userInfo = { _userId: 'old_user', createdAt: '2026-01-01' }
    storage.MyHabits = [{ userHabitId: 'uh_old' }]
    storage.pendingOperations = [{
      queueId: 'q_old',
      ownerUserId: 'old_user',
      runtimeEnv: 'test',
      operationId: 'op_old',
      idempotencyKey: 'idem_old',
      status: 'pending'
    }]
    const storageService = require('../../miniprogram/services/storageService')

    const result = storageService.bindCacheIdentity('new_user', 'test')

    expect(result).toMatchObject({
      success: true,
      mismatch: true,
      quarantinedCount: 1
    })
    expect(storage.MyHabits).toBeUndefined()
    expect(storage.pendingOperations).toBeUndefined()
    expect(storage.pendingOperationsQuarantine[0]).toEqual(expect.objectContaining({
      queueId: 'q_old',
      quarantineReason: 'CACHE_IDENTITY_MISMATCH'
    }))
    expect(storage.cacheMeta).toEqual(expect.objectContaining({
      ownerUserId: 'new_user',
      runtimeEnv: 'test'
    }))
  })
})
