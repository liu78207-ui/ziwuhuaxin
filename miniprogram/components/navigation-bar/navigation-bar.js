Component({
  options: {
    multipleSlots: true
  },
  properties: {
    extClass: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    background: {
      type: String,
      value: ''
    },
    color: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    loading: {
      type: Boolean,
      value: false
    },
    homeButton: {
      type: Boolean,
      value: false,
    },
    animated: {
      type: Boolean,
      value: true
    },
    show: {
      type: Boolean,
      value: true,
      observer: '_showChange'
    },
    delta: {
      type: Number,
      value: 1
    },
  },
  data: {
    displayStyle: ''
  },
  lifetimes: {
    attached() {
      let rect = { left: 0 }
      let windowInfo = {}
      let deviceInfo = {}
      try {
        rect = wx.getMenuButtonBoundingClientRect()
      } catch (e) {
        console.warn('navigation-bar getMenuButtonBoundingClientRect failed:', e && e.message ? e.message : String(e || 'unknown error'))
      }
      try {
        windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {}
      } catch (e) {
        console.warn('navigation-bar getWindowInfo failed:', e && e.message ? e.message : String(e || 'unknown error'))
      }
      try {
        deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {}
      } catch (e) {
        console.warn('navigation-bar getDeviceInfo failed:', e && e.message ? e.message : String(e || 'unknown error'))
      }
      const isAndroid = deviceInfo.platform === 'android'
      const isDevtools = deviceInfo.platform === 'devtools'
      const safeAreaTop = windowInfo.safeArea?.top || windowInfo.statusBarHeight || 0
      const leftWidth = Math.max(0, (windowInfo.windowWidth || 0) - rect.left)
      this.setData({
        ios: !isAndroid,
        innerPaddingRight: `padding-right: ${leftWidth}px`,
        leftWidth: `width: ${leftWidth}px`,
        safeAreaTop: isDevtools || isAndroid ? `height: calc(var(--height) + ${safeAreaTop}px); padding-top: ${safeAreaTop}px` : ``
      })
    },
  },
  methods: {
    _showChange(show) {
      const animated = this.data.animated
      let displayStyle = ''
      if (animated) {
        displayStyle = `opacity: ${show ? '1' : '0'};transition:opacity 0.5s;`
      } else {
        displayStyle = `display: ${show ? '' : 'none'}`
      }
      this.setData({
        displayStyle
      })
    },
    back() {
      const data = this.data
      if (data.delta) {
        wx.navigateBack({
          delta: data.delta
        })
      }
      this.triggerEvent('back', { delta: data.delta }, {})
    }
  },
})
