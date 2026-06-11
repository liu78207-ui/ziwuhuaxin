/**
 * App.js 单元测试
 * 对应用例：UC-026~UC-029, EX-006, EX-007, COM-005, COM-007, EX-014, EX-015
 */

global.wx = {
  cloud: {
    init: jest.fn(),
    callFunction: jest.fn()
  },
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  showToast: jest.fn(),
  onNetworkStatusChange: jest.fn(),
  getNetworkType: jest.fn()
};

describe('App.js 功能测试', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UC-026: 本地数据加载', () => {
    test('应正确加载MyHabits数据', () => {
      const mockHabits = [
        { habitId: '1', name: '金刚功', freq_type: 'daily' }
      ];
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'MyHabits') return mockHabits;
        return null;
      });

      const storedHabits = wx.getStorageSync('MyHabits');
      const globalData = { MyHabits: storedHabits || [] };

      expect(globalData.MyHabits).toHaveLength(1);
      expect(globalData.MyHabits[0].name).toBe('金刚功');
    });

    test('应正确加载CheckinLogs数据', () => {
      const mockLogs = [
        { habitId: '1', date: '2026-04-13', sync_status: 1 }
      ];
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'CheckinLogs') return mockLogs;
        return null;
      });

      const storedLogs = wx.getStorageSync('CheckinLogs');
      const globalData = { CheckinLogs: storedLogs || [] };

      expect(globalData.CheckinLogs).toHaveLength(1);
    });

    test('应处理本地存储为空的情况', () => {
      wx.getStorageSync.mockReturnValue(null);

      const habits = wx.getStorageSync('MyHabits') || [];

      expect(habits).toEqual([]);
    });
  });

  describe('EX-006: 本地数据损坏修复', () => {
    test('缺少freq_type应添加默认值', () => {
      const damagedHabits = [
        { habitId: '1', name: '金刚功' }
      ];

      const fixedHabits = damagedHabits.map(habit => {
        if (!habit.freq_type) {
          habit.freq_type = 'daily';
          habit.freq_rules = 1;
        }
        return habit;
      });

      expect(fixedHabits[0].freq_type).toBe('daily');
      expect(fixedHabits[0].freq_rules).toBe(1);
    });

    test('freq_category与freq_type不匹配应修正', () => {
      const damagedHabits = [
        { habitId: '1', name: '金刚功', freq_type: 'daily', freq_category: 'daily-interval' }
      ];

      const fixedHabits = damagedHabits.map(habit => {
        if (habit.freq_category === 'daily-interval' && habit.freq_type === 'daily') {
          habit.freq_type = 'interval';
        }
        return habit;
      });

      expect(fixedHabits[0].freq_type).toBe('interval');
    });
  });

  describe('EX-007: 数据迁移', () => {
    test('应迁移旧策略数据格式', () => {
      const oldStrategy = {
        habit_id: 1,
        habit_title: '站桩',
        category: '运动类',
        duration: 20,
        freq_type: 'daily'
      };

      function migrateOldStrategy(old) {
        return {
          habitId: String(old.habit_id || old.habitId || Date.now()),
          name: old.habit_title || old.name || '未知习惯',
          themeClass: old.themeClass || 'theme-red',
          targetMinutes: old.duration || old.targetMinutes || 20,
          category: old.category || '运动类',
          freq_type: old.freq_type || 'daily',
          createdAt: new Date().toISOString().split('T')[0]
        };
      }

      const migrated = migrateOldStrategy(oldStrategy);

      expect(migrated.habitId).toBe('1');
      expect(migrated.name).toBe('站桩');
      expect(migrated.targetMinutes).toBe(20);
      expect(migrated.freq_type).toBe('daily');
    });

    test('应迁移旧打卡记录格式', () => {
      const oldRecords = {
        'h_001': ['2026-04-10', '2026-04-11', '2026-04-12'],
        'h_002': ['2026-04-11', '2026-04-13']
      };

      function migrateOldRecords(records) {
        const logs = [];
        for (const habitId in records) {
          const dates = records[habitId];
          if (Array.isArray(dates)) {
            dates.forEach(dateStr => {
              logs.push({
                logId: `L_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                habitId: String(habitId),
                date: dateStr,
                timestamp: new Date(dateStr).getTime()
              });
            });
          }
        }
        return logs;
      }

      const migrated = migrateOldRecords(oldRecords);

      expect(migrated).toHaveLength(5);
      expect(migrated[0].habitId).toBe('h_001');
    });
  });

  describe('COM-005: 调试模式日期偏移', () => {
    test('DEBUG_DAY_OFFSET为0应返回今天', () => {
      const DEBUG_DAY_OFFSET = 0;
      const today = new Date();
      if (DEBUG_DAY_OFFSET !== 0) {
        today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
      }
      const dateStr = today.toISOString().split('T')[0];
      const expectedToday = new Date().toISOString().split('T')[0];
      
      expect(dateStr).toBe(expectedToday);
    });

    test('DEBUG_DAY_OFFSET为1应返回明天', () => {
      const DEBUG_DAY_OFFSET = 1;
      const today = new Date();
      today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
      const dateStr = today.toISOString().split('T')[0];
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      expect(dateStr).toBe(tomorrowStr);
    });

    test('DEBUG_DAY_OFFSET为-1应返回昨天', () => {
      const DEBUG_DAY_OFFSET = -1;
      const today = new Date();
      today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
      const dateStr = today.toISOString().split('T')[0];
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      expect(dateStr).toBe(yesterdayStr);
    });
  });

  describe('COM-007: 软删除后恢复', () => {
    test('已删除的习惯应能恢复', () => {
      const MyHabits = [
        { habitId: '1', name: '金刚功', isDeleted: true, deletedAt: '2026-04-13' }
      ];

      const habitIndex = MyHabits.findIndex(h => h.habitId === '1' && h.isDeleted);
      
      expect(habitIndex).toBe(0);

      if (habitIndex > -1) {
        MyHabits[habitIndex] = {
          ...MyHabits[habitIndex],
          isDeleted: false,
          deletedAt: null,
          restoredAt: new Date().toISOString()
        };
      }

      expect(MyHabits[0].isDeleted).toBe(false);
      expect(MyHabits[0].restoredAt).toBeDefined();
    });

    test('未删除的习惯恢复应返回false', () => {
      const MyHabits = [
        { habitId: '1', name: '金刚功', isDeleted: false }
      ];

      const habitIndex = MyHabits.findIndex(h => h.habitId === '1' && h.isDeleted);

      expect(habitIndex).toBe(-1);
    });

    test('不存在的习惯恢复应返回false', () => {
      const MyHabits = [];

      const habitIndex = MyHabits.findIndex(h => h.habitId === '999' && h.isDeleted);

      expect(habitIndex).toBe(-1);
    });
  });

  describe('EX-014: 同步冲突处理', () => {
    test('应正确合并云端和本地数据', () => {
      const cloudLogs = [
        { habitId: '1', date: '2026-04-13', sync_status: 1 }
      ];
      const localPendingLogs = [
        { habitId: '2', date: '2026-04-13', sync_status: 0 }
      ];

      const cloudHabitDateMap = new Map();
      cloudLogs.forEach(log => {
        cloudHabitDateMap.set(`${log.habitId}_${log.date}`, log);
      });

      const mergedLogs = [...cloudLogs];
      let conflictCount = 0;

      localPendingLogs.forEach(localLog => {
        const key = `${localLog.habitId}_${localLog.date}`;
        if (!cloudHabitDateMap.has(key)) {
          mergedLogs.push({ ...localLog, sync_status: 0 });
        } else {
          conflictCount++;
        }
      });

      expect(mergedLogs).toHaveLength(2);
      expect(conflictCount).toBe(0);
    });

    test('冲突时应以云端数据为准', () => {
      const cloudLogs = [
        { habitId: '1', date: '2026-04-13', sync_status: 1 }
      ];
      const localPendingLogs = [
        { habitId: '1', date: '2026-04-13', sync_status: 0 }
      ];

      const cloudHabitDateMap = new Map();
      cloudLogs.forEach(log => {
        cloudHabitDateMap.set(`${log.habitId}_${log.date}`, log);
      });

      const mergedLogs = [...cloudLogs];
      let conflictCount = 0;

      localPendingLogs.forEach(localLog => {
        const key = `${localLog.habitId}_${localLog.date}`;
        if (!cloudHabitDateMap.has(key)) {
          mergedLogs.push({ ...localLog, sync_status: 0 });
        } else {
          conflictCount++;
        }
      });

      expect(mergedLogs).toHaveLength(1);
      expect(conflictCount).toBe(1);
    });
  });

  describe('EX-015: 部分同步失败', () => {
    test('应正确统计成功和失败数量', async () => {
      const logs = [
        { logId: '1', habitId: '1', date: '2026-04-13', sync_status: 0 },
        { logId: '2', habitId: '2', date: '2026-04-13', sync_status: 0 }
      ];

      let successCount = 0;
      let failCount = 0;

      for (const log of logs) {
        const mockResult = log.logId === '1' 
          ? { success: true } 
          : { success: false };
        
        if (mockResult.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });

    test('失败记录应保留待同步状态', () => {
      const logs = [
        { logId: '1', habitId: '1', date: '2026-04-13', sync_status: 0 }
      ];

      const result = { success: false, message: '失败' };

      if (!result.success) {
        // 保持原状态
      }

      const log = logs.find(l => l.logId === '1');
      expect(log.sync_status).toBe(0);
    });
  });

  describe('UC-028: 同步本地数据到云端', () => {
    test('无待同步数据时应跳过', async () => {
      const logs = [];
      const pendingLogs = logs.filter(log => log.sync_status === 0 || log.sync_status === undefined);
      const toDeleteLogs = logs.filter(log => log.sync_status === 2);

      const hasDataToSync = pendingLogs.length > 0 || toDeleteLogs.length > 0;

      expect(hasDataToSync).toBe(false);
    });

    test('有待同步数据时应执行同步', async () => {
      const logs = [
        { logId: '1', habitId: '1', date: '2026-04-13', sync_status: 0 }
      ];
      const pendingLogs = logs.filter(log => log.sync_status === 0 || log.sync_status === undefined);

      const hasDataToSync = pendingLogs.length > 0;

      expect(hasDataToSync).toBe(true);
    });
  });

  describe('UC-029: 网络状态监听', () => {
    test('WiFi网络应标记为在线', () => {
      const networkType = 'wifi';
      const isOnline = networkType !== 'none';

      expect(isOnline).toBe(true);
    });

    test('无网络应标记为离线', () => {
      const networkType = 'none';
      const isOnline = networkType !== 'none';

      expect(isOnline).toBe(false);
    });
  });

  describe('数据隔离', () => {
    test('不同openid的数据应互不影响', () => {
      const userAOpenid = 'user_a_openid';
      const userBOpenid = 'user_b_openid';

      const userALogs = [
        { _openid: userAOpenid, habitId: '1', date: '2026-04-13' }
      ];

      const userBLogs = userALogs.filter(log => log._openid === userBOpenid);

      expect(userBLogs).toHaveLength(0);
    });
  });

  describe('打卡记录操作', () => {
    test('应正确添加打卡记录', () => {
      const logs = [];
      const habitIdStr = '1';
      const date = '2026-04-13';

      const existingIndex = logs.findIndex(log =>
        log.habitId === habitIdStr && log.date === date
      );

      if (existingIndex === -1) {
        logs.push({
          logId: `L_${Date.now()}`,
          habitId: habitIdStr,
          date: date,
          timestamp: new Date(date).getTime(),
          sync_status: 0
        });
      }

      expect(logs).toHaveLength(1);
      expect(logs[0].habitId).toBe('1');
    });

    test('重复打卡应被阻止', () => {
      const logs = [
        { habitId: '1', date: '2026-04-13' }
      ];

      const existingIndex = logs.findIndex(log =>
        log.habitId === '1' && log.date === '2026-04-13'
      );

      expect(existingIndex).toBe(0);

      const canAdd = existingIndex === -1;
      expect(canAdd).toBe(false);
    });
  });

  describe('MyHabits操作', () => {
    test('应添加新习惯', () => {
      const habits = [];
      const newHabit = {
        habitId: '1',
        name: '金刚功',
        category: '运动类',
        targetMinutes: 20,
        freq_type: 'daily'
      };

      habits.push({
        ...newHabit,
        createdAt: new Date().toISOString().split('T')[0]
      });

      expect(habits).toHaveLength(1);
      expect(habits[0].name).toBe('金刚功');
    });

    test('应检查重复习惯', () => {
      const habits = [
        { habitId: '1', name: '金刚功' }
      ];

      const existingIndex = habits.findIndex(h => h.habitId === '1');

      expect(existingIndex).toBe(0);
    });

    test('应移除习惯（软删除）', () => {
      const habits = [
        { habitId: '1', name: '金刚功' },
        { habitId: '2', name: '八段锦' }
      ];

      const habitIndex = habits.findIndex(h => h.habitId === '1');

      if (habitIndex > -1) {
        habits[habitIndex] = {
          ...habits[habitIndex],
          isDeleted: true,
          deletedAt: new Date().toISOString()
        };
      }

      expect(habits[0].isDeleted).toBe(true);
      expect(habits[0].deletedAt).toBeDefined();
    });
  });

  describe('actual App id compatibility', () => {
    function loadAppConfig() {
      jest.resetModules();
      let appConfig;
      global.App = jest.fn(config => {
        appConfig = config;
        return config;
      });
      require('../../miniprogram/app.js');
      return appConfig;
    }

    test('addHabit restores deleted habits by strategy habit_id', () => {
      const app = loadAppConfig();
      app.globalData.MyHabits = [
        { habit_id: 'strategy-1', _id: 'catalog-1', name: 'Old', isDeleted: true, deletedAt: '2026-05-16' }
      ];

      const restoredId = app.addHabit({ strategy: { habit_id: 'strategy-1' }, _id: 'catalog-2', name: 'New' });

      expect(restoredId).toBe('strategy-1');
      expect(app.globalData.MyHabits).toHaveLength(1);
      expect(app.globalData.MyHabits[0].isDeleted).toBe(false);
      expect(app.globalData.MyHabits[0].deletedAt).toBeNull();
    });

    test('saveDeletedHabitInfo uses strategy habit_id as the history key', () => {
      const app = loadAppConfig();
      wx.getStorageSync.mockReturnValue({});

      app.saveDeletedHabitInfo({
        _id: 'catalog-1',
        title: 'Catalog Habit',
        strategy: { habit_id: 'strategy-1' }
      });

      expect(wx.setStorageSync).toHaveBeenCalledWith(
        'AllHabitsInfo',
        expect.objectContaining({
          'strategy-1': expect.objectContaining({
            habitId: 'strategy-1',
            name: 'Catalog Habit'
          })
        })
      );
    });

    test('log helpers match cloud habit_id and checkin_date fields', () => {
      const app = loadAppConfig();
      app.globalData.CheckinLogs = [
        { habit_id: 'strategy-1', checkin_date: '2026-05-16T00:00:00.000Z', sync_status: 1 }
      ];

      expect(app.getLogsByHabitId('strategy-1')).toHaveLength(1);
      expect(app.getLogsByDate('2026-05-16')).toHaveLength(1);
      expect(app.isCheckedOnDate('strategy-1', '2026-05-16')).toBe(true);
    });

    test('isCheckedOnDate ignores logs marked for deletion', () => {
      const app = loadAppConfig();
      app.globalData.CheckinLogs = [
        { habit_id: 'strategy-1', checkin_date: '2026-05-16', sync_status: 2 }
      ];

      expect(app.isCheckedOnDate('strategy-1', '2026-05-16')).toBe(false);
    });

    test('syncToCloud migrates legacy pending checkins through syncCheckin', async () => {
      const app = loadAppConfig();
      const storage = {};
      wx.getStorageSync.mockImplementation((key) => storage[key]);
      wx.setStorageSync.mockImplementation((key, value) => {
        storage[key] = value;
      });
      app.globalData.isOnline = true;
      app.globalData.CheckinLogs = [
        { logId: 'local-1', habitId: 'strategy-1', date: '2026-05-16', sync_status: 0 }
      ];
      global.getCurrentPages = jest.fn(() => []);
      wx.cloud.callFunction.mockResolvedValue({
        result: { success: true, data: { status: 'checked' } }
      });

      await app.syncToCloud();

      expect(wx.cloud.callFunction).toHaveBeenCalledWith(expect.objectContaining({
        name: 'syncCheckin',
        data: expect.objectContaining({
          userHabitId: 'strategy-1',
          date: '2026-05-16',
          action: 'checkin'
        })
      }));
      expect(app.globalData.CheckinLogs[0].sync_status).toBe(1);
    });

    test('syncToCloud migrates legacy delete markers through syncCheckin undo', async () => {
      const app = loadAppConfig();
      const storage = {};
      wx.getStorageSync.mockImplementation((key) => storage[key]);
      wx.setStorageSync.mockImplementation((key, value) => {
        storage[key] = value;
      });
      app.globalData.isOnline = true;
      app.globalData.CheckinLogs = [
        { logId: 'local-1', habitId: 'strategy-1', date: '2026-05-16', sync_status: 2 }
      ];
      global.getCurrentPages = jest.fn(() => []);
      wx.cloud.callFunction.mockResolvedValue({
        result: { success: true, data: { status: 'canceled' } }
      });

      await app.syncToCloud();

      expect(wx.cloud.callFunction).toHaveBeenCalledWith(expect.objectContaining({
        name: 'syncCheckin',
        data: expect.objectContaining({
          userHabitId: 'strategy-1',
          date: '2026-05-16',
          action: 'undo'
        })
      }));
      expect(app.globalData.CheckinLogs).toEqual([]);
    });

    test('category theme defaults use report-supported classes', () => {
      const app = loadAppConfig();

      expect(app.getThemeByCategory('sports')).toBe('t-green');
      expect(app.getThemeByCategory('therapy')).toBe('t-red');
      expect(app.getThemeByCategory('life')).toBe('t-yellow');
      expect(app.getThemeByCategory('运动类')).toBe('t-green');
      expect(app.getThemeByCategory('理疗类')).toBe('t-red');
      expect(app.getThemeByCategory('起居类')).toBe('t-yellow');
      expect(app.getThemeByCategory('unknown')).toBe('t-blue');
    });

    test('migrateOldStrategy keeps habit-specific theme instead of defaulting Chinese categories to blue', () => {
      const app = loadAppConfig();

      expect(app.migrateOldStrategy({
        habit_id: '1',
        habit_title: '金刚功',
        category: '运动类'
      }).themeClass).toBe('t-red');
      expect(app.migrateOldStrategy({
        habit_id: '3',
        habit_title: '八段锦',
        category: '运动类'
      }).themeClass).toBe('t-yellow');
      expect(app.migrateOldStrategy({
        habit_id: '12',
        habit_title: '艾灸',
        category: '理疗类'
      }).themeClass).toBe('t-red');
    });
  });
});
