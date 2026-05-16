// index.ts
const releaseLog = () => {};

Page({
  data: {
    motto: 'Hello World',
    userInfo: {},
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),
    canIUseNicknameComp: wx.canIUse('input.type.nickname'),
  },

  onLoad() {
    releaseLog('Index page loaded');
  },

  onShow() {
    releaseLog('Index page shown');
  },
});
