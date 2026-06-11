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
  isLoggedIn: jest.fn(() => false),
  getUserInfo: jest.fn(),
  uploadAvatar: jest.fn(),
  saveUserInfo: jest.fn(),
  setUserInfo: jest.fn(),
  logout: jest.fn()
}))

jest.mock('../../../miniprogram/utils/share.js', () => ({
  enableShareMenu: jest.fn(),
  appMessage: jest.fn(),
  timeline: jest.fn()
}))

describe('profile page login flow', () => {
  let page
  let userService

  beforeEach(() => {
    jest.resetModules()
    Page.mockClear()
    userService = require('../../../miniprogram/services/userService')
    require('../../../miniprogram/pages/profile/profile.js')
    page = Page.mock.results[0].value
  })

  test('onLogin forces user login and refreshes profile view model', async () => {
    userService.login.mockResolvedValue({ userId: 'user_001', createdAt: '2026-05-31T00:00:00.000Z' })
    page.refreshViewModel = jest.fn()

    await page.onLogin()

    expect(userService.login).toHaveBeenCalledWith({ force: true })
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
})
