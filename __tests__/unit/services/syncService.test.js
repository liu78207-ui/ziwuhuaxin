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

  test('does not fall back to syncLocalData when recoverData cloud function is not deployed', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('cloud.callFunction:fail Error: errCode: -501000 | errMsg: FunctionName parameter could not be found.'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('FunctionName parameter could not be found')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
    expect(storage.MyHabits).toBeUndefined()
    expect(storage.CheckinLogs).toBeUndefined()
  })

  test('does not fall back to syncLocalData when recoverData times out', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('timeout')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('does not fall back to syncLocalData when recoverData target collections are not created yet', async () => {
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: false,
          code: 'CLOUD_ERROR',
          message: 'collection.get:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: user_habits.'
        }
      })

    await expect(syncService.recoverFromCloud()).rejects.toThrow('collection not exists')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
    expect(storage.MyHabits).toBeUndefined()
    expect(storage.CheckinLogs).toBeUndefined()
  })

  test('bootstrapCloudData returns a non-blocking failure when recoverData times out', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.bootstrapCloudData()).resolves.toEqual({
      success: false,
      source: 'none',
      restored: false,
      skipped: false,
      error: 'timeout'
    })

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('recoverFromCloud throws when recoverData fails', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('timeout')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, {
      name: 'recoverData',
      data: { dailyStateDays: 90 }
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('persists recovered V1 user habits using canonical fields', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [{
            userHabitId: 'uh_001',
            habitId: '3',
            name: '八段锦',
            category: '运动类',
            targetMinutes: 15,
            status: 'active',
            addedAt: '2026-05-31T08:00:00.000Z',
            pinnedAt: '2026-06-01T08:00:00.000Z'
          }],
          policyVersions: [{ policyVersionId: 'pv_001', userHabitId: 'uh_001', effectiveEndDate: null }],
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
      habitId: '3',
      name: '八段锦',
      targetMinutes: 15,
      addedAt: '2026-05-31T08:00:00.000Z',
      pinnedAt: '2026-06-01T08:00:00.000Z',
      latestPolicyVersionId: 'pv_001'
    })])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_001', userHabitId: 'uh_001', effectiveEndDate: null }])
    expect(storage.dailyCheckinStates).toEqual([{ stateId: 'ds_001', userHabitId: 'uh_001', date: '2026-05-31' }])
  })

  test('recoverFromCloud writes recovered habits in stable added order', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [
            {
              userHabitId: 'uh_new',
              habitId: '20',
              name: '八段锦',
              status: 'active',
              createdAt: '2026-05-12',
              addedAt: '2026-05-12T09:00:00.000Z'
            },
            {
              userHabitId: 'uh_3_1778572800000_wxyz',
              habitId: '3',
              name: '揉腹',
              status: 'active',
              createdAt: '2026-05-12'
            }
          ],
          policyVersions: [],
          dailyStates: []
        }
      }
    })

    await syncService.recoverFromCloud()

    expect(storage.MyHabits.map(habit => habit.userHabitId)).toEqual([
      'uh_3_1778572800000_wxyz',
      'uh_new'
    ])
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
            name: '金刚功',
            status: 'active'
          }],
          policyVersions: [{ policyVersionId: 'pv_bootstrap', userHabitId: 'uh_bootstrap', effectiveEndDate: null }],
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
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_bootstrap', userHabitId: 'uh_bootstrap', effectiveEndDate: null }])
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
        addedAt: '2026-06-16T08:00:00.000Z',
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
        addedAt: '2026-06-16T08:00:00.000Z',
        idempotencyKey: 'idem_habit_add'
      })
    })
    expect(storage.pendingOperations[0].status).toBe('synced')
  })

  test('processQueue syncs pinnedAt updates through syncHabit', async () => {
    storage.pendingOperations = [{
      queueId: 'q_habit_pin',
      entityType: 'habit',
      action: 'updatePinned',
      payload: {
        userHabitId: 'uh_habit_pin',
        habitId: '20',
        pinnedAt: '2026-06-01T08:00:00.000Z'
      },
      idempotencyKey: 'idem_habit_pin',
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
        action: 'updatePinned',
        userHabitId: 'uh_habit_pin',
        habitId: '20',
        pinnedAt: '2026-06-01T08:00:00.000Z',
        idempotencyKey: 'idem_habit_pin'
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
