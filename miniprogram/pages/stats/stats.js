Page({
  data: {
    weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    weekRange: '',
    currentWeekStart: null,
    statsData: {
      matrix: [],
      checkinRate: 0,
      totalCount: 0,
      checkinDays: 0,
      maxStreak: 0
    },
    loading: false
  },

  onLoad() {
    this.initWeekRange();
    // 使用模拟数据
    this.setData({
      statsData: {
        matrix: [
          { habitTitle: '八段锦', checkins: [true, true, false, true, true, false, true] },
          { habitTitle: '艾灸', checkins: [true, true, true, true, false, true, true] },
          { habitTitle: '泡脚', checkins: [false, true, true, false, true, true, false] }
        ],
        checkinRate: 75,
        totalCount: 45,
        checkinDays: 12,
        maxStreak: 7
      },
      loading: false
    });
  },

  initWeekRange() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    this.setData({
      currentWeekStart: monday
    });
    
    this.updateWeekRange(monday);
  },

  updateWeekRange(monday) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const formatDate = (date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}月${day}日`;
    };
    
    this.setData({
      weekRange: `${formatDate(monday)} - ${formatDate(sunday)}`
    });
  },

  prevWeek() {
    const current = new Date(this.data.currentWeekStart);
    current.setDate(current.getDate() - 7);
    this.setData({ currentWeekStart: current });
    this.updateWeekRange(current);
  },

  nextWeek() {
    const current = new Date(this.data.currentWeekStart);
    current.setDate(current.getDate() + 7);
    this.setData({ currentWeekStart: current });
    this.updateWeekRange(current);
  }
});
