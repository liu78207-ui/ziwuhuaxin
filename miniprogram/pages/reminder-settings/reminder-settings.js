/**
 * reminder-settings.js
 * 修习提醒设置页。
 */

const reminderService = require('../../services/reminderService')
const shareService = require('../../services/shareService')
const { getNavTitleStyle } = require('../../utils/navLayout')

function getErrorMessage(err) {
  return err && err.message ? err.message : String(err || 'unknown error')
}

function getWheelClass(index, selectedIndex) {
  const distance = index - selectedIndex
  if (distance === 0) return 'is-selected'
  if (distance === -1) return 'is-near is-before'
  if (distance === 1) return 'is-near is-after'
  if (distance === -2) return 'is-edge is-before'
  if (distance === 2) return 'is-edge is-after'
  if (distance === -3) return 'is-far is-before'
  if (distance === 3) return 'is-far is-after'
  return 'is-hidden'
}

function buildTimeColumn(length, selectedIndex) {
  return Array.from({ length }, (_, index) => ({
    label: String(index).padStart(2, '0'),
    wheelClass: getWheelClass(index, selectedIndex)
  }))
}

function buildTimeColumns(value = [21, 0]) {
  return [
    buildTimeColumn(24, Number(value[0]) || 0),
    buildTimeColumn(60, Number(value[1]) || 0)
  ]
}

Page({
  data: {
    navTitleStyle: '',
    enabled: false,
    reminderTime: '21:00',
    authText: '',
    authGuideVisible: false,
    authGuideTitle: '',
    authGuideText: '',
    authGuideActionText: '',
    showEnableReminderModal: false,
    timeColumns: buildTimeColumns([21, 0]),
    timeValue: [21, 0],
    isLoading: false,
    isSaving: false
  },
  saveTimer: null,

  onLoad() {
    this.setData({
      navTitleStyle: getNavTitleStyle()
    })
    this.refreshViewModel()
  },

  onShow() {
    shareService.enableShareMenu()
  },

  onUnload() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  },

  async refreshViewModel() {
    this.setData({ isLoading: true })
    try {
      const settings = await reminderService.refreshSettings()
      this.applyViewModel(settings)
    } catch (err) {
      console.warn('刷新提醒设置失败:', getErrorMessage(err))
      this.applyViewModel(reminderService.getCachedSettings())
    } finally {
      this.setData({ isLoading: false })
    }
  },

  applyViewModel(settings) {
    const vm = reminderService.buildSettingsViewModel(settings)
    const [hour, minute] = String(vm.reminderTime || '21:00').split(':').map(value => Number(value))
    const timeValue = [
      Number.isFinite(hour) ? hour : 21,
      Number.isFinite(minute) ? minute : 0
    ]
    this.setData({
      enabled: vm.enabled,
      reminderTime: vm.reminderTime,
      authText: vm.authText,
      authGuideVisible: vm.authGuideVisible,
      authGuideTitle: vm.authGuideTitle,
      authGuideText: vm.authGuideText,
      authGuideActionText: vm.authGuideActionText,
      timeValue,
      timeColumns: buildTimeColumns(timeValue)
    })
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/profile/profile' })
      }
    })
  },

  onTimeChange(e) {
    const value = Array.isArray(e.detail.value) ? e.detail.value : [21, 0]
    const hour = String(value[0] || 0).padStart(2, '0')
    const minute = String(value[1] || 0).padStart(2, '0')
    this.setData({
      timeValue: value,
      timeColumns: buildTimeColumns(value),
      reminderTime: `${hour}:${minute}`
    })
    this.scheduleSave()
  },

  async onEnableChange(e) {
    const nextEnabled = e.detail.value === true
    if (!nextEnabled) {
      this.setData({ enabled: false })
      await this.saveCurrentSettings(false)
      return
    }

    this.setData({ showEnableReminderModal: true })
  },

  preventBubble() {},

  closeEnableReminderModal() {
    if (this.data.isSaving) return
    this.setData({
      showEnableReminderModal: false,
      enabled: false
    })
  },

  async confirmEnableReminder() {
    if (this.data.isSaving) return
    this.setData({ showEnableReminderModal: false })
    await this.requestSubscribeAndEnable()
  },

  async requestSubscribeAndEnable() {
    this.setData({ isSaving: true })
    try {
      const result = await reminderService.requestSubscribeAndEnable({
        reminderTime: this.data.reminderTime,
        remindIfNoCheckin: true
      })
      this.applyViewModel(result.settings)
      wx.showToast({
        title: result.accepted ? '提醒已开启' : '暂未授权',
        icon: 'none'
      })
    } catch (err) {
      console.warn('订阅提醒失败:', getErrorMessage(err))
      this.setData({ enabled: false })
      wx.showToast({ title: '暂未开启提醒', icon: 'none' })
    } finally {
      this.setData({ isSaving: false })
    }
  },

  async onOpenSubscriptionSettings() {
    try {
      await reminderService.openSubscriptionSettings()
      wx.showToast({ title: '返回后可重新开启提醒', icon: 'none' })
    } catch (err) {
      console.warn('打开订阅设置失败:', getErrorMessage(err))
      wx.showToast({ title: '无法打开设置页', icon: 'none' })
    }
  },

  scheduleSave() {
    if (this.data.isLoading) return
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveCurrentSettings(this.data.enabled).catch(err => {
        console.warn('自动保存提醒设置失败:', getErrorMessage(err))
      })
    }, 360)
  },

  async saveCurrentSettings(enabled = this.data.enabled) {
    if (this.data.isSaving) return

    this.setData({ isSaving: true })
    try {
      const saved = await reminderService.saveSettings({
        enabled,
        reminderTime: this.data.reminderTime,
        remindIfNoCheckin: true
      })
      this.applyViewModel(saved)
      return saved
    } catch (err) {
      console.error('保存提醒设置失败:', getErrorMessage(err))
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
      throw err
    } finally {
      this.setData({ isSaving: false })
    }
  }
})
