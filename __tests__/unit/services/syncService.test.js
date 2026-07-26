describe('syncService recoverFromCloud', () => {
  let syncService
  let eventBus
  let storage = {}

  function expectedCloudCall(name, data) {
    const expectedData = data && typeof data.asymmetricMatch === 'function'
      ? expect.objectContaining({
        __runtimeEnv: 'test',
        __collectionPrefix: 'test_'
      })
      : expect.objectContaining({
        ...data,
        __runtimeEnv: 'test',
        __collectionPrefix: 'test_'
      })
    return expect.objectContaining({
      name,
      data: expectedData,
      config: {
        env: 'cloud1-6gjv79k431b8103b'
      }
    })
  }

  beforeEach(() => {
    jest.resetModules()
    storage = {
      cacheMeta: {
        ownerUserId: 'user_test',
        runtimeEnv: 'test'
      }
    }

    wx.getStorageSync.mockImplementation((key) => storage[key])
    wx.setStorageSync.mockImplementation((key, value) => {
      storage[key] = value
    })
    wx.cloud.callFunction.mockReset()

    eventBus = require('../../../miniprogram/services/eventBus')
    eventBus.clear()
    syncService = require('../../../miniprogram/services/syncService')
    syncService.confirmSyncIdentity('user_test', 'test')
  })

  test('does not fall back to syncLocalData when recoverData cloud function is not deployed', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('cloud.callFunction:fail Error: errCode: -501000 | errMsg: FunctionName parameter could not be found.'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('FunctionName parameter could not be found')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverData', { dailyStateDays: 90 }))
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
    expect(storage.MyHabits).toBeUndefined()
    expect(storage.CheckinLogs).toBeUndefined()
  })

  test('does not fall back to syncLocalData when recoverData times out', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('timeout')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverData', { dailyStateDays: 90 }))
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

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverData', { dailyStateDays: 90 }))
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

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverData', { dailyStateDays: 90 }))
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('recoverFromCloud throws when recoverData fails', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('timeout')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverData', { dailyStateDays: 90 }))
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('persists recovered V1 user habits using canonical fields', async () => {
    storage.pendingOperations = [{ queueId: 'q_stale', status: 'pending' }]
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
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_stale', status: 'pending' }])
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

  test('follows every recoverData cursor and commits the full history once complete', async () => {
    storage.pendingOperations = [{ queueId: 'q_keep', status: 'failed' }]
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_all', habitId: '1', status: 'active' }],
            policyVersions: [{ policyVersionId: 'pv_all', userHabitId: 'uh_all', effectiveEndDate: null }],
            dailyStates: [{ stateId: 'ds_1', userHabitId: 'uh_all', date: '2026-01-01' }],
            nextCursor: '1'
          }
        }
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_all', habitId: '1', status: 'active' }],
            policyVersions: [{ policyVersionId: 'pv_all', userHabitId: 'uh_all', effectiveEndDate: null }],
            dailyStates: [{ stateId: 'ds_2', userHabitId: 'uh_all', date: '2026-07-22' }],
            nextCursor: null
          }
        }
      })

    await syncService.recoverFromCloud({ historyScope: 'all' })

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(
      1,
      expectedCloudCall('recoverData', { historyScope: 'all' })
    )
    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(
      2,
      expectedCloudCall('recoverData', { historyScope: 'all', cursor: '1' })
    )
    expect(storage.dailyCheckinStates.map(state => state.stateId)).toEqual(['ds_1', 'ds_2'])
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_keep', status: 'failed' }])
  })

  test('recovers more than 500 daily states across every page before one commit', async () => {
    const states = Array.from({ length: 501 }, (_, index) => ({
      stateId: `ds_${String(index).padStart(3, '0')}`,
      userHabitId: 'uh_all',
      date: new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString().slice(0, 10)
    }))
    const pages = []
    for (let index = 0; index < states.length; index += 100) {
      pages.push(states.slice(index, index + 100))
    }
    pages.forEach((page, pageIndex) => {
      wx.cloud.callFunction.mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: pageIndex === 0
              ? [{ userHabitId: 'uh_all', habitId: '1', status: 'active' }]
              : [],
            policyVersions: pageIndex === 0
              ? [{ policyVersionId: 'pv_all', userHabitId: 'uh_all', effectiveEndDate: null }]
              : [],
            dailyStates: page,
            nextCursor: pageIndex < pages.length - 1 ? `cursor_${pageIndex + 1}` : null
          }
        }
      })
    })

    await syncService.recoverFromCloud({ historyScope: 'all' })

    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(6)
    expect(storage.dailyCheckinStates).toHaveLength(501)
    expect(storage.dailyCheckinStates[0].stateId).toBe('ds_000')
    expect(storage.dailyCheckinStates[500].stateId).toBe('ds_500')
  })

  test('rejects a repeated recovery cursor without modifying existing cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local' }]
    storage.dailyCheckinStates = [{ stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01' }]
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [],
            policyVersions: [],
            dailyStates: [{ stateId: 'ds_cloud', userHabitId: 'uh_cloud', date: '2026-07-01' }],
            nextCursor: '1'
          }
        }
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            dailyStates: [],
            nextCursor: '1'
          }
        }
      })

    await expect(syncService.recoverFromCloud({ historyScope: 'all' }))
      .rejects.toThrow('游标未前进')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01' }
    ])
  })

  test('times out an incomplete recovery page without modifying existing cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = [{ stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01' }]
    wx.cloud.callFunction.mockImplementationOnce(() => new Promise(() => {}))

    await expect(syncService.recoverFromCloud({
      historyScope: 'all',
      pageTimeoutMs: 5
    })).rejects.toThrow('分页请求超时')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }])
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01' }
    ])
  })

  test('rejects duplicate habits or policy versions before modifying existing cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = [{ stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01' }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [
            { userHabitId: 'uh_duplicate', habitId: '1' },
            { userHabitId: 'uh_duplicate', habitId: '1' }
          ],
          policyVersions: [
            { policyVersionId: 'pv_duplicate', userHabitId: 'uh_duplicate' },
            { policyVersionId: 'pv_duplicate', userHabitId: 'uh_duplicate' }
          ],
          dailyStates: []
        }
      }
    })

    await expect(syncService.recoverFromCloud({ historyScope: 'all' }))
      .rejects.toThrow('重复的用户习惯')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }])
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01' }
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('recoverData', { dailyStateDays: 90 }))
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

  test('bootstrapCloudData skips recovery only when local core cache is complete', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = [{ stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-06-16', status: 'checked' }]

    await expect(syncService.bootstrapCloudData()).resolves.toEqual({
      success: true,
      source: 'localCache',
      restored: false,
      skipped: true
    })

    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
  })

  test('bootstrapCloudData recovers when habits exist but daily states are missing', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local', habitId: '17', name: '晨起温水' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local', effectiveEndDate: null }]
    storage.dailyCheckinStates = []
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [{ userHabitId: 'uh_cloud', habitId: '17', name: '晨起温水', status: 'active' }],
          policyVersions: [{ policyVersionId: 'pv_cloud', userHabitId: 'uh_cloud', effectiveEndDate: null }],
          dailyStates: [{ stateId: 'ds_cloud', userHabitId: 'uh_cloud', habitId: '17', date: '2026-07-01', status: 'checked' }]
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('recoverData', { dailyStateDays: 90 }))
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_cloud', userHabitId: 'uh_cloud', habitId: '17', date: '2026-07-01', status: 'checked' }
    ])
  })

  test('bootstrapCloudData force option recovers even when local habits exist', async () => {
    const recoveredHandler = jest.fn()
    eventBus.on('sync:recovered', recoveredHandler)
    storage.MyHabits = [{ userHabitId: 'uh_local', habitId: 'custom_stale', source: 'custom' }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [{
            userHabitId: 'uh_cloud',
            habitId: '17',
            name: '晨起温水',
            status: 'active'
          }],
          policyVersions: [],
          dailyStates: [{ stateId: 'ds_cloud', userHabitId: 'uh_cloud', habitId: '17', date: '2026-07-07', status: 'checked' }]
        }
      }
    })

    await expect(syncService.bootstrapCloudData({ dailyStateDays: 30, force: true })).resolves.toEqual({
      success: true,
      source: 'recoverData',
      restored: true,
      skipped: false,
      error: undefined
    })

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('recoverData', { dailyStateDays: 30 }))
    expect(storage.MyHabits).toEqual([expect.objectContaining({
      userHabitId: 'uh_cloud',
      habitId: '17',
      name: '晨起温水'
    })])
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_cloud', userHabitId: 'uh_cloud', habitId: '17', date: '2026-07-07', status: 'checked' }
    ])
    expect(recoveredHandler).toHaveBeenCalledWith({
      source: 'recoverData',
      restored: true
    })
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

    expect(updatedHandler).toHaveBeenCalledWith(expect.objectContaining({
      syncedCount: 1,
      source: 'processQueue'
    }))
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
    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('syncCheckin', expect.objectContaining({
        userHabitId: 'uh_001',
        action: 'checkin',
        idempotencyKey: 'idem_001'
      })))
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('syncHabit', expect.objectContaining({
        action: 'addHabit',
        userHabitId: 'uh_habit_add',
        habitId: '20',
        policyVersionId: 'pv_habit_add',
        addedAt: '2026-06-16T08:00:00.000Z',
        idempotencyKey: 'idem_habit_add'
      })))
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('syncHabit', expect.objectContaining({
        action: 'updatePinned',
        userHabitId: 'uh_habit_pin',
        habitId: '20',
        pinnedAt: '2026-06-01T08:00:00.000Z',
        idempotencyKey: 'idem_habit_pin'
      })))
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
    jest.useFakeTimers()
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
    jest.useRealTimers()
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('syncCheckin', expect.objectContaining({
        operationId: 'op_retry_success',
        idempotencyKey: 'idem_retry_success'
      })))
    expect(storage.pendingOperations[0]).toEqual(expect.objectContaining({
      queueId: 'q_retry_success',
      status: 'synced',
      retryCount: 0,
      lastError: null
    }))
  })

  test('retry rejects missing items and allows manual retry after automatic retries are exhausted', async () => {
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
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { success: true } })
    await expect(syncService.retry('q_exhausted')).resolves.toEqual({
      success: true,
      status: 'synced',
      error: ''
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('retryAllFailed preserves operation identity while reactivating exhausted items', async () => {
    storage.pendingOperations = [{
      queueId: 'q_failed_all',
      entityType: 'checkin',
      action: 'checkin',
      operationId: 'op_failed_all',
      idempotencyKey: 'idem_failed_all',
      payload: {
        userHabitId: 'uh_failed_all',
        date: '2026-07-22',
        operationId: 'op_failed_all',
        idempotencyKey: 'idem_failed_all'
      },
      status: 'failed',
      retryCount: 3,
      nextRetryAt: '2026-07-22T00:00:00.000Z',
      createdAt: '2026-07-22T00:00:00.000Z'
    }]
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { success: true } })

    await expect(syncService.retryAllFailed()).resolves.toMatchObject({
      success: true,
      retriedCount: 1,
      summary: { allSynced: true, unsyncedCount: 0 }
    })
    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall(
      'syncCheckin',
      expect.objectContaining({
        operationId: 'op_failed_all',
        idempotencyKey: 'idem_failed_all'
      })
    ))
  })

  test('processQueue is single-flight and all callers await the same promise', async () => {
    storage.pendingOperations = [{
      queueId: 'q_single_flight',
      entityType: 'checkin',
      action: 'checkin',
      payload: { userHabitId: 'uh_single', date: '2026-07-24' },
      idempotencyKey: 'idem_single',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-07-24T00:00:00.000Z'
    }]
    let resolveCloud
    wx.cloud.callFunction.mockImplementationOnce(() => new Promise(resolve => {
      resolveCloud = resolve
    }))

    const first = syncService.processQueue()
    const second = syncService.processQueue()
    expect(second).toBe(first)
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)

    resolveCloud({ result: { success: true, serverRevision: 1 } })
    await expect(first).resolves.toMatchObject({ syncedCount: 1 })
    await expect(second).resolves.toMatchObject({ syncedCount: 1 })
  })

  test('identity mismatch isolates a queue item without calling a cloud function', async () => {
    storage.pendingOperations = [{
      queueId: 'q_wrong_owner',
      entityType: 'checkin',
      action: 'checkin',
      payload: { userHabitId: 'uh_wrong', date: '2026-07-24' },
      idempotencyKey: 'idem_wrong',
      ownerUserId: 'another_user',
      runtimeEnv: 'prod',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-07-24T00:00:00.000Z'
    }]

    await syncService.processQueue()

    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
    expect(storage.pendingOperations[0]).toEqual(expect.objectContaining({
      status: 'failed',
      lastErrorCode: 'SYNC_IDENTITY_MISMATCH'
    }))
  })

  test('interrupted syncing and retrying items recover once without changing operation identity', () => {
    storage.pendingOperations = [
      {
        queueId: 'q_interrupted',
        operationId: 'op_keep',
        idempotencyKey: 'idem_keep',
        status: 'syncing'
      },
      {
        queueId: 'q_retrying',
        operationId: 'op_retry_keep',
        idempotencyKey: 'idem_retry_keep',
        status: 'retrying',
        nextRetryAt: '2099-01-01T00:00:00.000Z'
      }
    ]

    expect(syncService.normalizeInterruptedQueue()).toBe(true)
    expect(syncService.normalizeInterruptedQueue()).toBe(false)
    expect(storage.pendingOperations).toEqual([
      expect.objectContaining({
        status: 'pending',
        operationId: 'op_keep',
        idempotencyKey: 'idem_keep'
      }),
      expect.objectContaining({
        status: 'pending',
        operationId: 'op_retry_keep',
        idempotencyKey: 'idem_retry_keep'
      })
    ])
  })

  test('cloud confirmation writes checkin revision and sync state back locally', async () => {
    storage.checkinOperations = [{
      operationId: 'op_confirm',
      idempotencyKey: 'idem_confirm',
      syncStatus: 'pending'
    }]
    storage.dailyCheckinStates = [{
      stateId: 'state_confirm',
      userHabitId: 'uh_confirm',
      date: '2026-07-24',
      status: 'checked'
    }]
    storage.pendingOperations = [{
      queueId: 'q_confirm',
      entityType: 'checkin',
      action: 'checkin',
      operationId: 'op_confirm',
      payload: { userHabitId: 'uh_confirm', date: '2026-07-24' },
      idempotencyKey: 'idem_confirm',
      status: 'pending',
      retryCount: 0,
      createdAt: '2026-07-24T00:00:00.000Z'
    }]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        serverRevision: 7,
        lastOperationId: 'op_confirm',
        dailyState: { status: 'checked' }
      }
    })

    await syncService.processQueue()

    expect(storage.checkinOperations[0]).toEqual(expect.objectContaining({
      syncStatus: 1,
      serverRevision: 7,
      syncError: ''
    }))
    expect(storage.dailyCheckinStates[0]).toEqual(expect.objectContaining({
      serverRevision: 7,
      lastServerOperationId: 'op_confirm'
    }))
  })

  test('needsLocalRecovery returns true only when local habits are empty', () => {
    storage.MyHabits = []
    storage.policyVersions = [{ policyVersionId: 'pv_existing' }]
    expect(syncService.needsLocalRecovery()).toBe(true)

    storage.MyHabits = [{ userHabitId: 'uh_existing' }]
    storage.policyVersions = []
    storage.dailyCheckinStates = [{ stateId: 'ds_existing' }]
    expect(syncService.needsLocalRecovery()).toBe(true)

    storage.policyVersions = [{ policyVersionId: 'pv_existing' }]
    storage.dailyCheckinStates = []
    expect(syncService.needsLocalRecovery()).toBe(true)

    storage.dailyCheckinStates = [{ stateId: 'ds_existing' }]
    expect(syncService.needsLocalRecovery()).toBe(false)
  })
})
