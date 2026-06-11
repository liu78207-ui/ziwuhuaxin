const share = require('../utils/share')

const PAGE_SHARE = {
  home: {
    title: '子午花信 · 顺时修习，日日有信',
    path: '/pages/home/home',
    query: 'from=timeline&page=home'
  },
  habits: {
    title: '子午花信 · 选一项修习，从今天开始',
    path: '/pages/habits/habits',
    query: 'from=timeline&page=habits'
  },
  stats: {
    title: '子午花信 · 观心报表',
    path: '/pages/stats/stats',
    query: 'from=timeline&page=stats'
  },
  profile: {
    title: '子午花信 · 顺时修习，日日有信',
    path: '/pages/profile/profile',
    query: 'from=timeline&page=profile'
  }
}

function getPageConfig(page) {
  return PAGE_SHARE[page] || PAGE_SHARE.home
}

function enableShareMenu() {
  return share.enableShareMenu()
}

function appMessage(title, path) {
  return share.appMessage(title, path)
}

function timeline(title, query) {
  return share.timeline(title, query)
}

function getShareMessage(page, titleOverride) {
  const config = getPageConfig(page)
  return share.appMessage(titleOverride || config.title, config.path)
}

function getShareTimeline(page, titleOverride) {
  const config = getPageConfig(page)
  return share.timeline(titleOverride || config.title, config.query)
}

module.exports = {
  enableShareMenu,
  appMessage,
  timeline,
  getShareMessage,
  getShareTimeline
}
