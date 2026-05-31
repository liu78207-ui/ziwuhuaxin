// services/userService.js
// Phase 6C: 页面层瘦身 - Profile 用户信息服务

const storageService = require('./storageService')

/**
 * 获取用户信息（同步，优先从本地缓存读取）
 * @returns {Object} userInfo { avatarUrl, nickName }
 */
function getUserInfo() {
  return storageService.getUserInfo() || { avatarUrl: '', nickName: '' }
}

/**
 * 设置用户信息到本地缓存
 * @param {Object} info { avatarUrl, nickName }
 */
function setUserInfo(info) {
  storageService.setUserInfo(info)
}

/**
 * 从云端加载用户信息
 * Phase 6C 暂缓：云端身份依赖云函数 cloud.getWXContext()，当前不实现
 * @returns {Promise<Object|null>}
 */
async function loadFromCloud() {
  // Phase 6C 暂缓云端加载，云函数实现后替换
  console.log('loadFromCloud: Phase 6C 暂缓，云端加载依赖云函数');
  return null
}

/**
 * 更新用户信息到云数据库
 * Phase 6C 暂缓：云端身份依赖云函数 cloud.getWXContext()，当前不实现
 * @param {Object} data - 要更新的字段
 * @returns {Promise<void>}
 */
async function updateUserInfo(data) {
  // Phase 6C 暂缓云端更新，云函数实现后替换
  console.log('updateUserInfo: Phase 6C 暂缓，云端更新依赖云函数');
}

/**
 * 将云存储 cloud:// URL 转换为临时 URL
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<string>} 临时 URL 或原路径
 */
async function resolveDisplayAvatarUrl(cloudPath) {
  if (!cloudPath || !cloudPath.startsWith('cloud://')) {
    return cloudPath
  }

  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [cloudPath] })
    const file = res.fileList && res.fileList[0]
    return (file && file.tempFileURL) || cloudPath
  } catch (e) {
    console.error('resolveDisplayAvatarUrl 失败:', e)
    return cloudPath
  }
}

/**
 * 构建 Profile 展示模型（同步）
 * @returns {{userInfo: Object, displayAvatarUrl: string}}
 */
function getProfileViewModel() {
  const userInfo = getUserInfo()
  return {
    userInfo,
    displayAvatarUrl: userInfo.avatarUrl || ''
  }
}

module.exports = {
  getUserInfo,
  setUserInfo,
  loadFromCloud,
  updateUserInfo,
  resolveDisplayAvatarUrl,
  getProfileViewModel
}