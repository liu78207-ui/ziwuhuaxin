/**
 * ============================================================
 * ⚠️ 安全提示 ⚠️
 * ============================================================
 * 注意：本项目的 MyHabits 和 CheckinLogs 数据表，务必在云开发控制台中
 * 将其数据权限设置为【仅创建者可读写】。前端在执行 db.collection('CheckinLogs').add()
 * 时，系统会自动写入 _openid 字段，实现天然的数据隔离，无需在代码中手动拼接 openid。
 * ============================================================
 */

const iconMap = require('../../utils/iconMap.js');
const reportCalculator = require('../../utils/reportCalculator.js');
const lunarCalendar = require('../../utils/lunarCalendar.js');
const share = require('../../utils/share.js');

// 从全局获取调试配置
const getDebugOffset = () => {
  const app = getApp();
  const offset = app.globalData.DEBUG_DAY_OFFSET;
  return offset !== undefined ? offset : 0;
};

// 获取模拟日期（如果处于调试模式）
const getSimulatedDate = () => {
  const DEBUG_DAY_OFFSET = getDebugOffset();
  const today = new Date();
  if (DEBUG_DAY_OFFSET !== 0) {
    today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
  }
  return today;
};

Page({
  data: {
    currentTab: 'week', // 'week', 'month' 或 'year'
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    dateTitle: '',
    dateSubtitle: '',
    lunarDate: '',
    dateRange: '',
    habitMatrix: [],
    monthHabits: [],
    yearHabits: [],
    stats: {
      checkinRate: 0,
      totalCount: 0,
      checkinDays: 0,
      maxStreak: 0
    },
    currentWeekStart: null, // 当前周开始日期
    currentMonth: null, // 当前显示的月份 (0-11)
    currentYear: null // 当前显示的年份
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

  onLoad() {
    // 初始化当前时间（考虑调试偏移）
    const today = getSimulatedDate();
    const weekStart = this.getWeekStart(today);
    this.setData({
      currentWeekStart: weekStart.getTime(),
      currentMonth: today.getMonth(),
      currentYear: today.getFullYear(),
      // 初始化空数据结构，避免渲染错误
      habitMatrix: [],
      monthHabits: [],
      yearHabits: [],
      stats: {
        checkinRate: 0,
        totalCount: 0,
        checkinDays: 0,
        maxStreak: 0
      }
    });

    this.updateDateDisplay();
  },

  onShow() {
    share.enableShareMenu();

    // 调试：检查本地存储中的数据
    this.debugStorageData();
    
    // 每次显示页面时刷新数据（确保跨页面同步）
    // 使用 wx.nextTick 避免与初次渲染冲突
    wx.nextTick(() => {
      this.loadRealData();
    });

    // 设置自定义 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  // 调试：检查本地存储中的数据
  debugStorageData() {
    try {
      const allHabitsInfo = wx.getStorageSync('AllHabitsInfo') || {};
      const checkinLogs = wx.getStorageSync('CheckinLogs') || [];
      const myHabits = wx.getStorageSync('MyHabits') || [];
      
      console.log('=== 调试信息 ===');
      console.log('AllHabitsInfo 键:', Object.keys(allHabitsInfo));
      console.log('AllHabitsInfo 内容:', allHabitsInfo);
      console.log('CheckinLogs 中的 habitIds:', [...new Set(checkinLogs.map(log => log.habitId))]);
      console.log('MyHabits 中的 habitIds:', myHabits.map(h => h.habitId || h._id));
      console.log('===============');
    } catch (e) {
      console.error('调试信息获取失败:', e);
    }
  },

  // 获取周开始日期（周一）
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // 格式化日期（只显示月/日）
  formatDate(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}.${day}`;
  },

  formatFullDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}.${month}.${day}`;
  },

  // 格式化日期为 key (YYYY-MM-DD)
  formatDateKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 更新日期显示
  updateDateDisplay() {
    const currentTab = this.data.currentTab;

    let dateTitle = '';
    let dateSubtitle = '';

    if (currentTab === 'week') {
      const weekStart = new Date(this.data.currentWeekStart);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      dateTitle = `${this.formatFullDate(weekStart)} - ${this.formatDate(weekEnd)}`;
      dateSubtitle = lunarCalendar.formatLunarRange(weekStart, weekEnd);
    } else if (currentTab === 'month') {
      const year = this.data.currentYear;
      const month = this.data.currentMonth;
      const monthStr = (month + 1).toString().padStart(2, '0');
      const lastDay = new Date(year, month + 1, 0).getDate();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month, lastDay);
      dateTitle = `${year}.${monthStr}`;
      dateSubtitle = lunarCalendar.formatLunarRange(monthStart, monthEnd);
    } else if (currentTab === 'year') {
      const year = this.data.currentYear;
      dateTitle = `${year}`;
      dateSubtitle = lunarCalendar.formatLunarRange(
        new Date(year, 0, 1),
        new Date(year, 11, 31)
      );
    }

    this.setData({
      dateTitle,
      dateSubtitle,
      lunarDate: dateTitle,
      dateRange: dateSubtitle
    });
  },

  // 切换报表类型
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    // 使用 wx.nextTick 确保 setData 完成后再加载数据
    wx.nextTick(() => {
      this.updateDateDisplay();
      this.loadRealData();
    });
  },

  // 上一周期
  prevPeriod() {
    console.log('prevPeriod clicked, currentTab:', this.data.currentTab);
    const currentTab = this.data.currentTab;
    
    if (currentTab === 'week') {
      const weekStart = new Date(this.data.currentWeekStart);
      weekStart.setDate(weekStart.getDate() - 7);
      this.setData({ currentWeekStart: weekStart.getTime() }, () => {
        this.updateDateDisplay();
        this.loadRealData();
      });
    } else if (currentTab === 'month') {
      let newMonth = this.data.currentMonth - 1;
      let newYear = this.data.currentYear;
      if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      }
      this.setData({ currentMonth: newMonth, currentYear: newYear }, () => {
        this.updateDateDisplay();
        this.loadRealData();
      });
    } else if (currentTab === 'year') {
      this.setData({ currentYear: this.data.currentYear - 1 }, () => {
        this.updateDateDisplay();
        this.loadRealData();
      });
    }
  },

  // 下一周期
  nextPeriod() {
    console.log('nextPeriod clicked, currentTab:', this.data.currentTab);
    const currentTab = this.data.currentTab;
    
    if (currentTab === 'week') {
      const weekStart = new Date(this.data.currentWeekStart);
      weekStart.setDate(weekStart.getDate() + 7);
      this.setData({ currentWeekStart: weekStart.getTime() }, () => {
        this.updateDateDisplay();
        this.loadRealData();
      });
    } else if (currentTab === 'month') {
      let newMonth = this.data.currentMonth + 1;
      let newYear = this.data.currentYear;
      if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      }
      this.setData({ currentMonth: newMonth, currentYear: newYear }, () => {
        this.updateDateDisplay();
        this.loadRealData();
      });
    } else if (currentTab === 'year') {
      this.setData({ currentYear: this.data.currentYear + 1 }, () => {
        this.updateDateDisplay();
        this.loadRealData();
      });
    }
  },

  // 加载真实数据（严格基于 MyHabits 和 CheckinLogs）
  async loadRealData() {
    const app = getApp();
    const currentTab = this.data.currentTab;

    // 确保时间状态已初始化（考虑调试偏移）
    if (currentTab === 'week' && !this.data.currentWeekStart) {
      const today = getSimulatedDate();
      const weekStart = this.getWeekStart(today);
      this.setData({ currentWeekStart: weekStart.getTime() });
    }

    // 优先从本地存储读取 MyHabits（确保获取最新数据）
    let myHabits = [];
    try {
      const storedHabits = wx.getStorageSync('MyHabits');
      if (storedHabits && Array.isArray(storedHabits)) {
        myHabits = storedHabits;
        // 同步到全局数据
        app.globalData.MyHabits = storedHabits;
        console.log('从本地存储加载 MyHabits:', myHabits.length);
      }
    } catch (e) {
      console.error('从本地存储读取 MyHabits 失败:', e);
    }

    // 如果本地存储为空，再尝试从全局数据获取
    if (!myHabits || myHabits.length === 0) {
      myHabits = app.getAllHabits ? app.getAllHabits() : (app.globalData.MyHabits || []);
    }

    // 同样优先从本地存储读取 CheckinLogs
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        app.globalData.CheckinLogs = storedLogs;
        console.log('从本地存储加载 CheckinLogs:', storedLogs.length);
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    // 打印当前习惯的详细信息
    console.log('当前习惯列表:');
    myHabits.forEach(h => {
      console.log('  ', h.name, 'freq_type:', h.freq_type, 'freq_rules:', h.freq_rules, 'createdAt:', h.createdAt);
    });
    
    // 合并已删除但有打卡记录的习惯（用于显示历史数据）
    myHabits = this.mergeWithDeletedHabits(myHabits);
    
    // 打印合并后的习惯列表
    console.log('合并后的习惯列表:');
    myHabits.forEach(h => {
      console.log('  ', h.name, 'freq_type:', h.freq_type, 'isDeleted:', h.isDeleted);
    });
    
    // 如果没有习惯，显示空状态
    if (myHabits.length === 0) {
      this.setData({
        habitMatrix: [],
        monthHabits: [],
        yearHabits: [],
        stats: {
          checkinRate: 0,
          totalCount: 0,
          checkinDays: 0,
          maxStreak: 0
        }
      });
      return;
    }

    try {
      if (currentTab === 'week') {
        await this.loadWeekData(myHabits);
      } else if (currentTab === 'month') {
        await this.loadMonthData(myHabits);
      } else if (currentTab === 'year') {
        await this.loadYearData(myHabits);
      }
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({
        habitMatrix: [],
        monthHabits: [],
        yearHabits: [],
        stats: {
          checkinRate: 0,
          totalCount: 0,
          checkinDays: 0,
          maxStreak: 0
        }
      });
    }
  },

  // 合并已删除但有打卡记录的习惯
  mergeWithDeletedHabits(myHabits) {
    const app = getApp();
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }
    
    const habitIdsWithLogs = [...new Set(allLogs.map(log => String(log.habitId)))];
    const currentHabitIds = myHabits.map(h => String(h.habitId || h._id));
    const deletedHabitIds = habitIdsWithLogs.filter(id => !currentHabitIds.includes(id));
    
    const allHabitsInfo = wx.getStorageSync('AllHabitsInfo') || {};
    const enrichedHabits = (myHabits || []).map(habit => {
      const habitId = String(habit.habitId || habit.habit_id || habit._id || '');
      const savedInfo = allHabitsInfo[habitId] || {};
      const habitLogs = allLogs
        .filter(log => String(log.habitId || log.habit_id) === habitId)
        .sort((a, b) => new Date(a.date || a.checkin_date) - new Date(b.date || b.checkin_date));
      const newestLogDate = habitLogs.length > 0
        ? String(habitLogs[habitLogs.length - 1].date || habitLogs[habitLogs.length - 1].checkin_date).split('T')[0]
        : null;
      const deletedAt = habit.deletedAt || habit.deleted_at || savedInfo.deletedAt || savedInfo.deleted_at || null;

      if (habit.isDeleted || habit.is_deleted || habit.deleted || deletedAt) {
        return {
          ...savedInfo,
          ...habit,
          isDeleted: true,
          deletedAt: deletedAt || newestLogDate || habit.createdAt || habit.plan_start_date || null
        };
      }

      return habit;
    });
    
    const deletedHabits = deletedHabitIds.map(habitId => {
      if (allHabitsInfo[habitId]) {
        const habitInfo = allHabitsInfo[habitId];
        
        const habitLogs = allLogs
          .filter(log => String(log.habitId) === habitId)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const oldestDate = habitLogs.length > 0 ? habitLogs[0].date : null;
        
        const deletedAt = habitInfo.deletedAt || null;

        let freq_type = habitInfo.freq_type || 'daily';
        let freq_rules = habitInfo.freq_rules || 1;
        let freq_category = habitInfo.freq_category || 'everyday';
        if (habitLogs.length >= 3) {
          const intervals = [];
          for (let i = 1; i < habitLogs.length; i++) {
            const prev = new Date(habitLogs[i - 1].date);
            const curr = new Date(habitLogs[i].date);
            intervals.push(Math.round((curr - prev) / (1000 * 60 * 60 * 24)));
          }
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          if (avgInterval <= 1.5) {
            freq_type = 'daily';
            freq_rules = 1;
            freq_category = 'everyday';
          } else if (avgInterval <= 4) {
            freq_type = 'interval';
            freq_rules = Math.round(avgInterval) - 1;
            freq_category = 'daily-interval';
          } else {
            freq_type = 'daily';
            freq_rules = 1;
            freq_category = 'everyday';
          }
        }
        
        let iconUrl = habitInfo.iconUrl || '';
        let themeClass = habitInfo.themeClass || 't-green';
        if (!iconUrl && habitInfo.name) {
          const iconConfig = iconMap.getIconConfig(habitInfo.name);
          if (iconConfig) {
            iconUrl = iconConfig.iconUrl;
            themeClass = iconConfig.themeClass;
          }
        }
        
        return {
          ...habitInfo,
          iconUrl: iconUrl,
          themeClass: themeClass,
          freq_type,
          freq_rules,
          freq_category,
          isDeleted: true,
          deletedAt: deletedAt,
          plan_start_date: habitInfo.plan_start_date || oldestDate,
          createdAt: habitInfo.createdAt || oldestDate
        };
      }
      
      const habitLogs = allLogs
        .filter(log => String(log.habitId) === habitId)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const oldestDate = habitLogs.length > 0 ? habitLogs[0].date : null;
      const newestDate = habitLogs.length > 0 ? habitLogs[habitLogs.length - 1].date : null;
      
      const habitInfo = allHabitsInfo[habitId] || {};
      const habitName = habitInfo.name || '已删除习惯';
      const habitCategory = habitInfo.category || '其他';
      const habitTargetMinutes = habitInfo.targetMinutes || 15;
      const habitThemeClass = habitInfo.themeClass || 't-green';
      const habitFreqType = habitInfo.freq_type || 'daily';
      const habitFreqRules = habitInfo.freq_rules || 1;
      const habitFreqCategory = habitInfo.freq_category || 'everyday';
      const habitIconUrl = habitInfo.iconUrl || '';
      
      let iconUrl = habitIconUrl;
      let themeClass = habitThemeClass;
      if (!iconUrl && habitName) {
        const iconConfig = iconMap.getIconConfig(habitName);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        }
      }
      
      return {
        habitId: habitId,
        _id: habitId,
        name: habitName,
        category: habitCategory,
        targetMinutes: habitTargetMinutes,
        themeClass: themeClass,
        freq_type: habitFreqType,
        freq_rules: habitFreqRules,
        freq_category: habitFreqCategory,
        iconUrl: iconUrl,
        isDeleted: true,
        deletedAt: newestDate || null,
        plan_start_date: oldestDate,
        createdAt: oldestDate
      };
    });
    
    return [...enrichedHabits, ...deletedHabits];
  },

  // 加载周报表数据
  async legacyLoadWeekData(myHabits) {
    const app = getApp();

    // 获取当前周的7天日期
    const weekDates = this.getWeekDates();
    const startDate = this.formatDateKey(weekDates[0]);
    const endDate = this.formatDateKey(weekDates[6]);

    // 优先从本地存储读取 CheckinLogs（确保获取最新数据）
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 同步到全局数据
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    // 如果本地存储为空，再尝试从全局数据获取
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    // 从 CheckinLogs 获取日期范围内的打卡记录
    const checkinLogs = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

    // 构建习惯矩阵（只显示 MyHabits 中的习惯）
    const habitMatrix = myHabits.map((habit) => {
      const isDeleted = habit.isDeleted;
      const deletedAt = habit.deletedAt;
      const deletedDateStr = deletedAt ? deletedAt.split('T')[0] : null;
      
      const days = weekDates.map(date => {
        const dateStr = this.formatDateKey(date);
        const shouldShow = this.shouldShowHabitOnDate(habit, date);
        const habitIdStr = String(habit.habitId || habit._id);
        const isChecked = checkinLogs.some(log =>
          String(log.habitId) === habitIdStr && log.date === dateStr
        );

        let status = 'inactive';
        if (isChecked) {
          status = 'checked';
        } else if (shouldShow) {
          status = 'unchecked';
        }

        const isAfterDeletion = isDeleted && deletedDateStr && dateStr >= deletedDateStr;

        return {
          checked: isChecked,
          shouldShow: shouldShow,
          status: status,
          isAfterDeletion: isAfterDeletion
        };
      });

      // 优先使用 habit 中已有的 iconUrl（对于已删除习惯）
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;
      
      // 如果没有 iconUrl，尝试从 iconMap 获取
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '🔥';
          themeClass = themeClass || 'theme-jade';
        }
      }

      return {
        habitId: habit.habitId,
        name: habit.name,
        iconUrl: iconUrl,
        icon: icon,
        themeClass: themeClass,
        days: days,
        isDeleted: habit.isDeleted || false,
        deletedAt: habit.deletedAt || null,
        plan_start_date: habit.plan_start_date || habit.createdAt,
        createdAt: habit.createdAt,
        freq_type: habit.freq_type,
        freq_rules: habit.freq_rules,
        freq_category: habit.freq_category
      };
    });
    
    // 过滤：只保留本周有应打卡日的习惯
    // 对于已删除习惯，只要本周有应打卡日或删除前有打卡就保留
    const filteredHabitMatrix = habitMatrix.filter(habit => {
      const hasDueDay = habit.days.some(day => day.shouldShow);
      const hasCheckinBeforeDeletion = habit.isDeleted && habit.deletedAt
        ? habit.days.some(day => day.checked && !day.isAfterDeletion)
        : habit.days.some(day => day.checked);
      habit.hasDueDay = hasDueDay;
      return hasDueDay || hasCheckinBeforeDeletion;
    });

    // 计算统计数据（考虑策略）
    console.log('[loadWeekData] habitMatrix 数量:', habitMatrix.length);
    habitMatrix.forEach((h, i) => {
      console.log(`[loadWeekData] 习惯${i}: ${h.name}, freq_type=${h.freq_type}, freq_rules=${h.freq_rules}, plan_start_date=${h.plan_start_date}`);
    });
    const stats = this.calculateStatsWithStrategy(habitMatrix, myHabits, weekDates);

    this.setData({
      habitMatrix: filteredHabitMatrix,
      monthHabits: [],
      yearHabits: [],
      stats: stats
    });
  },

  // 加载月报表数据
  async legacyLoadMonthData(myHabits) {
    const app = getApp();

    const year = this.data.currentYear;
    const month = this.data.currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // 优先从本地存储读取 CheckinLogs（确保获取最新数据）
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 同步到全局数据
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    // 如果本地存储为空，再尝试从全局数据获取
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    // 从 CheckinLogs 获取当月打卡记录
    const checkinLogs = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

    // 生成月报表数据（只显示 MyHabits 中的习惯）
    // 计算当月1号是星期几 (0=周日, 1=周一...)
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    // 转换为周一开始 (0=周一, 6=周日)
    const startWeekday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    
    const monthHabits = myHabits.map((habit) => {
      const days = [];
      let doneCount = 0;
      
      // 添加月初空白格子（让1号对齐正确的星期）
      for (let i = 0; i < startWeekday; i++) {
        days.push({
          date: '',
          done: false,
          empty: true
        });
      }
      
      // 添加当月日期
      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 只有 CheckinLogs 中有记录，才显示为已完成
        const isDone = checkinLogs.some(log => 
          log.habitId === habit.habitId && log.date === dateStr
        );
        
        if (isDone) doneCount++;
        
        days.push({
          date: i,
          done: isDone,
          empty: false
        });
      }
      
      // 补齐末尾，使总数为7的倍数（完整周）
      const totalCells = days.length;
      const remainingCells = (7 - (totalCells % 7)) % 7;
      for (let i = 0; i < remainingCells; i++) {
        days.push({
          date: '',
          done: false,
          empty: true
        });
      }
      
      const rate = Math.round((doneCount / daysInMonth) * 100);
      
      // 优先使用 habit 中已有的 iconUrl（对于已删除习惯）
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;
      
      // 如果没有 iconUrl，尝试从 iconMap 获取
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '🔥';
          themeClass = themeClass || 'theme-jade';
        }
      }
      
      return {
        habitId: habit.habitId,
        name: habit.name,
        iconUrl: iconUrl,
        icon: icon,
        themeClass: themeClass,
        days: days,
        rate: rate,
        daysCount: doneCount,
        isDeleted: habit.isDeleted || false
      };
    });

    this.setData({
      monthHabits: monthHabits,
      // 月报表不显示 habitMatrix 和 yearHabits
      habitMatrix: [],
      yearHabits: [],
      // 清空 stats 或计算月报表的 stats
      stats: {
        checkinRate: 0,
        totalCount: 0,
        checkinDays: 0,
        maxStreak: 0
      }
    });
  },

  // 加载年报表数据
  async legacyLoadYearData(myHabits) {
    const app = getApp();

    const year = this.data.currentYear;

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 优先从本地存储读取 CheckinLogs（确保获取最新数据）
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 同步到全局数据
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    // 如果本地存储为空，再尝试从全局数据获取
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    // 从 CheckinLogs 获取全年打卡记录
    const checkinLogs = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

    // 生成年报表数据（只显示 MyHabits 中的习惯）
    const yearHabits = myHabits.map((habit) => {
      // 生成一年的热力图数据（52周 x 7天 = 364个格子）
      const heatmap = [];
      let totalDays = 0;
      
      // 获取今年第一天是星期几
      const firstDay = new Date(year, 0, 1);
      const startWeekDay = firstDay.getDay(); // 0=周日, 1=周一...
      
      // 计算需要填充的空白格子
      const emptyCells = startWeekDay === 0 ? 6 : startWeekDay - 1;
      
      // 添加空白格子
      for (let i = 0; i < emptyCells; i++) {
        heatmap.push({ level: '' });
      }
      
      // 获取今年总天数
      const daysInYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 366 : 365;
      
      // 生成每天的打卡状态
      for (let i = 0; i < daysInYear; i++) {
        const currentDate = new Date(year, 0, 1);
        currentDate.setDate(currentDate.getDate() + i);
        const dateStr = this.formatDateKey(currentDate);
        
        // 只有 CheckinLogs 中有记录，才显示为已打卡
        const isDone = checkinLogs.some(log => 
          log.habitId === habit.habitId && log.date === dateStr
        );
        
        if (isDone) {
          totalDays++;
          heatmap.push({ level: 'level-1' }); // 有打卡记录
        } else {
          heatmap.push({ level: '' }); // 无打卡记录，空白
        }
      }
      
      // 补充到完整的52周
      const remainingCells = 364 - heatmap.length;
      for (let i = 0; i < remainingCells; i++) {
        heatmap.push({ level: '' });
      }
      
      // 优先使用 habit 中已有的 iconUrl（对于已删除习惯）
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;
      
      // 如果没有 iconUrl，尝试从 iconMap 获取
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '🔥';
          themeClass = themeClass || 'theme-jade';
        }
      }
      
      return {
        habitId: habit.habitId,
        name: habit.name,
        iconUrl: iconUrl,
        icon: icon,
        themeClass: themeClass,
        heatmap: heatmap,
        totalDays: totalDays,
        isDeleted: habit.isDeleted || false
      };
    });

    this.setData({
      yearHabits: yearHabits,
      // 年报表不显示 habitMatrix 和 monthHabits
      habitMatrix: [],
      monthHabits: [],
      // 清空 stats
      stats: {
        checkinRate: 0,
        totalCount: 0,
        checkinDays: 0,
        maxStreak: 0
      }
    });
  },

  // 使用本地数据加载（后备方案）
  loadLocalData(myHabits) {
    const app = getApp();
    const weekDates = this.getWeekDates();

    // 优先从本地存储读取 CheckinLogs（确保获取最新数据）
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 同步到全局数据
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    // 如果本地存储为空，再尝试从全局数据获取
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    const matrix = myHabits.map((habit) => {
      const days = weekDates.map(date => {
        const dateStr = this.formatDateKey(date);
        const isChecked = allLogs.some(log => 
          log.habitId === habit.habitId && log.date === dateStr
        );
        return { checked: isChecked };
      });

      // 优先使用 habit 中已有的 iconUrl（对于已删除习惯）
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;
      
      // 如果没有 iconUrl，尝试从 iconMap 获取
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '🔥';
          themeClass = themeClass || 'theme-jade';
        }
      }

      return {
        habitId: habit.habitId,
        name: habit.name,
        iconUrl: iconUrl,
        icon: icon,
        themeClass: themeClass,
        days: days
      };
    });

    const stats = this.calculateStats(matrix, myHabits.length);

    this.setData({
      habitMatrix: matrix,
      monthHabits: [],
      yearHabits: [],
      stats: stats
    });
  },

  // 获取当前周的日期数组
  getWeekDates() {
    const weekStart = new Date(this.data.currentWeekStart);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  },

  // 计算统计数据
  calculateStats(habitMatrix, totalHabits) {
    let totalCount = 0;
    let checkinCount = 0;
    let checkinDays = new Set();
    let maxStreak = 0;

    habitMatrix.forEach(habit => {
      let streak = 0;
      let maxHabitStreak = 0;
      
      habit.days.forEach((day, index) => {
        totalCount++;
        if (day.checked) {
          checkinCount++;
          checkinDays.add(index);
          streak++;
          maxHabitStreak = Math.max(maxHabitStreak, streak);
        } else {
          streak = 0;
        }
      });
      
      maxStreak = Math.max(maxStreak, maxHabitStreak);
    });

    const checkinRate = totalCount > 0 ? Math.round((checkinCount / totalCount) * 100) : 0;

    return {
      checkinRate,
      totalCount: checkinCount,
      checkinDays: checkinDays.size,
      maxStreak
    };
  },

  getAllCheckinLogs() {
    const app = getApp();
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('从本地存储读取 CheckinLogs 失败:', e);
    }

    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }
    return allLogs;
  },

  buildPeriodReport(myHabits, startDate, endDate) {
    const todayStr = this.formatDateKey(getSimulatedDate());
    return reportCalculator.calculatePeriodReport(
      myHabits,
      this.getAllCheckinLogs(),
      startDate,
      endDate,
      todayStr
    );
  },

  getHabitVisual(habit) {
    let iconUrl = habit.iconUrl;
    let themeClass = habit.themeClass;
    let icon = null;

    if (!iconUrl) {
      const iconConfig = iconMap.getIconConfig(habit.name);
      if (iconConfig) {
        iconUrl = iconConfig.iconUrl;
        themeClass = iconConfig.themeClass;
      } else {
        icon = '🔥';
        themeClass = themeClass || 'theme-jade';
      }
    }

    return { iconUrl, themeClass, icon };
  },

  mapWeekHabitReport(report) {
    const habit = report.habit || {};
    const visual = this.getHabitVisual(habit);
    return {
      habitId: report.habitId,
      name: habit.name,
      iconUrl: visual.iconUrl,
      icon: visual.icon,
      themeClass: visual.themeClass,
      days: report.days.map(day => ({
        checked: day.checked,
        isChecked: day.isChecked,
        isDue: day.isDue,
        shouldShow: day.shouldShow,
        status: day.status,
        countsInDueDenominator: day.countsInDueDenominator,
        countsInDenominator: day.countsInDenominator,
        countsAsDone: day.countsAsDone,
        isAfterDeletion: day.isAfterDeletion
      })),
      isDeleted: habit.isDeleted || false,
      deletedAt: habit.deletedAt || habit.deleted_at || null,
      dueCount: report.dueCount,
      doneCount: report.doneCount
    };
  },

  mapMonthHabitReport(report, year, month, daysInMonth, startWeekday) {
    const habit = report.habit || {};
    const visual = this.getHabitVisual(habit);
    const dayMap = {};
    report.days.forEach(day => {
      dayMap[day.date] = day;
    });

    const days = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push({ date: '', status: 'empty', empty: true, done: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const item = dayMap[dateStr] || {};
      days.push({
        date: day,
        status: item.status || 'inactive',
        empty: false,
        done: item.status === 'checked',
        checked: item.status === 'checked',
        isChecked: Boolean(item.isChecked),
        isDue: Boolean(item.isDue),
        shouldShow: Boolean(item.shouldShow),
        countsInDueDenominator: Boolean(item.countsInDueDenominator),
        countsAsDone: Boolean(item.countsAsDone)
      });
    }

    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      days.push({ date: '', status: 'empty', empty: true, done: false });
    }

    return {
      habitId: report.habitId,
      name: habit.name,
      iconUrl: visual.iconUrl,
      icon: visual.icon,
      themeClass: visual.themeClass,
      days,
      rate: report.dueCount > 0 ? Math.round((report.doneCount / report.dueCount) * 100) : 0,
      daysCount: report.doneCount,
      isDeleted: habit.isDeleted || false
    };
  },

  mapYearHabitReport(report, year) {
    const habit = report.habit || {};
    const visual = this.getHabitVisual(habit);
    const dayMap = {};
    report.days.forEach(day => {
      dayMap[day.date] = day;
    });

    const heatmap = [];
    const firstDay = new Date(year, 0, 1);
    const emptyCells = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    for (let i = 0; i < emptyCells; i++) {
      heatmap.push({ level: '', empty: true });
    }

    const daysInYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 366 : 365;
    for (let i = 0; i < daysInYear; i++) {
      const currentDate = new Date(year, 0, 1);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = this.formatDateKey(currentDate);
      const item = dayMap[dateStr] || {};
      heatmap.push({
        level: item.status === 'checked' ? 'level-1' : '',
        status: item.status || 'inactive'
      });
    }

    const remainingCells = (7 - (heatmap.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      heatmap.push({ level: '', empty: true });
    }

    return {
      habitId: report.habitId,
      name: habit.name,
      iconUrl: visual.iconUrl,
      icon: visual.icon,
      themeClass: visual.themeClass,
      heatmap,
      totalDays: report.doneCount,
      isDeleted: habit.isDeleted || false
    };
  },

  shouldShowHabitReport(report) {
    const habit = report.habit || {};
    if (habit.isDeleted || habit.deletedAt || habit.deleted_at) {
      return report.dueCount > 0 || report.doneCount > 0;
    }
    return report.dueCount > 0 || report.doneCount > 0;
  },

  async loadWeekData(myHabits) {
    const weekDates = this.getWeekDates();
    const startDate = this.formatDateKey(weekDates[0]);
    const endDate = this.formatDateKey(weekDates[6]);
    const report = this.buildPeriodReport(myHabits, startDate, endDate);

    this.setData({
      habitMatrix: report.habitReports
        .filter(item => item.dueCount > 0)
        .map(item => this.mapWeekHabitReport(item)),
      monthHabits: [],
      yearHabits: [],
      stats: report.stats
    });
  },

  async loadMonthData(myHabits) {
    const year = this.data.currentYear;
    const month = this.data.currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startWeekday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const report = this.buildPeriodReport(myHabits, startDate, endDate);

    this.setData({
      monthHabits: report.habitReports
        .filter(item => this.shouldShowHabitReport(item))
        .map(item => this.mapMonthHabitReport(item, year, month, daysInMonth, startWeekday)),
      habitMatrix: [],
      yearHabits: [],
      stats: report.stats
    });
  },

  async loadYearData(myHabits) {
    const year = this.data.currentYear;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const report = this.buildPeriodReport(myHabits, startDate, endDate);

    this.setData({
      yearHabits: report.habitReports
        .filter(item => this.shouldShowHabitReport(item))
        .map(item => this.mapYearHabitReport(item, year)),
      habitMatrix: [],
      monthHabits: [],
      stats: report.stats
    });
  },

  calculateDueCount(startDate, endDate, freqType, freqRules, freqCategory, planStartDate, deletedAt) {
    if (!startDate || !endDate || !planStartDate) {
      return 0;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const planStart = new Date(planStartDate);

    if (end < planStart) {
      return 0;
    }

    const effectiveStart = start < planStart ? planStart : start;

    if (effectiveStart > end) {
      return 0;
    }

    let effectiveEnd = end;
    if (deletedAt) {
      const deletedDate = new Date(deletedAt.split('T')[0]);
      if (deletedDate < end) {
        effectiveEnd = new Date(deletedDate.getTime() - 24 * 60 * 60 * 1000);
      }
    }

    if (effectiveStart > effectiveEnd) {
      return 0;
    }

    const diffDays = Math.floor((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24));

    if (freqType === 'daily') {
      return diffDays + 1;
    }

    if (freqType === 'interval' || (freqType === 'daily' && freqCategory === 'daily-interval')) {
      const intervalDays = (freqRules && freqRules.intervalDays) ? (freqRules.intervalDays + 1) : ((freqRules || 1) + 1);
      let count = 0;
      const current = new Date(effectiveStart);
      while (current <= effectiveEnd) {
        const daysSinceStart = Math.floor((current - planStart) / (1000 * 60 * 60 * 24));
        if (daysSinceStart >= 0 && daysSinceStart % intervalDays === 0) {
          count++;
        }
        current.setDate(current.getDate() + 1);
      }
      return count;
    }

    if (freqType === 'weekly') {
      const targetDays = Array.isArray(freqRules) ? freqRules : [];
      if (targetDays.length === 0) {
        return diffDays + 1;
      }

      const totalWeeks = Math.floor(diffDays / 7);
      const fullWeekCount = totalWeeks * targetDays.length;

      const remainingDays = diffDays % 7;
      let remainingCount = 0;

      for (let i = 0; i <= remainingDays; i++) {
        const checkDate = new Date(effectiveStart);
        checkDate.setDate(effectiveStart.getDate() + i);
        const dayOfWeek = checkDate.getDay();
        const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
        if (targetDays.includes(normalizedDay)) {
          remainingCount++;
        }
      }

      return fullWeekCount + remainingCount;
    }

    return diffDays + 1;
  },

  isDueDate(habit, date) {
    const dateStr = this.formatDateKey(date);
    const dayOfWeek = date.getDay();

    if (habit.isDeleted && habit.deletedAt) {
      const deletedDateStr = habit.deletedAt.split('T')[0];
      if (dateStr >= deletedDateStr) {
        return false;
      }
    }

    if (!habit.freq_type) {
      return true;
    }

    const planStartDate = habit.plan_start_date || habit.createdAt;
    if (planStartDate && dateStr < planStartDate) {
      return false;
    }

    let effectiveFreqType = habit.freq_type;
    if (habit.freq_category === 'daily-interval' && habit.freq_type === 'daily') {
      effectiveFreqType = 'interval';
    }

    if (effectiveFreqType === 'daily') {
      return true;
    }

    if (effectiveFreqType === 'interval') {
      let intervalDays;
      if (habit.freq_category === 'daily-interval' && habit.freq_rules && habit.freq_rules.intervalDays) {
        intervalDays = habit.freq_rules.intervalDays + 1;
      } else {
        intervalDays = (habit.freq_rules || 1) + 1;
      }
      const startDate = (habit.freq_rules && habit.freq_rules.startDate) ? habit.freq_rules.startDate : (planStartDate || habit.createdAt);
      if (!startDate) {
        return true;
      }
      const planStart = new Date(startDate);
      const currentDate = new Date(dateStr);
      const diffDays = Math.floor((currentDate - planStart) / (1000 * 60 * 60 * 24));
      const isCheckinDay = diffDays >= 0 && diffDays % intervalDays === 0;
      
      return isCheckinDay;
    }

    if (effectiveFreqType === 'weekly') {
      const weeklyDays = habit.freq_rules || [];
      if (!Array.isArray(weeklyDays) || weeklyDays.length === 0) {
        return true;
      }
      const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      return weeklyDays.includes(normalizedDay);
    }

    return true;
  },

  shouldShowHabitOnDate(habit, date) {
    const dateStr = this.formatDateKey(date);
    const dayOfWeek = date.getDay();

    // 调试日志：检查 habit 数据
    if (habit.name === '经络拍打' || habit.name === '刮痧' || habit.name === '金刚功') {
      console.log(`[shouldShowHabitOnDate] ${habit.name} - ${dateStr}:`, {
        freq_type: habit.freq_type,
        freq_rules: habit.freq_rules,
        plan_start_date: habit.plan_start_date,
        createdAt: habit.createdAt,
        isDeleted: habit.isDeleted
      });
    }

    if (habit.isDeleted && habit.deletedAt) {
      const deletedDateStr = habit.deletedAt.split('T')[0];
      if (dateStr >= deletedDateStr) {
        return false;
      }
    }

    if (!habit.freq_type) {
      return true;
    }

    // 检查 freq_category 是否指示间隔打卡，但 freq_type 被错误保存为 'daily'
    let effectiveFreqType = habit.freq_type;
    if (habit.freq_category === 'daily-interval' && habit.freq_type === 'daily') {
      // 数据损坏：freq_category 指示间隔打卡，但 freq_type 被保存为 'daily'
      // 根据 freq_category 修正 freq_type
      effectiveFreqType = 'interval';
      console.warn(`数据修复: ${habit.name} 的 freq_type 从 'daily' 修正为 'interval'（根据 freq_category）`);
    }
    
    // 检查计划开始日期
    const planStartDate = habit.plan_start_date || habit.createdAt;
    if (planStartDate && dateStr < planStartDate) {
      return false;
    }

    if (effectiveFreqType === 'daily') {
      return true;
    }

    if (effectiveFreqType === 'interval') {
      let intervalDays;
      if (habit.freq_category === 'daily-interval' && habit.freq_rules && habit.freq_rules.intervalDays) {
        intervalDays = habit.freq_rules.intervalDays + 1;
      } else {
        intervalDays = (habit.freq_rules || 1) + 1;
      }
      const startDate = (habit.freq_rules && habit.freq_rules.startDate) ? habit.freq_rules.startDate : planStartDate;
      if (!startDate) {
        if (habit.name === '经络拍打' || habit.name === '刮痧' || habit.name === '金刚功') {
          console.log(`[shouldShowHabitOnDate] ${habit.name} - ${dateStr}: 无startDate，默认为每日打卡`);
        }
        return true;
      }
      const planStart = new Date(startDate);
      const currentDate = new Date(dateStr);
      const diffDays = Math.floor((currentDate - planStart) / (1000 * 60 * 60 * 24));
      const isDueDay = diffDays >= 0 && diffDays % intervalDays === 0;
      if (habit.name === '经络拍打' || habit.name === '刮痧' || habit.name === '金刚功') {
        console.log(`[shouldShowHabitOnDate] ${habit.name} - ${dateStr}: planStart=${planStartDate}, interval=${intervalDays}, diff=${diffDays}, isDue=${isDueDay}`);
      }
      return isDueDay;
    }

    if (effectiveFreqType === 'weekly') {
      const weeklyDays = habit.freq_rules || [];
      if (!Array.isArray(weeklyDays) || weeklyDays.length === 0) {
        return true;
      }
      const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      return weeklyDays.includes(normalizedDay);
    }

    return true;
  },

  calculateStatsWithStrategy(habitMatrix, myHabits, weekDates) {
    let totalShouldShow = 0;
    let checkinCount = 0;
    let checkinDays = new Set();
    let maxStreak = 0;

    const startDateStr = this.formatDateKey(weekDates[0]);
    const endDateStr = this.formatDateKey(weekDates[6]);

    habitMatrix.forEach(habit => {
      const isDeleted = habit.isDeleted;
      const deletedAt = habit.deletedAt;
      const planStartDate = habit.plan_start_date || habit.createdAt;

      if (!planStartDate) {
        return;
      }

      const dueCount = this.calculateDueCount(
        startDateStr,
        endDateStr,
        habit.freq_type,
        habit.freq_rules,
        habit.freq_category,
        planStartDate,
        deletedAt
      );

      totalShouldShow += dueCount;

      let habitStreak = 0;
      let habitMaxStreak = 0;

      habit.days.forEach((day, index) => {
        const currentDate = weekDates[index];
        const currentDateStr = this.formatDateKey(currentDate);

        if (!day.shouldShow) {
          return;
        }

        if (isDeleted && deletedAt) {
          const deletedDateStr = deletedAt.split('T')[0];
          if (currentDateStr >= deletedDateStr) {
            return;
          }
        }

        if (day.checked) {
          checkinCount++;
          checkinDays.add(index);
          habitStreak++;
          habitMaxStreak = Math.max(habitMaxStreak, habitStreak);
        } else {
          habitStreak = 0;
        }
      });

      maxStreak = Math.max(maxStreak, habitMaxStreak);
    });

    const checkinRate = totalShouldShow > 0 ? Math.round((checkinCount / totalShouldShow) * 100) : 0;

    return {
      checkinRate,
      totalCount: checkinCount,
      checkinDays: checkinDays.size,
      maxStreak
    };
  },

  onShareAppMessage() {
    return share.appMessage('子午花信 · 观心报表', '/pages/stats/stats');
  },

  onShareTimeline() {
    return share.timeline('子午花信 · 观心报表', 'from=timeline&page=stats');
  }
});
