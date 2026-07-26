jest.mock('../../miniprogram/services/userService.js', () => ({
  login: jest.fn()
}))

jest.mock('../../miniprogram/services/syncService.js', () => ({
  needsLocalRecovery: jest.fn(() => true),
  bootstrapCloudData: jest.fn(() => Promise.resolve({ success: true, restored: true })),
  recoverFromCloud: jest.fn(() => Promise.resolve({ success: true })),
  recoverOrSync: jest.fn(() => Promise.resolve())
}))

jest.mock('../../miniprogram/services/timeService.js', () => ({}))
jest.mock('../../miniprogram/utils/iconMap.js', () => ({
  getIconConfig: jest.fn(() => null)
}))

describe('App cloud startup gate', () => {
  let userService
  let syncService

  const flushPromises = () => new Promise(resolve => setImmediate(resolve))

  beforeEach(() => {
    jest.resetModules()
    global.App = jest.fn((options) => {
      const app = { ...options, globalData: options.globalData || {} }
      if (options.onLaunch) {
        options.onLaunch.call(app)
      }
      return app
    })
    wx.getStorageSync.mockReturnValue(null)
    wx.cloud.init.mockClear()
    wx.getNetworkType = jest.fn(({ success }) => success({ networkType: 'wifi' }))
    wx.onNetworkStatusChange = jest.fn()
    wx.getAccountInfoSync = jest.fn(() => ({
      miniProgram: { envVersion: 'develop' }
    }))
    userService = require('../../miniprogram/services/userService.js')
    syncService = require('../../miniprogram/services/syncService.js')
  })

  test('initializes develop with the test CloudBase env', async () => {
    userService.login.mockResolvedValue({ success: true })

    require('../../miniprogram/app.js')
    await flushPromises()

    expect(wx.cloud.init).toHaveBeenCalledWith({
      env: 'cloud1-6gjv79k431b8103b',
      traceUser: true
    })
  })

  test('initializes trial with the test CloudBase env', async () => {
    wx.getAccountInfoSync = jest.fn(() => ({
      miniProgram: { envVersion: 'trial' }
    }))
    userService.login.mockResolvedValue({ success: true })

    require('../../miniprogram/app.js')
    await flushPromises()

    expect(wx.cloud.init).toHaveBeenCalledWith({
      env: 'cloud1-6gjv79k431b8103b',
      traceUser: true
    })
  })

  test('initializes release with the shared CloudBase env and no startup block', async () => {
    wx.getAccountInfoSync = jest.fn(() => ({
      miniProgram: { envVersion: 'release' }
    }))
    userService.login.mockResolvedValue({ success: true })

    require('../../miniprogram/app.js')
    await flushPromises()

    expect(wx.cloud.init).toHaveBeenCalledWith({
      env: 'cloud1-6gjv79k431b8103b',
      traceUser: true
    })
    expect(userService.login).toHaveBeenCalledWith({ force: true })
    expect(syncService.bootstrapCloudData).toHaveBeenCalled()
  })

  test('does not run recovery or sync when startup login times out', async () => {
    userService.login.mockRejectedValue(new Error('timeout'))

    require('../../miniprogram/app.js')
    await flushPromises()

    expect(userService.login).toHaveBeenCalledWith({ force: true })
    expect(syncService.bootstrapCloudData).not.toHaveBeenCalled()
    expect(syncService.recoverFromCloud).not.toHaveBeenCalled()
    expect(syncService.recoverOrSync).not.toHaveBeenCalled()
  })

  test('runs cloud bootstrap after startup login succeeds', async () => {
    userService.login.mockResolvedValue({ success: true })

    require('../../miniprogram/app.js')
    await flushPromises()

    expect(userService.login).toHaveBeenCalledWith({ force: true })
    expect(syncService.bootstrapCloudData).toHaveBeenCalled()
    expect(syncService.recoverOrSync).toHaveBeenCalled()
  })

  test('onShow reconfirms identity and resumes pending sync without full recovery', async () => {
    userService.login.mockResolvedValue({ success: true })

    require('../../miniprogram/app.js')
    await flushPromises()
    const app = global.App.mock.results[0].value
    userService.login.mockClear()
    syncService.bootstrapCloudData.mockClear()
    syncService.recoverOrSync.mockClear()

    app.onShow()
    await flushPromises()

    expect(userService.login).toHaveBeenCalledWith({ force: true })
    expect(syncService.bootstrapCloudData).not.toHaveBeenCalled()
    expect(syncService.recoverOrSync).toHaveBeenCalled()
  })
})
