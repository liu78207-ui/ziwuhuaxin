// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    safeAreaBottom: 0,
    list: [
      { pagePath: "/pages/home/home", text: "案台", icon: "/assets/icons/home.png", iconActive: "/assets/icons/home-active.png" },
      { pagePath: "/pages/habits/habits", text: "修习", icon: "/assets/icons/habit.png", iconActive: "/assets/icons/habit-active.png" },
      { pagePath: "/pages/stats/stats", text: "观心", icon: "/assets/icons/stats.png", iconActive: "/assets/icons/stats-active.png" },
      { pagePath: "/pages/profile/profile", text: "归藏", icon: "/assets/icons/profile.png", iconActive: "/assets/icons/profile-active.png" }
    ]
  },

  lifetimes: {
    attached() {
      const systemInfo = wx.getSystemInfoSync();
      this.setData({
        safeAreaBottom: systemInfo.safeAreaInsets?.bottom || 0
      });
    }
  },

  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      
      if (this.data.selected === index) return;
      
      wx.switchTab({
        url: path
      });
    }
  }
});
