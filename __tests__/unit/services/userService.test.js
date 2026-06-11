describe('userService profile view model', () => {
  let userService
  let storage = {}

  beforeEach(() => {
    jest.resetModules()
    jest.useRealTimers()
    storage = {}

    wx.getStorageSync.mockImplementation((key) => storage[key])
    wx.setStorageSync.mockImplementation((key, value) => {
      storage[key] = value
    })
    wx.login.mockImplementation(({ success }) => {
      success({ code: 'wx_login_code_001' })
    })
    wx.cloud.callFunction.mockResolvedValue({
      result: {
        success: true,
        userId: 'user_001',
        createdAt: '2026-05-31T00:00:00.000Z'
      }
    })

    userService = require('../../../miniprogram/services/userService')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('uses an existing bundled icon as the logged-out default avatar', () => {
    const vm = userService.getProfileViewModel()

    expect(vm.isLoggedIn).toBe(false)
    expect(vm.canEditProfile).toBe(false)
    expect(vm.displayAvatarUrl).toBe('/assets/icons/profile.png')
  })

  test('uses an existing bundled icon when logged in user has no avatar', () => {
    storage.userInfo = {
      _userId: 'user_001',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
      nickName: 'Test User',
      avatarUrl: ''
    }

    const vm = userService.getProfileViewModel()

    expect(vm.isLoggedIn).toBe(true)
    expect(vm.canEditProfile).toBe(true)
    expect(vm.displayAvatarUrl).toBe('/assets/icons/profile.png')
    expect(vm.nickName).toBe('Test User')
  })

  test('leaves nickname empty for logged in users without a saved nickname', () => {
    storage.userInfo = {
      _userId: 'user_001',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
      nickName: '',
      avatarUrl: ''
    }

    const vm = userService.getProfileViewModel()

    expect(vm.isLoggedIn).toBe(true)
    expect(vm.nickName).toBe('')
  })

  test('login follows wx.login before sending code to cloud login', async () => {
    await userService.login({ force: true })

    expect(wx.login).toHaveBeenCalled()
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'login',
      data: {
        code: 'wx_login_code_001'
      }
    })
    expect(storage.userInfo).toEqual(expect.objectContaining({
      _userId: 'user_001',
      createdAt: '2026-05-31T00:00:00.000Z'
    }))
  })

  test('login keeps a valid local session when legacy cloud user has no createdAt', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
    wx.cloud.callFunction.mockResolvedValue({
      result: {
        success: true,
        userId: 'legacy_user_001'
      }
    })

    await userService.login({ force: true })

    expect(storage.userInfo).toEqual(expect.objectContaining({
      _userId: 'legacy_user_001',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z'
    }))

    jest.useRealTimers()
  })

  test('silent login with cached user does not refresh cloud profile in background', async () => {
    storage.userInfo = {
      _userId: 'user_001',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
      nickName: 'Test User',
      avatarUrl: ''
    }

    await userService.login({ force: false })
    await Promise.resolve()

    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
  })
})
