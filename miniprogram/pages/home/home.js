/**
 * home.js - 首页
 * 页面层只负责：UI 渲染、用户事件响应、调用 Service
 */

const homeService = require('../../services/homeService');
const habitService = require('../../services/habitService');
const checkinService = require('../../services/checkinService');
const timeService = require('../../services/timeService');
const shareService = require('../../services/shareService');
const eventBus = require('../../services/eventBus');

// 习惯圆圈背景色 - 柔和的国风色调
const CIRCLE_COLORS = [
  '#F5E6E0', '#E8E4D9', '#D4E5E0', '#E5DED4', '#D9E2E8', '#E8D9D9'
];

Page({
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
    circleColors: CIRCLE_COLORS,
    navBgOpacity: 0,
    pressingId: null,
    checkedCount: 0,
    totalCount: 0,
    progressPercent: 0
  },

  // 防抖控制：记录正在处理的 habitId
  processingHabitId: null,
  processingTimer: null,
  refreshTimer: null,
  isPageVisible: false,
  unsubscribeSyncRecovered: null,
  unsubscribeSyncUpdated: null,
  unsubscribeCheckinUpdated: null,
  unsubscribeHabitUpdated: null,

  // 触摸开始 - 添加按压状态
  onTouchStart(e) {
    const { habitId } = e.currentTarget.dataset;
    this.setData({ pressingId: habitId });
  },

  // 触摸结束 - 延迟移除按压状态，让动画可见
  onTouchEnd(e) {
    setTimeout(() => {
      this.setData({ pressingId: null });
    }, 150);
  },

  // 跳转到修习页面
  goToHabits() {
    habitService.requestPendingTab('sports');
    wx.switchTab({
      url: '/pages/habits/habits'
    });
  },

  onLoad() {
    this.subscribeSyncEvents();
    this.loadViewModel();
  },

  onUnload() {
    this.unsubscribeSyncEvents();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  onHide() {
    this.isPageVisible = false;
  },

  subscribeSyncEvents() {
    if (
      this.unsubscribeSyncRecovered ||
      this.unsubscribeSyncUpdated ||
      this.unsubscribeCheckinUpdated ||
      this.unsubscribeHabitUpdated
    ) return;

    const refreshRecovered = () => {
      this.loadViewModel();
    };
    const refresh = (payload = {}) => {
      this.scheduleViewModelRefresh(payload.source || 'event');
    };
    this.unsubscribeSyncRecovered = eventBus.on('sync:recovered', refreshRecovered);
    this.unsubscribeSyncUpdated = eventBus.on('sync:updated', refresh);
    this.unsubscribeCheckinUpdated = eventBus.on('checkin:updated', refresh);
    this.unsubscribeHabitUpdated = eventBus.on('habit:updated', refresh);
  },

  unsubscribeSyncEvents() {
    if (this.unsubscribeSyncRecovered) {
      this.unsubscribeSyncRecovered();
      this.unsubscribeSyncRecovered = null;
    }
    if (this.unsubscribeSyncUpdated) {
      this.unsubscribeSyncUpdated();
      this.unsubscribeSyncUpdated = null;
    }
    if (this.unsubscribeCheckinUpdated) {
      this.unsubscribeCheckinUpdated();
      this.unsubscribeCheckinUpdated = null;
    }
    if (this.unsubscribeHabitUpdated) {
      this.unsubscribeHabitUpdated();
      this.unsubscribeHabitUpdated = null;
    }
  },

  onShow() {
    this.isPageVisible = true;
    shareService.enableShareMenu();

    this.loadViewModel();

    // 重置导航栏背景色
    this.setData({
      navBgOpacity: 0
    });

    // 设置自定义 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  // 页面滚动监听 - 导航栏背景色渐显
  onPageScroll(e) {
    const scrollTop = e.scrollTop;
    const threshold = 0;
    const maxScroll = 30;
    let opacity = 0;

    if (scrollTop > threshold) {
      opacity = Math.min(scrollTop / maxScroll, 1);
    }

    const roundedOpacity = Math.round(opacity * 20) / 20;
    if (Math.abs(roundedOpacity - this.data.navBgOpacity) >= 0.05) {
      this.setData({
        navBgOpacity: roundedOpacity
      });
    }
  },

  scheduleViewModelRefresh(source = 'event', delay = 160) {
    if (!this.isPageVisible) return;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.loadViewModel();
    }, source === 'sync:recovered' ? 0 : delay);
  },

  // 加载视图模型
  async loadViewModel() {
    try {
      const vm = await homeService.getHomeViewModel();
      this.setData({
        timeInfo: vm.timeInfo,
        taskList: vm.taskList,
        checkedCount: vm.checkedCount,
        totalCount: vm.totalCount,
        progressPercent: vm.progressPercent
      });
    } catch (e) {
      console.error('loadViewModel 失败:', e);
    }
  },

  // 处理打卡/取消打卡（带防抖）
  async handleCheckin(e) {
    const { habitId } = e.currentTarget.dataset;

    // 防抖检查：如果正在处理同一个 habit，忽略此次点击
    if (this.processingHabitId === habitId) {
      console.log('防抖：忽略重复点击', habitId);
      return;
    }

    // 设置防抖状态
    this.processingHabitId = habitId;
    clearTimeout(this.processingTimer);
    this.processingTimer = setTimeout(() => {
      this.processingHabitId = null;
    }, 1000);

    // 找到对应的 habit（taskItem._id 是 userHabitId）
    const habit = this.data.taskList.find(item => item._id === habitId);
    if (!habit) {
      this.processingHabitId = null;
      return;
    }

    const isChecked = habit.isChecked;
    const userHabitId = habit._id;
    const todayKey = timeService.getTodayKey();

    try {
      const state = await checkinService.toggleCheckin(userHabitId, todayKey);
      this.applyCheckinStateToTask(userHabitId, state);
      this.scheduleViewModelRefresh('checkin:local', 300);

      wx.showToast({
        title: isChecked ? '已取消打卡' : '打卡成功',
        icon: 'none'
      });
    } catch (e) {
      console.error('toggleCheckin 失败:', e);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    } finally {
      // 清除防抖状态
      this.processingHabitId = null;
      clearTimeout(this.processingTimer);
    }
  },

  applyCheckinStateToTask(userHabitId, state) {
    const nextChecked = state && state.status === 'checked';
    let changed = false;
    const taskList = this.data.taskList.map(item => {
      if (item._id !== userHabitId) return item;
      changed = item.isChecked !== nextChecked;
      const streakDelta = changed ? (nextChecked ? 1 : -1) : 0;
      return {
        ...item,
        isChecked: nextChecked,
        streak: Math.max(0, (item.streak || 0) + streakDelta)
      };
    });

    if (!changed) return;

    const totalCount = taskList.length;
    const checkedCount = taskList.filter(item => item.isChecked).length;
    const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    this.setData({
      taskList,
      checkedCount,
      totalCount,
      progressPercent
    });
  },

  // 分享给好友
  onShareAppMessage() {
    const { timeInfo, taskList } = this.data;
    const checkedCount = taskList.filter(item => item.isChecked).length;
    const totalCount = taskList.length;

    return shareService.appMessage(
      `子午花信 · ${timeInfo.shichen || '今日修习'} | 今日已打卡 ${checkedCount}/${totalCount} 项`,
      '/pages/home/home'
    );
  },

  onShareTimeline() {
    return shareService.getShareTimeline('home');
  }
});
