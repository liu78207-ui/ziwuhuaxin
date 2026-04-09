Page({
  data: {
    categories: ['全部', '运动类', '理疗类', '起居类'],
    currentTab: 0,
    habits: [],
    filteredHabits: [],
    loading: false,
    showModal: false,
    selectedHabit: null,
    selectedDuration: null,
    selectedFreqType: 'daily',
    selectedWeekdays: [],
    selectedInterval: null,
    durationOptions: [5, 10, 15, 20, 30, 45, 60, 90, 120],
    freqTypes: [
      { value: 'daily', label: '每天' },
      { value: 'weekly', label: '每周' },
      { value: 'interval', label: '间隔' }
    ],
    weekdays: [
      { value: 1, label: '周一' },
      { value: 2, label: '周二' },
      { value: 3, label: '周三' },
      { value: 4, label: '周四' },
      { value: 5, label: '周五' },
      { value: 6, label: '周六' },
      { value: 7, label: '周日' }
    ],
    intervalOptions: [2, 3, 4, 5, 6, 7, 10, 14, 30]
  },

  onLoad() {
    console.log('habits页面 onLoad');
    // 使用模拟数据，避免数据库查询
    const mockHabits = [
      { _id: '1', title: '八段锦', category: '运动类', default_duration: 15 },
      { _id: '2', title: '金刚功', category: '运动类', default_duration: 20 },
      { _id: '3', title: '艾灸', category: '理疗类', default_duration: 30 },
      { _id: '4', title: '泡脚', category: '起居类', default_duration: 20 }
    ];
    this.setData({
      habits: mockHabits,
      filteredHabits: mockHabits,
      loading: false
    });
  },

  onShow() {
    console.log('habits页面 onShow');
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
      return habits;
    }
    const categoryMap = { 1: '运动类', 2: '理疗类', 3: '起居类' };
    const category = categoryMap[tabIndex];
    return habits.filter(h => h.category === category);
  },

  openStrategyModal(e) {
    const habit = e.currentTarget.dataset.habit;
    this.setData({
      showModal: true,
      selectedHabit: habit,
      selectedDuration: habit.default_duration || 30,
      selectedFreqType: 'daily',
      selectedWeekdays: [],
      selectedInterval: null
    });
  },

  closeModal() {
    this.setData({ showModal: false });
  },

  onDurationChange(e) {
    const index = e.detail.value;
    this.setData({
      selectedDuration: this.data.durationOptions[index]
    });
  },

  onFreqTypeChange(e) {
    const index = e.detail.value;
    this.setData({
      selectedFreqType: this.data.freqTypes[index].value
    });
  },

  toggleWeekday(e) {
    const value = e.currentTarget.dataset.value;
    const selectedWeekdays = this.data.selectedWeekdays;
    const index = selectedWeekdays.indexOf(value);
    
    if (index > -1) {
      selectedWeekdays.splice(index, 1);
    } else {
      selectedWeekdays.push(value);
    }
    
    this.setData({ selectedWeekdays });
  },

  onIntervalChange(e) {
    const index = e.detail.value;
    this.setData({
      selectedInterval: this.data.intervalOptions[index]
    });
  },

  saveStrategy() {
    wx.showToast({
      title: '保存成功',
      icon: 'success'
    });
    this.closeModal();
  }
});
