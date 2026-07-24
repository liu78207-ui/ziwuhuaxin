let mockCachedSettings = {}
let mockCloudResult = null

jest.mock('../../../miniprogram/services/storageService', () => ({
  getReminderSettings: jest.fn(() => mockCachedSettings),
  setReminderSettings: jest.fn((settings) => {
    mockCachedSettings = settings
    return true
  })
}))

jest.mock('../../../miniprogram/services/cloudService', () => ({
  callFunction: jest.fn(() => Promise.resolve(mockCloudResult))
}))

jest.mock('../../../miniprogram/services/eventBus', () => ({
  emit: jest.fn()
}))

jest.mock('../../../miniprogram/services/userService', () => ({
  login: jest.fn(() => Promise.resolve({ userId: 'user_1' }))
}))

describe('reminderService', () => {
  beforeEach(() => {
    jest.resetModules()
    mockCachedSettings = {}
    mockCloudResult = {
      success: true,
      data: {
        reminder: {
          enabled: false,
          reminderTime: '21:00',
          timezone: 'Asia/Shanghai',
          remindIfNoCheckin: true,
          subscribeStatus: 'unknown',
          subscribeGrantCount: 0
        }
      }
    }
    wx.requestSubscribeMessage.mockReset()
  })

  test('默认设置生成正确', () => {
    const reminderService = require('../../../miniprogram/services/reminderService')
    const settings = reminderService.getCachedSettings()

    expect(settings).toMatchObject({
      enabled: false,
      reminderTime: '21:00',
      timezone: 'Asia/Shanghai',
      remindIfNoCheckin: true,
      subscribeStatus: 'unknown',
      subscribeGrantCount: 0
    })
    expect(reminderService.buildSummary(settings)).toBe('未开启')
    expect(reminderService.buildSummary({ ...settings, enabled: true })).toBe('已开启')
  })

  test('授权成功后保存 enabled 和授权次数', async () => {
    mockCachedSettings = {
      enabled: false,
      reminderTime: '21:00',
      subscribeGrantCount: 0
    }
    wx.requestSubscribeMessage.mockImplementation(({ tmplIds, success }) => {
      success({ [tmplIds[0]]: 'accept' })
    })
    mockCloudResult = {
      success: true,
      data: {
        reminder: {
          enabled: true,
          reminderTime: '21:00',
          timezone: 'Asia/Shanghai',
          remindIfNoCheckin: true,
          subscribeStatus: 'accepted',
          subscribeGrantCount: 1
        }
      }
    }

    const reminderService = require('../../../miniprogram/services/reminderService')
    const result = await reminderService.requestSubscribeAndEnable()

    expect(result.accepted).toBe(true)
    expect(result.settings.enabled).toBe(true)
    expect(result.settings.subscribeGrantCount).toBe(1)
  })

  test('授权拒绝后不自动开启提醒', async () => {
    wx.requestSubscribeMessage.mockImplementation(({ tmplIds, success }) => {
      success({ [tmplIds[0]]: 'reject' })
    })
    mockCloudResult = {
      success: true,
      data: {
        reminder: {
          enabled: false,
          reminderTime: '21:00',
          timezone: 'Asia/Shanghai',
          remindIfNoCheckin: true,
          subscribeStatus: 'rejected',
          subscribeGrantCount: 0
        }
      }
    }

    const reminderService = require('../../../miniprogram/services/reminderService')
    const result = await reminderService.requestSubscribeAndEnable()

    expect(result.accepted).toBe(false)
    expect(result.settings.enabled).toBe(false)
    expect(result.settings.subscribeStatus).toBe('rejected')
  })

  test('云函数失败时抛出保存失败错误', async () => {
    const reminderService = require('../../../miniprogram/services/reminderService')
    mockCloudResult = {
      success: false,
      error: { message: 'cloud failed' }
    }

    await expect(reminderService.saveSettings({ enabled: true })).rejects.toThrow('cloud failed')
  })
})
