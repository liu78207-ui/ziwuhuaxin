describe('cacheService.clearLocalUserCacheAndRecover', () => {
  const servicePath = '../../miniprogram/services/cacheService'
  const snapshot = {
    userHabits: [{ userHabitId: 'uh_1' }],
    policyVersions: [{ policyVersionId: 'pv_1' }],
    dailyStates: [{ userHabitId: 'uh_1', date: '2026-07-01' }]
  }

  function loadServiceWithMocks(overrides = {}) {
    jest.resetModules()
    const calls = []
    const syncService = {
      recoverOrSync: jest.fn(async () => {
        calls.push('recoverOrSync')
        return { success: true, summary: { allSynced: true, unsyncedCount: 0 } }
      }),
      retryAllFailed: jest.fn(async () => {
        calls.push('retryAllFailed')
        return { success: true, retriedCount: 0, summary: { allSynced: true, unsyncedCount: 0 } }
      }),
      fetchRecoverySnapshot: jest.fn(async () => {
        calls.push('fetchRecoverySnapshot')
        return snapshot
      }),
      getSyncSummary: jest.fn(() => ({ allSynced: true, unsyncedCount: 0 })),
      ...overrides.syncService
    }
    const storageService = {
      stageRecoverySnapshot: jest.fn(() => {
        calls.push('stageRecoverySnapshot')
        return true
      }),
      replaceUserDataCacheFromRecoverySnapshot: jest.fn(() => {
        calls.push('replaceUserDataCacheFromRecoverySnapshot')
        return { success: true, cleared: true, removedKeys: ['MyHabits'], failedKeys: [] }
      }),
      discardRecoverySnapshot: jest.fn(() => {
        calls.push('discardRecoverySnapshot')
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

  test('先确认同步并预取全量快照，再原子替换缓存', async () => {
    const { cacheService, calls, syncService, eventBus } = loadServiceWithMocks()

    const result = await cacheService.clearLocalUserCacheAndRecover({ historyScope: 'all' })

    expect(result).toEqual({
      success: true,
      cleared: true,
      restored: true,
      restoreSource: 'recoverData',
      blocked: false,
      blockedReason: '',
      failedKeys: [],
      recoveryError: ''
    })
    expect(calls).toEqual([
      'recoverOrSync',
      'fetchRecoverySnapshot',
      'stageRecoverySnapshot',
      'replaceUserDataCacheFromRecoverySnapshot',
      'emit:cache:invalidated'
    ])
    expect(syncService.fetchRecoverySnapshot).toHaveBeenCalledWith({ historyScope: 'all' })
    expect(eventBus.emit).toHaveBeenCalledWith('cache:invalidated', expect.objectContaining({
      scope: 'userData',
      source: 'profile.clearCache'
    }))
  })

  test('存在未同步操作时阻止清理且不读取恢复快照', async () => {
    const syncSummary = { allSynced: false, unsyncedCount: 2, failed: 1, retrying: 1 }
    const { cacheService, syncService, storageService, userService } = loadServiceWithMocks({
      syncService: {
        recoverOrSync: jest.fn(async () => ({
          success: false,
          reason: 'UNSYNCED_OPERATIONS_REMAIN',
          summary: syncSummary
        }))
      }
    })

    const result = await cacheService.clearLocalUserCacheAndRecover({ historyScope: 'all' })

    expect(result).toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      blocked: true,
      blockedReason: 'UNSYNCED_OPERATIONS_REMAIN',
      syncSummary
    })
    expect(syncService.fetchRecoverySnapshot).not.toHaveBeenCalled()
    expect(storageService.stageRecoverySnapshot).not.toHaveBeenCalled()
    expect(userService.login).not.toHaveBeenCalled()
  })

  test('清缓存确认会显式重试 failed，成功后再继续同步与恢复', async () => {
    const summaries = [
      { allSynced: false, unsyncedCount: 1, failed: 1 },
      { allSynced: true, unsyncedCount: 0, failed: 0 }
    ]
    const { cacheService, calls, syncService } = loadServiceWithMocks({
      syncService: {
        getSyncSummary: jest.fn()
          .mockReturnValueOnce(summaries[0])
          .mockReturnValue(summaries[1]),
        retryAllFailed: jest.fn(async () => {
          calls.push('retryAllFailed')
          return { success: true, retriedCount: 1, summary: summaries[1] }
        })
      }
    })

    const result = await cacheService.clearLocalUserCacheAndRecover({ historyScope: 'all' })

    expect(result).toMatchObject({
      success: true,
      cleared: true,
      restored: true,
      blocked: false
    })
    expect(syncService.retryAllFailed).toHaveBeenCalledTimes(1)
    expect(calls.slice(0, 3)).toEqual([
      'retryAllFailed',
      'recoverOrSync',
      'fetchRecoverySnapshot'
    ])
  })

  test('清缓存显式重试 failed 仍失败时保留缓存并返回同步摘要', async () => {
    const failedSummary = { allSynced: false, unsyncedCount: 1, failed: 1 }
    const { cacheService, syncService, storageService } = loadServiceWithMocks({
      syncService: {
        getSyncSummary: jest.fn(() => failedSummary),
        retryAllFailed: jest.fn(async () => ({
          success: false,
          retriedCount: 1,
          summary: failedSummary
        })),
        recoverOrSync: jest.fn(async () => ({
          success: false,
          reason: 'UNSYNCED_OPERATIONS_REMAIN',
          summary: failedSummary
        }))
      }
    })

    const result = await cacheService.clearLocalUserCacheAndRecover({ historyScope: 'all' })

    expect(result).toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      blocked: true,
      syncSummary: failedSummary
    })
    expect(syncService.retryAllFailed).toHaveBeenCalledTimes(1)
    expect(syncService.fetchRecoverySnapshot).not.toHaveBeenCalled()
    expect(storageService.stageRecoverySnapshot).not.toHaveBeenCalled()
  })

  test('云端预恢复失败时保留原缓存', async () => {
    const { cacheService, storageService, eventBus } = loadServiceWithMocks({
      syncService: {
        fetchRecoverySnapshot: jest.fn(async () => {
          throw new Error('recoverData timeout')
        })
      }
    })

    const result = await cacheService.clearLocalUserCacheAndRecover({ historyScope: 'all' })

    expect(result).toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      blocked: false,
      recoveryError: 'recoverData timeout'
    })
    expect(storageService.replaceUserDataCacheFromRecoverySnapshot).not.toHaveBeenCalled()
    expect(storageService.discardRecoverySnapshot).toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  test('快照替换失败时返回失败键且不宣布缓存失效', async () => {
    const { cacheService, userService, eventBus } = loadServiceWithMocks({
      storageService: {
        stageRecoverySnapshot: jest.fn(() => true),
        replaceUserDataCacheFromRecoverySnapshot: jest.fn(() => ({
          success: false,
          cleared: false,
          reason: 'RECOVERY_REPLACE_FAILED',
          failedKeys: ['dailyCheckinStates']
        })),
        discardRecoverySnapshot: jest.fn()
      }
    })

    const result = await cacheService.clearLocalUserCacheAndRecover()

    expect(result).toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      failedKeys: ['dailyCheckinStates'],
      recoveryError: 'RECOVERY_REPLACE_FAILED'
    })
    expect(userService.login).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})
