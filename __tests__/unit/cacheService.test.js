describe('cacheService.clearLocalUserCacheAndRecover', () => {
  const servicePath = '../../miniprogram/services/cacheService'
  const snapshot = {
    userHabits: [{ userHabitId: 'uh_1' }],
    policyVersions: [{ policyVersionId: 'pv_1', userHabitId: 'uh_1' }],
    dailyStates: [{ userHabitId: 'uh_1', date: '2026-07-01', status: 'checked' }]
  }

  function loadServiceWithMocks(overrides = {}) {
    jest.resetModules()
    const calls = []
    const syncedSummary = {
      total: 0,
      pending: 0,
      syncing: 0,
      retrying: 0,
      failed: 0,
      synced: 0,
      unsyncedCount: 0,
      allSynced: true
    }
    const syncService = {
      recoverOrSync: jest.fn(async () => {
        calls.push('recoverOrSync')
        return { success: true, summary: syncedSummary }
      }),
      getSyncSummary: jest.fn(() => syncedSummary),
      fetchRecoverySnapshot: jest.fn(async () => {
        calls.push('fetchRecoverySnapshot')
        return snapshot
      }),
      ...overrides.syncService
    }
    const storageService = {
      stageRecoverySnapshot: jest.fn(() => {
        calls.push('stageRecoverySnapshot')
        return true
      }),
      replaceUserDataCacheFromRecoverySnapshot: jest.fn(() => {
        calls.push('replaceUserDataCacheFromRecoverySnapshot')
        return { success: true, cleared: true, removedKeys: ['CheckinLogs'], failedKeys: [] }
      }),
      discardRecoverySnapshot: jest.fn(() => {
        calls.push('discardRecoverySnapshot')
      }),
      ...overrides.storageService
    }
    const eventBus = {
      emit: jest.fn(eventName => {
        calls.push(`emit:${eventName}`)
      }),
      ...overrides.eventBus
    }

    jest.doMock('../../miniprogram/services/syncService', () => syncService)
    jest.doMock('../../miniprogram/services/storageService', () => storageService)
    jest.doMock('../../miniprogram/services/eventBus', () => eventBus)

    return {
      cacheService: require(servicePath),
      calls,
      syncService,
      storageService,
      eventBus
    }
  }

  test('先同步并预取全量快照，再提交和清理 legacy 缓存', async () => {
    const { cacheService, calls, syncService, eventBus } = loadServiceWithMocks()

    await expect(cacheService.clearLocalUserCacheAndRecover()).resolves.toEqual({
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
    expect(syncService.fetchRecoverySnapshot).toHaveBeenCalledWith({
      historyScope: 'all',
      pageTimeoutMs: undefined
    })
    expect(eventBus.emit).toHaveBeenCalledWith('cache:invalidated', expect.objectContaining({
      scope: 'userData',
      source: 'profile.clearCache'
    }))
  })

  test('存在未同步操作时阻止清理并保留旧缓存', async () => {
    const summary = {
      total: 2,
      pending: 1,
      failed: 1,
      syncing: 0,
      retrying: 0,
      synced: 0,
      unsyncedCount: 2,
      allSynced: false
    }
    const { cacheService, syncService, storageService } = loadServiceWithMocks({
      syncService: {
        recoverOrSync: jest.fn(async () => ({
          success: false,
          reason: 'UNSYNCED_OPERATIONS_REMAIN',
          summary
        })),
        getSyncSummary: jest.fn(() => summary)
      }
    })

    await expect(cacheService.clearLocalUserCacheAndRecover()).resolves.toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      blocked: true,
      blockedReason: 'UNSYNCED_OPERATIONS_REMAIN',
      syncSummary: summary
    })
    expect(syncService.fetchRecoverySnapshot).not.toHaveBeenCalled()
    expect(storageService.stageRecoverySnapshot).not.toHaveBeenCalled()
  })

  test('云端分页恢复失败时不修改旧缓存', async () => {
    const { cacheService, storageService, eventBus } = loadServiceWithMocks({
      syncService: {
        fetchRecoverySnapshot: jest.fn(async () => {
          throw new Error('recoverData 分页请求超时，本地数据未修改')
        })
      }
    })

    await expect(cacheService.clearLocalUserCacheAndRecover()).resolves.toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      blocked: false,
      recoveryError: 'recoverData 分页请求超时，本地数据未修改'
    })
    expect(storageService.replaceUserDataCacheFromRecoverySnapshot).not.toHaveBeenCalled()
    expect(storageService.discardRecoverySnapshot).toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  test('暂存失败时不替换缓存', async () => {
    const { cacheService, storageService } = loadServiceWithMocks({
      storageService: {
        stageRecoverySnapshot: jest.fn(() => false)
      }
    })

    await expect(cacheService.clearLocalUserCacheAndRecover()).resolves.toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      recoveryError: '恢复快照暂存失败'
    })
    expect(storageService.replaceUserDataCacheFromRecoverySnapshot).not.toHaveBeenCalled()
  })

  test('快照提交失败时返回失败键且不宣布缓存失效', async () => {
    const { cacheService, eventBus } = loadServiceWithMocks({
      storageService: {
        replaceUserDataCacheFromRecoverySnapshot: jest.fn(() => ({
          success: false,
          cleared: false,
          reason: 'RECOVERY_COMMIT_FAILED',
          failedKeys: ['dailyCheckinStates']
        }))
      }
    })

    await expect(cacheService.clearLocalUserCacheAndRecover()).resolves.toMatchObject({
      success: false,
      cleared: false,
      restored: false,
      failedKeys: ['dailyCheckinStates'],
      recoveryError: 'RECOVERY_COMMIT_FAILED'
    })
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})
