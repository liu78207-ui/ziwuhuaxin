// index.ts
Page({
  data: {
    motto: 'Hello World',
    userInfo: {},
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),
    canIUseNicknameComp: wx.canIUse('input.type.nickname'),
  },

  onLoad() {
    console.log('Index page loaded');
  },

  onShow() {
    console.log('Index page shown');
  },
});
