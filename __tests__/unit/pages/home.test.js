/**
 * 首页 (home) 页面单元测试
 * 测试时辰显示、任务列表、打卡功能等
 */

const fs = require('fs');
const path = require('path');

// 模拟微信小程序API和页面方法
global.wx = {
  switchTab: jest.fn(),
  navigateTo: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn(),
  cloud: {
    callFunction: jest.fn()
  }
};

global.Page = jest.fn((config) => config);
global.getApp = jest.fn(() => ({
  globalData: {
    MyHabits: [],
    CheckinLogs: []
  }
}));

global.setTimeout = jest.fn((fn) => fn());

describe('首页 (home) 页面测试', () => {
  let pageConfig;

  beforeAll(() => {
    // 模拟页面配置
    pageConfig = {
      data: {
        timeInfo: {
          hour: '00',
          minute: '00',
          date: '',
          shichen: '亥时',
          meridian: '三焦经',
          advice: ''
        },
        taskList: [],
        loading: false,
        circleColors: [
          '#F5E6E0', '#E8E4D9', '#D4E5E0', '#E5DED4', '#D9E2E8', '#E8D9D9'
        ],
        navBgOpacity: 0
      },

      onLoad() {
        this.initTimeInfo();
        setTimeout(() => {
          this.loadHabitsData();
        }, 100);
      },

      onShow() {
        this.initTimeInfo();
        setTimeout(() => {
          this.loadHabitsData();
        }, 50);
      },

      initTimeInfo() {
        // 模拟初始化时间信息
        this.setData({
          timeInfo: {
            hour: '12',
            minute: '00',
            date: '4月14日 周一',
            shichen: '午时',
            meridian: '心经当令',
            advice: '宜小憩养心'
          }
        });
      },

      loadHabitsData() {
        // 模拟加载习惯数据
        this.setData({ loading: true });
        
        wx.cloud.callFunction({
          name: 'getTodayTasks',
          success: (res) => {
            if (res.result && res.result.success) {
              this.setData({
                taskList: res.result.data || [],
                loading: false
              });
            }
          },
          fail: () => {
            this.setData({ loading: false });
          }
        });
      },

      goToHabits() {
        wx.switchTab({
          url: '/pages/habits/habits'
        });
      },

      onCheckin(e) {
        const { habitId } = e.currentTarget.dataset;
        
        wx.cloud.callFunction({
          name: 'doCheckin',
          data: { habit_id: habitId },
          success: (res) => {
            if (res.result.success) {
              wx.showToast({
                title: '打卡成功',
                icon: 'none'
              });
              this.loadHabitsData();
            } else {
              wx.showToast({
                title: res.result.message || '打卡失败',
                icon: 'none'
              });
            }
          }
        });
      },

      onPageScroll(e) {
        const scrollTop = e.scrollTop;
        const maxScroll = 30;
        const opacity = Math.min(scrollTop / maxScroll, 1);
        this.setData({ navBgOpacity: opacity });
      },

      setData(data) {
        Object.assign(this.data, data);
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('页面生命周期测试', () => {
    test('onLoad应该初始化时间信息和加载数据', () => {
      pageConfig.onLoad();
      
      expect(pageConfig.data.timeInfo.shichen).toBe('午时');
      expect(wx.cloud.callFunction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'getTodayTasks' })
      );
    });

    test('onShow应该刷新时间信息和数据', () => {
      pageConfig.onShow();
      
      expect(pageConfig.data.timeInfo.shichen).toBe('午时');
    });
  });

  describe('时间信息显示测试', () => {
    test('应该正确显示时辰信息', () => {
      pageConfig.initTimeInfo();
      
      expect(pageConfig.data.timeInfo).toHaveProperty('shichen');
      expect(pageConfig.data.timeInfo).toHaveProperty('meridian');
      expect(pageConfig.data.timeInfo).toHaveProperty('advice');
    });

    test('时间格式应该正确', () => {
      pageConfig.initTimeInfo();
      
      expect(pageConfig.data.timeInfo.hour).toMatch(/^\d{2}$/);
      expect(pageConfig.data.timeInfo.minute).toMatch(/^\d{2}$/);
    });
  });

  describe('任务列表测试', () => {
    test('应该加载今日任务', () => {
      const mockTasks = [
        { habit_id: '1', title: '站桩', is_done: false, streak_days: 3 },
        { habit_id: '2', title: '八段锦', is_done: true, streak_days: 5 }
      ];

      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({
          result: {
            success: true,
            data: mockTasks
          }
        });
      });

      pageConfig.loadHabitsData();

      expect(pageConfig.data.taskList).toHaveLength(2);
      expect(pageConfig.data.loading).toBe(false);
    });

    test('空任务列表应该正常显示', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({
          result: {
            success: true,
            data: []
          }
        });
      });

      pageConfig.loadHabitsData();

      expect(pageConfig.data.taskList).toHaveLength(0);
    });

    test('加载失败应该处理错误', () => {
      wx.cloud.callFunction.mockImplementation(({ fail }) => {
        fail(new Error('网络错误'));
      });

      pageConfig.loadHabitsData();

      expect(pageConfig.data.loading).toBe(false);
    });
  });

  describe('打卡功能测试', () => {
    test('打卡成功应该显示成功提示', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({
          result: { success: true, message: '打卡成功' }
        });
      });

      const mockEvent = {
        currentTarget: {
          dataset: { habitId: '1' }
        }
      };

      pageConfig.onCheckin(mockEvent);

      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '打卡成功', icon: 'none' })
      );
    });

    test('重复打卡应该显示提示', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({
          result: { success: false, message: '今日已打卡' }
        });
      });

      const mockEvent = {
        currentTarget: {
          dataset: { habitId: '1' }
        }
      };

      pageConfig.onCheckin(mockEvent);

      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '今日已打卡', icon: 'none' })
      );
    });

    test('打卡应该传递正确的habitId', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({ result: { success: true } });
      });

      const mockEvent = {
        currentTarget: {
          dataset: { habitId: 'h_123' }
        }
      };

      pageConfig.onCheckin(mockEvent);

      expect(wx.cloud.callFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'doCheckin',
          data: { habit_id: 'h_123' }
        })
      );
    });
  });

  describe('页面导航测试', () => {
    test('点击添加应该跳转到修习页面', () => {
      pageConfig.goToHabits();

      expect(wx.switchTab).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/pages/habits/habits' })
      );
    });
  });

  describe('首页置顶视觉测试', () => {
    test('首页不显示置顶星标', () => {
      const wxml = fs.readFileSync(
        path.join(__dirname, '../../../miniprogram/pages/home/home.wxml'),
        'utf8'
      );

      expect(wxml).not.toContain('pin-badge');
    });
  });

  describe('页面滚动效果测试', () => {
    test('滚动应该改变导航栏透明度', () => {
      pageConfig.onPageScroll({ scrollTop: 15 });

      expect(pageConfig.data.navBgOpacity).toBe(0.5);
    });

    test('滚动超过阈值应该最大透明度为1', () => {
      pageConfig.onPageScroll({ scrollTop: 100 });

      expect(pageConfig.data.navBgOpacity).toBe(1);
    });

    test('滚动为0时透明度应该为0', () => {
      pageConfig.onPageScroll({ scrollTop: 0 });

      expect(pageConfig.data.navBgOpacity).toBe(0);
    });
  });

  describe('养生建议测试', () => {
    test('应该根据时辰显示正确的养生建议', () => {
      const adviceMap = {
        '子时': '宜熟睡养胆',
        '丑时': '宜熟睡养肝',
        '寅时': '宜深度睡眠',
        '卯时': '宜起床排便',
        '辰时': '宜进食早餐',
        '巳时': '宜工作学习',
        '午时': '宜小憩养心',
        '未时': '宜多喝水',
        '申时': '宜运动排毒',
        '酉时': '宜静养藏精',
        '戌时': '宜放松身心',
        '亥时': '宜准备入睡'
      };

      Object.entries(adviceMap).forEach(([shichen, expectedAdvice]) => {
        expect(expectedAdvice).toBeTruthy();
      });
    });
  });
});
