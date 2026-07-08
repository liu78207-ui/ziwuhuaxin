describe('config/env', () => {
  beforeEach(() => {
    jest.resetModules()
    wx.getAccountInfoSync = jest.fn(() => ({
      miniProgram: { envVersion: 'develop' }
    }))
  })

  test('maps develop to test', () => {
    const env = require('../../../miniprogram/config/env')
    expect(env.getRuntimeEnv('develop')).toBe('test')
  })

  test('maps trial to test', () => {
    const env = require('../../../miniprogram/config/env')
    expect(env.getRuntimeEnv('trial')).toBe('test')
  })

  test('maps release to prod', () => {
    const env = require('../../../miniprogram/config/env')
    expect(env.getRuntimeEnv('release')).toBe('prod')
  })

  test('defaults to test when account info API is unavailable', () => {
    delete wx.getAccountInfoSync
    const env = require('../../../miniprogram/config/env')
    expect(env.getMiniProgramEnvVersion()).toBe('develop')
    expect(env.getRuntimeEnv()).toBe('test')
  })

  test('uses shared CloudBase env with test collection prefix for develop', () => {
    const env = require('../../../miniprogram/config/env')
    const config = env.getCurrentEnvConfig()

    expect(config.cloudEnvId).toBe('cloud1-6gjv79k431b8103b')
    expect(config.collectionPrefix).toBe('test_')
  })

  test('uses shared CloudBase env without collection prefix for release', () => {
    wx.getAccountInfoSync = jest.fn(() => ({
      miniProgram: { envVersion: 'release' }
    }))
    const env = require('../../../miniprogram/config/env')
    const config = env.getCurrentEnvConfig()

    expect(config.cloudEnvId).toBe('cloud1-6gjv79k431b8103b')
    expect(config.collectionPrefix).toBe('')
    expect(() => env.assertCloudEnvReady(config)).not.toThrow()
  })
})
