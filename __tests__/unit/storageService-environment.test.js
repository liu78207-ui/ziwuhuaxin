describe('storageService runtime environment isolation', () => {
  let storage

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    storage = {
      MyHabits: [{ userHabitId: 'uh_prod' }],
      pendingOperations: [{ queueId: 'q_prod', status: 'pending' }]
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

  test('正式环境继续使用旧 key，不发生迁移或重命名', () => {
    const storageService = require('../../miniprogram/services/storageService')
    storageService.configureRuntimeEnv('prod')

    expect(storageService.resolveStorageKey('MyHabits')).toBe('MyHabits')
    expect(storageService.getMyHabits()).toEqual([{ userHabitId: 'uh_prod' }])

    storageService.setMyHabits([{ userHabitId: 'uh_prod_new' }])
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_prod_new' }])
    expect(storage['test:MyHabits']).toBeUndefined()
  })

  test('测试环境只读写 test: 前缀，不读取正式缓存和 pending', () => {
    const storageService = require('../../miniprogram/services/storageService')
    storageService.configureRuntimeEnv('test')

    expect(storageService.resolveStorageKey('MyHabits')).toBe('test:MyHabits')
    expect(storageService.getMyHabits()).toEqual([])
    expect(storageService.getPendingOperations()).toEqual([])

    storageService.setMyHabits([{ userHabitId: 'uh_test' }])
    storageService.setPendingOperations([{ queueId: 'q_test', status: 'pending' }])

    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_prod' }])
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_prod', status: 'pending' }])
    expect(storage['test:MyHabits']).toEqual([{ userHabitId: 'uh_test' }])
    expect(storage['test:pendingOperations']).toEqual([{ queueId: 'q_test', status: 'pending' }])
  })

  test('测试环境清理只移除 test: 数据，不影响正式缓存', () => {
    storage['test:MyHabits'] = [{ userHabitId: 'uh_test' }]
    storage['test:dailyCheckinStates'] = [{ stateId: 'ds_test' }]
    storage['test:CheckinLogs_backup_phase3_1785000000000'] = [{ legacy: true }]
    const storageService = require('../../miniprogram/services/storageService')
    storageService.configureRuntimeEnv('test')

    const result = storageService.clearUserDataCache()

    expect(result.success).toBe(true)
    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_prod' }])
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_prod', status: 'pending' }])
    expect(storage['test:MyHabits']).toBeUndefined()
    expect(storage['test:dailyCheckinStates']).toBeUndefined()
    expect(storage['test:CheckinLogs_backup_phase3_1785000000000']).toBeUndefined()
  })

  test('测试环境全量 clear 也只清除 test: 命名空间', () => {
    storage['test:MyHabits'] = [{ userHabitId: 'uh_test' }]
    storage['test:unknownBusinessCache'] = { value: true }
    storage.unrelatedProdPreference = { keep: true }
    const storageService = require('../../miniprogram/services/storageService')
    storageService.configureRuntimeEnv('test')

    expect(storageService.clear()).toEqual({
      success: true,
      failedKeys: []
    })

    expect(storage.MyHabits).toEqual([{ userHabitId: 'uh_prod' }])
    expect(storage.pendingOperations).toEqual([{ queueId: 'q_prod', status: 'pending' }])
    expect(storage.unrelatedProdPreference).toEqual({ keep: true })
    expect(storage['test:MyHabits']).toBeUndefined()
    expect(storage['test:unknownBusinessCache']).toBeUndefined()
  })
})
