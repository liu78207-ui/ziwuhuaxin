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
    this.loadViewModel();
  },

  onShow() {
    share.enableShareMenu();

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  // 加载视图模型（同步，只读本地缓存）
  loadViewModel() {
    const { userInfo, displayAvatarUrl } = userService.getProfileViewModel();
    this.setData({
      userInfo,
      displayAvatarUrl
    });
  },

  // ========== 选择头像 ==========
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) {
      console.error('获取头像临时路径失败');
      return;
    }

    this.setData({
      displayAvatarUrl: avatarUrl
    });

    // Phase 6C 暂缓头像上传功能（cloudService.uploadFile 不存在）
    wx.showToast({
      title: '头像预览已更新，上传功能开发中',
      icon: 'none'
    });
  },

  // ========== 输入昵称 ==========
  onInputNickname(e) {
    const nickName = e.detail.value;
    if (!nickName || nickName.trim() === '') {
      return;
    }

    // 更新本地缓存
    const updatedUserInfo = { ...this.data.userInfo, nickName: nickName.trim() };
    userService.setUserInfo(updatedUserInfo);
    this.setData({
      userInfo: updatedUserInfo,
      displayAvatarUrl: updatedUserInfo.avatarUrl || ''
    });

    // Phase 6C 暂缓云端更新，云函数实现后替换
  },

  // 返回上一页
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