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

  function snapshotMeta(userHabits, policyVersions, dailyStates, overrides = {}) {
    return {
      protocolVersion: 2,
      scope: 'all',
      token: 'snapshot_token',
      totalUserHabits: userHabits.length,
      totalPolicyVersions: policyVersions.length,
      totalDailyStates: dailyStates.length,
      ...overrides
    }
  }

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

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
    expect(storage.MyHabits).toBeUndefined()
    expect(storage.CheckinLogs).toBeUndefined()
  })

  test('does not fall back to syncLocalData when recoverData times out', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('timeout')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
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

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
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

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('recoverFromCloud throws when recoverData fails', async () => {
    wx.cloud.callFunction
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(syncService.recoverFromCloud()).rejects.toThrow('timeout')

    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(1, expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
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
          dailyStates: [{ stateId: 'ds_001', userHabitId: 'uh_001', date: '2026-05-31', status: 'checked' }],
          snapshotMeta: snapshotMeta([{}], [{}], [{}])
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
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_001', userHabitId: 'uh_001', date: '2026-05-31', status: 'checked' }
    ])
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
          dailyStates: [],
          snapshotMeta: snapshotMeta([{}, {}], [], [])
        }
      }
    })

    await syncService.recoverFromCloud()

    expect(storage.MyHabits.map(habit => habit.userHabitId)).toEqual([
      'uh_3_1778572800000_wxyz',
      'uh_new'
    ])
  })

  test('follows every cursor and commits the complete snapshot once', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = [
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-01-01', status: 'checked' }
    ]
    storage.pendingOperations = [{ queueId: 'q_keep', status: 'failed' }]
    const meta = snapshotMeta([{}], [{}], [{}, {}])
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_all', habitId: '1', status: 'active' }],
            policyVersions: [{ policyVersionId: 'pv_all', userHabitId: 'uh_all', effectiveEndDate: null }],
            dailyStates: [
              { stateId: 'ds_1', userHabitId: 'uh_all', date: '2026-01-01', status: 'checked' }
            ],
            nextCursor: 'cursor_1',
            snapshotMeta: meta
          }
        }
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_all', habitId: '1', status: 'active' }],
            policyVersions: [{ policyVersionId: 'pv_all', userHabitId: 'uh_all', effectiveEndDate: null }],
            dailyStates: [
              { stateId: 'ds_2', userHabitId: 'uh_all', date: '2026-07-26', status: 'checked' }
            ],
            nextCursor: null,
            snapshotMeta: meta
          }
        }
      })

    await syncService.recoverFromCloud()

    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(2)
    expect(wx.cloud.callFunction).toHaveBeenNthCalledWith(2, expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2,
      cursor: 'cursor_1'
    }))
    expect(storage.dailyCheckinStates.map(state => state.stateId)).toEqual(['ds_1', 'ds_2'])
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_keep', status: 'failed' }])
  })

  test('recovers more than 500 daily states across all client pages', async () => {
    const states = Array.from({ length: 501 }, (_, index) => ({
      stateId: `ds_${String(index).padStart(3, '0')}`,
      userHabitId: 'uh_all',
      date: new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString().slice(0, 10),
      status: 'checked'
    }))
    const pages = []
    for (let index = 0; index < states.length; index += 100) {
      pages.push(states.slice(index, index + 100))
    }
    const meta = snapshotMeta([{}], [], states)
    pages.forEach((page, pageIndex) => {
      wx.cloud.callFunction.mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_all', habitId: '1', status: 'active' }],
            policyVersions: [],
            dailyStates: page,
            nextCursor: pageIndex < pages.length - 1 ? `cursor_${pageIndex + 1}` : null,
            snapshotMeta: meta
          }
        }
      })
    })

    await syncService.recoverFromCloud()

    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(6)
    expect(storage.dailyCheckinStates).toHaveLength(501)
    expect(storage.dailyCheckinStates[0].stateId).toBe('ds_000')
    expect(storage.dailyCheckinStates[500].stateId).toBe('ds_500')
  })

  test('rejects repeated cursor without modifying existing cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = [
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01', status: 'checked' }
    ]
    const meta = snapshotMeta([{}], [], [{}])
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_cloud', habitId: '1', status: 'active' }],
            policyVersions: [],
            dailyStates: [
              { stateId: 'ds_cloud', userHabitId: 'uh_cloud', date: '2026-07-01', status: 'checked' }
            ],
            nextCursor: 'same_cursor',
            snapshotMeta: meta
          }
        }
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            dailyStates: [],
            nextCursor: 'same_cursor',
            snapshotMeta: meta
          }
        }
      })

    await expect(syncService.recoverFromCloud()).rejects.toThrow('游标未前进')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01', status: 'checked' }
    ])
  })

  test('rejects snapshot token changes between pages without modifying cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = []
    const firstMeta = snapshotMeta([{}], [], [{}, {}], { token: 'token_1' })
    const changedMeta = { ...firstMeta, token: 'token_2' }
    wx.cloud.callFunction
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            userHabits: [{ userHabitId: 'uh_cloud', habitId: '1', status: 'active' }],
            policyVersions: [],
            dailyStates: [
              { stateId: 'ds_1', userHabitId: 'uh_cloud', date: '2026-07-01', status: 'checked' }
            ],
            nextCursor: 'cursor_1',
            snapshotMeta: firstMeta
          }
        }
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          data: {
            dailyStates: [
              { stateId: 'ds_2', userHabitId: 'uh_cloud', date: '2026-07-02', status: 'checked' }
            ],
            nextCursor: null,
            snapshotMeta: changedMeta
          }
        }
      })

    await expect(syncService.recoverFromCloud()).rejects.toThrow('快照发生变化')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
  })

  test('rejects an old recoverData protocol before changing cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = []
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [],
          policyVersions: [],
          dailyStates: [],
          nextCursor: null
        }
      }
    })

    await expect(syncService.recoverFromCloud()).rejects.toThrow('版本不支持')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
  })

  test('times out an incomplete page without modifying existing cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = [
      { stateId: 'ds_local', userHabitId: 'uh_local', date: '2026-07-01', status: 'checked' }
    ]
    wx.cloud.callFunction.mockImplementationOnce(() => new Promise(() => {}))

    await expect(syncService.recoverFromCloud({ pageTimeoutMs: 5 }))
      .rejects.toThrow('分页请求超时')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
    expect(storage.dailyCheckinStates[0].stateId).toBe('ds_local')
  })

  test('rejects duplicate daily state keys before modifying cache', async () => {
    storage.MyHabits = [{ userHabitId: 'uh_local' }]
    storage.policyVersions = [{ policyVersionId: 'pv_local', userHabitId: 'uh_local' }]
    storage.dailyCheckinStates = []
    const duplicateStates = [
      { stateId: 'ds_1', userHabitId: 'uh_cloud', date: '2026-07-01', status: 'checked' },
      { stateId: 'ds_2', userHabitId: 'uh_cloud', date: '2026-07-01', status: 'checked' }
    ]
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: {
          userHabits: [{ userHabitId: 'uh_cloud', habitId: '1', status: 'active' }],
          policyVersions: [],
          dailyStates: duplicateStates,
          nextCursor: null,
          snapshotMeta: snapshotMeta([{}], [], duplicateStates)
        }
      }
    })

    await expect(syncService.recoverFromCloud()).rejects.toThrow('重复的每日状态')
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_local' }])
  })

  test('preserves structurally valid orphan history from an otherwise complete snapshot', () => {
    const snapshot = {
      userHabits: [],
      policyVersions: [{
        policyVersionId: 'pv_orphan',
        userHabitId: 'uh_removed',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null
      }],
      dailyStates: [{
        stateId: 'state_orphan',
        userHabitId: 'uh_removed',
        date: '2026-01-01',
        status: 'checked'
      }]
    }

    expect(() => syncService.validateRecoverySnapshot(snapshot, {
      protocolVersion: 2,
      scope: 'all',
      token: 'snapshot-token',
      totalUserHabits: 0,
      totalPolicyVersions: 1,
      totalDailyStates: 1
    })).not.toThrow()
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
          dailyStates: [{ stateId: 'ds_bootstrap', userHabitId: 'uh_bootstrap', date: '2026-06-16', status: 'checked' }],
          snapshotMeta: snapshotMeta([{}], [{}], [{}])
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
    expect(storage.MyHabits).toEqual([expect.objectContaining({
      userHabitId: 'uh_bootstrap',
      habitId: '1',
      name: '金刚功'
    })])
    expect(storage.policyVersions).toEqual([{ policyVersionId: 'pv_bootstrap', userHabitId: 'uh_bootstrap', effectiveEndDate: null }])
    expect(storage.dailyCheckinStates).toEqual([
      { stateId: 'ds_bootstrap', userHabitId: 'uh_bootstrap', date: '2026-06-16', status: 'checked' }
    ])
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
          dailyStates: [{ stateId: 'ds_cloud', userHabitId: 'uh_cloud', habitId: '17', date: '2026-07-01', status: 'checked' }],
          snapshotMeta: snapshotMeta([{}], [{}], [{}])
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
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
          dailyStates: [{ stateId: 'ds_cloud', userHabitId: 'uh_cloud', habitId: '17', date: '2026-07-07', status: 'checked' }],
          snapshotMeta: snapshotMeta([{}], [], [{}])
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

    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expectedCloudCall('recoverDataV2Test', {
      historyScope: 'all',
      recoveryProtocolVersion: 2
    }))
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
