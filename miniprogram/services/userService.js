// services/userService.js
// Phase 6C: 页面层瘦身 - Profile 用户信息服务

const storageService = require('./storageService')

// 云数据库实例（与 phase6-plan.md 安全原则一致：不从前端传 openid）
let _db = null
function getDb() {
  if (!_db) {
    _db = wx.cloud.database()
  }
  return _db
}

/**
 * 获取用户信息（优先缓存）
 * @returns {Object|null}
 */
function getUserInfo() {
  return storageService.getUserInfo()
}

/**
 * 设置用户信息到缓存
 * @param {Object} info
 */
function setUserInfo(info) {
  storageService.setUserInfo(info)
}

/**
 * 从云端加载用户信息
 * 云函数通过 cloud.getWXContext() 获取身份，不从前端传 openid
 * @returns {Promise<Object|null>}
 */
async function loadFromCloud() {
  try {
    const db = getDb()
    // 注意：此处在没有云函数的情况下直接访问云数据库
    // 实际生产环境应通过云函数 cloud.getWXContext() 获取 openid
    const res = await db.collection('users').doc('placeholder').get()
    if (res.data) {
      const userInfo = {
        avatarUrl: res.data.avatarUrl || '',
        nickName: res.data.nickName || ''
      }
      setUserInfo(userInfo)
      return userInfo
    }
    return null
  } catch (e) {
    console.error('loadFromCloud 失败:', e)
    return null
  }
}

/**
 * 更新用户信息到云数据库
 * @param {Object} data - 要更新的字段
 * @returns {Promise<void>}
 */
async function updateUserInfo(data) {
  try {
    const db = getDb()
    // 注意：此处在没有云函数的情况下直接访问云数据库
    // 实际生产环境应通过云函数更新
    const userInfo = getUserInfo()
    await db.collection('users').doc('placeholder').set({
      data: {
        ...userInfo,
        ...data,
        updateTime: db.serverDate()
      }
    })
    // 更新本地缓存
    const updated = { ...userInfo, ...data }
    setUserInfo(updated)
  } catch (e) {
    console.error('updateUserInfo 失败:', e)
  }
}

/**
 * 构建 Profile 展示模型
 * @returns {Promise<{userInfo: Object, displayAvatarUrl: string}>}
 */
async function getProfileViewModel() {
  const userInfo = getUserInfo() || { avatarUrl: '', nickName: '' }
  // displayAvatarUrl 由页面通过 updateDisplayAvatar 处理云存储临时链接
  return {
    userInfo,
    displayAvatarUrl: userInfo?.avatarUrl || ''
  }
}

module.exports = {
  getUserInfo,
  setUserInfo,
  loadFromCloud,
  updateUserInfo,
  getProfileViewModel
}