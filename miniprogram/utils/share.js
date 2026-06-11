const SHARE_MENU_OPTIONS = {
  withShareTicket: true,
  menus: ['shareAppMessage', 'shareTimeline']
};

const DEFAULT_IMAGE = '/images/share-cover.png';

function enableShareMenu() {
  if (typeof wx !== 'undefined' && wx.showShareMenu) {
    wx.showShareMenu({
      ...SHARE_MENU_OPTIONS,
      fail: (err) => {
        const message = err && err.errMsg ? err.errMsg : String(err || 'unknown error');
        console.warn('share.enableShareMenu 失败:', message);
      }
    });
  }
}

function appMessage(title, path, imageUrl = DEFAULT_IMAGE) {
  return { title, path, imageUrl };
}

function timeline(title, query = '', imageUrl = DEFAULT_IMAGE) {
  return { title, query, imageUrl };
}

module.exports = {
  enableShareMenu,
  appMessage,
  timeline
};
