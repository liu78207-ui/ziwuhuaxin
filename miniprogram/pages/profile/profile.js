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

  // 选择头像（Phase 7D — 选图 + 上传云端 + 保存）
  async onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) {
      console.error('获取头像临时路径失败');
      return;
    }

    // 未登录禁止上传，避免留下无归属的孤立文件
    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const userInfo = userService.getUserInfo();
    const previousAvatarUrl = userInfo.avatarUrl || '';
    const previousDisplayUrl = this.data.displayAvatarUrl;

    // 乐观更新本地预览
    this.setData({ displayAvatarUrl: avatarUrl });

    // 构造云存储路径：avatars/{userId}_{timestamp}.jpg
    const userId = userInfo._userId || 'guest';
    const timestamp = Date.now();
    const cloudPath = `avatars/${userId}_${timestamp}.jpg`;

    let cloudUrl = '';
    try {
      cloudUrl = await userService.uploadAvatar(avatarUrl, cloudPath);
    } catch (err) {
      console.error('头像上传失败:', err);
      // 回滚 UI 和本地缓存
      this.setData({ displayAvatarUrl: previousDisplayUrl });
      userService.setUserInfo({ avatarUrl: previousAvatarUrl });
      wx.showToast({ title: '上传失败', icon: 'none' });
      return;
    }

    // 保存到云端 + 本地缓存
    try {
      await userService.saveUserInfo({ avatarUrl: cloudUrl });
      this.setData({ displayAvatarUrl: cloudUrl });
      wx.showToast({ title: '头像已更新', icon: 'none' });
    } catch (err) {
      console.error('头像保存失败:', err);
      // 回滚 UI 和本地缓存
      this.setData({ displayAvatarUrl: previousDisplayUrl });
      userService.setUserInfo({ avatarUrl: previousAvatarUrl });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 输入昵称（Phase 7B — 云端同步保存）
  async onInputNickname(e) {
    const nickName = e.detail.value;
    if (!nickName || nickName.trim() === '') {
      return;
    }

    const trimmed = nickName.trim();
    const previousNickName = this.data.userInfo.nickName;
    // 乐观更新本地 UI
    this.setData({
      'userInfo.nickName': trimmed
    });

    try {
      await userService.saveUserInfo({ nickName: trimmed });
    } catch (err) {
      // 失败时回滚本地缓存再刷新 UI
      userService.setUserInfo({ nickName: previousNickName });
      this.refreshViewModel();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
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