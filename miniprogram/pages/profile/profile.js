/**
 * profile.js - 个人中心页面
 * 页面层只负责：UI 渲染、用户事件响应、调用 Service
 */

const shareService = require('../../services/shareService');
const userService = require('../../services/userService');

function getErrorMessage(err) {
  return err && err.message ? err.message : String(err || 'unknown error');
}

Page({
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: ''
    },
    displayAvatarUrl: '',
    isAvatarSaving: false,
    isAvatarChoosing: false,
    isProfileSaving: false,
    isLoggingIn: false
  },

  onLoad() {
    this.refreshViewModel();
  },

  onShow() {
    shareService.enableShareMenu();

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }

    this.clearAvatarChoosingLock();
    this.refreshViewModel();
  },

  onUnload() {
    this.clearAvatarChoosingLock();
  },

  refreshViewModel() {
    const vm = userService.getProfileViewModel();
    this.setData({
      userInfo: { nickName: vm.nickName },
      displayAvatarUrl: vm.displayAvatarUrl,
      buttonText: vm.buttonText,
      memberSince: vm.memberSince,
      isLoggedIn: vm.isLoggedIn,
      canEditProfile: vm.canEditProfile
    });
  },

  async onLogin() {
    if (this.data.isLoggingIn) {
      return;
    }

    this.setData({ isLoggingIn: true });
    try {
      await userService.login({ force: true });
      try {
        await userService.refreshUserInfo();
      } catch (refreshErr) {
        console.warn('刷新用户资料失败:', getErrorMessage(refreshErr));
      }
      this.refreshViewModel();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (err) {
      console.error('登录失败:', getErrorMessage(err));
      wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ isLoggingIn: false });
    }
  },

  setAvatarChoosingLock() {
    if (this._avatarChoosingTimer) {
      clearTimeout(this._avatarChoosingTimer);
    }
    this.setData({ isAvatarChoosing: true });
    this._avatarChoosingTimer = setTimeout(() => {
      this.clearAvatarChoosingLock();
    }, 1500);
  },

  clearAvatarChoosingLock() {
    if (this._avatarChoosingTimer) {
      clearTimeout(this._avatarChoosingTimer);
      this._avatarChoosingTimer = null;
    }
    if (this.data && this.data.isAvatarChoosing) {
      this.setData({ isAvatarChoosing: false });
    }
  },

  onAvatarOpen() {
    if (this.data.isAvatarSaving || this.data.isAvatarChoosing) {
      return;
    }
    this.setAvatarChoosingLock();
  },

  // 选择头像（Phase 7D – 选图 + 上传云端 + 保存）
  async onChooseAvatar(e) {
    if (this.data.isAvatarSaving) {
      return;
    }
    this.clearAvatarChoosingLock();

    const { avatarUrl } = e.detail || {};
    if (!avatarUrl) {
      console.error('获取头像临时路径失败');
      return;
    }

    // 未登录禁止上传，避免留下无归属的孤立文件
    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ isAvatarSaving: true });

    const userInfo = userService.getUserInfo();
    const previousAvatarUrl = userInfo.avatarUrl || '';
    const previousDisplayUrl = this.data.displayAvatarUrl;

    // 乐观更新本地预览
    this.setData({ displayAvatarUrl: avatarUrl });

    // 构造云存储路径：avatars/{userId}_{timestamp}.jpg
    const userId = userInfo._userId || 'guest';
    const cloudPath = userService.buildAvatarCloudPath(userId);

    let cloudUrl = '';
    try {
      cloudUrl = await userService.uploadAvatar(avatarUrl, cloudPath);
    } catch (err) {
      console.error('头像上传失败:', getErrorMessage(err));
      // 回滚 UI 和本地缓存
      this.setData({ displayAvatarUrl: previousDisplayUrl });
      userService.setUserInfo({ avatarUrl: previousAvatarUrl });
      wx.showToast({ title: '上传失败', icon: 'none' });
      this.setData({ isAvatarSaving: false });
      return;
    }

    // 保存到云端 + 本地缓存
    try {
      await userService.saveUserInfo({ avatarUrl: cloudUrl });
      this.setData({ displayAvatarUrl: cloudUrl });
      wx.showToast({ title: '头像已更新', icon: 'none' });
    } catch (err) {
      console.error('头像保存失败:', getErrorMessage(err));
      // 回滚 UI 和本地缓存
      this.setData({ displayAvatarUrl: previousDisplayUrl });
      userService.setUserInfo({ avatarUrl: previousAvatarUrl });
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ isAvatarSaving: false });
    }
  },

  // 输入昵称（微信 nickname 能力确认后保存）
  async onNicknameSubmit(e) {
    if (this.data.isProfileSaving) {
      return;
    }

    const nickName = e && e.detail ? e.detail.value : '';
    const trimmed = userService.normalizeNickName(nickName);
    if (!trimmed) {
      return;
    }
    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.refreshViewModel();
      return;
    }
    if (trimmed === this.data.userInfo.nickName) {
      return;
    }

    const previousNickName = this.data.userInfo.nickName;
    // 乐观更新本地 UI
    this.setData({
      'userInfo.nickName': trimmed,
      isProfileSaving: true
    });

    try {
      await userService.saveUserInfo({ nickName: trimmed });
      wx.showToast({ title: '昵称已更新', icon: 'none' });
    } catch (err) {
      console.error('昵称保存失败:', getErrorMessage(err));
      // 失败时回滚本地缓存再刷新 UI
      userService.setUserInfo({ nickName: previousNickName });
      this.refreshViewModel();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isProfileSaving: false });
    }
  },

  onInputNickname(e) {
    return this.onNicknameSubmit(e);
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
    return shareService.getShareMessage('profile');
  },

  onShareTimeline() {
    return shareService.getShareTimeline('profile');
  }
});
