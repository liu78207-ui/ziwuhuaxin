const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  // Phase 7: openid 安全边界 — 云端自行通过 getWXContext 获取，不落地到前端
  // login 云函数职责：查询/创建 users 文档，返回内部 userId，不返回 openid

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  try {
    // 查询是否已存在 users 文档（按 OPENID 隔离）
    const userResult = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    const now = new Date().toISOString();

    if (userResult.data && userResult.data.length > 0) {
      // 已存在，返回 userId 和 createdAt
      const user = userResult.data[0];
      return {
        success: true,
        userId: user._id,
        createdAt: user.createdAt
      };
    }

    // 不存在则创建
    const newUser = {
      _openid: OPENID,
      createdAt: now,
      updatedAt: now,
      nickName: '',
      avatarUrl: ''
    };

    const addResult = await db.collection('users').add({
      data: newUser
    });

    return {
      success: true,
      userId: addResult._id,
      createdAt: now
    };
  } catch (e) {
    console.error('login 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};