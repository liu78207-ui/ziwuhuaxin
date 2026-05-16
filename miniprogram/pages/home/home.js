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

// 判断习惯今天是否应该显示（根据频率策略）
function shouldShowHabitToday(habit) {
  // 调试模式：可以模拟不同日期
  const DEBUG_DAY_OFFSET = getDebugOffset();
  const today = new Date();
  if (DEBUG_DAY_OFFSET !== 0) {
    today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
  }
  
  const todayStr = formatDateKey(today);
  const deletedDate = (habit.deletedAt || habit.deleted_at || '').split('T')[0];
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

  // 加载习惯数据（从 MyHabits 表读取）
  loadHabitsData() {
    console.log('=== loadHabitsData 开始执行 ===');
    const app = getApp();

    // 从全局数据获取 MyHabits 表
    let myHabits = [];
    if (app.getAllHabits) {
      myHabits = app.getAllHabits();
    } else {
      myHabits = app.globalData.MyHabits || [];
    }

    // 如果全局数据为空，尝试从本地存储直接读取
    if (!myHabits || myHabits.length === 0) {
      try {
        const storedHabits = wx.getStorageSync('MyHabits');
        if (storedHabits && Array.isArray(storedHabits) && storedHabits.length > 0) {
          myHabits = storedHabits;
          // 同步到全局数据
          app.globalData.MyHabits = storedHabits;
          console.log('从本地存储加载 MyHabits:', myHabits.length);
        }
      } catch (e) {
        console.error('从本地存储读取失败:', e);
      }
    }

    console.log('loadHabitsData - MyHabits:', myHabits.length, myHabits);
    
    // 打印每个习惯的策略信息
    myHabits.forEach(habit => {
      console.log('习惯:', habit.name, {
        freq_type: habit.freq_type,
        freq_rules: habit.freq_rules,
        createdAt: habit.createdAt
      });
    });

    // 获取今天的日期字符串（考虑调试偏移）
    const DEBUG_DAY_OFFSET = getDebugOffset();
    const todayDate = new Date();
    if (DEBUG_DAY_OFFSET !== 0) {
      todayDate.setDate(todayDate.getDate() + DEBUG_DAY_OFFSET);
    }
    const today = formatDateKey(todayDate);
    console.log('模拟日期:', today, 'DEBUG_DAY_OFFSET:', DEBUG_DAY_OFFSET);

    if (!myHabits || myHabits.length === 0) {
      // 如果没有习惯，显示空状态
      console.log('没有习惯数据，显示空状态');
      this.setData({
        taskList: []
      });
      return;
    }

    // 根据策略过滤今天应该显示的习惯
    const filteredHabits = myHabits.filter(habit => shouldShowHabitToday(habit));
    console.log('过滤后应显示的习惯:', filteredHabits.length, '个');
    console.log('应显示的习惯列表:', filteredHabits.map(h => h.name));

    // 将 MyHabits 转换为任务列表
    const taskList = filteredHabits.map((habit, index) => {
      // 获取图标配置
      const iconConfig = iconMap.getIconConfig(habit.name);
      
      // 检查今天是否已打卡（从 CheckinLogs 表查询）
      // 强制使用本地检查，避免 app 方法可能的问题
      const isDone = this.checkTodayCheckin(habit.habitId, today);
      
      console.log('打卡检查:', habit.name, 'habitId:', habit.habitId, '日期:', today, '已打卡:', isDone);
      
      // 同时检查 app 方法的结果（用于调试）
      if (app.isCheckedOnDate) {
        const appResult = app.isCheckedOnDate(habit.habitId, today);
        console.log('  app.isCheckedOnDate 结果:', appResult);
      }
      
      // 动态计算跨年累计的策略内有效打卡天数
      let streak = 0;
      try {
        streak = this.calculateStreakLocal(habit, today);
      } catch (e) {
        console.error('计算连续天数失败:', e);
        streak = 0;
      }
      // 确保 streak 是数字
      streak = Number(streak) || 0;
      
      return {
        _id: habit.habitId,
        title: habit.name,
        category: habit.category || '运动类',
        duration: habit.targetMinutes,
        isChecked: isDone,
        streak: streak, // 动态计算，不是写死的
        bgColor: CIRCLE_COLORS[index % CIRCLE_COLORS.length],
        iconUrl: iconConfig ? iconConfig.iconUrl : iconMap.getIconPath(habit.name),
        themeClass: iconConfig ? iconConfig.themeClass : (habit.themeClass || 'theme-jade'),
        emoji: this.getEmojiByCategory(habit.category),
        meta: `${habit.targetMinutes}分钟`
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

  getAllCheckinLogs() {
    const app = getApp();
    let logs = app.globalData.CheckinLogs || [];
    try {
      const storedLogs = wx.getStorageSync('CheckinLogs');
      if (Array.isArray(storedLogs)) {
        logs = storedLogs;
        app.globalData.CheckinLogs = storedLogs;
      }
    } catch (e) {
      console.error('读取 CheckinLogs 失败:', e);
    }
    return logs;
  },

  // 本地计算首页“已坚持 X 天”：跨年累计的策略内有效打卡天数
  calculateStreakLocal(habit, todayStr) {
    return reportCalculator.calculateLifetimeEffectivePracticeDays(
      habit,
      this.getAllCheckinLogs(),
      todayStr
    );
  },

  // 处理打卡/取消打卡（带防抖）
  async handleCheckin(e) {
    const { habitId } = e.currentTarget.dataset;
    const app = getApp();

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

    // 找到对应的 habit
    const habit = this.data.taskList.find(item => item._id === habitId);
    if (!habit) {
      this.processingHabitId = null;
      return;
    }

    const isChecked = habit.isChecked;

    // 使用模拟日期（如果处于调试模式）
    const DEBUG_DAY_OFFSET = getDebugOffset();
    const todayDate = new Date();
    if (DEBUG_DAY_OFFSET !== 0) {
      todayDate.setDate(todayDate.getDate() + DEBUG_DAY_OFFSET);
    }
    const today = formatDateKey(todayDate);

    // 本地校验：检查是否已打卡（防止重复打卡）
    if (!isChecked) {
      const existingLog = app.globalData.CheckinLogs.find(log =>
        String(log.habitId || log.habit_id || '') === String(habitId) &&
        String(log.date || log.checkin_date || '').split('T')[0] === today
      );
      if (existingLog && existingLog.sync_status !== 2) {
        wx.showToast({
          title: '今日已打卡',
          icon: 'none'
        });
        this.processingHabitId = null;
        return;
      }
    }

    // 更新本地状态
    const taskList = this.data.taskList.map(item => {
      if (item._id === habitId) {
        const currentStreak = Number(item.streak) || 0;
        return {
          ...item,
          isChecked: !isChecked,
          streak: !isChecked ? currentStreak + 1 : Math.max(0, currentStreak - 1)
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

    // 保存或取消打卡记录
    if (!isChecked) {
      // 打卡：添加到 CheckinLogs，标记为待同步
      if (app.addCheckinLog) {
        app.addCheckinLog(habitId, today, 0); // sync_status = 0 待同步
      }
      await this.syncCheckinToCloud(habitId, true, today);
    } else {
      // 取消打卡：从 CheckinLogs 移除或标记为待删除
      if (app.removeCheckinLog) {
        app.removeCheckinLog(habitId, today);
      }
      await this.syncCheckinToCloud(habitId, false, today);
    }

    // 清除防抖状态
    this.processingHabitId = null;
    clearTimeout(this.processingTimer);
  },

  // 同步打卡状态到云端
  async syncCheckinToCloud(habitId, isCheckin, checkinDate) {
    const app = getApp();

    // 调试模式下跳过云端同步（因为云端使用真实日期）
    const DEBUG_DAY_OFFSET = getDebugOffset();
    if (DEBUG_DAY_OFFSET !== 0) {
      console.log('调试模式：跳过云端同步');
      wx.showToast({
        title: isCheckin ? '打卡成功(调试模式)' : '已取消(调试模式)',
        icon: 'none'
      });
      return;
    }

    // 检查网络状态
    const isOnline = app.globalData.isOnline;

    if (!isOnline) {
      // 断网状态：显示本地成功提示
      wx.showToast({
        title: isCheckin ? '打卡成功（已存入本地，网络恢复后自动同步）' : '已取消打卡（网络恢复后同步）',
        icon: 'none',
        duration: 2000
      });
      // 触发后台同步（网络恢复时会自动执行）
      app.syncToCloud();
      return;
    }

    // 有网络时立即同步
    try {
      const cloudFuncName = isCheckin ? 'doCheckin' : 'undoCheckin';
      const { result } = await wx.cloud.callFunction({
        name: cloudFuncName,
        data: { habit_id: habitId, checkin_date: checkinDate }
      });

      if (result.success) {
        // 同步成功，更新本地记录状态
        const logs = app.globalData.CheckinLogs || [];
        const today = checkinDate || formatDateKey(new Date());
        const logIndex = logs.findIndex(log =>
          log.habitId === String(habitId) && log.date === today
        );
        if (logIndex > -1) {
          if (isCheckin) {
            logs[logIndex].sync_status = 1; // 标记为已同步
            logs[logIndex].sync_time = new Date().toISOString();
          }
          app.saveCheckinLogs(logs);
        }

        wx.showToast({
          title: isCheckin ? '打卡成功' : '已取消打卡',
          icon: 'none'
        });
      } else if (result.message === '今日已打卡') {
        // 云端已存在，标记本地为已同步
        const logs = app.globalData.CheckinLogs || [];
        const today = checkinDate || formatDateKey(new Date());
        const logIndex = logs.findIndex(log =>
          log.habitId === String(habitId) && log.date === today
        );
        if (logIndex > -1) {
          logs[logIndex].sync_status = 1;
          app.saveCheckinLogs(logs);
        }
        wx.showToast({
          title: '今日已打卡',
          icon: 'none'
        });
      } else {
        console.error('云端同步失败:', result.message);
        wx.showToast({
          title: result.message || '同步失败，已保存本地',
          icon: 'none'
        });
      }
    } catch (e) {
      console.error('调用云函数失败:', e);
      wx.showToast({
        title: isCheckin ? '打卡成功（网络异常，稍后自动同步）' : '已取消（网络异常，稍后同步）',
        icon: 'none',
        duration: 2000
      });
    }
  },

  // 同步完成回调
  onSyncComplete() {
    console.log('同步完成，刷新页面数据');
    this.loadHabitsData();
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
