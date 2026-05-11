// components/tab-bar/tab-bar.js
Component({
  properties: {
    activeIndex: {
      type: Number,
      value: 0
    }
  },

  data: {
    safeAreaBottom: 0,
    tabs: [
      { label: '案台', icon: '📜' },
      { label: '修习', icon: '📚' },
      { label: '观心', icon: '📊' },
      { label: '归藏', icon: '👤' }
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
    handleTabTap(e) {
      const index = e.currentTarget.dataset.index;
      if (index === this.data.activeIndex) return;
      
      this.triggerEvent('change', { index });
    }
  }
});
