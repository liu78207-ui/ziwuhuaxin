jest.mock('../../../miniprogram/services/userService', () => ({
  getProfileViewModel: jest.fn(() => ({
    isLoggedIn: false,
    canEditProfile: false,
    displayAvatarUrl: '/assets/icons/profile.png',
    nickName: '点击登录',
    memberSince: '',
    buttonText: '登录，子午花信'
  })),
  login: jest.fn(),
  refreshUserInfo: jest.fn(),
  isLoggedIn: jest.fn(() => false),
  getUserInfo: jest.fn(),
  uploadAvatar: jest.fn(),
  buildAvatarCloudPath: jest.fn(() => 'avatars/user_001_1714656000000.jpg'),
  normalizeNickName: jest.fn((value) => String(value || '').trim().slice(0, 24)),
  saveUserInfo: jest.fn(),
  setUserInfo: jest.fn(),
  logout: jest.fn()
}))

jest.mock('../../../miniprogram/services/cacheService', () => ({
  clearLocalUserCacheAndRecover: jest.fn()
}))

jest.mock('../../../miniprogram/utils/share.js', () => ({
  enableShareMenu: jest.fn(),
  appMessage: jest.fn(),
  timeline: jest.fn()
}))

describe('profile page login flow', () => {
  let page
  let userService
  let cacheService

  beforeEach(() => {
    jest.resetModules()
    Page.mockClear()
    userService = require('../../../miniprogram/services/userService')
    cacheService = require('../../../miniprogram/services/cacheService')
    require('../../../miniprogram/pages/profile/profile.js')
    page = Page.mock.results[0].value
  })

  afterEach(() => {
    if (page && typeof page.clearAvatarChoosingLock === 'function') {
      page.clearAvatarChoosingLock()
    }
  })

  test('onLogin forces user login and refreshes profile view model', async () => {
    userService.login.mockResolvedValue({ userId: 'user_001', createdAt: '2026-05-31T00:00:00.000Z' })
    userService.refreshUserInfo.mockResolvedValue({
      _userId: 'user_001',
      createdAt: '2026-05-31T00:00:00.000Z'
    })
    page.refreshViewModel = jest.fn()

    await page.onLogin()

    expect(userService.login).toHaveBeenCalledWith({ force: true })
    expect(userService.refreshUserInfo).toHaveBeenCalled()
    expect(page.refreshViewModel).toHaveBeenCalled()
  })

  test('onLogin logs timeout failures without printing the raw Error stack', async () => {
    const error = new Error('timeout')
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    userService.login.mockRejectedValue(error)

    await page.onLogin()

    expect(consoleSpy).toHaveBeenCalledWith('登录失败:', 'timeout')
    expect(consoleSpy).not.toHaveBeenCalledWith('登录失败:', error)

    consoleSpy.mockRestore()
  })

  test('onAvatarOpen locks chooseAvatar entry against repeat taps', () => {
    page.setData = jest.fn(function(data) {
      Object.assign(this.data, data)
    })

    page.onAvatarOpen()

    expect(page.data.isAvatarChoosing).toBe(true)
    expect(page.setData).toHaveBeenCalledWith({ isAvatarChoosing: true })
  })

  test('onChooseAvatar uploads and saves selected avatar through userService', async () => {
    page.setData = jest.fn(function(data) {
      Object.assign(this.data, data)
    })
    page.data.isAvatarSaving = false
    page.data.displayAvatarUrl = '/assets/icons/profile.png'
    userService.isLoggedIn.mockReturnValue(true)
    userService.getUserInfo.mockReturnValue({
      _userId: 'user_001',
      avatarUrl: ''
    })
    userService.uploadAvatar.mockResolvedValue('cloud://avatar-file')
    userService.saveUserInfo.mockResolvedValue()

    await page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp-avatar' } })

    expect(userService.buildAvatarCloudPath).toHaveBeenCalledWith('user_001')
    expect(userService.uploadAvatar).toHaveBeenCalledWith('wxfile://tmp-avatar', 'avatars/user_001_1714656000000.jpg')
    expect(userService.saveUserInfo).toHaveBeenCalledWith({ avatarUrl: 'cloud://avatar-file' })
    expect(page.data.isAvatarSaving).toBe(false)
  })

  test('onNicknameSubmit trims and saves nickname once logged in', async () => {
    page.setData = jest.fn(function(data) {
      Object.assign(this.data, data)
      if (data['userInfo.nickName'] !== undefined) {
        this.data.userInfo.nickName = data['userInfo.nickName']
      }
    })
    page.data.userInfo = { nickName: '旧名' }
    userService.isLoggedIn.mockReturnValue(true)
    userService.saveUserInfo.mockResolvedValue()

    await page.onNicknameSubmit({ detail: { value: '  新名  ' } })

    expect(userService.saveUserInfo).toHaveBeenCalledWith({ nickName: '新名' })
    expect(page.data.isProfileSaving).toBe(false)
  })

  test('confirmClearCache skips pre-clear sync and forces cloud recovery', async () => {
    page.setData = jest.fn(function(data) {
      Object.assign(this.data, data)
    })
    page.refreshViewModel = jest.fn()
    page.data.isClearingCache = false
    cacheService.clearLocalUserCacheAndRecover.mockResolvedValue({
      success: true,
      cleared: true,
      restored: true,
      skippedPreClearSync: true,
      failedKeys: [],
      recoveryError: ''
    })

    await page.confirmClearCache()

    expect(cacheService.clearLocalUserCacheAndRecover).toHaveBeenCalledWith({
      dailyStateDays: 90,
      skipPreClearSync: true
    })
    expect(wx.showToast).toHaveBeenCalledWith({
      title: '已恢复云端',
      icon: 'none'
    })
    expect(page.refreshViewModel).toHaveBeenCalled()
    expect(page.data.isClearingCache).toBe(false)
    expect(page.data.showClearCacheModal).toBe(false)
  })
})
