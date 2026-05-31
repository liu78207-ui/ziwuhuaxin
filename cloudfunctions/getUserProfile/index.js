const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 获取用户资料
 * 云端按 OPENID 隔离查询 users 文档
 * 返回: { success, userId, userInfo: { nickName, avatarUrl, createdAt, updatedAt } }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  try {
    const result = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      const user = result.data[0];
      return {
        success: true,
        userId: user._id,
        userInfo: {
          nickName: user.nickName || '',
          avatarUrl: user.avatarUrl || '',
          createdAt: user.createdAt || '',
          updatedAt: user.updatedAt || ''
        }
      };
    }

    // 用户不存在，返回空资料
    return {
      success: true,
      userId: null,
      userInfo: {
        nickName: '',
        avatarUrl: '',
        createdAt: '',
        updatedAt: ''
      }
    };
  } catch (e) {
    console.error('getUserProfile 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};