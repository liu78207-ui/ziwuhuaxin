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

  // 加载视图模型
  loadViewModel() {
    const { userInfo, displayAvatarUrl } = userService.getProfileViewModel();
    this.setData({
      userInfo,
      displayAvatarUrl: userInfo.avatarUrl || ''
    });
    // 后台静默刷新云端用户信息
    this.refreshUserInfoFromCloud();
  },

  // 后台静默刷新云端用户信息
  refreshUserInfoFromCloud() {
    // 暂不实现（云端身份依赖云函数，Phase 6C 不修改 cloudService）
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

    // 头像上传功能暂缓（cloudService.uploadFile 不存在）
    // 保留本地临时显示，不上传到云端
    wx.showToast({
      title: '头像预览已更新，上传功能开发中',
      icon: 'none'
    });
  },

  updateDisplayAvatar(avatarUrl) {
    if (!avatarUrl) {
      this.setData({ displayAvatarUrl: '' });
      return;
    }

    if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({
        fileList: [avatarUrl],
        success: (res) => {
          const file = res.fileList && res.fileList[0];
          this.setData({
            displayAvatarUrl: (file && file.tempFileURL) || avatarUrl
          });
        },
        fail: (err) => {
          console.error('获取头像临时链接失败:', err);
          this.setData({ displayAvatarUrl: avatarUrl });
        }
      });
      return;
    }

    this.setData({ displayAvatarUrl: avatarUrl });
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
    this.setData({ userInfo: updatedUserInfo });

    // 昵称更新功能暂缓（云端更新依赖 cloudService）
    console.log('昵称已更新（待云端同步）:', nickName.trim());
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