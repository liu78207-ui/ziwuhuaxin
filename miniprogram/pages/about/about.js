/**
 * about.js - 关于我们页面
 */

function getMenuButtonLayout() {
  let windowInfo = {};
  let menuButtonInfo = null;

  try {
    windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
  } catch (e) {
    console.warn('about getWindowInfo failed:', e && e.message ? e.message : String(e || 'unknown error'));
  }

  try {
    menuButtonInfo = wx.getMenuButtonBoundingClientRect();
  } catch (e) {
    console.warn('about getMenuButtonBoundingClientRect failed:', e && e.message ? e.message : String(e || 'unknown error'));
  }

  const statusBarHeight = windowInfo.statusBarHeight || 44;
  const top = menuButtonInfo && menuButtonInfo.top ? menuButtonInfo.top : statusBarHeight + 24;
  const height = menuButtonInfo && menuButtonInfo.height ? menuButtonInfo.height : 32;

  return { top, height };
}

function getNavBackStyle(layout) {
  return `top: ${layout.top}px; height: ${layout.height}px; width: ${layout.height}px;`;
}

function getNavTitleStyle(layout) {
  return `top: ${layout.top}px; height: ${layout.height}px; line-height: ${layout.height}px;`;
}

Page({
  data: {
    navBackStyle: '',
    navTitleStyle: '',
    navBgOpacity: 0
  },

  onLoad() {
    const menuLayout = getMenuButtonLayout();

    this.setData({
      navBackStyle: getNavBackStyle(menuLayout),
      navTitleStyle: getNavTitleStyle(menuLayout)
    });

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  onAboutScroll(e) {
    const scrollTop = e.detail && e.detail.scrollTop ? e.detail.scrollTop : 0;
    const maxScroll = 30;
    const opacity = Math.min(scrollTop / maxScroll, 1);
    const roundedOpacity = Math.round(opacity * 20) / 20;

    if (Math.abs(roundedOpacity - this.data.navBgOpacity) >= 0.05) {
      this.setData({
        navBgOpacity: roundedOpacity
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/profile/profile'
        });
      }
    });
  }
});
