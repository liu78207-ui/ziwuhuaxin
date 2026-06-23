function getMenuButtonLayout() {
  let windowInfo = {};
  let menuButtonInfo = null;

  try {
    windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
  } catch (e) {
    console.warn('navLayout getWindowInfo failed:', e && e.message ? e.message : String(e || 'unknown error'));
  }

  if (wx.getMenuButtonBoundingClientRect) {
    try {
      menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    } catch (e) {
      console.warn('navLayout getMenuButtonBoundingClientRect failed:', e && e.message ? e.message : String(e || 'unknown error'));
    }
  }

  const statusBarHeight = windowInfo.statusBarHeight || 44;
  const top = menuButtonInfo && menuButtonInfo.top ? menuButtonInfo.top : statusBarHeight + 24;
  const height = menuButtonInfo && menuButtonInfo.height ? menuButtonInfo.height : 32;

  return { top, height };
}

function getNavTitleStyle(layout = getMenuButtonLayout()) {
  return `margin-top: ${layout.top}px; height: ${layout.height}px; line-height: ${layout.height}px;`;
}

module.exports = {
  getMenuButtonLayout,
  getNavTitleStyle
};
