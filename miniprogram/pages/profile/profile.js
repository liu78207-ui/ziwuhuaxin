const app = getApp();

Page({
  data: {
    userInfo: null
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo
    });
  },

  handleLogin() {
    if (app.globalData.userInfo) {
      return;
    }

    app.getUserProfile(() => {
      this.setData({
        userInfo: app.globalData.userInfo
      });
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });
    });
  },

  viewBadges() {
    wx.showToast({
      title: '勋章功能开发中',
      icon: 'none'
    });
  },

  viewHistory() {
    wx.showToast({
      title: '记录功能开发中',
      icon: 'none'
    });
  },

  clearData() {
    wx.showModal({
      title: '提示',
      content: '确定要清除缓存吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({
            title: '已清除',
            icon: 'success'
          });
        }
      }
    });
  }
});
