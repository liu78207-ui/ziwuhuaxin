/**
 * ============================================================
 * ⚠️ 安全提示 ⚠️
 * ============================================================
 * 注意：本项目的 MyHabits 和 CheckinLogs 数据表，务必在云开发控制台中
 * 将其数据权限设置为【仅创建者可读写】。前端在执行 db.collection('CheckinLogs').add()
 * 时，系统会自动写入 _openid 字段，实现天然的数据隔离，无需在代码中手动拼接 openid。
 * ============================================================
 */

const homeService = require('../../services/homeService');
const checkinService = require('../../services/checkinService');
const share = require('../../utils/share.js');

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
    progressPercent: 0,
    isOnline: true
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
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.pendingHabitsTab = 'sports';
    }

    wx.switchTab({
      url: '/pages/habits/habits'
    });
  },

  onLoad() {
    const app = getApp();
    app.printAllLogs();

    this.setData({
      isOnline: app.globalData.isOnline
    });

    this.loadViewModel();
  },

  onShow() {
    share.enableShareMenu();

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
    const todayKey = require('../../services/timeService').getTodayKey();

    try {
      const newState = await checkinService.toggleCheckin(userHabitId, todayKey);

      // 更新本地 taskList 状态
      const taskList = this.data.taskList.map(item => {
        if (item._id === userHabitId) {
          const currentStreak = Number(item.streak) || 0;
          const nowChecked = newState.status === 'checked';
          return {
            ...item,
            isChecked: nowChecked,
            streak: nowChecked ? currentStreak + 1 : Math.max(0, currentStreak - 1)
          };
        }
        return item;
      });

      // 计算更新后的进度
      const totalCount = taskList.length;
      const checkedCount = taskList.filter(item => item.isChecked).length;
      const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

      this.setData({
        taskList,
        checkedCount,
        totalCount,
        progressPercent
      });

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

    return share.appMessage(
      `子午花信 · ${timeInfo.shichen || '今日修习'} | 今日已打卡 ${checkedCount}/${totalCount} 项`,
      '/pages/home/home'
    );
  },

  onShareTimeline() {
    return share.timeline('子午花信 · 顺时修习，日日有信', 'from=timeline&page=home');
  }
});