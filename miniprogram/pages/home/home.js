/**
 * home.js - 首页
 * 页面层只负责：UI 渲染、用户事件响应、调用 Service
 */

const homeService = require('../../services/homeService');
const habitService = require('../../services/habitService');
const checkinService = require('../../services/checkinService');
const timeService = require('../../services/timeService');
const shareService = require('../../services/shareService');

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
    this.loadViewModel();
  },

  onShow() {
    shareService.enableShareMenu();

    // 先清空任务列表，强制视图刷新
    this.setData({ taskList: [] });

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

    this.setData({
      navBgOpacity: opacity
    });
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
      await checkinService.toggleCheckin(userHabitId, todayKey);

      // 重新加载 ViewModel 保持数据一致性
      await this.loadViewModel();

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
    }

    // 清除防抖状态
    this.processingHabitId = null;
    clearTimeout(this.processingTimer);
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
