const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_NICKNAME_LENGTH = 24;

function normalizeNickName(nickName) {
  return String(nickName || '').trim().slice(0, MAX_NICKNAME_LENGTH);
}

function normalizeAvatarUrl(avatarUrl) {
  return String(avatarUrl || '').trim();
}

/**
 * 保存用户资料（昵称/头像）
 * 云端按 OPENID 隔离查询并更新 users 文档
 * 入参: { nickName?, avatarUrl? }
 * 返回: { success }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  const updateData = {
    updatedAt: new Date().toISOString()
  };

  if (Object.prototype.hasOwnProperty.call(event || {}, 'nickName')) {
    const normalizedNickName = normalizeNickName(event.nickName);
    if (normalizedNickName) {
      updateData.nickName = normalizedNickName;
    }
  }
  if (Object.prototype.hasOwnProperty.call(event || {}, 'avatarUrl')) {
    const normalizedAvatarUrl = normalizeAvatarUrl(event.avatarUrl);
    if (normalizedAvatarUrl) {
      updateData.avatarUrl = normalizedAvatarUrl;
    }
  }

  if (Object.keys(updateData).length === 1) {
    return { success: false, code: 'PARAM_ERROR', message: '至少需要提供 nickName 或 avatarUrl' };
  }

  try {
    // 查询用户的 openid 记录
    const userResult = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    if (!userResult.data || userResult.data.length === 0) {
      return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在，请先登录' };
    }

    const userId = userResult.data[0]._id;

    await db.collection('users').doc(userId).update({
      data: updateData
    });

    return { success: true };
  } catch (e) {
    console.error('saveUserProfile 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};
