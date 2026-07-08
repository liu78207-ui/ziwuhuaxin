describe('cloudService.callFunction', () => {
  let cloudService

  beforeEach(() => {
    jest.resetModules()
    wx.cloud.callFunction.mockReset()
    wx.cloud.uploadFile = jest.fn()
    wx.getAccountInfoSync = jest.fn(() => ({
      miniProgram: { envVersion: 'develop' }
    }))
    cloudService = require('../../../miniprogram/services/cloudService')
  })

  test('binds cloud function calls to the current CloudBase env by default', async () => {
    wx.cloud.callFunction.mockResolvedValue({
      errMsg: 'cloud.callFunction:ok',
      result: { success: true, serverTime: 1780224000000 }
    })

    await cloudService.callFunction('recoverData', {})

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'recoverData',
      data: {
        __runtimeEnv: 'test',
        __collectionPrefix: 'test_'
      },
      config: {
        env: 'cloud1-6gjv79k431b8103b'
      }
    })
  })

  test('normalizes timeout failures as retryable timeout errors', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    wx.cloud.callFunction.mockRejectedValue(new Error('timeout'))

    const result = await cloudService.callFunction('recoverData', {})

    expect(result).toEqual({
      success: false,
      error: {
        code: cloudService.ERROR_CODES.TIMEOUT,
        message: 'timeout'
      },
      shouldPending: true
    })
    expect(warnSpy).toHaveBeenCalledWith(
      'cloudService.callFunction 失败:',
      'recoverData',
      cloudService.ERROR_CODES.TIMEOUT,
      'timeout'
    )
    warnSpy.mockRestore()
  })

  test('preserves cloud function business error codes', async () => {
    wx.cloud.callFunction.mockResolvedValue({
      result: {
        success: false,
        code: 'ALREADY_CHECKED',
        message: 'already checked'
      }
    })

    const result = await cloudService.callFunction('doCheckin', {})

    expect(result).toEqual({
      success: false,
      error: {
        code: 'ALREADY_CHECKED',
        message: 'already checked'
      }
    })
  })

  test('uploadFile does not log the raw Error object when upload times out', async () => {
    const error = new Error('timeout')
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    wx.cloud.uploadFile.mockRejectedValue(error)

    await expect(cloudService.uploadFile('/tmp/avatar.jpg', 'avatars/user.jpg')).rejects.toThrow('timeout')

    expect(consoleSpy).toHaveBeenCalledWith('cloudService.uploadFile 失败:', 'timeout')
    expect(consoleSpy).not.toHaveBeenCalledWith('cloudService.uploadFile 失败:', error)

    consoleSpy.mockRestore()
  })

  test('returns registered collection names with current prefix', () => {
    expect(cloudService.getCollectionName('userHabits')).toBe('test_user_habits')
  })

  test('throws for unregistered collection names', () => {
    expect(() => cloudService.getCollectionName('unknownCollection')).toThrow('未登记的 CloudBase 集合')
  })
})
