jest.mock('../../miniprogram/services/userService.js', () => ({
  login: jest.fn()
}))

jest.mock('../../miniprogram/services/syncService.js', () => ({
  needsLocalRecovery: jest.fn(() => true),
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
    wx.getNetworkType = jest.fn(({ success }) => success({ networkType: 'wifi' }))
    wx.onNetworkStatusChange = jest.fn()
    userService = require('../../miniprogram/services/userService.js')
    syncService = require('../../miniprogram/services/syncService.js')
  })

  test('does not run recovery or sync when startup login times out', async () => {
    userService.login.mockRejectedValue(new Error('timeout'))

    require('../../miniprogram/app.js')
    await Promise.resolve()
    await Promise.resolve()

    expect(userService.login).toHaveBeenCalledWith({ force: false })
    expect(syncService.recoverFromCloud).not.toHaveBeenCalled()
    expect(syncService.recoverOrSync).not.toHaveBeenCalled()
  })
})
