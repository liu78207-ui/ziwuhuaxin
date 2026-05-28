/**
 * ============================================================
 * 鈿狅笍 瀹夊叏鎻愮ず 鈿狅笍
 * ============================================================
 * 娉ㄦ剰锛氭湰椤圭洰鐨?MyHabits 鍜?CheckinLogs 鏁版嵁琛紝鍔″繀鍦ㄤ簯寮€鍙戞帶鍒跺彴涓?
 * 灏嗗叾鏁版嵁鏉冮檺璁剧疆涓恒€愪粎鍒涘缓鑰呭彲璇诲啓銆戙€傚墠绔湪鎵ц db.collection('CheckinLogs').add()
 * 鏃讹紝绯荤粺浼氳嚜鍔ㄥ啓鍏?_openid 瀛楁锛屽疄鐜板ぉ鐒剁殑鏁版嵁闅旂锛屾棤闇€鍦ㄤ唬鐮佷腑鎵嬪姩鎷兼帴 openid銆?
 * ============================================================
 */

const iconMap = require('../../utils/iconMap.js');
const reportCalculator = require('../../utils/reportCalculator.js');
const lunarCalendar = require('../../utils/lunarCalendar.js');
const share = require('../../utils/share.js');

// Phase 5: reportService 接入
// 设置为 true 启用 reportService，false 则走 legacy 路径
// 注意：开启前需确保测试数据为 Phase 3 格式（包含 userHabitId/policyVersion 等）
const USE_REPORT_SERVICE = false
let reportService = null
if (USE_REPORT_SERVICE) {
  try {
    reportService = require('../../services/reportService')
  } catch (e) {
    console.error('[stats] reportService load failed:', e)
  }
}

// 浠庡叏灞€鑾峰彇璋冭瘯閰嶇疆
const getDebugOffset = () => {
  const app = getApp();
  const offset = app.globalData.DEBUG_DAY_OFFSET;
  return offset !== undefined ? offset : 0;
};

// 鑾峰彇妯℃嫙鏃ユ湡锛堝鏋滃浜庤皟璇曟ā寮忥級
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
    currentTab: 'week', // 'week', 'month' 鎴?'year'
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
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
    currentWeekStart: null, // 褰撳墠鍛ㄥ紑濮嬫棩鏈?
    currentMonth: null, // 褰撳墠鏄剧ず鐨勬湀浠?(0-11)
    currentYear: null // 褰撳墠鏄剧ず鐨勫勾浠?
  },

  // 杩斿洖涓婁竴椤?
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
    // 鍒濆鍖栧綋鍓嶆椂闂达紙鑰冭檻璋冭瘯鍋忕Щ锛?
    const today = getSimulatedDate();
    const weekStart = this.getWeekStart(today);
    this.setData({
      currentWeekStart: weekStart.getTime(),
      currentMonth: today.getMonth(),
      currentYear: today.getFullYear(),
      // 鍒濆鍖栫┖鏁版嵁缁撴瀯锛岄伩鍏嶆覆鏌撻敊璇?
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

    // 璋冭瘯锛氭鏌ユ湰鍦板瓨鍌ㄤ腑鐨勬暟鎹?    this.debugStorageData();

    // 姣忔鏄剧ず椤甸潰鏃跺埛鏂版暟鎹紙纭繚璺ㄩ〉闈㈠悓姝ワ級
    // 浣跨敤 wx.nextTick 閬垮厤涓庡垵娆℃覆鏌撳啿绐?
    wx.nextTick(() => {
      this.loadRealData();
    });

    // 璁剧疆鑷畾涔?TabBar 閫変腑鐘舵€?
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  // 璋冭瘯锛氭鏌ユ湰鍦板瓨鍌ㄤ腑鐨勬暟鎹?
  debugStorageData() {
    try {
      const allHabitsInfo = wx.getStorageSync('AllHabitsInfo') || {};
      const checkinLogs = wx.getStorageSync('CheckinLogs') || [];
      const myHabits = wx.getStorageSync('MyHabits') || [];

      console.log('=== 璋冭瘯淇℃伅 ===');
      console.log('AllHabitsInfo 閿?', Object.keys(allHabitsInfo));
      console.log('AllHabitsInfo 鍐呭:', allHabitsInfo);
      console.log('CheckinLogs 涓殑 habitIds:', [...new Set(checkinLogs.map(log => log.habitId))]);
      console.log('MyHabits 涓殑 habitIds:', myHabits.map(h => h.habitId || h._id));
      console.log('===============');
    } catch (e) {
      console.error('璋冭瘯淇℃伅鑾峰彇澶辫触:', e);
    }
  },

  // 鑾峰彇鍛ㄥ紑濮嬫棩鏈燂紙鍛ㄤ竴锛?
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // 鏍煎紡鍖栨棩鏈燂紙鍙樉绀烘湀/鏃ワ級
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

  // 鏍煎紡鍖栨棩鏈熶负 key (YYYY-MM-DD)
  formatDateKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 鏇存柊鏃ユ湡鏄剧ず
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

  // 鍒囨崲鎶ヨ〃绫诲瀷
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    // 浣跨敤 wx.nextTick 纭繚 setData 瀹屾垚鍚庡啀鍔犺浇鏁版嵁
    wx.nextTick(() => {
      this.updateDateDisplay();
      this.loadRealData();
    });
  },

  // 涓婁竴鍛ㄦ湡
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

  // 涓嬩竴鍛ㄦ湡
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

  // 鍔犺浇鐪熷疄鏁版嵁锛堜弗鏍煎熀浜?MyHabits 鍜?CheckinLogs锛?
  async loadRealData() {
    const app = getApp();
    const currentTab = this.data.currentTab;

    // 纭繚鏃堕棿鐘舵€佸凡鍒濆鍖栵紙鑰冭檻璋冭瘯鍋忕Щ锛?
    if (currentTab === 'week' && !this.data.currentWeekStart) {
      const today = getSimulatedDate();
      const weekStart = this.getWeekStart(today);
      this.setData({ currentWeekStart: weekStart.getTime() });
    }

    // 浼樺厛浠庢湰鍦板瓨鍌ㄨ鍙?MyHabits锛堢‘淇濊幏鍙栨渶鏂版暟鎹級
    let myHabits = [];
    try {
      const storedHabits = wx.getStorageSync('MyHabits');
      if (storedHabits && Array.isArray(storedHabits)) {
        myHabits = storedHabits;
        // 鍚屾鍒板叏灞€鏁版嵁
        app.globalData.MyHabits = storedHabits;
        console.log('浠庢湰鍦板瓨鍌ㄥ姞杞?MyHabits:', myHabits.length);
      }
    } catch (e) {
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?MyHabits 澶辫触:', e);
    }

    // 濡傛灉鏈湴瀛樺偍涓虹┖锛屽啀灏濊瘯浠庡叏灞€鏁版嵁鑾峰彇
    if (!myHabits || myHabits.length === 0) {
      myHabits = app.getAllHabits ? app.getAllHabits() : (app.globalData.MyHabits || []);
    }

    // 鍚屾牱浼樺厛浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        app.globalData.CheckinLogs = storedLogs;
        console.log('浠庢湰鍦板瓨鍌ㄥ姞杞?CheckinLogs:', storedLogs.length);
      }
    } catch (e) {
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
    }

    // 鎵撳嵃褰撳墠涔犳儻鐨勮缁嗕俊鎭?
    console.log('褰撳墠涔犳儻鍒楄〃:');
    myHabits.forEach(h => {
      console.log('  ', h.name, 'freq_type:', h.freq_type, 'freq_rules:', h.freq_rules, 'createdAt:', h.createdAt);
    });

    // 鍚堝苟宸插垹闄や絾鏈夋墦鍗¤褰曠殑涔犳儻锛堢敤浜庢樉绀哄巻鍙叉暟鎹級
    myHabits = this.mergeWithDeletedHabits(myHabits);

    // 鎵撳嵃鍚堝苟鍚庣殑涔犳儻鍒楄〃
    console.log('鍚堝苟鍚庣殑涔犳儻鍒楄〃:');
    myHabits.forEach(h => {
      console.log('  ', h.name, 'freq_type:', h.freq_type, 'isDeleted:', h.isDeleted);
    });

    // 濡傛灉娌℃湁涔犳儻锛屾樉绀虹┖鐘舵€?
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
      console.error('鍔犺浇鏁版嵁澶辫触:', err);
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

  // 鍚堝苟宸插垹闄や絾鏈夋墦鍗¤褰曠殑涔犳儻
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
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
    }

    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    const getHabitId = habit => String((habit.strategy && habit.strategy.habit_id) || habit.habitId || habit.habit_id || habit._id || '');
    const getLogHabitId = log => String(log.habitId || log.habit_id || '');
    const getLogDate = log => String(log.date || log.checkin_date || '').split('T')[0];
    const habitIdsWithLogs = [...new Set(allLogs.map(getLogHabitId).filter(Boolean))];
    const currentHabitIds = myHabits.map(getHabitId);
    const deletedHabitIds = habitIdsWithLogs.filter(id => !currentHabitIds.includes(id));

    const allHabitsInfo = wx.getStorageSync('AllHabitsInfo') || {};
    const enrichedHabits = (myHabits || []).map(habit => {
      const habitId = getHabitId(habit);
      const savedInfo = allHabitsInfo[habitId] || {};
      const habitLogs = allLogs
        .filter(log => getLogHabitId(log) === habitId)
        .sort((a, b) => new Date(getLogDate(a)) - new Date(getLogDate(b)));
      const newestLogDate = habitLogs.length > 0
        ? getLogDate(habitLogs[habitLogs.length - 1])
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
          .filter(log => getLogHabitId(log) === habitId)
          .sort((a, b) => new Date(getLogDate(a)) - new Date(getLogDate(b)));
        const oldestDate = habitLogs.length > 0 ? getLogDate(habitLogs[0]) : null;

        const deletedAt = habitInfo.deletedAt || null;

        let freq_type = habitInfo.freq_type || 'daily';
        let freq_rules = habitInfo.freq_rules || 1;
        let freq_category = habitInfo.freq_category || 'everyday';
        if (habitLogs.length >= 3) {
          const intervals = [];
          for (let i = 1; i < habitLogs.length; i++) {
            const prev = new Date(getLogDate(habitLogs[i - 1]));
            const curr = new Date(getLogDate(habitLogs[i]));
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
        .filter(log => getLogHabitId(log) === habitId)
        .sort((a, b) => new Date(getLogDate(a)) - new Date(getLogDate(b)));
      const oldestDate = habitLogs.length > 0 ? getLogDate(habitLogs[0]) : null;
      const newestDate = habitLogs.length > 0 ? getLogDate(habitLogs[habitLogs.length - 1]) : null;

      const habitInfo = allHabitsInfo[habitId] || {};
      const habitName = habitInfo.name || 'Deleted habit';
      const habitCategory = habitInfo.category || '鍏朵粬';
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

  // 鍔犺浇鍛ㄦ姤琛ㄦ暟鎹?
  async legacyLoadWeekData(myHabits) {
    const app = getApp();

    // 鑾峰彇褰撳墠鍛ㄧ殑7澶╂棩鏈?
    const weekDates = this.getWeekDates();
    const startDate = this.formatDateKey(weekDates[0]);
    const endDate = this.formatDateKey(weekDates[6]);

    // 浼樺厛浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs锛堢‘淇濊幏鍙栨渶鏂版暟鎹級
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 鍚屾鍒板叏灞€鏁版嵁
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
    }

    // 濡傛灉鏈湴瀛樺偍涓虹┖锛屽啀灏濊瘯浠庡叏灞€鏁版嵁鑾峰彇
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    // 浠?CheckinLogs 鑾峰彇鏃ユ湡鑼冨洿鍐呯殑鎵撳崱璁板綍
    const checkinLogs = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

    // 鏋勫缓涔犳儻鐭╅樀锛堝彧鏄剧ず MyHabits 涓殑涔犳儻锛?
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

      // 浼樺厛浣跨敤 habit 涓凡鏈夌殑 iconUrl锛堝浜庡凡鍒犻櫎涔犳儻锛?
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;

      // 濡傛灉娌℃湁 iconUrl锛屽皾璇曚粠 iconMap 鑾峰彇
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '馃敟';
          themeClass = themeClass || 't-blue';
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

    // 杩囨护锛氬彧淇濈暀鏈懆鏈夊簲鎵撳崱鏃ョ殑涔犳儻
    // 瀵逛簬宸插垹闄や範鎯紝鍙鏈懆鏈夊簲鎵撳崱鏃ユ垨鍒犻櫎鍓嶆湁鎵撳崱灏变繚鐣?
    const filteredHabitMatrix = habitMatrix.filter(habit => {
      const hasDueDay = habit.days.some(day => day.shouldShow);
      const hasCheckinBeforeDeletion = habit.isDeleted && habit.deletedAt
        ? habit.days.some(day => day.checked && !day.isAfterDeletion)
        : habit.days.some(day => day.checked);
      habit.hasDueDay = hasDueDay;
      return hasDueDay || hasCheckinBeforeDeletion;
    });

    // 璁＄畻缁熻鏁版嵁锛堣€冭檻绛栫暐锛?
    console.log('[loadWeekData] habitMatrix 鏁伴噺:', habitMatrix.length);
    habitMatrix.forEach((h, i) => {
      console.log(`[loadWeekData] 涔犳儻${i}: ${h.name}, freq_type=${h.freq_type}, freq_rules=${h.freq_rules}, plan_start_date=${h.plan_start_date}`);
    });
    const stats = this.calculateStatsWithStrategy(habitMatrix, myHabits, weekDates);

    this.setData({
      habitMatrix: filteredHabitMatrix,
      monthHabits: [],
      yearHabits: [],
      stats: stats
    });
  },

  // 鍔犺浇鏈堟姤琛ㄦ暟鎹?
  async legacyLoadMonthData(myHabits) {
    const app = getApp();

    const year = this.data.currentYear;
    const month = this.data.currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // 浼樺厛浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs锛堢‘淇濊幏鍙栨渶鏂版暟鎹級
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 鍚屾鍒板叏灞€鏁版嵁
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
    }

    // 濡傛灉鏈湴瀛樺偍涓虹┖锛屽啀灏濊瘯浠庡叏灞€鏁版嵁鑾峰彇
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    // 浠?CheckinLogs 鑾峰彇褰撴湀鎵撳崱璁板綍
    const checkinLogs = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

    // 鐢熸垚鏈堟姤琛ㄦ暟鎹紙鍙樉绀?MyHabits 涓殑涔犳儻锛?
    // 璁＄畻褰撴湀1鍙锋槸鏄熸湡鍑?(0=鍛ㄦ棩, 1=鍛ㄤ竴...)
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    // 杞崲涓哄懆涓€寮€濮?(0=鍛ㄤ竴, 6=鍛ㄦ棩)
    const startWeekday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const monthHabits = myHabits.map((habit) => {
      const days = [];
      let doneCount = 0;

      // 娣诲姞鏈堝垵绌虹櫧鏍煎瓙锛堣1鍙峰榻愭纭殑鏄熸湡锛?
      for (let i = 0; i < startWeekday; i++) {
        days.push({
          date: '',
          done: false,
          empty: true
        });
      }

      // 娣诲姞褰撴湀鏃ユ湡
      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 鍙湁 CheckinLogs 涓湁璁板綍锛屾墠鏄剧ず涓哄凡瀹屾垚
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

      // 琛ラ綈鏈熬锛屼娇鎬绘暟涓?鐨勫€嶆暟锛堝畬鏁村懆锛?
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

      // 浼樺厛浣跨敤 habit 涓凡鏈夌殑 iconUrl锛堝浜庡凡鍒犻櫎涔犳儻锛?
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;

      // 濡傛灉娌℃湁 iconUrl锛屽皾璇曚粠 iconMap 鑾峰彇
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '馃敟';
          themeClass = themeClass || 't-blue';
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
      // 鏈堟姤琛ㄤ笉鏄剧ず habitMatrix 鍜?yearHabits
      habitMatrix: [],
      yearHabits: [],
      // 娓呯┖ stats 鎴栬绠楁湀鎶ヨ〃鐨?stats
      stats: {
        checkinRate: 0,
        totalCount: 0,
        checkinDays: 0,
        maxStreak: 0
      }
    });
  },

  // 鍔犺浇骞存姤琛ㄦ暟鎹?
  async legacyLoadYearData(myHabits) {
    const app = getApp();

    const year = this.data.currentYear;

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 浼樺厛浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs锛堢‘淇濊幏鍙栨渶鏂版暟鎹級
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 鍚屾鍒板叏灞€鏁版嵁
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
    }

    // 濡傛灉鏈湴瀛樺偍涓虹┖锛屽啀灏濊瘯浠庡叏灞€鏁版嵁鑾峰彇
    if (!allLogs || allLogs.length === 0) {
      allLogs = app.globalData.CheckinLogs || [];
    }

    // 浠?CheckinLogs 鑾峰彇鍏ㄥ勾鎵撳崱璁板綍
    const checkinLogs = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

    // 鐢熸垚骞存姤琛ㄦ暟鎹紙鍙樉绀?MyHabits 涓殑涔犳儻锛?
    const yearHabits = myHabits.map((habit) => {
      // 鐢熸垚涓€骞寸殑鐑姏鍥炬暟鎹紙52鍛?x 7澶?= 364涓牸瀛愶級
      const heatmap = [];
      let totalDays = 0;

      // 鑾峰彇浠婂勾绗竴澶╂槸鏄熸湡鍑?
      const firstDay = new Date(year, 0, 1);
      const startWeekDay = firstDay.getDay(); // 0=鍛ㄦ棩, 1=鍛ㄤ竴...

      // 璁＄畻闇€瑕佸～鍏呯殑绌虹櫧鏍煎瓙
      const emptyCells = startWeekDay === 0 ? 6 : startWeekDay - 1;

      // 娣诲姞绌虹櫧鏍煎瓙
      for (let i = 0; i < emptyCells; i++) {
        heatmap.push({ level: '' });
      }

      // 鑾峰彇浠婂勾鎬诲ぉ鏁?
      const daysInYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 366 : 365;

      // 鐢熸垚姣忓ぉ鐨勬墦鍗＄姸鎬?
      for (let i = 0; i < daysInYear; i++) {
        const currentDate = new Date(year, 0, 1);
        currentDate.setDate(currentDate.getDate() + i);
        const dateStr = this.formatDateKey(currentDate);

        // 鍙湁 CheckinLogs 涓湁璁板綍锛屾墠鏄剧ず涓哄凡鎵撳崱
        const isDone = checkinLogs.some(log =>
          log.habitId === habit.habitId && log.date === dateStr
        );

        if (isDone) {
          totalDays++;
          heatmap.push({ level: 'level-1' }); // 鏈夋墦鍗¤褰?
        } else {
          heatmap.push({ level: '' }); // 鏃犳墦鍗¤褰曪紝绌虹櫧
        }
      }

      // 琛ュ厖鍒板畬鏁寸殑52鍛?
      const remainingCells = 364 - heatmap.length;
      for (let i = 0; i < remainingCells; i++) {
        heatmap.push({ level: '' });
      }

      // 浼樺厛浣跨敤 habit 涓凡鏈夌殑 iconUrl锛堝浜庡凡鍒犻櫎涔犳儻锛?
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;

      // 濡傛灉娌℃湁 iconUrl锛屽皾璇曚粠 iconMap 鑾峰彇
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '馃敟';
          themeClass = themeClass || 't-blue';
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
      // 骞存姤琛ㄤ笉鏄剧ず habitMatrix 鍜?monthHabits
      habitMatrix: [],
      monthHabits: [],
      // 娓呯┖ stats
      stats: {
        checkinRate: 0,
        totalCount: 0,
        checkinDays: 0,
        maxStreak: 0
      }
    });
  },

  // 浣跨敤鏈湴鏁版嵁鍔犺浇锛堝悗澶囨柟妗堬級
  loadLocalData(myHabits) {
    const app = getApp();
    const weekDates = this.getWeekDates();

    // 浼樺厛浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs锛堢‘淇濊幏鍙栨渶鏂版暟鎹級
    let allLogs = [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (storedLogs && Array.isArray(storedLogs)) {
        allLogs = storedLogs;
        // 鍚屾鍒板叏灞€鏁版嵁
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
    }

    // 濡傛灉鏈湴瀛樺偍涓虹┖锛屽啀灏濊瘯浠庡叏灞€鏁版嵁鑾峰彇
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

      // 浼樺厛浣跨敤 habit 涓凡鏈夌殑 iconUrl锛堝浜庡凡鍒犻櫎涔犳儻锛?
      let iconUrl = habit.iconUrl;
      let themeClass = habit.themeClass;
      let icon = null;

      // 濡傛灉娌℃湁 iconUrl锛屽皾璇曚粠 iconMap 鑾峰彇
      if (!iconUrl) {
        const iconConfig = iconMap.getIconConfig(habit.name);
        if (iconConfig) {
          iconUrl = iconConfig.iconUrl;
          themeClass = iconConfig.themeClass;
        } else {
          icon = '馃敟';
          themeClass = themeClass || 't-blue';
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

  // 鑾峰彇褰撳墠鍛ㄧ殑鏃ユ湡鏁扮粍
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

  // 璁＄畻缁熻鏁版嵁
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
      console.error('浠庢湰鍦板瓨鍌ㄨ鍙?CheckinLogs 澶辫触:', e);
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

  isValidReportTheme(themeClass) {
    return [
      't-red',
      't-green',
      't-yellow',
      't-blue',
      't-purple',
      'theme-red',
      'theme-green',
      'theme-yellow',
      'theme-blue',
      'theme-purple'
    ].includes(themeClass);
  },

  getReportThemeByCategory(category) {
    const themeMap = {
      sports: 't-green',
      therapy: 't-red',
      life: 't-yellow',
      '运动类': 't-green',
      '理疗类': 't-red',
      '起居类': 't-yellow'
    };
    return themeMap[category] || iconMap.getThemeByCategory(category) || 't-blue';
  },

  getHabitDisplayName(habit) {
    return habit.name || habit.title || habit.habit_title || habit.habitTitle || '';
  },

  getHabitVisual(habit) {
    const habitName = this.getHabitDisplayName(habit);
    let iconUrl = habit.iconUrl || habit.icon_url;
    let themeClass = habit.themeClass || habit.theme_class;
    let icon = null;
    const iconConfig = iconMap.getIconConfig(habitName);

    if (iconConfig && iconConfig.themeClass) {
      themeClass = iconConfig.themeClass;
    } else if (!this.isValidReportTheme(themeClass)) {
      themeClass = this.getReportThemeByCategory(habit.category);
    }

    if (!this.isValidReportTheme(themeClass)) {
      themeClass = 't-blue';
    }

    if (!iconUrl) {
      if (iconConfig) {
        iconUrl = iconConfig.iconUrl;
      } else {
        icon = '馃敟';
      }
    }

    return { iconUrl, themeClass, icon };
  },

  mapWeekHabitReport(report) {
    const habit = report.habit || {};
    const visual = this.getHabitVisual(habit);
    return {
      habitId: report.habitId,
      name: this.getHabitDisplayName(habit),
      iconUrl: visual.iconUrl,
      icon: visual.icon,
      themeClass: visual.themeClass,
      days: report.days.map(day => ({
        themeClass: visual.themeClass,
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
      days.push({ date: '', status: 'empty', empty: true, done: false, themeClass: visual.themeClass });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const item = dayMap[dateStr] || {};
      days.push({
        themeClass: visual.themeClass,
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
      days.push({ date: '', status: 'empty', empty: true, done: false, themeClass: visual.themeClass });
    }

    return {
      habitId: report.habitId,
      name: this.getHabitDisplayName(habit),
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
      heatmap.push({ level: '', empty: true, themeClass: visual.themeClass });
    }

    const daysInYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 366 : 365;
    for (let i = 0; i < daysInYear; i++) {
      const currentDate = new Date(year, 0, 1);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = this.formatDateKey(currentDate);
      const item = dayMap[dateStr] || {};
      heatmap.push({
        themeClass: visual.themeClass,
        level: item.status === 'checked' ? 'level-1' : '',
        status: item.status || 'inactive'
      });
    }

    const remainingCells = (7 - (heatmap.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      heatmap.push({ level: '', empty: true, themeClass: visual.themeClass });
    }

    return {
      habitId: report.habitId,
      name: this.getHabitDisplayName(habit),
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
    if (USE_REPORT_SERVICE && reportService) {
      try {
        const weekDates = this.getWeekDates();
        const weekStart = this.formatDateKey(weekDates[0]);
        const report = await reportService.getWeeklyReport(weekStart);

        this.setData({
          habitMatrix: report.habitReports
            .filter(item => this.shouldShowHabitReport(item))
            .map(item => this.mapWeekHabitReport(item)),
          monthHabits: [],
          yearHabits: [],
          stats: report.stats
        });
        return
      } catch (e) {
        console.error('[stats] loadWeekData via reportService failed, falling back to legacy:', e)
      }
    }

    // Legacy path
    const weekDates = this.getWeekDates();
    const startDate = this.formatDateKey(weekDates[0]);
    const endDate = this.formatDateKey(weekDates[6]);
    const report = this.buildPeriodReport(myHabits, startDate, endDate);

    this.setData({
      habitMatrix: report.habitReports
        .filter(item => this.shouldShowHabitReport(item))
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

    if (USE_REPORT_SERVICE && reportService) {
      try {
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const report = await reportService.getMonthlyReport(monthStr);

        this.setData({
          monthHabits: report.habitReports
            .filter(item => this.shouldShowHabitReport(item))
            .map(item => this.mapMonthHabitReport(item, year, month, daysInMonth, startWeekday)),
          habitMatrix: [],
          yearHabits: [],
          stats: report.stats
        });
        return
      } catch (e) {
        console.error('[stats] loadMonthData via reportService failed, falling back to legacy:', e)
      }
    }

    // Legacy path
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

    if (USE_REPORT_SERVICE && reportService) {
      try {
        const report = await reportService.getYearlyReport(String(year));

        this.setData({
          yearHabits: report.habitReports
            .filter(item => this.shouldShowHabitReport(item))
            .map(item => this.mapYearHabitReport(item, year)),
          habitMatrix: [],
          monthHabits: [],
          stats: report.stats
        });
        return
      } catch (e) {
        console.error('[stats] loadYearData via reportService failed, falling back to legacy:', e)
      }
    }

    // Legacy path
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

    // 璋冭瘯鏃ュ織锛氭鏌?habit 鏁版嵁
    if (habit.name === 'Jingluo' || habit.name === 'Guasha' || habit.name === 'Jingang') {
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

    // 妫€鏌?freq_category 鏄惁鎸囩ず闂撮殧鎵撳崱锛屼絾 freq_type 琚敊璇繚瀛樹负 'daily'
    let effectiveFreqType = habit.freq_type;
    if (habit.freq_category === 'daily-interval' && habit.freq_type === 'daily') {
      // 鏁版嵁鎹熷潖锛歠req_category 鎸囩ず闂撮殧鎵撳崱锛屼絾 freq_type 琚繚瀛樹负 'daily'
      // 鏍规嵁 freq_category 淇 freq_type
      effectiveFreqType = 'interval';
      console.warn(`data repair: ${habit.name} freq_type daily -> interval`);
    }

    // 妫€鏌ヨ鍒掑紑濮嬫棩鏈?
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
        if (habit.name === 'Jingluo' || habit.name === 'Guasha' || habit.name === 'Jingang') {
          console.log(`[shouldShowHabitOnDate] ${habit.name} - ${dateStr}: 鏃爏tartDate锛岄粯璁や负姣忔棩鎵撳崱`);
        }
        return true;
      }
      const planStart = new Date(startDate);
      const currentDate = new Date(dateStr);
      const diffDays = Math.floor((currentDate - planStart) / (1000 * 60 * 60 * 24));
      const isDueDay = diffDays >= 0 && diffDays % intervalDays === 0;
      if (habit.name === 'Jingluo' || habit.name === 'Guasha' || habit.name === 'Jingang') {
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
    return share.appMessage('瀛愬崍鑺变俊 路 瑙傚績鎶ヨ〃', '/pages/stats/stats');
  },

  onShareTimeline() {
    return share.timeline('瀛愬崍鑺变俊 路 瑙傚績鎶ヨ〃', 'from=timeline&page=stats');
  }
});
