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
      const systemInfo = wx.getSystemInfoSync();
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      
      this.setData({
        statusBarHeight: systemInfo.statusBarHeight,
        navBarHeight: (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height,
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
