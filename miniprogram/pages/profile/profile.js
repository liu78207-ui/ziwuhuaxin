/**
 * profile.js - 个人中心页面
 * 页面层只负责：UI 渲染、用户事件响应、调用 Service
 */

const share = require('../../utils/share.js');
const userService = require('../../services/userService');

Page({
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: ''
    },
    displayAvatarUrl: ''
  },

  onLoad() {
    this.refreshViewModel();
  },

  onShow() {
    share.enableShareMenu();

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }

    this.refreshViewModel();
  },

  refreshViewModel() {
    const vm = userService.getProfileViewModel();
    this.setData({
      userInfo: { nickName: vm.nickName },
      displayAvatarUrl: vm.displayAvatarUrl,
      buttonText: vm.buttonText,
      memberSince: vm.memberSince,
      isLoggedIn: vm.isLoggedIn
    });
  },

  // 选择头像
  async onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) {
      console.error('获取头像临时路径失败');
      return;
    }

    // Phase 7B 暂缓头像上传（cloudService.uploadFile 未实现）
    // 乐观更新本地头像预览
    this.setData({
      displayAvatarUrl: avatarUrl
    });
    wx.showToast({
      title: '头像预览已更新，上传功能开发中',
      icon: 'none'
    });
  },

  // 输入昵称（Phase 7B 暂缓云端保存，仅更新本地缓存）
  onInputNickname(e) {
    const nickName = e.detail.value;
    if (!nickName || nickName.trim() === '') {
      return;
    }

    // 只写本地缓存，云端保存等 Phase 7B 实现 saveUserProfile 云函数后启用
    userService.setUserInfo({ nickName: nickName.trim() });
    this.setData({
      'userInfo.nickName': nickName.trim()
    });
  },

  // 退出登录
  async onLogout() {
    userService.logout();
    this.refreshViewModel();
    wx.showToast({
      title: '已退出登录',
      icon: 'none'
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }
    });
  },

  viewHistory() {
    wx.showToast({ title: '记录功能开发中', icon: 'none' });
  },

  viewSettings() {
    wx.showToast({ title: '设置功能开发中', icon: 'none' });
  },

  viewAbout() {
    wx.showToast({ title: '关于功能开发中', icon: 'none' });
  },

  onShareAppMessage() {
    return share.appMessage('子午花信 · 顺时修习，日日有信', '/pages/profile/profile');
  },

  onShareTimeline() {
    return share.timeline('子午花信 · 顺时修习，日日有信', 'from=timeline&page=profile');
  }
});