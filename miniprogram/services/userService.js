// services/userService.js
// Phase 7: 用户服务层 — 登录收敛、openid 安全、用户资料 CRUD

const storageService = require('./storageService');
const cloudService = require('./cloudService');

/**
 * 登录（静默 + 强制）
 * - 有本地缓存时直接返回，不阻塞启动
 * - 网络可用时异步刷新云端最新资料
 * @param {Object} options - { force: boolean }
 * @returns {Promise<Object>} - { userId, createdAt }
 */
async function login(options = {}) {
  const { force = false } = options;

  // 检查本地缓存是否已登录
  const cachedUserInfo = storageService.getUserInfo();
  if (cachedUserInfo && cachedUserInfo.createdAt) {
    // 有缓存，直接返回（不阻塞）
    if (!force) {
      // 静默模式：异步刷新云端资料，不等待
      refreshUserInfo().catch(() => {});
      return { userId: cachedUserInfo._userId, createdAt: cachedUserInfo.createdAt };
    }
  }

  // 无缓存或强制登录，调用云函数
  try {
    const res = await cloudService.callFunction('login', {});
    if (!res.success) {
      throw new Error(res.error?.message || 'login 云函数返回失败');
    }

    // 保存登录态（不存 openid）
    // cloudService.callFunction 返回结构：{ success, data, error }
    // login 云函数返回：{ success: true, userId, createdAt }
    const userId = res.data?.userId;
    const createdAt = res.data?.createdAt;
    const userInfo = {
      _userId: userId,
      createdAt: createdAt,
      updatedAt: createdAt,
      nickName: cachedUserInfo?.nickName || '',
      avatarUrl: cachedUserInfo?.avatarUrl || ''
    };
    storageService.setUserInfo(userInfo);

    return { userId, createdAt };
  } catch (e) {
    if (force) {
      throw e;
    }
    // 静默模式：网络失败时返回本地缓存
    if (cachedUserInfo && cachedUserInfo.createdAt) {
      return { userId: cachedUserInfo._userId, createdAt: cachedUserInfo.createdAt };
    }
    throw e;
  }
}

/**
 * 获取用户信息（同步，优先从本地缓存读取）
 * Phase 7 缓存字段不含 openid
 * @returns {Object} userInfo { _userId, createdAt, updatedAt, nickName, avatarUrl }
 */
function getUserInfo() {
  return storageService.getUserInfo() || {
    _userId: '',
    createdAt: '',
    updatedAt: '',
    nickName: '',
    avatarUrl: ''
  };
}

/**
 * 设置用户信息到本地缓存
 * @param {Object} info - { nickName?, avatarUrl? }
 */
function setUserInfo(info) {
  const existing = storageService.getUserInfo() || {};
  storageService.setUserInfo({ ...existing, ...info, updatedAt: new Date().toISOString() });
}

/**
 * 判断是否已登录
 * @returns {boolean}
 */
function isLoggedIn() {
  const userInfo = storageService.getUserInfo();
  return !!(userInfo && userInfo.createdAt);
}

/**
 * 从云端刷新用户资料
 * - 网络失败时返回本地缓存兜底
 * @returns {Promise<Object>} - 云端最新的 userInfo
 */
async function refreshUserInfo() {
  try {
    const res = await cloudService.callFunction('getUserProfile', {});
    if (!res.success) {
      throw new Error(res.error?.message || 'getUserProfile 云函数返回失败');
    }

    // 合并云端资料到本地缓存（保留本地头像/昵称，若云端为空）
    // cloudService.callFunction 返回结构：{ success, data, error }
    // getUserProfile 云函数返回：{ success: true, userId, userInfo: { nickName, avatarUrl, createdAt } }
    const existing = storageService.getUserInfo() || {};
    const cloudInfo = res.data?.userInfo || {};
    const merged = {
      _userId: existing._userId || res.data?.userId,
      createdAt: cloudInfo.createdAt || existing.createdAt || '',
      updatedAt: cloudInfo.updatedAt || new Date().toISOString(),
      nickName: cloudInfo.nickName || existing.nickName || '',
      avatarUrl: cloudInfo.avatarUrl || existing.avatarUrl || ''
    };
    storageService.setUserInfo(merged);
    return merged;
  } catch (e) {
    // 网络失败时返回本地缓存兜底
    const cached = storageService.getUserInfo();
    if (cached && cached.createdAt) {
      return cached;
    }
    throw e;
  }
}

/**
 * 保存用户资料（昵称/头像）到云端 + 本地缓存
 * @param {Object} data - { nickName?, avatarUrl? }
 * @returns {Promise<void>}
 */
async function saveUserInfo(data) {
  if (!isLoggedIn()) {
    throw new Error('未登录，无法保存用户资料');
  }

  // 先更新本地缓存（乐观更新）
  setUserInfo(data);

  try {
    // cloudService.callFunction 返回结构：{ success, data, error }
    const res = await cloudService.callFunction('saveUserProfile', data);
    if (!res.success) {
      throw new Error(res.error?.message || 'saveUserProfile 云函数返回失败');
    }
  } catch (e) {
    // 云端失败时保留本地缓存，下次网络恢复可重试
    throw e;
  }
}

/**
 * 上传头像到云存储
 * @param {string} tempFilePath - 临时文件路径
 * @param {string} cloudPath - 云存储目标路径
 * @returns {Promise<string>} - cloud:// URL
 */
async function uploadAvatar(tempFilePath, cloudPath) {
  return cloudService.uploadFile(tempFilePath, cloudPath);
}

/**
 * 退出登录（仅清除 profile 登录态，不影响习惯/打卡/pending 队列）
 */
function logout() {
  const existing = storageService.getUserInfo() || {};
  storageService.setUserInfo({
    _userId: existing._userId || '',
    createdAt: '',
    updatedAt: '',
    nickName: '',
    avatarUrl: ''
  });
}

/**
 * 将云存储 cloud:// URL 转换为临时 URL
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<string>} 临时 URL 或原路径
 */
async function resolveDisplayAvatarUrl(cloudPath) {
  return cloudService.getTempFileURL(cloudPath);
}

/**
 * 构建 Profile 展示模型（纯同步，只读本地缓存）
 * @returns {Object} ProfileViewModel
 */
function getProfileViewModel() {
  const userInfo = getUserInfo();
  const loggedIn = !!(userInfo && userInfo.createdAt);

  if (!loggedIn) {
    return {
      isLoggedIn: false,
      displayAvatarUrl: '/assets/default-avatar.png',
      nickName: '点击登录',
      memberSince: '',
      buttonText: '登录，子午花信'
    };
  }

  return {
    isLoggedIn: true,
    displayAvatarUrl: userInfo.avatarUrl || '/assets/default-avatar.png',
    nickName: userInfo.nickName || '匿名修习者',
    memberSince: userInfo.createdAt || '',
    buttonText: '退出登录'
  };
}

module.exports = {
  login,
  getUserInfo,
  setUserInfo,
  isLoggedIn,
  refreshUserInfo,
  saveUserInfo,
  uploadAvatar,
  logout,
  resolveDisplayAvatarUrl,
  getProfileViewModel
};