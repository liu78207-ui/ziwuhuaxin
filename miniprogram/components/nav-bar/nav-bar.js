// components/nav-bar/nav-bar.js
Component({
  properties: {
    title: {
      type: String,
      value: '子午花信'
    },
    showBack: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statusBarHeight: 44,
    navBarHeight: 44,
    capsuleWidth: 88
  },

  lifetimes: {
    attached() {
      let windowInfo = {};
      let menuButtonInfo = { top: 48, height: 32, width: 88 };
      try {
        windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      } catch (e) {
        console.warn('nav-bar getWindowInfo failed:', e && e.message ? e.message : String(e || 'unknown error'));
      }
      try {
        menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      } catch (e) {
        console.warn('nav-bar getMenuButtonBoundingClientRect failed:', e && e.message ? e.message : String(e || 'unknown error'));
      }
      const statusBarHeight = windowInfo.statusBarHeight || 44;
      
      this.setData({
        statusBarHeight,
        navBarHeight: (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height,
        capsuleWidth: menuButtonInfo.width + 16
      });
    }
  },

  methods: {
    handleBack() {
      wx.navigateBack();
    }
  }
});
