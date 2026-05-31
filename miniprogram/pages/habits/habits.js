const iconMap = require('../../utils/iconMap.js');
const share = require('../../utils/share.js');
const habitService = require('../../services/habitService');

Page({
  data: {
    categories: ['我的', '运动类', '理疗类', '起居类'],
    currentTab: 0,
    habits: [],
    filteredHabits: [],
    loading: false,
    showModal: false,
    selectedHabit: null,
    // 单次目标（必选项）
    selectedDuration: 20,
    // 频次分类：everyday(每天), daily-interval(按天间隔), weekly(每周固定)
    freqCategory: 'everyday',
    // 每天频次的子选项：everyday(每天), interval(间隔天数)
    dailyFreqType: 'everyday',
    // 按天间隔天数
    dailyInterval: 2,
    dailyIntervalOptions: [1, 2, 3, 4, 5, 6, 7],
    // 每周固定
    selectedWeekdays: [],
    selectedWeekdaysText: '周一，周三，周日',
    // 选择器数据
    durationOptions: [5, 10, 15, 20, 30, 45, 60, 90, 120],
    weekdays: [
      { value: 1, label: '周一', checked: false },
      { value: 2, label: '周二', checked: false },
      { value: 3, label: '周三', checked: false },
      { value: 4, label: '周四', checked: false },
      { value: 5, label: '周五', checked: false },
      { value: 6, label: '周六', checked: false },
      { value: 7, label: '周日', checked: false }
    ],
    // 弹窗显示控制
    showDurationPickerModal: false,
    showDailyIntervalPickerModal: false,
    showWeekdayPicker: false,
    showPlanStartDatePickerModal: false, // 计划开始日期选择弹窗
    
    // picker-view 选中值
    durationPickerValue: [3], // 默认选中 20 分钟（索引3）
    dailyIntervalPickerValue: [1], // 默认选中 2 天（索引1）
    weekdayPickerValue: [0], // 默认选中周一
    
    // 计划开始时间配置
    planStartType: 'custom',
    planStartDate: '', // 'today' | 'tomorrow' | 'custom'
    planStartDateOptions: [
      { value: 'today', label: '今天' },
      { value: 'tomorrow', label: '明天' },
      { value: 'custom', label: '选择日期' }
    ],
    planStartDateCustom: '', // 自定义日期选择器的值
    planStartHint: '', // 提示信息
    
    // 自定义操作菜单
    showActionMenu: false,
    actionMenuTitle: '',
    actionMenuItems: [],
    actionMenuCallback: null
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
    console.log('habits页面 onLoad');
    // 完整的习惯数据（与数据库一致）
    const allHabits = [
      // 运动类
      { _id: '1', title: '金刚功', category: '运动类', description: '道家养生功法，强身健体', default_duration: 15 },
      { _id: '2', title: '站桩', category: '运动类', description: '静心养气，固本培元', default_duration: 20 },
      { _id: '3', title: '八段锦', category: '运动类', description: '传统养生功法，强身健体', default_duration: 15 },
      { _id: '4', title: '五禽戏', category: '运动类', description: '模仿五禽动作，舒筋活络', default_duration: 20 },
      { _id: '5', title: '太极拳', category: '运动类', description: '舒缓柔和，调和气血', default_duration: 30 },
      { _id: '6', title: '快走', category: '运动类', description: '有氧运动，促进代谢', default_duration: 30 },
      { _id: '7', title: '瑜伽', category: '运动类', description: '身心合一，柔韧身体', default_duration: 45 },
      { _id: '8', title: '普拉提', category: '运动类', description: '核心训练，塑形美体', default_duration: 40 },
      { _id: '9', title: '游泳', category: '运动类', description: '全身运动，增强心肺', default_duration: 45 },
      { _id: '10', title: '跑步', category: '运动类', description: '有氧运动，释放压力', default_duration: 30 },
      { _id: '11', title: '跳绳', category: '运动类', description: '简单高效，燃脂塑形', default_duration: 15 },
      
      // 理疗类
      { _id: '12', title: '艾灸', category: '理疗类', description: '温阳散寒，提升免疫力', default_duration: 30 },
      { _id: '13', title: '刮痧', category: '理疗类', description: '活血化瘀，排毒养颜', default_duration: 20 },
      { _id: '14', title: '拔罐', category: '理疗类', description: '疏通经络，祛湿排毒', default_duration: 15 },
      { _id: '15', title: '推拿', category: '理疗类', description: '放松肌肉，缓解疲劳', default_duration: 30 },
      { _id: '16', title: '经络拍打', category: '理疗类', description: '疏通经络，促进循环', default_duration: 15 },
      
      // 起居类
      { _id: '17', title: '晨起温水', category: '起居类', description: '清肠排毒，唤醒身体', default_duration: 5 },
      { _id: '18', title: '梳头', category: '起居类', description: '疏通头部经络，提神醒脑', default_duration: 5 },
      { _id: '19', title: '叩齿', category: '起居类', description: '固肾健齿，生津养咽', default_duration: 5 },
      { _id: '20', title: '揉腹', category: '起居类', description: '调理脾胃，促进消化', default_duration: 10 },
      { _id: '21', title: '睡前泡脚', category: '起居类', description: '活血通络，促进睡眠', default_duration: 20 }
    ];
    
    // 处理习惯数据，添加图标和主题类，并按首字母排序
    const processedHabits = allHabits
      .map(habit => {
        const iconConfig = iconMap.getIconConfig(habit.title);
        return {
          ...habit,
          iconUrl: iconConfig ? iconConfig.iconUrl : null,
          themeClass: iconConfig ? iconConfig.themeClass : iconMap.getThemeByCategory(habit.category)
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

    this.setData({
      habits: processedHabits,
      filteredHabits: processedHabits,
      loading: false
    });

    // 加载用户已添加的习惯状态
    this.loadUserHabitsStatus();
  },

  onShow() {
    share.enableShareMenu();

    console.log('habits页面 onShow');

    // 每次显示页面时重新加载用户习惯状态
    this.loadUserHabitsStatus();
    this.consumePendingTabIntent();

    // 设置自定义 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  consumePendingTabIntent() {
    const app = getApp();
    const pendingTab = app && app.globalData && app.globalData.pendingHabitsTab;
    if (pendingTab !== 'sports') {
      return;
    }

    delete app.globalData.pendingHabitsTab;
    this.setData({
      currentTab: 1,
      filteredHabits: this.filterHabits(this.data.habits, 1)
    });
  },

  // 加载用户已添加的习惯状态
  loadUserHabitsStatus() {
    // 使用 habitService.buildHabitDisplayList 构建展示列表
    const habits = habitService.buildHabitDisplayList(this.data.habits);

    this.setData({
      habits: habits,
      filteredHabits: this.filterHabits(habits, this.data.currentTab)
    });

    console.log('已更新习惯状态:', habits.filter(h => h.hasStrategy).length, '个已添加');
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentTab: index,
      filteredHabits: this.filterHabits(this.data.habits, index)
    });
  },

  filterHabits(habits, tabIndex) {
    if (tabIndex === 0) {
      return habits.filter(h => h.hasStrategy);
    }
    const categoryMap = { 1: '运动类', 2: '理疗类', 3: '起居类' };
    const category = categoryMap[tabIndex];
    return habits.filter(h => h.category === category);
  },

  openStrategyModal(e) {
    const habit = e.currentTarget.dataset.habit;

    // 如果习惯已添加，显示自定义操作菜单
    if (habit.hasStrategy) {
      this.showCustomActionMenu({
        title: habit.title,
        items: [
          { text: '修改策略', type: 'primary' },
          { text: '删除习惯', type: 'danger' }
        ],
        callback: (index) => {
          if (index === 0) {
            // 修改策略
            this.openEditStrategyModal(habit);
          } else if (index === 1) {
            // 删除习惯
            wx.showModal({
              title: '删除习惯',
              content: `确定要删除「${habit.title}」吗？\n历史打卡数据将保留`,
              confirmColor: '#e64340',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.removeStrategy(habit);
                }
              }
            });
          }
        }
      });
      return;
    }

    // 未添加的习惯，直接打开添加弹窗
    this.openAddStrategyModal(habit);
  },

  // 显示自定义操作菜单
  showCustomActionMenu({ title, items, callback }) {
    this.setData({
      showActionMenu: true,
      actionMenuTitle: title,
      actionMenuItems: items,
      actionMenuCallback: callback
    });
  },

  // 关闭自定义操作菜单
  closeActionMenu() {
    this.setData({
      showActionMenu: false,
      actionMenuTitle: '',
      actionMenuItems: [],
      actionMenuCallback: null
    });
  },

  // 选择操作菜单项
  onActionMenuSelect(e) {
    const index = e.currentTarget.dataset.index;
    const callback = this.data.actionMenuCallback;
    
    // 先关闭弹窗
    this.closeActionMenu();
    
    // 执行回调
    if (callback) {
      setTimeout(() => {
        callback(index);
      }, 300); // 等待弹窗动画完成
    }
  },

  // 长按 habit - 快速修改（仅对已添加的习惯）
  onHabitLongPress(e) {
    const habit = e.currentTarget.dataset.habit;

    // 只有已添加的习惯才响应长按
    if (habit.hasStrategy) {
      this.openEditStrategyModal(habit);
    } else {
      // 未添加的习惯，提示单击添加
      wx.showToast({
        title: '单击添加习惯',
        icon: 'none',
        duration: 1500
      });
    }
  },

  // 打开添加策略弹窗
  openAddStrategyModal(habit) {
    // 重置 weekdays 的选中状态
    const weekdays = this.data.weekdays.map(day => ({ ...day, checked: false }));
    
    // 获取今天的日期
    const today = this.getTodayDate();

    this.setData({
      showModal: true,
      selectedHabit: habit,
      // 单次目标（必选项）
      selectedDuration: habit.default_duration || 20,
      // 频次分类默认每天
      freqCategory: 'everyday',
      // 每天频次子选项
      dailyFreqType: 'everyday',
      // 按天间隔默认2天
      dailyInterval: 2,
      // 每周固定
      selectedWeekdays: [],
      selectedWeekdaysText: '选择星期',
      weekdays,
      // 计划开始时间默认选中自定义开始时间中的“今天”
      planStartType: 'custom',
      planStartDate: 'today',
      planStartDateCustom: '',
      planStartHint: '',
      minPlanStartDate: today
    });
  },

  // 打开修改策略弹窗
  openEditStrategyModal(habit) {
    // 从当前 habit 中读取已有策略
    const strategy = habit.strategy || {};
    const freqCategory = strategy.freq_category || 'everyday';
    const freqType = strategy.freq_type || 'daily';
    const freqRules = strategy.freq_rules;

    // 解析已有的策略设置
    let dailyInterval = 2;
    let selectedWeekdays = [];
    let selectedWeekdaysText = '选择星期';

    if (freqCategory === 'daily-interval' && freqRules) {
      dailyInterval = freqRules;
    } else if (freqCategory === 'weekly' && Array.isArray(freqRules)) {
      selectedWeekdays = freqRules;
      const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日'];
      selectedWeekdaysText = freqRules.length > 0
        ? freqRules.map(d => '周' + weekdayNames[d]).join('，')
        : '选择星期';
    }

    // 设置 weekdays 选中状态
    const weekdays = this.data.weekdays.map(day => ({
      ...day,
      checked: selectedWeekdays.includes(day.value)
    }));
    
    // 处理计划开始时间
    const today = this.getTodayDate();
    const savedPlanStartDate = strategy.plan_start_date || today;
    const habitCreatedAt = habit.createdAt || today;
    const minDate = habitCreatedAt < today ? habitCreatedAt : today;
    
    // 判断计划开始时间选项
    let planStartType = 'custom';
    let planStartDate = 'today';
    let planStartDateCustom = '';
    
    if (savedPlanStartDate === today) {
      planStartDate = 'today';
    } else if (savedPlanStartDate === this.getOffsetDate(1)) {
      planStartDate = 'tomorrow';
    } else {
      planStartDate = 'custom';
      planStartDateCustom = savedPlanStartDate;
    }

    this.setData({
      showModal: true,
      selectedHabit: habit,
      // 单次目标
      selectedDuration: strategy.duration || habit.default_duration || 20,
      // 频次分类
      freqCategory: freqCategory,
      // 每天频次子选项
      dailyFreqType: freqCategory === 'daily-interval' ? 'interval' : 'everyday',
      // 按天间隔
      dailyInterval: dailyInterval,
      // 每周固定
      selectedWeekdays: selectedWeekdays,
      selectedWeekdaysText: selectedWeekdaysText,
      weekdays: weekdays,
      // 计划开始时间
      planStartType: planStartType,
      planStartDate: planStartDate,
      planStartDateCustom: planStartDateCustom,
      planStartHint: '',
      minPlanStartDate: minDate
    });
  },

  // 移除习惯策略
  async removeStrategy(habit) {
    // 1. 获取 userHabitId
    const userHabitId = habit.strategy && habit.strategy.habit_id
      ? String(habit.strategy.habit_id)
      : null;

    if (!userHabitId) {
      console.error('removeStrategy: 找不到 userHabitId');
      wx.showToast({ title: '删除失败', icon: 'none' });
      return;
    }

    // 2. 调用 habitService 软删除
    try {
      await habitService.softDeleteHabit(userHabitId);
    } catch (e) {
      console.error('habitService.softDeleteHabit 失败:', e);
    }

    // 3. 更新习惯列表显示状态
    const habits = this.data.habits.map(h => {
      if (h._id === habit._id) {
        const { strategy, strategyText, hasStrategy, ...rest } = h;
        return rest;
      }
      return h;
    });

    this.setData({
      habits,
      filteredHabits: this.filterHabits(habits, this.data.currentTab)
    });

    wx.showToast({
      title: '已取消',
      icon: 'success'
    });
  },

   closeModal() {
    this.setData({ showModal: false });
  },

  onDurationChange(e) {
    const index = e.detail ? e.detail.value : 3;
    if (this.data.durationOptions[index] !== undefined) {
      this.setData({
        selectedDuration: this.data.durationOptions[index],
        durationIndex: index
      });
    }
  },

  onFreqTypeChange(e) {
    // radio-group 返回的是选中的 value 值
    const value = e.detail ? e.detail.value : 'daily';
    console.log('频次切换:', value);
    this.setData({
      selectedFreqType: value
    });
  },

  toggleWeekday(e) {
    const index = e.currentTarget.dataset.index;
    const weekdays = this.data.weekdays.map((day, i) => {
      if (i === index) {
        return { ...day, checked: !day.checked };
      }
      return day;
    });
    
    const selectedWeekdays = weekdays
      .filter(day => day.checked)
      .map(day => day.value);
    
    const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日'];
    const selectedWeekdaysText = selectedWeekdays.length > 0 
      ? selectedWeekdays.map(d => weekdayNames[d]).join(', ')
      : '一, 三, 日';
    
    this.setData({ 
      weekdays,
      selectedWeekdays,
      selectedWeekdaysText
    });
  },

  // 选择每天
  selectEveryday() {
    this.setData({
      freqCategory: 'everyday',
      dailyFreqType: 'everyday'
    });
  },

  // 点击间隔天数选项 - 选中并打开选择器
  onDailyIntervalClick() {
    this.setData({
      freqCategory: 'daily-interval',
      dailyFreqType: 'interval'
    });
    this.openDailyIntervalPicker();
  },

  // 点击每周固定选项 - 选中并打开选择器
  onWeeklyFixedClick() {
    this.setData({
      freqCategory: 'weekly'
    });
    this.openWeekdayPicker();
  },

  // 打开按天间隔选择器
  openDailyIntervalPicker() {
    const index = this.data.dailyIntervalOptions.indexOf(this.data.dailyInterval);
    this.setData({ 
      showDailyIntervalPickerModal: true,
      dailyIntervalPickerValue: [index >= 0 ? index : 1]
    });
  },

  // 关闭按天间隔选择器
  closeDailyIntervalPicker() {
    this.setData({ showDailyIntervalPickerModal: false });
  },

  // 选择按天间隔
  selectDailyInterval(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      dailyInterval: value
    });
  },

  // 选择按天间隔并关闭弹窗
  selectDailyIntervalAndClose(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      dailyInterval: value
    });
    this.closeDailyIntervalPicker();
  },

  // 确认按天间隔选择
  confirmDailyInterval() {
    this.closeDailyIntervalPicker();
  },

  // picker-view 间隔天数选择变化
  onDailyIntervalPickerChange(e) {
    const index = e.detail.value[0];
    const value = this.data.dailyIntervalOptions[index];
    this.setData({
      dailyInterval: value,
      dailyIntervalPickerValue: [index]
    });
  },

  // 确认 picker-view 间隔天数选择
  confirmDailyIntervalPicker() {
    this.closeDailyIntervalPicker();
  },

  // 减少时长
  decreaseDuration() {
    const current = this.data.selectedDuration || 20;
    const min = this.data.durationOptions[0];
    const index = this.data.durationOptions.indexOf(current);
    if (index > 0) {
      this.setData({
        selectedDuration: this.data.durationOptions[index - 1]
      });
    }
  },

  // 增加时长
  increaseDuration() {
    const current = this.data.selectedDuration || 20;
    const max = this.data.durationOptions[this.data.durationOptions.length - 1];
    const index = this.data.durationOptions.indexOf(current);
    if (index < this.data.durationOptions.length - 1) {
      this.setData({
        selectedDuration: this.data.durationOptions[index + 1]
      });
    }
  },

  // 打开时长选择器
  openDurationPicker() {
    const index = this.data.durationOptions.indexOf(this.data.selectedDuration);
    this.setData({ 
      showDurationPickerModal: true,
      durationPickerValue: [index >= 0 ? index : 3]
    });
  },

  // 关闭时长选择器
  closeDurationPicker() {
    this.setData({ showDurationPickerModal: false });
  },

  // 选择时长
  selectDuration(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      selectedDuration: value
    });
  },

  // 选择时长并关闭弹窗
  selectDurationAndClose(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      selectedDuration: value
    });
    this.closeDurationPicker();
  },

  // 确认时长选择
  confirmDuration() {
    this.closeDurationPicker();
  },

  // picker-view 时长选择变化
  onDurationPickerChange(e) {
    const index = e.detail.value[0];
    const value = this.data.durationOptions[index];
    this.setData({
      selectedDuration: value,
      durationPickerValue: [index]
    });
  },

  // 确认 picker-view 时长选择
  confirmDurationPicker() {
    this.closeDurationPicker();
  },

  // 打开星期选择器
  openWeekdayPicker() {
    this.setData({ showWeekdayPicker: true });
  },

  // 关闭星期选择器
  closeWeekdayPicker() {
    this.setData({ showWeekdayPicker: false });
  },

  // 确认星期选择
  confirmWeekday() {
    this.closeWeekdayPicker();
  },

  async saveStrategy() {
    const app = getApp();
    const habit = this.data.selectedHabit;
    const { freqCategory, dailyInterval, selectedWeekdays } = this.data;

    // 根据频次分类构建策略数据
    let freq_type, freq_rules;
    switch (freqCategory) {
      case 'everyday':
        freq_type = 'daily';
        freq_rules = 1; // 每天
        break;
      case 'daily-interval':
        freq_type = 'interval';
        freq_rules = dailyInterval; // 间隔天数
        break;
      case 'weekly':
        freq_type = 'weekly';
        freq_rules = selectedWeekdays;
        break;
      default:
        freq_type = 'daily';
        freq_rules = 1;
    }

    // 获取计划开始日期
    const planStartDate = this.getFinalPlanStartDate();

    // 1. 调用 habitService 添加用户习惯实例（创建 userHabitId + 首个策略版本）
    let userHabitId;
    let strategy;
    try {
      const userHabit = await habitService.addHabit(habit._id, {
        duration: this.data.selectedDuration || habit.default_duration || 30,
        frequencyType: freq_type,
        frequencyConfig: freq_type === 'weekly' ? { weekdays: freq_rules } : { intervalDays: freq_rules },
        startDate: planStartDate
      });
      userHabitId = userHabit.userHabitId;
      strategy = {
        habit_id: userHabitId,
        habit_title: habit.title,
        category: habit.category,
        duration: this.data.selectedDuration || habit.default_duration || 30,
        freq_type: freq_type,
        freq_rules: freq_rules,
        freq_category: freqCategory,
        plan_start_date: planStartDate
      };
      console.log('habitService.addHabit 完成:', userHabitId);
    } catch (e) {
      console.error('habitService.addHabit 失败:', e);
      return;
    }

    // 生成策略显示文本（频次 + 时间）
    const freqText = habitService.buildStrategyText(strategy);
    const strategyText = `${freqText} · ${strategy.duration}分钟`;

    // 更新习惯列表显示状态
    const habits = this.data.habits.map(h => {
      if (h._id === habit._id) {
        return {
          ...h,
          hasStrategy: true,
          strategy: strategy,
          strategyText: strategyText
        };
      }
      return h;
    });

    this.setData({
      habits,
      filteredHabits: this.filterHabits(habits, this.data.currentTab)
    });

    wx.showToast({
      title: '保存成功',
      icon: 'success'
    });
    this.closeModal();
  },

  // 更新星期选择文本
  updateSelectedWeekdaysText() {
    const selectedWeekdays = this.data.weekdays
      .filter(day => day.checked)
      .map(day => day.value);
    
    const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日'];
    const selectedWeekdaysText = selectedWeekdays.length > 0 
      ? selectedWeekdays.map(d => '周' + weekdayNames[d]).join('，')
      : '周一，周三，周日';
    
    this.setData({
      selectedWeekdays,
      selectedWeekdaysText
    });
  },

  // ========== 计划开始时间相关方法（委托给 habitService） ==========

  // 获取今天日期字符串
  getTodayDate() {
    return habitService.getTodayDateStr(getApp());
  },

  // 获取偏移日期
  getOffsetDate(days) {
    return habitService.getOffsetDateStr(days, getApp());
  },

  // 获取下周一日期
  getNextMonday() {
    return habitService.getNextMondayStr(getApp());
  },
  
  // 点击计划开始时间选项（今天/明天/选择日期）
  onPlanStartOptionClick(e) {
    const value = e.currentTarget.dataset.value;
    
    if (value === 'custom') {
      // 打开日期选择弹窗
      this.openPlanStartDatePicker();
    } else {
      // 处理今天/明天
      let planStartDate = '';
      switch (value) {
        case 'today':
          planStartDate = this.getTodayDate();
          break;
        case 'tomorrow':
          planStartDate = this.getOffsetDate(1);
          break;
      }
      
      this.setData({
        planStartDate: value,
        planStartDateCustom: '',
        planStartHint: this.generatePlanStartHint(planStartDate)
      });
    }
  },
  
  // 打开计划开始日期选择弹窗
  openPlanStartDatePicker() {
    const today = new Date(this.getTodayDate());
    const currentYear = today.getFullYear();
    
    // 生成年份数组（当前年份前后10年）
    const years = [];
    for (let i = currentYear - 10; i <= currentYear + 10; i++) {
      years.push(i);
    }
    
    // 生成月份数组
    const months = [];
    for (let i = 1; i <= 12; i++) {
      months.push(i);
    }
    
    // 生成日期数组
    const days = [];
    for (let i = 1; i <= 31; i++) {
      days.push(i);
    }
    
    // 设置当前选中的日期为今天
    const todayStr = this.getTodayDate();
    const todayDate = new Date(todayStr);
    const yearIndex = years.indexOf(todayDate.getFullYear());
    const monthIndex = todayDate.getMonth();
    const dayIndex = todayDate.getDate() - 1;
    
    this.setData({
      showPlanStartDatePickerModal: true,
      planStartDateYears: years,
      planStartDateMonths: months,
      planStartDateDays: days,
      planStartDatePickerValue: [yearIndex, monthIndex, dayIndex],
      planStartDatePickerTempValue: todayStr
    });
  },
  
  // 关闭计划开始日期选择弹窗
  closePlanStartDatePicker() {
    this.setData({ showPlanStartDatePickerModal: false });
  },
  
  // 日期选择器变化
  onPlanStartDatePickerChange(e) {
    const value = e.detail.value;
    const years = this.data.planStartDateYears;
    const months = this.data.planStartDateMonths;
    const days = this.data.planStartDateDays;
    
    const year = years[value[0]];
    const month = months[value[1]];
    const day = days[value[2]];
    
    // 格式化日期
    const monthStr = month < 10 ? '0' + month : month;
    const dayStr = day < 10 ? '0' + day : day;
    const selectedDate = `${year}-${monthStr}-${dayStr}`;
    
    this.setData({
      planStartDatePickerTempValue: selectedDate
    });
  },
  
  // 确认日期选择
  confirmPlanStartDatePicker() {
    const selectedDate = this.data.planStartDatePickerTempValue;
    const today = this.getTodayDate();
    const habit = this.data.selectedHabit;
    const createdAt = habit.createdAt || today;
    
    // 校验：不能早于习惯创建日
    if (selectedDate < createdAt) {
      wx.showToast({
        title: `不能早于创建日${createdAt}`,
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      planStartDate: 'custom',
      planStartDateCustom: selectedDate,
      planStartHint: this.generatePlanStartHint(selectedDate)
    });
    
    this.closePlanStartDatePicker();
  },
  
  // 生成提示信息
  generatePlanStartHint(planStartDate) {
    const today = this.getTodayDate();
    
    if (planStartDate > today) {
      // 未来日期
      return `计划将从${planStartDate}开始，首页打卡按钮将于${planStartDate}首次显示`;
    }
    
    return '';
  },
  
  // 获取最终的计划开始日期
  getFinalPlanStartDate() {
    const { planStartDate, planStartDateCustom } = this.data;
    
    // 自定义模式
    if (planStartDate === 'custom' && planStartDateCustom) {
      return planStartDateCustom;
    }
    
    // 根据选项计算
    switch (planStartDate) {
      case 'today':
        return this.getTodayDate();
      case 'tomorrow':
        return this.getOffsetDate(1);
      case 'next_monday':
        return this.getNextMonday();
      default:
        return this.getTodayDate();
    }
  },

  onShareAppMessage() {
    return share.appMessage('子午花信 · 选一项修习，从今天开始', '/pages/habits/habits');
  },

  onShareTimeline() {
    return share.timeline('子午花信 · 选一项修习，从今天开始', 'from=timeline&page=habits');
  }
});
