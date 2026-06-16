describe('syncService recoverFromCloud', () => {
  let syncService
  let eventBus
  let storage = {}

  beforeEach(() => {
    jest.resetModules()
    storage = {}

    wx.getStorageSync.mockImplementation((key) => storage[key])
    wx.setStorageSync.mockImplementation((key, value) => {
      storage[key] = value
    })
    wx.cloud.callFunction.mockReset()

    eventBus = require('../../../miniprogram/services/eventBus')
    eventBus.clear()
    syncService = require('../../../miniprogram/services/syncService')
  })

  test('falls back to syncLocalData when recoverData cloud function is not deployed', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('cloud.callFunction:fail Error: errCode: -501000 | errMsg: FunctionName parameter could not be found.'))
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            MyHabits: [{ habitId: 'h_001', name: 'Test Habit' }],
            CheckinLogs: [{ habitId: 'h_001', date: '2026-05-31' }],
            AllHabitsInfo: { h_001: { habitId: 'h_001', name: 'Test Habit' } }
          }
        }
      })

    await expect(syncService.recoverFromCloud()).resolves.toEqual({
      success: true,
      source: 'syncLocalData',
      restored: true
    })

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(2, {
      name: 'syncLocalData',
      data: {}
    })
    expect(storage.MyHabits).toEqual([{ habitId: 'h_001', name: 'Test Habit' }])
    expect(storage.CheckinLogs).toEqual([{ habitId: 'h_001', date: '2026-05-31' }])
    expect(storage.AllHabitsInfo).toEqual({ h_001: { habitId: 'h_001', name: 'Test Habit' } })
  })

  test('falls back to syncLocalData when recoverData times out', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            MyHabits: [{ habitId: 'h_002', name: 'Recovered Habit' }],
            CheckinLogs: [{ habitId: 'h_002', date: '2026-05-31' }]
          }
        }
      })

    await expect(syncService.recoverFromCloud()).resolves.toEqual({
      success: true,
      source: 'syncLocalData',
      restored: true
    })

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(2, {
      name: 'syncLocalData',
      data: {}
    })
    expect(storage.MyHabits).toEqual([{ habitId: 'h_002', name: 'Recovered Habit' }])
    expect(storage.CheckinLogs).toEqual([{ habitId: 'h_002', date: '2026-05-31' }])
  })

  test('falls back to syncLocalData when recoverData target collections are not created yet', async () => {
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: false,
          code: 'CLOUD_ERROR',
          message: 'collection.get:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: user_habits.'
        }
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            MyHabits: [{ habitId: 'h_003', name: 'Legacy Habit' }],
            CheckinLogs: [{ habitId: 'h_003', date: '2026-05-31' }]
          }
        }
      })

    await expect(syncService.recoverFromCloud()).resolves.toEqual({
      success: true,
      source: 'syncLocalData',
      restored: true
    })

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(2, {
      name: 'syncLocalData',
      data: {}
    })
    expect(storage.MyHabits).toEqual([{ habitId: 'h_003', name: 'Legacy Habit' }])
    expect(storage.CheckinLogs).toEqual([{ habitId: 'h_003', date: '2026-05-31' }])
  })

  test('returns a non-blocking failure when both recovery functions time out', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).resolves.toEqual({
      success: false,
      source: 'none',
      error: {
        code: 'TIMEOUT',
        message: 'timeout'
      }
    })

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(2, {
      name: 'syncLocalData',
      data: {}
    })
  })

  test('persists migrated V1 user habits using title and duration fields', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [{
            userHabitId: 'uh_001',
            habitId: 'h_001',
            title: '八段锦',
            category: '运动类',
            duration: 15,
            status: 'active',
            latestPolicyVersionId: 'pv_001'
          }],
          policyVersions: [{ policyVersionId: 'pv_001', userHabitId: 'uh_001' }],
          dailyStates: [{ stateId: 'ds_001', userHabitId: 'uh_001', date: '2026-05-31' }]
        }
      }
    })

    await expect(syncService.recoverFromCloud()).resolves.toEqual({
      success: true,
      source: 'recoverData',
      restored: true
    })

    expect(storage.MyHabits).toEqual([expect.objectContaining({
      userHabitId: 'uh_001',
      habitId: 'h_001',
      name: '八段锦',
      targetMinutes: 15,
      latestPolicyVersionId: 'pv_001'
    })])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_001', userHabitId: 'uh_001' }])
    expect(storage.dailyCheckinStates).toEqual([{ stateId: 'ds_001', userHabitId: 'uh_001', date: '2026-05-31' }])
  })

  test('bootstrapCloudData recovers empty local cache and emits recovery event', async () => {
    const recoveredHandler = jest.fn()
    eventBus.on('sync:recovered', recoveredHandler)
    storage.MyHabits = []
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [{
            userHabitId: 'uh_bootstrap',
            habitId: '1',
            title: '金刚功',
            status: 'active',
            latestPolicyVersionId: 'pv_bootstrap'
          }],
          policyVersions: [{ policyVersionId: 'pv_bootstrap', userHabitId: 'uh_bootstrap' }],
          dailyStates: [{ stateId: 'ds_bootstrap', userHabitId: 'uh_bootstrap', date: '2026-06-16' }]
        }
      }
    })

    await expect(syncService.bootstrapCloudData()).resolves.toEqual({
      success: true,
      source: 'recoverData',
      restored: true,
      skipped: false,
      error: undefined
    })

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(storage.MyHabits).toEqual([expect.objectContaining({
      userHabitId: 'uh_bootstrap',
      habitId: '1',
      name: '金刚功'
    })])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_bootstrap', userHabitId: 'uh_bootstrap' }])
    expect(storage.dailyCheckinStates).toEqual([{ stateId: 'ds_bootstrap', userHabitId: 'uh_bootstrap', date: '2026-06-16' }])
    expect(recoveredHandler).toHaveBeenCalledWith({
      source: 'recoverData',
      restored: true
    })
  })

  test('bootstrapCloudData skips recovery when local habits exist', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]

    await expect(syncService.bootstrapCloudData()).resolves.toEqual({
      success: true,
      source: 'localCache',
      restored: false,
      skipped: true
    })

    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
  })

  test('recoverOrSync skips network probing when pending queue is empty', async () => {
    storage.pendingOperations = []
    wx.getNetworkType = jest.fn()

    await syncService.recoverOrSync()

    expect(wx.getNetworkType).not.toHaveBeenCalled()
    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
  })

  test('processQueue emits sync:updated after successful pending sync', async () => {
    const updatedHandler = jest.fn()
    eventBus.on('sync:updated', updatedHandler)
    storage.pendingOperations = [{
      queueId: 'q_emit',
      entityType: 'checkin',
      action: 'checkin',
      payload: { userHabitId: 'uh_emit', date: '2026-06-01' },
      idempotencyKey: 'idem_emit',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-06-01T00:00:00.000Z'
    }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { success: true }
    })

    await syncService.processQueue()

    expect(updatedHandler).toHaveBeenCalledWith({
      syncedCount: 1,
      source: 'processQueue'
    })
  })

  test('recoverOrSync checks network when pending queue has work', async () => {
    storage.pendingOperations = [{
      queueId: 'q_001',
      entityType: 'checkin',
      action: 'checkin',
      payload: { userHabitId: 'uh_001', date: '2026-06-01' },
      idempotencyKey: 'idem_001',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-06-01T00:00:00.000Z'
    }]
    wx.getNetworkType = jest.fn(({ success }) => success({ networkType: 'wifi' }))
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { success: true }
    })

    await syncService.recoverOrSync()

    expect(wx.getNetworkType).toHaveBeenCalled()
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'syncCheckin',
      data: expect.objectContaining({
        userHabitId: 'uh_001',
        action: 'checkin',
        idempotencyKey: 'idem_001'
      })
    })
  })

  test('processQueue passes queue action to syncHabit payloads', async () => {
    storage.pendingOperations = [{
      queueId: 'q_habit_add',
      entityType: 'habit',
      action: 'addHabit',
      payload: {
        userHabitId: 'uh_habit_add',
        habitId: '20',
        policyVersionId: 'pv_habit_add',
        duration: 10,
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-16'
      },
      idempotencyKey: 'idem_habit_add',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-06-16T00:00:00.000Z'
    }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { success: true }
    })

    await syncService.processQueue()

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'syncHabit',
      data: expect.objectContaining({
        action: 'addHabit',
        userHabitId: 'uh_habit_add',
        habitId: '20',
        policyVersionId: 'pv_habit_add',
        idempotencyKey: 'idem_habit_add'
      })
    })
    expect(storage.pendingOperations[0].status).toBe('synced')
  })

  test('pushWithDedup reuses existing active item with the same idempotencyKey', () => {
    storage.pendingOperations = []

    const first = syncService.pushWithDedup('checkin', 'checkin', {
      userHabitId: 'uh_dedup',
      date: '2026-06-01',
      operationId: 'op_dedup',
      idempotencyKey: 'idem_dedup'
    })
    const second = syncService.pushWithDedup('checkin', 'checkin', {
      userHabitId: 'uh_dedup',
      date: '2026-06-01',
      operationId: 'op_dedup_again',
      idempotencyKey: 'idem_dedup'
    })

    expect(first.success).toBe(true)
    expect(second).toEqual({
      success: false,
      reason: 'DUPLICATE_PENDING',
      queueId: first.queueId
    })
    expect(storage.pendingOperations).toHaveLength(1)
    expect(storage.pendingOperations[0]).toEqual(expect.objectContaining({
      queueId: first.queueId,
      operationId: 'op_dedup',
      idempotencyKey: 'idem_dedup',
      status: 'pending'
    }))
  })

  test('hasDuplicatePending treats pending syncing and retrying as active duplicates', () => {
    storage.pendingOperations = [
      {
        queueId: 'q_pending',
        entityType: 'checkin',
        entityId: 'uh_001',
        action: 'checkin',
        status: 'pending'
      },
      {
        queueId: 'q_synced',
        entityType: 'checkin',
        entityId: 'uh_002',
        action: 'checkin',
        status: 'synced'
      }
    ]

    expect(syncService.hasDuplicatePending('checkin', 'uh_001', 'checkin')).toBe(true)
    expect(syncService.hasDuplicatePending('checkin', 'uh_002', 'checkin')).toBe(false)

    storage.pendingOperations[0].status = 'syncing'
    expect(syncService.hasDuplicatePending('checkin', 'uh_001', 'checkin')).toBe(true)

    storage.pendingOperations[0].status = 'retrying'
    expect(syncService.hasDuplicatePending('checkin', 'uh_001', 'checkin')).toBe(true)
  })

  test('processQueue marks retryable failures as retrying before final failed state', async () => {
    storage.pendingOperations = [{
      queueId: 'q_retry',
      entityType: 'checkin',
      action: 'checkin',
      payload: { userHabitId: 'uh_retry', date: '2026-06-01' },
      idempotencyKey: 'idem_retry',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: false,
        error: { message: 'network down' }
      }
    })

    await syncService.processQueue()

    expect(storage.pendingOperations).toHaveLength(1)
    expect(storage.pendingOperations[0]).toEqual(expect.objectContaining({
      queueId: 'q_retry',
      status: 'retrying',
      retryCount: 1,
      lastError: 'network down'
    }))
    expect(storage.pendingOperations[0].nextRetryAt).toBeTruthy()
  })

  test('retry resets an eligible failed item to pending and processes it', async () => {
    storage.pendingOperations = [{
      queueId: 'q_retry_success',
      entityType: 'checkin',
      action: 'checkin',
      payload: {
        userHabitId: 'uh_retry_success',
        date: '2026-06-01',
        operationId: 'op_retry_success'
      },
      operationId: 'op_retry_success',
      idempotencyKey: 'idem_retry_success',
      status: 'failed',
      retryCount: 2,
      nextRetryAt: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { success: true }
    })

    await syncService.retry('q_retry_success')

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'syncCheckin',
      data: expect.objectContaining({
        operationId: 'op_retry_success',
        idempotencyKey: 'idem_retry_success'
      })
    })
    expect(storage.pendingOperations[0]).toEqual(expect.objectContaining({
      queueId: 'q_retry_success',
      status: 'synced',
      retryCount: 2,
      lastError: null
    }))
  })

  test('retry rejects missing or exhausted queue items without processing', async () => {
    storage.pendingOperations = [{
      queueId: 'q_exhausted',
      entityType: 'checkin',
      action: 'checkin',
      payload: { userHabitId: 'uh_exhausted', date: '2026-06-01' },
      idempotencyKey: 'idem_exhausted',
      status: 'failed',
      retryCount: 3,
      createdAt: '2026-06-01T00:00:00.000Z'
    }]

    await expect(syncService.retry('missing')).resolves.toEqual({
      success: false,
      error: 'NOT_FOUND'
    })
    await expect(syncService.retry('q_exhausted')).resolves.toEqual({
      success: false,
      error: 'MAX_RETRIES_EXCEEDED'
    })
    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
  })

  test('needsLocalRecovery returns true only when local habits are empty', () => {
    storage.MyHabits = []
    storage.policyVersions = [{ policyVersionId: 'pv_existing' }]
    expect(syncService.needsLocalRecovery()).toBe(true)

    storage.MyHabits = [{ userHabitId: 'uh_existing' }]
    expect(syncService.needsLocalRecovery()).toBe(false)
  })
})
