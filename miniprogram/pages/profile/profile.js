const share = require('../../utils/share.js');
const db = wx.cloud.database();

Page({
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: ''
    },
    displayAvatarUrl: '',
    openid: ''
  },

  onLoad() {
    const app = getApp();
    // 获取全局 openid
    const openid = app.globalData.openid || wx.getStorageSync('user_openid');
    this.setData({ openid });
    
    // 从云数据库加载用户信息
    this.loadUserInfoFromCloud();
  },

  onShow() {
    share.enableShareMenu();

    // 设置自定义 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  // ========== 从云数据库加载用户信息 ==========
  loadUserInfoFromCloud() {
    const app = getApp();
    const openid = this.data.openid;
    if (!openid) {
      console.log('openid 未获取，跳过云端加载');
      return;
    }

    db.collection('users').doc(openid).get()
      .then(res => {
        const userData = res.data;
        if (userData) {
          this.setData({
            userInfo: {
              avatarUrl: userData.avatarUrl || '',
              nickName: userData.nickName || ''
            }
          });
          this.updateDisplayAvatar(userData.avatarUrl || '');
          // 同步到全局和本地缓存
          app.globalData.userInfo = this.data.userInfo;
          wx.setStorageSync('userInfo', this.data.userInfo);
          console.log('从云端加载用户信息成功:', userData);
        }
      })
      .catch(err => {
        // 用户记录不存在是正常的，不需要报错
        if (err.errCode === -1) {
          console.log('云端暂无用户记录，等待用户设置');
        } else {
          console.error('从云端加载用户信息失败:', err);
        }
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

    const app = getApp();
    const openid = this.data.openid || app.globalData.openid || wx.getStorageSync('user_openid');
    if (!openid) {
      wx.showToast({
        title: '用户未登录',
        icon: 'none'
      });
      return;
    }
    this.setData({ openid });

    // 显示上传中提示
    wx.showLoading({ title: '上传中...' });

    // 生成带时间戳的云存储路径（防重名）
    const timestamp = Date.now();
    const cloudPath = `avatars/${openid}/${timestamp}.jpg`;

    // 上传图片到云存储
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: avatarUrl,
      success: (res) => {
        const fileID = res.fileID;
        console.log('头像上传成功，fileID:', fileID);

        // 更新云数据库
        this.updateUserInfoInCloud({
          avatarUrl: fileID
        });

        // 保存云端 fileID，同时将图片展示地址转换成可直接渲染的临时 URL
        this.setData({
          'userInfo.avatarUrl': fileID
        });
        this.updateDisplayAvatar(fileID);

        // 同步到全局和本地缓存
        const updatedUserInfo = { ...this.data.userInfo };
        app.globalData.userInfo = updatedUserInfo;
        wx.setStorageSync('userInfo', updatedUserInfo);

        wx.showToast({
          title: '头像设置成功',
          icon: 'success'
        });
      },
      fail: (err) => {
        console.error('头像上传失败:', err);
        wx.showToast({
          title: '上传失败，请重试',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
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

    const openid = this.data.openid;
    if (!openid) {
      wx.showToast({
        title: '用户未登录',
        icon: 'none'
      });
      return;
    }

    // 更新云数据库
    this.updateUserInfoInCloud({
      nickName: nickName.trim()
    });

    // 更新本地显示
    this.setData({
      'userInfo.nickName': nickName.trim()
    });

    // 同步到全局和本地缓存
    const updatedUserInfo = { ...this.data.userInfo };
    const app = getApp();
    app.globalData.userInfo = updatedUserInfo;
    wx.setStorageSync('userInfo', updatedUserInfo);

    console.log('昵称更新成功:', nickName.trim());
  },

  // ========== 更新用户信息到云数据库 ==========
  updateUserInfoInCloud(data) {
    const openid = this.data.openid;
    if (!openid) return;

    // 使用 set 方法，如果不存在则创建，存在则更新
    db.collection('users').doc(openid).set({
      data: {
        ...this.data.userInfo,
        ...data,
        updateTime: db.serverDate()
      }
    })
    .then(() => {
      console.log('用户信息更新到云端成功');
    })
    .catch(err => {
      console.error('用户信息更新到云端失败:', err);
    });
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

  // 查看修习记录
  viewHistory() {
    wx.showToast({
      title: '记录功能开发中',
      icon: 'none'
    });
  },

  // 养生偏好设置
  viewSettings() {
    wx.showToast({
      title: '设置功能开发中',
      icon: 'none'
    });
  },

  // 关于子午花信
  viewAbout() {
    wx.showToast({
      title: '关于功能开发中',
      icon: 'none'
    });
  },

  onShareAppMessage() {
    return share.appMessage('子午花信 · 顺时修习，日日有信', '/pages/profile/profile');
  },

  onShareTimeline() {
    return share.timeline('子午花信 · 顺时修习，日日有信', 'from=timeline&page=profile');
  }
});
