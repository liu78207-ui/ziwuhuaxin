describe('cacheService.clearLocalUserCacheAndRecover', () => {
  const servicePath = '../../miniprogram/services/cacheService'

  function loadServiceWithMocks(overrides = {}) {
    jest.resetModules()
    const calls = []
    const syncService = {
      recoverOrSync: jest.fn(async () => {
        calls.push('recoverOrSync')
        return { success: true }
      }),
      bootstrapCloudData: jest.fn(async () => {
        calls.push('bootstrapCloudData')
        return { success: true, restored: true }
      }),
      ...overrides.syncService
    }
    const storageService = {
      clearUserDataCache: jest.fn(() => {
        calls.push('clearUserDataCache')
        return { success: true, removedKeys: ['MyHabits'], failedKeys: [] }
      }),
      ...overrides.storageService
    }
    const userService = {
      login: jest.fn(async () => {
        calls.push('login')
        return { userId: 'user_1' }
      }),
      ...overrides.userService
    }
    const eventBus = {
      emit: jest.fn((eventName) => {
        calls.push(`emit:${eventName}`)
      }),
      ...overrides.eventBus
    }

    jest.doMock('../../miniprogram/services/syncService', () => syncService)
    jest.doMock('../../miniprogram/services/storageService', () => storageService)
    jest.doMock('../../miniprogram/services/userService', () => userService)
    jest.doMock('../../miniprogram/services/eventBus', () => eventBus)

    return {
      cacheService: require(servicePath),
      calls,
      syncService,
      storageService,
      userService,
      eventBus
    }
  }

  test('按顺序同步、清理、发事件、登录并恢复云端数据', async () => {
    const { cacheService, calls, syncService, eventBus } = loadServiceWithMocks()

    const result = await cacheService.clearLocalUserCacheAndRecover({ dailyStateDays: 30 })

    expect(result).toEqual({
      success: true,
      cleared: true,
      restored: true,
      failedKeys: [],
      recoveryError: ''
    })
    expect(calls).toEqual([
      'recoverOrSync',
      'clearUserDataCache',
      'emit:cache:invalidated',
      'login',
      'bootstrapCloudData'
    ])
    expect(eventBus.emit).toHaveBeenCalledWith('cache:invalidated', expect.objectContaining({
      scope: 'userData',
      source: 'profile.clearCache'
    }))
    expect(syncService.bootstrapCloudData).toHaveBeenCalledWith({ dailyStateDays: 30 })
  })

  test('清理部分 key 失败时不继续登录和恢复', async () => {
    const storageService = {
      clearUserDataCache: jest.fn(() => ({
        success: false,
        removedKeys: ['MyHabits'],
        failedKeys: ['dailyCheckinStates']
      }))
    }
    const { cacheService, userService, syncService } = loadServiceWithMocks({ storageService })

    const result = await cacheService.clearLocalUserCacheAndRecover()

    expect(result.success).toBe(false)
    expect(result.cleared).toBe(false)
    expect(result.failedKeys).toEqual(['dailyCheckinStates'])
    expect(userService.login).not.toHaveBeenCalled()
    expect(syncService.bootstrapCloudData).not.toHaveBeenCalled()
  })

  test('recoverData 失败时仍返回已清理，并带 recoveryError', async () => {
    const syncService = {
      recoverOrSync: jest.fn(async () => ({ success: true })),
      bootstrapCloudData: jest.fn(async () => ({
        success: false,
        restored: false,
        error: 'recoverData 云函数返回失败'
      }))
    }
    const { cacheService } = loadServiceWithMocks({ syncService })

    const result = await cacheService.clearLocalUserCacheAndRecover()

    expect(result.success).toBe(true)
    expect(result.cleared).toBe(true)
    expect(result.restored).toBe(false)
    expect(result.recoveryError).toBe('recoverData 云函数返回失败')
  })
})
