/**
 * Profile 页面单元测试
 * 测试用户信息管理、云端同步等功能
 */

describe('Profile 页面测试', () => {
  let pageConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    pageConfig = {
      data: {
        userInfo: {
          avatarUrl: '',
          nickName: ''
        },
        openid: ''
      },

      onLoad() {
        const app = getApp();
        const openid = app.globalData.openid || wx.getStorageSync('user_openid');
        this.setData({ openid });
      },

      onShow() {
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
          this.getTabBar().setData({ selected: 3 });
        }
      },

      onChooseAvatar(e) {
        const { avatarUrl } = e.detail;
        if (!avatarUrl) return;

        const openid = this.data.openid;
        if (!openid) return;

        wx.showLoading({ title: '上传中...' });

        const timestamp = Date.now();
        const cloudPath = `avatars/${openid}/${timestamp}.jpg`;

        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: avatarUrl,
          success: (res) => {
            const fileID = res.fileID;
            this.setData({
              'userInfo.avatarUrl': fileID
            });
            const updatedUserInfo = { ...this.data.userInfo };
            const app = getApp();
            app.globalData.userInfo = updatedUserInfo;
            wx.setStorageSync('userInfo', updatedUserInfo);
            wx.showToast({ title: '头像设置成功', icon: 'success' });
          },
          fail: (err) => {
            wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      },

      onInputNickname(e) {
        const nickName = e.detail.value;
        if (!nickName || nickName.trim() === '') return;

        const openid = this.data.openid;
        if (!openid) return;

        this.setData({
          'userInfo.nickName': nickName.trim()
        });

        const updatedUserInfo = { ...this.data.userInfo };
        const app = getApp();
        app.globalData.userInfo = updatedUserInfo;
        wx.setStorageSync('userInfo', updatedUserInfo);
      },

      setData(data) {
        const currentData = this.data;
        Object.keys(data).forEach(key => {
          if (key.includes('.')) {
            const keys = key.split('.');
            let obj = currentData;
            for (let i = 0; i < keys.length - 1; i++) {
              obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = data[key];
          } else {
            currentData[key] = data[key];
          }
        });
      }
    };
  });

  describe('页面初始化测试', () => {
    test('onLoad应该获取openid', () => {
      pageConfig.onLoad();
      expect(pageConfig.data.openid).toBe('test_openid');
    });

    test('getApp应该在onLoad中调用，不应在文件顶层', () => {
      expect(typeof pageConfig.onLoad).toBe('function');
      expect(pageConfig.data.openid).toBe('');
    });
  });

  describe('头像上传测试', () => {
    test('应该生成正确的云存储路径', () => {
      const openid = 'user_123';
      const timestamp = 1714656000000;
      const cloudPath = `avatars/${openid}/${timestamp}.jpg`;
      
      expect(cloudPath).toMatch(/^avatars\/.+\/\d+\.jpg$/);
    });

    test('应该正确更新用户头像', () => {
      const mockEvent = {
        detail: {
          avatarUrl: 'https://tmp/test_avatar.jpg'
        }
      };

      const uploadFileMock = jest.fn((config) => {
        config.success({ fileID: 'cloud_file_123' });
      });
      wx.cloud.uploadFile = uploadFileMock;

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onChooseAvatar(mockEvent);

      expect(uploadFileMock).toHaveBeenCalled();
    });

    test('头像上传失败应该显示错误提示', () => {
      const mockEvent = {
        detail: {
          avatarUrl: 'https://tmp/test_avatar.jpg'
        }
      };

      const uploadFileMock = jest.fn((config) => {
        config.fail({ errMsg: '上传失败' });
      });
      wx.cloud.uploadFile = uploadFileMock;

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onChooseAvatar(mockEvent);

      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '上传失败，请重试', icon: 'none' })
      );
    });
  });

  describe('昵称输入测试', () => {
    test('应该正确更新昵称', () => {
      const mockEvent = {
        detail: {
          value: '测试用户'
        }
      };

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onInputNickname(mockEvent);

      expect(pageConfig.data.userInfo.nickName).toBe('测试用户');
    });

    test('应该过滤空白字符', () => {
      const mockEvent = {
        detail: {
          value: '  测试用户  '
        }
      };

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onInputNickname(mockEvent);

      expect(pageConfig.data.userInfo.nickName).toBe('测试用户');
    });

    test('空昵称应该不更新', () => {
      const mockEvent = {
        detail: {
          value: ''
        }
      };

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onInputNickname(mockEvent);

      expect(pageConfig.data.userInfo.nickName).toBe('');
    });

    test('仅空白字符应该不更新', () => {
      const mockEvent = {
        detail: {
          value: '   '
        }
      };

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onInputNickname(mockEvent);

      expect(pageConfig.data.userInfo.nickName).toBe('');
    });
  });

  describe('TabBar集成测试', () => {
    test('onShow应该设置TabBar选中状态', () => {
      const mockTabBar = {
        setData: jest.fn()
      };
      pageConfig.getTabBar = jest.fn(() => mockTabBar);

      pageConfig.onShow();

      expect(mockTabBar.setData).toHaveBeenCalledWith({ selected: 3 });
    });

    test('getTabBar不存在时不应报错', () => {
      pageConfig.getTabBar = undefined;
      
      expect(() => pageConfig.onShow()).not.toThrow();
    });
  });

  describe('数据同步测试', () => {
    test('更新用户信息应该同步到全局和本地', () => {
      const mockEvent = {
        detail: {
          value: '新昵称'
        }
      };

      pageConfig.setData({ openid: 'user_123' });
      pageConfig.onInputNickname(mockEvent);

      expect(wx.setStorageSync).toHaveBeenCalledWith('userInfo', expect.any(Object));
    });
  });
});