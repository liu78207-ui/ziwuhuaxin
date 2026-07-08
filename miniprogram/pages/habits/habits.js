const iconMap = require('../../utils/iconMap.js');
const shareService = require('../../services/shareService');
const habitService = require('../../services/habitService');
const eventBus = require('../../services/eventBus');
const { getNavTitleStyle } = require('../../utils/navLayout');
const envConfig = require('../../config/env');
const { compareHabitsByPinyinName } = require('../../utils/habitSort');

const CUSTOM_ICON_URL = '/assets/icons/habit-zidingyi.png';

Page({
  data: {
    categories: ['我的', '运动', '理疗', '起居', '自定义'],
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
    planStartDatePickerReady: false,

    // picker-view 选中值
    durationPickerValue: [3], // 默认选中 20 分钟（索引3）
    dailyIntervalPickerValue: [1], // 默认选中 2 天（索引1）
    weekdayPickerValue: [0], // 默认选中周一
    planStartDatePickerValue: [0, 0, 0],
    planStartDateYears: [],
    planStartDateMonths: [],
    planStartDateDays: [],
    planStartDatePickerTempValue: '',

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
    isEditingStrategy: false,
    isCustomHabitModal: false,
    customHabitName: '',
    customHabitNameError: '',
    planStartNeedsReselect: false,
    isSavingStrategy: false,

    // 自定义操作菜单
    showActionMenu: false,
    actionMenuTitle: '',
    actionMenuItems: [],
    actionMenuCallback: null,
    showDeleteHabitModal: false,
    pendingDeleteHabit: null,
    deleteHabitModalTitleText: '',
    deleteHabitModalHintText: '',
    isDeletingHabit: false,
    showRenameChoiceModal: false,
    pendingRenameChoice: null,
    renameChoiceContent: '',
    renameChoicePrimaryText: '仅改名称',
    renameChoiceTodayChecked: false,
    isConfirmingRenameChoice: false,
    navTitleStyle: '',
    showEnvBadge: false,
    envBadgeText: ''
  },

  // 返回上一页
  unsubscribeSyncRecovered: null,
  unsubscribeSyncUpdated: null,
  unsubscribeHabitUpdated: null,
  refreshTimer: null,
  modalCloseTimer: null,
  isPageVisible: false,

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
    const currentEnvConfig = envConfig.getCurrentEnvConfig();
    this.setData({
      navTitleStyle: getNavTitleStyle(),
      showEnvBadge: currentEnvConfig.showEnvBadge,
      envBadgeText: currentEnvConfig.envBadgeText
    });
    this.subscribeSyncEvents();
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
      { _id: '23', title: '舞蹈', category: '运动类', description: '舒展身体，愉悦身心', default_duration: 30 },
      { _id: '24', title: '健体', category: '运动类', description: '综合训练，强健体魄', default_duration: 20 },
      { _id: '25', title: '易筋经', category: '运动类', description: '传统功法，强筋健骨', default_duration: 20 },

      // 理疗类
      { _id: '12', title: '艾灸', category: '理疗类', description: '温阳散寒，提升免疫力', default_duration: 30 },
      { _id: '13', title: '刮痧', category: '理疗类', description: '活血化瘀，排毒养颜', default_duration: 20 },
      { _id: '14', title: '拔罐', category: '理疗类', description: '疏通经络，祛湿排毒', default_duration: 15 },
      { _id: '15', title: '推拿', category: '理疗类', description: '放松肌肉，缓解疲劳', default_duration: 30 },
      { _id: '16', title: '经络拍打', category: '理疗类', description: '疏通经络，促进循环', default_duration: 15 },
      { _id: '22', title: '点穴', category: '理疗类', description: '按压穴位，疏通经络', default_duration: 15 },

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
      .sort(compareHabitsByPinyinName);

    this.setData({
      habits: processedHabits,
      filteredHabits: processedHabits,
      loading: false
    });

    // 加载用户已添加的习惯状态
    this.loadUserHabitsStatus();
  },

  onUnload() {
    this.unsubscribeSyncEvents();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.clearModalCloseTimer();
  },

  onHide() {
    this.isPageVisible = false;
  },

  subscribeSyncEvents() {
    if (this.unsubscribeSyncRecovered || this.unsubscribeSyncUpdated || this.unsubscribeHabitUpdated) return;

    const refreshRecovered = () => {
      this.loadUserHabitsStatus();
    };
    const refresh = () => {
      this.scheduleUserHabitsStatusRefresh();
    };
    this.unsubscribeSyncRecovered = eventBus.on('sync:recovered', refreshRecovered);
    this.unsubscribeSyncUpdated = eventBus.on('sync:updated', refresh);
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
    if (this.unsubscribeHabitUpdated) {
      this.unsubscribeHabitUpdated();
      this.unsubscribeHabitUpdated = null;
    }
  },

  onShow() {
    this.isPageVisible = true;
    shareService.enableShareMenu();

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
    const pendingTab = habitService.consumePendingTabIntent();
    if (pendingTab !== 'sports') {
      return;
    }

    this.setData({
      currentTab: 1,
      filteredHabits: this.filterHabits(this.data.habits, 1)
    });
  },

  // 加载用户已添加的习惯状态
  loadUserHabitsStatus() {
    habitService.cleanupNamelessCustomHabits();
    // 使用 habitService.buildHabitDisplayList 构建展示列表
    const habits = habitService.buildHabitDisplayList(this.getBaseHabitDefinitions());

    this.setData({
      habits: habits,
      filteredHabits: this.filterHabits(habits, this.data.currentTab)
    });

    console.log('已更新习惯状态:', habits.filter(h => h.hasStrategy).length, '个已添加');
  },

  getBaseHabitDefinitions(habits = this.data.habits) {
    return habits.filter(habit => habit && habit.source !== 'custom' && !habit.isCustomAddCard);
  },

  scheduleUserHabitsStatusRefresh(delay = 160) {
    if (!this.isPageVisible) return;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.loadUserHabitsStatus();
    }, delay);
  },

  clearModalCloseTimer() {
    if (this.modalCloseTimer) {
      clearTimeout(this.modalCloseTimer);
      this.modalCloseTimer = null;
    }
  },

  prepareOpenModal() {
    this.clearModalCloseTimer();
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentTab: index,
      filteredHabits: this.filterHabits(this.data.habits, index)
    });
  },

  goAddFromMyTab() {
    this.setData({
      currentTab: 1,
      filteredHabits: this.filterHabits(this.data.habits, 1)
    });
  },

  filterHabits(habits, tabIndex) {
    if (tabIndex === 0) {
      return habits
        .filter(h => h.hasStrategy)
        .map(h => this.withCustomDisplayMeta(h))
        .sort(compareHabitsByPinyinName);
    }
    if (tabIndex === 4) {
      const customHabits = habits
        .filter(h => h.source === 'custom')
        .map(h => this.withCustomDisplayMeta(h))
        .sort(compareHabitsByPinyinName);
      return customHabits.concat(this.buildCustomAddCard());
    }
    const categoryMap = { 1: '运动类', 2: '理疗类', 3: '起居类' };
    const category = categoryMap[tabIndex];
    return habits
      .filter(h => h.category === category)
      .sort(compareHabitsByPinyinName);
  },

  buildCustomAddCard() {
    return {
      _id: 'custom-add-card',
      isCustomAddCard: true,
      source: 'custom',
      title: '',
      category: '自定义',
      themeClass: 't-purple'
    };
  },

  getCustomDisplayInitial(habit) {
    const text = String((habit && (habit.title || habit.name || habit.habitTitle || habit.habit_title)) || '').trim();
    return text ? text.charAt(0) : '习';
  },

  getHabitDisplayTitle(habit) {
    return String((habit && (habit.title || habit.name || habit.habitTitle || habit.habit_title)) || '').trim();
  },

  withCustomDisplayMeta(habit) {
    if (!habit || habit.isCustomAddCard || habit.source !== 'custom') {
      return habit;
    }
    const displayTitle = this.getHabitDisplayTitle(habit);
    return {
      ...habit,
      title: displayTitle,
      name: habit.name || displayTitle,
      iconUrl: habit.iconUrl || CUSTOM_ICON_URL,
      displayInitial: habit.displayInitial || this.getCustomDisplayInitial({ title: displayTitle })
    };
  },

  openStrategyModal(e) {
    const habit = e.currentTarget.dataset.habit;

    if (habit && habit.isCustomAddCard) {
      this.openAddCustomHabitModal();
      return;
    }

    // 如果习惯已添加，显示自定义操作菜单
    if (habit.hasStrategy) {
      const pinned = Boolean(habit.pinnedAt);
      const isCustom = habit.source === 'custom';
      this.showCustomActionMenu({
        title: habit.title,
        items: [
          { text: isCustom ? '编辑习惯' : '编辑策略', type: 'primary' },
          { text: pinned ? '取消置顶' : '置顶习惯', type: 'primary' },
          { text: isCustom ? '停用习惯' : '删除习惯', type: 'danger' }
        ],
        callback: (index) => {
          if (index === 0) {
            if (isCustom) {
              this.openEditCustomHabitModal(habit);
            } else {
              this.openEditStrategyModal(habit);
            }
          } else if (index === 1) {
            this.togglePinnedHabit(habit);
          } else if (index === 2) {
            this.openDeleteHabitModal(habit);
          }
        }
      });
      return;
    }

    if (habit && habit.source === 'custom') {
      this.openReactivateCustomHabitModal(habit);
      return;
    }

    // 未添加的官方习惯，直接打开添加弹窗
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

  async togglePinnedHabit(habit) {
    const userHabitId = habit.strategy && habit.strategy.userHabitId
      ? String(habit.strategy.userHabitId)
      : null;

    if (!userHabitId) {
      wx.showToast({ title: '操作失败', icon: 'none' });
      return;
    }

    try {
      if (habit.pinnedAt) {
        await habitService.unpinHabit(userHabitId);
        wx.showToast({ title: '已取消置顶', icon: 'success' });
      } else {
        await habitService.pinHabit(userHabitId);
        wx.showToast({ title: '已置顶', icon: 'success' });
      }
      this.loadUserHabitsStatus();
    } catch (e) {
      console.error('habitService.togglePinnedHabit 失败:', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  openDeleteHabitModal(habit) {
    const isCustom = habit.source === 'custom';
    const habitTitle = habit.title || habit.name || habit.habitTitle || '该习惯';
    this.setData({
      showDeleteHabitModal: true,
      pendingDeleteHabit: habit,
      deleteHabitModalTitleText: isCustom
        ? `确定要停用「${habitTitle}」吗？`
        : `确定要删除「${habitTitle}」吗？`,
      deleteHabitModalHintText: '历史打卡数据将保留'
    });
  },

  closeDeleteHabitModal() {
    if (this.data.isDeletingHabit) {
      return;
    }
    this.setData({
      showDeleteHabitModal: false,
      pendingDeleteHabit: null,
      deleteHabitModalTitleText: '',
      deleteHabitModalHintText: ''
    });
  },

  async confirmDeleteHabit() {
    if (this.data.isDeletingHabit || !this.data.pendingDeleteHabit) {
      return;
    }

    const habit = this.data.pendingDeleteHabit;
    this.setData({ isDeletingHabit: true });
    try {
      await this.removeStrategy(habit);
      this.setData({
        showDeleteHabitModal: false,
        pendingDeleteHabit: null,
        deleteHabitModalTitleText: '',
        deleteHabitModalHintText: ''
      });
    } finally {
      this.setData({ isDeletingHabit: false });
    }
  },

  preventBubble() {
    // 阻止弹窗内容点击冒泡到遮罩
  },

  // 长按 habit - 快速修改（仅对已添加的习惯）
  onHabitLongPress(e) {
    const habit = e.currentTarget.dataset.habit;
    if (habit && habit.isCustomAddCard) {
      return;
    }

    // 只有已添加的习惯才响应长按
    if (habit.hasStrategy) {
      if (habit.source === 'custom') {
        this.openEditCustomHabitModal(habit);
      } else {
        this.openEditStrategyModal(habit);
      }
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
    this.prepareOpenModal();
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
      isEditingStrategy: false,
      planStartNeedsReselect: false,
      isSavingStrategy: false,
      isCustomHabitModal: false,
      customHabitName: '',
      customHabitNameError: '',
      minPlanStartDate: today
    });
  },

  openAddCustomHabitModal() {
    this.prepareOpenModal();
    const weekdays = this.data.weekdays.map(day => ({ ...day, checked: false }));
    const today = this.getTodayDate();

    this.setData({
      showModal: true,
      selectedHabit: {
        _id: '',
        source: 'custom',
        title: '自定义修习',
        category: '自定义',
        default_duration: 20,
        iconUrl: CUSTOM_ICON_URL,
        themeClass: 't-purple',
        emoji: '养'
      },
      selectedDuration: 20,
      freqCategory: 'everyday',
      dailyFreqType: 'everyday',
      dailyInterval: 2,
      selectedWeekdays: [],
      selectedWeekdaysText: '选择星期',
      weekdays,
      planStartType: 'custom',
      planStartDate: 'today',
      planStartDateCustom: '',
      planStartHint: '',
      isEditingStrategy: false,
      isCustomHabitModal: true,
      customHabitName: '',
      customHabitNameError: '',
      planStartNeedsReselect: false,
      isSavingStrategy: false,
      minPlanStartDate: today
    });
  },

  openReactivateCustomHabitModal(habit) {
    this.openAddCustomHabitModal();
    this.setData({
      selectedHabit: {
        ...habit,
        source: 'custom',
        category: '自定义',
        default_duration: habit.default_duration || 20,
        iconUrl: habit.iconUrl || CUSTOM_ICON_URL,
        themeClass: habit.themeClass || 't-purple',
        emoji: habit.emoji || '养'
      },
      selectedDuration: habit.default_duration || 20,
      customHabitName: this.getHabitDisplayTitle(habit),
      customHabitNameError: ''
    });
  },

  // 打开修改策略弹窗
  openEditStrategyModal(habit) {
    this.prepareOpenModal();
    // 从当前 habit 中读取已有策略
    const strategy = this.normalizeStrategyForEdit(habit);
    const freqCategory = strategy.frequencyCategory || 'everyday';
    const freqRules = strategy.frequencyRules;

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
    const savedPlanStartDate = strategy.startDate || today;
    const habitCreatedAt = habit.createdAt || today;
    const minDate = habitCreatedAt < today ? habitCreatedAt : today;
    const isNotStarted = savedPlanStartDate > today;

    // 已开始的习惯修改策略时从今天生效；未开始的习惯需用户重新确认开始时间。
    let planStartType = 'custom';
    let planStartDate = 'today';
    let planStartDateCustom = '';

    if (isNotStarted) {
      if (savedPlanStartDate === this.getOffsetDate(1)) {
        planStartDate = 'tomorrow';
      } else {
        planStartDate = 'custom';
        planStartDateCustom = savedPlanStartDate;
      }
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
      planStartHint: isNotStarted ? this.generatePlanStartHint(savedPlanStartDate) : '',
      isEditingStrategy: true,
      isCustomHabitModal: false,
      customHabitName: '',
      customHabitNameError: '',
      planStartNeedsReselect: isNotStarted,
      isSavingStrategy: false,
      minPlanStartDate: minDate
    });
  },

  openEditCustomHabitModal(habit) {
    this.openEditStrategyModal(habit);
    this.setData({
      isCustomHabitModal: true,
      customHabitName: habit.title || habit.name || '',
      customHabitNameError: ''
    });
  },

  normalizeStrategyForEdit(habit) {
    const strategy = habit.strategy || {};
    const rawFrequencyType = strategy.frequencyType || 'daily';
    const rawFrequencyConfig = strategy.frequencyConfig || {};
    let freqRules;

    if (rawFrequencyType === 'weekly') {
      freqRules = Array.isArray(rawFrequencyConfig)
        ? rawFrequencyConfig
        : (Array.isArray(rawFrequencyConfig.weekdays) ? rawFrequencyConfig.weekdays : []);
    } else {
      freqRules = typeof rawFrequencyConfig === 'number'
        ? rawFrequencyConfig
        : (rawFrequencyConfig.intervalDays || 1);
    }

    const freqCategory = rawFrequencyType === 'weekly'
      ? 'weekly'
      : (Number(freqRules) > 1 ? 'daily-interval' : 'everyday');

    return {
      ...strategy,
      duration: strategy.duration || habit.targetMinutes || habit.default_duration || 20,
      frequencyType: rawFrequencyType,
      frequencyRules: freqRules,
      frequencyCategory: freqCategory,
      startDate: strategy.startDate || strategy.effectiveStartDate || ''
    };
  },

  // 移除习惯策略
  async removeStrategy(habit) {
    // 1. 获取 userHabitId
    const userHabitId = habit.strategy && habit.strategy.userHabitId
      ? String(habit.strategy.userHabitId)
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
      title: habit.source === 'custom' ? '已停用' : '已删除',
      icon: 'success'
    });
  },

   closeModal() {
    this.clearModalCloseTimer();
    this.setData({
      showModal: false,
      isSavingStrategy: false,
      showRenameChoiceModal: false,
      isConfirmingRenameChoice: false
    });
    this.modalCloseTimer = setTimeout(() => {
      this.modalCloseTimer = null;
      if (this.data.showModal) return;
      this.setData({
      isEditingStrategy: false,
      isCustomHabitModal: false,
      selectedHabit: null,
      customHabitName: '',
      customHabitNameError: '',
      planStartNeedsReselect: false,
      pendingRenameChoice: null,
      renameChoiceContent: '',
      renameChoicePrimaryText: '仅改名称',
      renameChoiceTodayChecked: false,
      isConfirmingRenameChoice: false
      });
    }, 300);
  },

  onCustomHabitNameInput(e) {
    const value = e.detail ? e.detail.value : '';
    this.setData({
      customHabitName: value,
      customHabitNameError: ''
    });
  },

  normalizeCustomHabitName(value) {
    return String(value || '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12);
  },

  validateCustomHabitName() {
    if (!this.data.isCustomHabitModal) {
      return '';
    }
    const name = this.normalizeCustomHabitName(this.data.customHabitName);
    if (name.length < 2) {
      this.setData({ customHabitNameError: '请输入 2-12 个字的修习名称' });
      wx.showToast({ title: '请输入修习名称', icon: 'none' });
      return '';
    }
    return name;
  },

  getCustomHabitNameConflict(name, excludeUserHabitId) {
    if (typeof habitService.findCustomHabitByName !== 'function') {
      return null;
    }
    return habitService.findCustomHabitByName(name, { excludeUserHabitId });
  },

  isCustomNameChanged(habit, nextName) {
    const oldName = habitService.normalizeCustomHabitName
      ? habitService.normalizeCustomHabitName(this.getHabitDisplayTitle(habit))
      : this.normalizeCustomHabitName(this.getHabitDisplayTitle(habit));
    const normalizedNextName = habitService.normalizeCustomHabitName
      ? habitService.normalizeCustomHabitName(nextName)
      : this.normalizeCustomHabitName(nextName);
    return oldName !== normalizedNextName;
  },

  openRenameChoiceModal(context) {
    const isReactivateRename = context && context.renameChoiceType === 'reactivate';
    this.setData({
      showRenameChoiceModal: true,
      pendingRenameChoice: context,
      renameChoiceTodayChecked: false,
      renameChoiceContent: isReactivateRename
        ? '沿用原习惯会保留历史归属。\n作为新习惯会重新记录，原历史保留。'
        : '仅改名称连续记录不变。\n作为新习惯会重新记录，原历史保留。',
      renameChoicePrimaryText: isReactivateRename ? '沿用原习惯' : '仅改名称',
      isSavingStrategy: false,
      isConfirmingRenameChoice: false
    });
  },

  closeRenameChoiceModal() {
    if (this.data.isConfirmingRenameChoice) return;
    this.setData({
      showRenameChoiceModal: false,
      pendingRenameChoice: null,
      renameChoiceContent: '',
      renameChoicePrimaryText: '仅改名称',
      renameChoiceTodayChecked: false,
      isConfirmingRenameChoice: false
    });
  },

  confirmRenameOnly() {
    const renameDecision = this.data.pendingRenameChoice && this.data.pendingRenameChoice.renameChoiceType === 'reactivate'
      ? 'reuseExisting'
      : 'renameOnly';
    this.continueRenameChoiceSave(renameDecision);
  },

  confirmRenameAsNewHabit() {
    this.continueRenameChoiceSave('asNew');
  },

  async continueRenameChoiceSave(renameDecision) {
    if (this.data.isConfirmingRenameChoice || !this.data.pendingRenameChoice) {
      return;
    }
    this.setData({
      isConfirmingRenameChoice: true
    });
    await this.saveStrategy({ renameDecision, renameContext: this.data.pendingRenameChoice });
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

  async saveStrategy(options = {}) {
    if (this.data.isSavingStrategy) {
      return;
    }
    const renameDecision = options && options.renameDecision;
    const renameContext = options && options.renameContext;

    const habit = renameContext ? renameContext.habit : this.data.selectedHabit;
    const { freqCategory, dailyInterval, selectedWeekdays } = this.data;
    const customHabitName = renameContext ? renameContext.customHabitName : this.validateCustomHabitName();
    if (this.data.isCustomHabitModal && !customHabitName) {
      return;
    }

    if (this.data.planStartNeedsReselect) {
      wx.showToast({
        title: '请重新选择开始时间',
        icon: 'none'
      });
      return;
    }

    this.setData({ isSavingStrategy: true });

    // 根据频次分类构建策略数据
    let frequencyType, frequencyRules;
    switch (freqCategory) {
      case 'everyday':
        frequencyType = 'daily';
        frequencyRules = 1; // 每天
        break;
      case 'daily-interval':
        frequencyType = 'interval';
        frequencyRules = dailyInterval; // 间隔天数
        break;
      case 'weekly':
        frequencyType = 'weekly';
        frequencyRules = selectedWeekdays;
        break;
      default:
        frequencyType = 'daily';
        frequencyRules = 1;
    }

    // 获取计划开始日期
    const planStartDate = this.getFinalPlanStartDate();

    // 判断是新增还是修改：
    // - 新增：habit.strategy.userHabitId 不存在，或指向一个已删除的 userHabit
    // - 修改：habit.strategy.userHabitId 存在且指向一个 active 的 userHabit
    const existingUserHabitId = habit.strategy && habit.strategy.userHabitId
    const isEdit = existingUserHabitId
      && habitService.getHabitByUserHabitId(existingUserHabitId)
      && habitService.getHabitByUserHabitId(existingUserHabitId).status === 'active'

    const policyInput = {
      duration: this.data.selectedDuration || habit.default_duration || 30,
      frequencyType,
      frequencyConfig: frequencyType === 'weekly' ? { weekdays: frequencyRules } : { intervalDays: frequencyRules },
      startDate: planStartDate
    }
    const originalHabitDisplayId = habit._id;

    // 1. 调用 habitService：新增用 addHabit，修改用 updateHabitPolicy
    let userHabitId;
    let strategy;
    let shouldRebuildDisplayFromService = false;
    try {
      if (this.data.isCustomHabitModal && isEdit) {
        const nameChanged = this.isCustomNameChanged(habit, customHabitName);
        if (nameChanged && !renameDecision) {
          const conflict = this.getCustomHabitNameConflict(customHabitName, existingUserHabitId);
          if (conflict && conflict.status === 'active') {
            this.setData({ isSavingStrategy: false });
            wx.showToast({ title: '已存在同名自定义习惯', icon: 'none' });
            return;
          }
          this.openRenameChoiceModal({
            habit,
            existingUserHabitId,
            customHabitName,
            policyInput,
            conflict
          });
          return;
        }

        if (nameChanged && renameDecision === 'asNew') {
          const userHabit = await habitService.renameCustomHabitAsNew(existingUserHabitId, {
            name: customHabitName
          }, policyInput);
          userHabitId = userHabit.userHabitId;
          habit._id = userHabit.habitId;
          habit.title = userHabit.name;
          habit.name = userHabit.name;
          habit.category = userHabit.category;
          habit.source = userHabit.source;
          habit.themeClass = userHabit.themeClass;
          habit.emoji = '养';
          console.log('habitService.renameCustomHabitAsNew 完成:', userHabitId);
        } else {
          if (nameChanged || renameDecision === 'renameOnly') {
            await habitService.updateCustomHabitMeta(existingUserHabitId, {
              name: customHabitName
            });
          }
          const userHabit = await habitService.updateHabitPolicy(existingUserHabitId, policyInput)
          userHabitId = userHabit.userHabitId
          console.log('habitService.updateCustomHabitMeta/updateHabitPolicy 完成:', userHabitId)
        }
      } else if (this.data.isCustomHabitModal) {
        const existingCustomHabitId = renameContext && renameContext.existingCustomHabitId
          ? String(renameContext.existingCustomHabitId)
          : habit._id && String(habit._id).indexOf('custom_') === 0
          ? String(habit._id)
          : ''
        const isReactivatingCustomHabit = Boolean(existingCustomHabitId)
        const reactivatedNameChanged = isReactivatingCustomHabit && this.isCustomNameChanged(habit, customHabitName)
        if (reactivatedNameChanged && !renameDecision) {
          this.openRenameChoiceModal({
            habit,
            existingCustomHabitId,
            customHabitName,
            policyInput,
            renameChoiceType: 'reactivate'
          });
          return;
        }
        shouldRebuildDisplayFromService = Boolean(existingCustomHabitId)
        const shouldCreateNewCustomHabit = isReactivatingCustomHabit && renameDecision === 'asNew'
        const addCustom = existingCustomHabitId && !shouldCreateNewCustomHabit
          ? habitService.addCustomHabitInstance.bind(habitService, existingCustomHabitId)
          : habitService.addCustomHabit
        const userHabit = await addCustom({
          name: customHabitName
        }, policyInput)
        userHabitId = userHabit.userHabitId
        habit._id = userHabit.habitId
        habit.title = userHabit.name
        habit.category = userHabit.category
        habit.source = userHabit.source
        habit.themeClass = userHabit.themeClass
        habit.emoji = '养'
        console.log('habitService.addCustomHabit 完成:', userHabitId)
      } else if (isEdit) {
        const userHabit = await habitService.updateHabitPolicy(existingUserHabitId, policyInput)
        userHabitId = userHabit.userHabitId
        console.log('habitService.updateHabitPolicy 完成:', userHabitId)
      } else {
        const userHabit = await habitService.addHabit(habit._id, policyInput)
        userHabitId = userHabit.userHabitId
        console.log('habitService.addHabit 完成:', userHabitId)
      }
      strategy = {
        userHabitId,
        habitTitle: this.data.isCustomHabitModal ? customHabitName : habit.title,
        category: this.data.isCustomHabitModal ? '自定义' : habit.category,
        duration: this.data.selectedDuration || habit.default_duration || 30,
        frequencyType,
        frequencyConfig: frequencyType === 'weekly' ? { weekdays: frequencyRules } : { intervalDays: frequencyRules },
        startDate: planStartDate
      };
    } catch (e) {
      console.error('保存策略失败:', e);
      this.setData({
        isSavingStrategy: false,
        isConfirmingRenameChoice: false
      });
      const message = e && e.message ? e.message : '';
      if (message === 'CUSTOM_HABIT_NAME_DUPLICATED_ACTIVE') {
        wx.showToast({ title: '已存在同名自定义习惯', icon: 'none' });
        return;
      }
      if (message === 'CUSTOM_HABIT_NAME_EXISTS_DELETED') {
        wx.showToast({ title: '自定义库已存在', icon: 'none' });
        return;
      }
      if (message === 'CUSTOM_HABIT_LIBRARY_LIMIT_REACHED') {
        wx.showToast({ title: '自定义习惯已满 12 个', icon: 'none' });
        return;
      }
      if (message === 'CUSTOM_ACTIVE_HABIT_LIMIT_REACHED') {
        wx.showToast({ title: '自定义最多启用 5 个', icon: 'none' });
        return;
      }
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
      return;
    }

    // 生成策略显示文本（频次 + 时间）
    const freqText = habitService.buildStrategyText(strategy);
    const strategyText = `${freqText} · ${strategy.duration}分钟`;

    // 更新习惯列表显示状态
    const habits = shouldRebuildDisplayFromService
      ? habitService.buildHabitDisplayList(this.getBaseHabitDefinitions())
      : this.data.habits.map(h => {
      if (h._id === originalHabitDisplayId || h._id === habit._id) {
        return {
          ...h,
          title: this.data.isCustomHabitModal ? customHabitName : h.title,
          name: this.data.isCustomHabitModal ? customHabitName : h.name,
          source: this.data.isCustomHabitModal ? 'custom' : h.source,
          category: this.data.isCustomHabitModal ? '自定义' : h.category,
          iconUrl: this.data.isCustomHabitModal ? CUSTOM_ICON_URL : h.iconUrl,
          themeClass: this.data.isCustomHabitModal ? 't-purple' : h.themeClass,
          emoji: this.data.isCustomHabitModal ? '养' : h.emoji,
          hasStrategy: true,
          strategy: strategy,
          strategyText: strategyText
        };
      }
      return h;
    });
    const nextHabits = shouldRebuildDisplayFromService || habits.some(h => h._id === habit._id)
      ? habits
      : habits.concat({
        _id: habit._id,
        source: 'custom',
        title: customHabitName,
        name: customHabitName,
        category: '自定义',
        description: '自定义修习',
        default_duration: this.data.selectedDuration || 20,
        iconUrl: CUSTOM_ICON_URL,
        themeClass: 't-purple',
        displayInitial: this.getCustomDisplayInitial({ title: customHabitName }),
        hasStrategy: true,
        strategy,
        strategyText
      });

    this.setData({
      showRenameChoiceModal: false,
      pendingRenameChoice: null,
      renameChoiceContent: '',
      renameChoicePrimaryText: '仅改名称',
      renameChoiceTodayChecked: false,
      isConfirmingRenameChoice: false,
      habits: nextHabits,
      filteredHabits: this.filterHabits(nextHabits, this.data.currentTab)
    });

    wx.showToast({
      title: this.data.isCustomHabitModal && !isEdit ? '添加成功' : '保存成功',
      icon: 'success'
    });
    this.closeModal();
    if (!shouldRebuildDisplayFromService) {
      this.scheduleUserHabitsStatusRefresh(300);
    }
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
        planStartHint: this.generatePlanStartHint(planStartDate),
        planStartNeedsReselect: false
      });
    }
  },

  // 打开计划开始日期选择弹窗
  openPlanStartDatePicker() {
    const todayStr = this.getTodayDate();
    const selectedDate = this.data.planStartDateCustom || todayStr;
    const [currentYear, currentMonth, currentDay] = selectedDate.split('-').map(Number);
    const todayYear = Number(todayStr.split('-')[0]);

    // 生成年份数组（当前年份前后10年）
    const years = [];
    for (let i = todayYear - 10; i <= todayYear + 10; i++) {
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

    // 设置当前选中的日期为已有自定义日期；没有时定位到今天
    const yearIndex = years.indexOf(currentYear);
    const monthIndex = currentMonth - 1;
    const dayIndex = currentDay - 1;

    this.setData({
      showPlanStartDatePickerModal: false,
      planStartDatePickerReady: false,
      planStartDateYears: years,
      planStartDateMonths: months,
      planStartDateDays: days,
      planStartDatePickerValue: [yearIndex, monthIndex, dayIndex],
      planStartDatePickerTempValue: selectedDate
    });

    const showPicker = () => {
      this.setData({
        planStartDatePickerReady: true,
        showPlanStartDatePickerModal: true
      });
    };
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(showPicker);
    } else {
      setTimeout(showPicker, 0);
    }
  },

  // 关闭计划开始日期选择弹窗
  closePlanStartDatePicker() {
    this.setData({
      showPlanStartDatePickerModal: false,
      planStartDatePickerReady: false
    });
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
      planStartDatePickerValue: value,
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
      planStartHint: this.generatePlanStartHint(selectedDate),
      planStartNeedsReselect: false
    });

    this.closePlanStartDatePicker();
  },

  // 生成提示信息
  generatePlanStartHint(planStartDate) {
    const today = this.getTodayDate();

    if (planStartDate && planStartDate >= today) {
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
    return shareService.getShareMessage('habits');
  },

  onShareTimeline() {
    return shareService.getShareTimeline('habits');
  }
});
