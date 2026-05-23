/**
 * ============================================================
 * ⚠️ 安全提示 ⚠️
 * ============================================================
 * 注意：本项目的 MyHabits 和 CheckinLogs 数据表，务必在云开发控制台中
 * 将其数据权限设置为【仅创建者可读写】。前端在执行 db.collection('CheckinLogs').add()
 * 时，系统会自动写入 _openid 字段，实现天然的数据隔离，无需在代码中手动拼接 openid。
 * ============================================================
 */

const ziwu = require('../../utils/ziwu.js');
const iconMap = require('../../utils/iconMap.js');
const reportCalculator = require('../../utils/reportCalculator.js');
const share = require('../../utils/share.js');
const habitService = require('../../services/habitService');
const checkinService = require('../../services/checkinService');

// 习惯圆圈背景色 - 柔和的国风色调
const CIRCLE_COLORS = [
  '#F5E6E0', // 浅粉
  '#E8E4D9', // 米灰
  '#D4E5E0', // 浅青
  '#E5DED4', // 暖灰
  '#D9E2E8', // 浅蓝
  '#E8D9D9'  // 浅玫瑰
];

// 根据时辰获取养生建议（2行格式：时辰描述+养生方向。具体动作+效果）
function getAdviceByShichen(shichen) {
  const adviceMap = {
    '子时': '夜深胆气生，宜熟睡养胆。深度睡眠有助胆汁代谢和排毒。',
    '丑时': '凌晨肝血归，宜熟睡养肝。血液归于肝，熟睡有助肝脏解毒造血。',
    '寅时': '黎明肺气旺，宜深度睡眠。肺主一身气，此时宜静养，避免早起。',
    '卯时': '晨起大肠动，宜起床排便。喝温开水促进肠道蠕动，排出宿便。',
    '辰时': '早养胃气足，宜进食早餐。此时消化吸收最强，吃好早餐养胃气。',
    '巳时': '上午脾运化，宜工作学习。脾主运化水谷，精力充沛，适合事务。',
    '午时': '正午心火旺，宜小憩养心。饭后散步片刻，适当午休，养心安神。',
    '未时': '午后小肠忙，宜多喝水。小肠分清泌浊，多喝水帮助身体排毒。',
    '申时': '下午膀胱经，宜运动排毒。此时精力旺盛，适合运动多喝水。',
    '酉时': '傍晚肾藏精，宜静养藏精。避免剧烈运动，可泡脚按摩涌泉。',
    '戌时': '黄昏心包经，宜放松身心。散步阅读，保持心情愉悦，为入睡准备。',
    '亥时': '夜深水气重，宜温阳驱寒。去泡个脚吧，用热度驱散一天的疲惫。'
  };
  return adviceMap[shichen] || '顺应天时，调养身心。保持规律作息，养成健康习惯。';
}

// 从全局获取调试配置
const getDebugOffset = () => {
  const app = getApp();
  const offset = app.globalData.DEBUG_DAY_OFFSET;
  return offset !== undefined ? offset : 0;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateStr = (value) => {
  if (!value) return '';
  if (value instanceof Date) return formatDateKey(value);
  if (typeof value === 'string') return value.split('T')[0];
  if (typeof value.toDate === 'function') return formatDateKey(value.toDate());
  if (typeof value.toISOString === 'function') return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
};

// 判断习惯今天是否应该显示（根据频率策略）
function shouldShowHabitToday(habit) {
  // 调试模式：可以模拟不同日期
  const DEBUG_DAY_OFFSET = getDebugOffset();
  const today = new Date();
  if (DEBUG_DAY_OFFSET !== 0) {
    today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
  }
  
  const todayStr = formatDateKey(today);
  const deletedDate = toDateStr(habit.deletedAt || habit.deleted_at);
  if (deletedDate && todayStr >= deletedDate) {
    return false;
  }
  return reportCalculator.isDueByStrategy(habit, todayStr);
  const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
  
  // 调试日志
  console.log('=== shouldShowHabitToday ===');
  console.log('习惯名称:', habit.name);
  console.log('模拟日期:', todayStr, '星期:', dayOfWeek);
  console.log('freq_type:', habit.freq_type);
  console.log('freq_rules:', habit.freq_rules);
  console.log('createdAt:', habit.createdAt);
  
  // 如果没有设置频率类型，默认每天显示
  if (!habit.freq_type) {
    console.log('结果: 显示 (无freq_type)');
    return true;
  }

  // 检查计划开始日期
  const planStartDate = habit.plan_start_date || habit.createdAt;
  if (planStartDate && todayStr < planStartDate) {
    console.log('结果: 隐藏 (计划未开始)');
    return false;
  }

  // 每日习惯
  if (habit.freq_type === 'daily') {
    // 每日习惯：每天都应打卡
    console.log('结果: 显示 (每日习惯)');
    return true;
  }
  
  // 每周固定习惯
  if (habit.freq_type === 'weekly') {
    // freq_rules 是星期数组，如 [1, 3, 5] 表示周一、三、五
    const weeklyDays = habit.freq_rules || [];
    if (!Array.isArray(weeklyDays) || weeklyDays.length === 0) {
      console.log('结果: 显示 (无指定星期)');
      return true; // 如果没有指定具体星期几，默认每天显示
    }
    
    // 将 getDay() 的 0-6 转换为 1-7（周一到周日）
    const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const shouldShow = weeklyDays.includes(normalizedDay);
    console.log('今天星期(1-7):', normalizedDay);
    console.log('设置的星期:', weeklyDays);
    console.log('结果:', shouldShow ? '显示' : '隐藏');
    return shouldShow;
  }
  
  // 间隔天数习惯（每周不固定）
  if (habit.freq_type === 'interval') {
    // freq_rules 表示间隔天数，用户设置"间隔2天"意味着每3天打一次卡
    const interval = (habit.freq_rules || 1) + 1;
    const planStartDate = habit.plan_start_date || habit.createdAt || todayStr;
    const planStart = new Date(planStartDate);
    const daysDiff = Math.floor((today - planStart) / (1000 * 60 * 60 * 24));

    console.log('间隔天数:', interval);
    console.log('计划开始日期:', planStartDate);
    console.log('天数差:', daysDiff);

    const shouldShow = daysDiff >= 0 && daysDiff % interval === 0;
    console.log('结果:', shouldShow ? '显示' : '隐藏');
    return shouldShow;
  }
  
  // 其他频率类型，默认显示
  console.log('结果: 显示 (其他类型)');
  return true;
}

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
    this.initTimeInfo();

    // 打印所有打卡记录（调试用）
    const app = getApp();
    app.printAllLogs();

    // 获取网络状态
    this.setData({
      isOnline: app.globalData.isOnline
    });

    // 延迟加载数据，确保 app.js 已完成初始化
    setTimeout(() => {
      this.loadHabitsData();
    }, 100);
  },

  onShow() {
    share.enableShareMenu();

    console.log('=== onShow 触发 ===');
    this.initTimeInfo();

    // 先清空任务列表，强制视图刷新
    this.setData({ taskList: [] });
    
    // 每次显示页面时重新加载数据（确保跨页面同步）
    // 使用 setTimeout 确保 app.js 已完成初始化
    setTimeout(() => {
      console.log('=== onShow 中调用 loadHabitsData ===');
      this.loadHabitsData();
    }, 100);

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

  // 初始化时间信息
  initTimeInfo() {
    const timeInfo = ziwu.getTimeInfo();
    timeInfo.advice = getAdviceByShichen(timeInfo.shichen);
    this.setData({ timeInfo });
  },

  // 加载习惯数据（从 habitService 获取）
  async loadHabitsData() {
    console.log('=== loadHabitsData 开始执行 ===');

    // 获取调试日期偏移
    const DEBUG_DAY_OFFSET = getDebugOffset();
    const todayDate = new Date();
    if (DEBUG_DAY_OFFSET !== 0) {
      todayDate.setDate(todayDate.getDate() + DEBUG_DAY_OFFSET);
    }
    const today = formatDateKey(todayDate);
    console.log('模拟日期:', today, 'DEBUG_DAY_OFFSET:', DEBUG_DAY_OFFSET);

    // 从 habitService 获取今日习惯（已过滤频率策略）
    let todayHabits = [];
    try {
      todayHabits = await habitService.getTodayHabits(today);
    } catch (e) {
      console.error('habitService.getTodayHabits 失败:', e);
    }

    // 获取今日打卡状态（用于填充 isChecked）
    const todayStates = checkinService.getDailyStatesByDate(today);

    console.log('loadHabitsData - 今日应修习惯:', todayHabits.length);

    if (!todayHabits || todayHabits.length === 0) {
      console.log('没有习惯数据，显示空状态');
      this.setData({
        taskList: []
      });
      return;
    }

    // 转换为 taskList 格式，_id 使用 userHabitId
    const taskList = todayHabits.map((habit, index) => {
      const iconConfig = iconMap.getIconConfig(habit.name);
      const state = todayStates.find(s => s.userHabitId === habit.userHabitId);
      const isDone = state && state.status === 'checked';

      // 动态计算跨年累计的策略内有效打卡天数
      let streak = 0;
      try {
        streak = this.calculateStreakLocal(habit, today);
      } catch (e) {
        console.error('计算连续天数失败:', e);
        streak = 0;
      }
      streak = Number(streak) || 0;

      return {
        _id: habit.userHabitId,
        habitId: habit.habitId,
        title: habit.name,
        category: habit.category || '运动类',
        duration: habit.duration,
        isChecked: isDone,
        streak: streak,
        bgColor: CIRCLE_COLORS[index % CIRCLE_COLORS.length],
        iconUrl: iconConfig ? iconConfig.iconUrl : iconMap.getIconPath(habit.name),
        themeClass: iconConfig ? iconConfig.themeClass : (habit.themeClass || 'theme-jade'),
        emoji: this.getEmojiByCategory(habit.category),
        meta: `${habit.duration}分钟`
      };
    });

    // 计算进度
    const totalCount = taskList.length;
    const checkedCount = taskList.filter(item => item.isChecked).length;
    const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    this.setData({
      taskList,
      checkedCount,
      totalCount,
      progressPercent
    });
    console.log('首页加载习惯数据:', taskList.length, '条', '进度:', checkedCount + '/' + totalCount);
    console.log('taskList:', taskList.map(t => ({ name: t.title, isChecked: t.isChecked })));
  },

  // 本地检查今天是否打卡（备用方法）
  checkTodayCheckin(habitId, dateStr) {
    const app = getApp();
    const logs = app.globalData.CheckinLogs || [];
    return logs.some(log => {
      const logHabitId = String(log.habitId || log.habit_id || '');
      const logDate = String(log.date || log.checkin_date || '').split('T')[0];
      return logHabitId === String(habitId) && logDate === dateStr && log.sync_status !== 2;
    });
  },

  // 根据分类获取表情符号
  getEmojiByCategory(category) {
    const emojiMap = {
      '运动类': '🏃',
      '理疗类': '🔥',
      '起居类': '🍵'
    };
    return emojiMap[category] || '🧘';
  },

  getAllCheckinLogs(dateStr) {
    // Phase 3C: 通过 checkinService 获取本地打卡状态，不再直接读 storage
    return checkinService.getDailyStatesByDate(dateStr || '');
  },

  // 本地计算首页”已坚持 X 天”：跨年累计的策略内有效打卡天数
  // Phase 3C: streak 计算依赖旧 CheckinLogs 结构，暂通过 service 直接获取
  calculateStreakLocal(habit, todayStr) {
    const states = this.getAllCheckinLogs(todayStr);
    // Phase 3C: DailyCheckinState 结构不支持 lifetime streak 精确计算，保守返回已打卡天数
    const checkedCount = states.filter(s => s.userHabitId === habit.userHabitId && s.status === 'checked').length;
    return checkedCount;
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

    // 找到对应的 habit（taskItem._id 现在是 userHabitId）
    const habit = this.data.taskList.find(item => item._id === habitId);
    if (!habit) {
      this.processingHabitId = null;
      return;
    }

    const isChecked = habit.isChecked;
    const userHabitId = habit._id;

    // 使用模拟日期（如果处于调试模式）
    const DEBUG_DAY_OFFSET = getDebugOffset();
    const todayDate = new Date();
    if (DEBUG_DAY_OFFSET !== 0) {
      todayDate.setDate(todayDate.getDate() + DEBUG_DAY_OFFSET);
    }
    const today = formatDateKey(todayDate);

    // 调用 checkinService.toggleCheckin（处理幂等和状态持久化）
    try {
      const newState = await checkinService.toggleCheckin(userHabitId, today);

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

  // Phase 3C: 禁止在页面层调用云同步逻辑

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
