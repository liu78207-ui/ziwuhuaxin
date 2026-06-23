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
