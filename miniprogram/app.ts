// app.ts
import type { IAppOption } from "./utils/types"

interface AppGlobalData {
  userInfo: WechatMiniprogram.UserInfo | null
  openid: string | null
}

App<IAppOption>({
  globalData: {
    userInfo: null,
    openid: null,
  } as AppGlobalData,

  onLaunch() {
    console.log('App onLaunch')
    // 暂不初始化云开发，避免死循环
    // wx.cloud.init({
    //   env: 'cloud1-6gjv79k431b8103b',
    //   traceUser: true,
    // })
  },

  getUserProfile(callback?: () => void) {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      lang: 'zh_CN',
      success: (res) => {
        this.globalData.userInfo = res.userInfo
        wx.showToast({ title: '登录成功', icon: 'success' })
        if (callback) callback()
      },
      fail: (err) => {
        console.error('获取用户信息失败', err)
        wx.showToast({
          title: '需要授权才能登录',
          icon: 'none'
        })
      }
    })
  }
})
