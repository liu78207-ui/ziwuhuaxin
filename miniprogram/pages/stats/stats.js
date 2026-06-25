const iconMap = require('../../utils/iconMap.js');
const lunarCalendar = require('../../utils/lunarCalendar.js');
const shareService = require('../../services/shareService');
const timeService = require('../../services/timeService.js');
const eventBus = require('../../services/eventBus.js');
const { getNavTitleStyle } = require('../../utils/navLayout');

// All report data must come from reportService / reportAggregator.
let reportService = null
try {
  reportService = require('../../services/reportService')
} catch (e) {
  console.error('[stats] reportService load failed:', e)
}

// 浠庡叏灞€鑾峰彇璋冭瘯閰嶇疆
const getDebugOffset = () => {
  const app = getApp();
  const offset = app.globalData.DEBUG_DAY_OFFSET;
  return offset !== undefined ? offset : 0;
};

// 鑾峰彇妯℃嫙鏃ユ湡锛堝鏋滃浜庤皟璇曟ā寮忥級
const getSimulatedDate = () => {
  return timeService.getSimulatedDate({ getDebugOffset });
};

const normalizeDateKey = (date) => {
  if (typeof date === 'string') return date;
  if (typeof date === 'number') return timeService.formatTimestamp(date);
  return timeService.formatDate(date);
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
    currentYear: null, // 褰撳墠鏄剧ず鐨勫勾浠?
    navTitleStyle: '',
    yearLoading: false
  },

  unsubscribeSyncRecovered: null,
  unsubscribeSyncUpdated: null,
  unsubscribeReportUpdated: null,
  syncRefreshTimer: null,
  reportLoadToken: 0,
  yearRenderTimer: null,
  yearRenderBatchSize: 6,

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
    this.setData({
      navTitleStyle: getNavTitleStyle()
    });
    this.subscribeSyncEvents();
    this.resetToCurrentPeriod();
    this.setData({
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

  onUnload() {
    this.unsubscribeSyncEvents();
  },

  subscribeSyncEvents() {
    if (this.unsubscribeSyncRecovered || this.unsubscribeSyncUpdated || this.unsubscribeReportUpdated) return;

    const refreshRecovered = () => {
      this.refreshAfterRecovery();
    };
    const refresh = () => {
      this.scheduleSyncRefresh();
    };
    this.unsubscribeSyncRecovered = eventBus.on('sync:recovered', refreshRecovered);
    this.unsubscribeSyncUpdated = eventBus.on('sync:updated', refresh);
    this.unsubscribeReportUpdated = eventBus.on('report:updated', refresh);
  },

  refreshAfterRecovery() {
    if (this.syncRefreshTimer) {
      clearTimeout(this.syncRefreshTimer);
      this.syncRefreshTimer = null;
    }
    if (reportService && typeof reportService.clearYearlyReportCache === 'function') {
      reportService.clearYearlyReportCache();
    }
    this.loadRealData();
  },

  scheduleSyncRefresh() {
    if (this.syncRefreshTimer) {
      clearTimeout(this.syncRefreshTimer);
    }
    this.syncRefreshTimer = setTimeout(() => {
      this.syncRefreshTimer = null;
      if (reportService && typeof reportService.clearYearlyReportCache === 'function') {
        reportService.clearYearlyReportCache();
      }
      this.loadRealData();
    }, 120);
  },

  unsubscribeSyncEvents() {
    if (this.syncRefreshTimer) {
      clearTimeout(this.syncRefreshTimer);
      this.syncRefreshTimer = null;
    }
    this.cancelYearRender();
    if (this.unsubscribeSyncRecovered) {
      this.unsubscribeSyncRecovered();
      this.unsubscribeSyncRecovered = null;
    }
    if (this.unsubscribeSyncUpdated) {
      this.unsubscribeSyncUpdated();
      this.unsubscribeSyncUpdated = null;
    }
    if (this.unsubscribeReportUpdated) {
      this.unsubscribeReportUpdated();
      this.unsubscribeReportUpdated = null;
    }
  },

  onShow() {
    shareService.enableShareMenu();

    // 璋冭瘯锛氭鏌ユ湰鍦板瓨鍌ㄤ腑鐨勬暟鎹?    this.debugStorageData();

    // 姣忔鏄剧ず椤甸潰鏃跺埛鏂版暟鎹紙纭繚璺ㄩ〉闈㈠悓姝ワ級
    // 浣跨敤 wx.nextTick 閬垮厤涓庡垵娆℃覆鏌撳啿绐?
    wx.nextTick(() => {
      (async () => {
        try {
          this.resetToCurrentPeriod();
          this.updateDateDisplay();
          await this.loadRealData();
        } catch (err) {
          console.error('[stats] loadRealData failed:', err);
        }
      })();
    });

    // 璁剧疆鑷畾涔?TabBar 閫変腑鐘舵€?
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  resetToCurrentPeriod() {
    const today = getSimulatedDate();
    this.setData({
      currentWeekStart: this.getWeekStart(today),
      currentMonth: today.getUTCMonth(),
      currentYear: today.getUTCFullYear()
    });
  },

  // 鑾峰彇鍛ㄥ紑濮嬫棩鏈燂紙鍛ㄤ竴锛?
  getWeekStart(date) {
    return timeService.getWeekRange(timeService.formatDate(date)).startDate;
  },

  // 鏍煎紡鍖栨棩鏈燂紙鍙樉绀烘湀/鏃ワ級
  formatDate(date) {
    const dateKey = normalizeDateKey(date);
    const [, month, day] = dateKey.split('-');
    return `${month}.${day}`;
  },

  formatFullDate(date) {
    const dateKey = normalizeDateKey(date);
    const [year, month, day] = dateKey.split('-');
    return `${year}.${month}.${day}`;
  },

  // 鏍煎紡鍖栨棩鏈熶负 key (YYYY-MM-DD)
  formatDateKey(date) {
    return normalizeDateKey(date);
  },

  // 鏇存柊鏃ユ湡鏄剧ず
  updateDateDisplay() {
    const currentTab = this.data.currentTab;

    let dateTitle = '';
    let dateSubtitle = '';

    if (currentTab === 'week') {
      const weekStart = normalizeDateKey(this.data.currentWeekStart);
      const weekEnd = timeService.addDays(weekStart, 6);
      dateTitle = `${this.formatFullDate(weekStart)} - ${this.formatDate(weekEnd)}`;
      dateSubtitle = lunarCalendar.formatLunarRange(timeService.parseDate(weekStart), timeService.parseDate(weekEnd));
    } else if (currentTab === 'month') {
      const year = this.data.currentYear;
      const month = this.data.currentMonth;
      const monthStr = (month + 1).toString().padStart(2, '0');
      const monthStart = `${year}-${monthStr}-01`;
      const monthEnd = timeService.getMonthRange(monthStart).endDate;
      dateTitle = `${year}.${monthStr}`;
      dateSubtitle = lunarCalendar.formatLunarRange(timeService.parseDate(monthStart), timeService.parseDate(monthEnd));
    } else if (currentTab === 'year') {
      const year = this.data.currentYear;
      dateTitle = `${year}`;
      dateSubtitle = lunarCalendar.formatLunarRange(
        timeService.parseDate(`${year}-01-01`),
        timeService.parseDate(`${year}-12-31`)
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
    if (!tab || tab === this.data.currentTab) {
      return;
    }
    this.cancelYearRender();
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
      const weekStart = timeService.addDays(normalizeDateKey(this.data.currentWeekStart), -7);
      this.setData({ currentWeekStart: weekStart }, () => {
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
      const weekStart = timeService.addDays(normalizeDateKey(this.data.currentWeekStart), 7);
      this.setData({ currentWeekStart: weekStart }, () => {
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

  // V1 report path: data comes from reportService.
  async loadRealData() {
    const token = this.beginReportLoad();
    const currentTab = this.data.currentTab;

    // 确保时间状态已初始化（考虑调试偏移）
    if (currentTab === 'week' && !this.data.currentWeekStart) {
      const today = getSimulatedDate();
      const weekStart = this.getWeekStart(today);
      this.setData({ currentWeekStart: weekStart });
    }

    // Phase 6D - V1 路径：loadWeek/Month/YearData 直接从 reportService 获取数据
    try {
      if (currentTab === 'week') {
        await this.loadWeekData(token);
      } else if (currentTab === 'month') {
        await this.loadMonthData(token);
      } else if (currentTab === 'year') {
        await this.loadYearData(token);
      }
    } catch (err) {
      if (!this.isReportLoadCurrent(token)) return;
      console.error('加载数据失败:', err);
      this.setData({
        habitMatrix: [],
        monthHabits: [],
        yearHabits: [],
        yearLoading: false,
        stats: {
          checkinRate: 0,
          totalCount: 0,
          checkinDays: 0,
          maxStreak: 0
        }
      });
    }
  },

  beginReportLoad() {
    this.cancelYearRender();
    this.reportLoadToken += 1;
    return this.reportLoadToken;
  },

  isReportLoadCurrent(token) {
    return typeof token !== 'number' || token === this.reportLoadToken;
  },

  cancelYearRender() {
    if (this.yearRenderTimer) {
      clearTimeout(this.yearRenderTimer);
      this.yearRenderTimer = null;
    }
  },

  // 鑾峰彇褰撳墠鍛ㄧ殑鏃ユ湡鏁扮粍
  getWeekDates() {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(timeService.addDays(normalizeDateKey(this.data.currentWeekStart), i));
    }
    return dates;
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

  compareHabitDisplayName(a, b) {
    const nameCompare = String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    if (nameCompare !== 0) return nameCompare;
    return String(a.habitId || '').localeCompare(String(b.habitId || ''));
  },

  compareHabitCheckinCountDesc(a, b) {
    const countA = Number(a.practiceCount ?? a.totalDays ?? a.daysCount ?? 0);
    const countB = Number(b.practiceCount ?? b.totalDays ?? b.daysCount ?? 0);
    if (countA !== countB) return countB - countA;
    return this.compareHabitDisplayName(a, b);
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
        displayStatus: day.displayStatus || day.status,
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
        displayStatus: item.displayStatus || item.status || 'inactive',
        empty: false,
        done: item.status === 'checked',
        checked: item.status === 'checked',
        isChecked: Boolean(item.isChecked),
        isDue: Boolean(item.isDue),
        shouldShow: Boolean(item.shouldShow),
        countsInDueDenominator: Boolean(item.countsInDueDenominator),
        countsInDenominator: Boolean(item.countsInDenominator),
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
      daysCount: report.checkinDays ?? report.doneCount,
      practiceCount: report.practiceCount ?? report.doneCount,
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
    const firstDay = timeService.parseDate(`${year}-01-01`);
    const firstDayOfWeek = firstDay.getUTCDay();
    const emptyCells = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    for (let i = 0; i < emptyCells; i++) {
      heatmap.push({ level: '', empty: true, themeClass: visual.themeClass });
    }

    const yearRange = timeService.getYearRange(`${year}-01-01`);
    const daysInYear = timeService.dateDiff(yearRange.endDate, yearRange.startDate) + 1;
    for (let i = 0; i < daysInYear; i++) {
      const dateStr = timeService.addDays(yearRange.startDate, i);
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
      totalDays: report.checkinDays ?? report.doneCount,
      practiceCount: report.practiceCount ?? report.doneCount,
      isDeleted: habit.isDeleted || false
    };
  },

  shouldShowHabitReport(report) {
    if (report.hasVisibleState) {
      return true;
    }
    const habit = report.habit || {};
    if (habit.isDeleted || habit.deletedAt || habit.deleted_at) {
      return report.dueCount > 0 || report.doneCount > 0;
    }
    return report.dueCount > 0 || report.doneCount > 0;
  },

  async loadWeekData(token) {
    if (!reportService) {
      console.warn('[stats] reportService not available, skipping week data load');
      return;
    }

    const weekDates = this.getWeekDates();
    const weekStart = this.formatDateKey(weekDates[0]);
    const report = await reportService.getWeeklyReport(weekStart);
    if (!this.isReportLoadCurrent(token)) return;

    this.setData({
      habitMatrix: report.habitReports
        .filter(item => this.shouldShowHabitReport(item))
        .map(item => this.mapWeekHabitReport(item))
        .sort((a, b) => this.compareHabitDisplayName(a, b)),
      monthHabits: [],
      yearHabits: [],
      yearLoading: false,
      stats: report.stats
    });
  },

  async loadMonthData(token) {
    const year = this.data.currentYear;
    const month = this.data.currentMonth;
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthRange = timeService.getMonthRange(monthStart);
    const daysInMonth = timeService.dateDiff(monthRange.endDate, monthRange.startDate) + 1;
    const firstDayOfMonth = timeService.parseDate(monthRange.startDate).getUTCDay();
    const startWeekday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    if (!reportService) {
      console.warn('[stats] reportService not available, skipping month data load');
      return;
    }

    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const report = await reportService.getMonthlyReport(monthStr);
    if (!this.isReportLoadCurrent(token)) return;

    this.setData({
      monthHabits: report.habitReports
        .filter(item => this.shouldShowHabitReport(item))
        .map(item => this.mapMonthHabitReport(item, year, month, daysInMonth, startWeekday))
        .sort((a, b) => this.compareHabitCheckinCountDesc(a, b)),
      habitMatrix: [],
      yearHabits: [],
      yearLoading: false,
      stats: report.stats
    });
  },

  async loadYearData(token) {
    const year = this.data.currentYear;

    if (!reportService) {
      console.warn('[stats] reportService not available, skipping year data load');
      return;
    }

    this.cancelYearRender();
    this.setData({
      yearLoading: true,
      yearHabits: [],
      habitMatrix: [],
      monthHabits: []
    });

    const report = await reportService.getYearlyReport(String(year));
    if (!this.isReportLoadCurrent(token)) return;

    const yearHabits = report.habitReports
      .filter(item => this.shouldShowHabitReport(item))
      .map(item => this.mapYearHabitReport(item, year))
      .sort((a, b) => this.compareHabitCheckinCountDesc(a, b));

    this.renderYearHabitsInBatches(yearHabits, report.stats, token);
  },

  renderYearHabitsInBatches(yearHabits, stats, token) {
    if (!this.isReportLoadCurrent(token)) return;

    const batchSize = this.data.currentTab === 'year'
      ? (this.yearRenderBatchSize || 6)
      : yearHabits.length;
    const firstBatch = yearHabits.slice(0, batchSize);
    let renderedCount = firstBatch.length;

    this.setData({
      yearHabits: firstBatch,
      habitMatrix: [],
      monthHabits: [],
      stats,
      yearLoading: renderedCount < yearHabits.length
    });

    const renderNextBatch = () => {
      if (!this.isReportLoadCurrent(token) || this.data.currentTab !== 'year') {
        this.cancelYearRender();
        return;
      }

      const nextCount = Math.min(renderedCount + batchSize, yearHabits.length);
      renderedCount = nextCount;
      this.setData({
        yearHabits: yearHabits.slice(0, renderedCount),
        yearLoading: renderedCount < yearHabits.length
      });

      if (renderedCount < yearHabits.length) {
        this.yearRenderTimer = setTimeout(renderNextBatch, 16);
      } else {
        this.yearRenderTimer = null;
      }
    };

    if (renderedCount < yearHabits.length) {
      this.yearRenderTimer = setTimeout(renderNextBatch, 16);
    }
  },

  onShareAppMessage() {
    return shareService.getShareMessage('stats');
  },

  onShareTimeline() {
    return shareService.getShareTimeline('stats');
  }
});
