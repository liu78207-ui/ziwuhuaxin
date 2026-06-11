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
      let windowInfo = {};
      try {
        windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      } catch (e) {
        console.warn('tab-bar getWindowInfo failed:', e && e.message ? e.message : String(e || 'unknown error'));
      }
      const safeAreaBottom = windowInfo.safeAreaInsets?.bottom ||
        (windowInfo.safeArea && windowInfo.windowHeight
          ? Math.max(0, windowInfo.windowHeight - windowInfo.safeArea.bottom)
          : 0);
      this.setData({
        safeAreaBottom
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
