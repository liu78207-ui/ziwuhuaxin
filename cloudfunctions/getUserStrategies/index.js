const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  try {
    const res = await db.collection('user_strategies').where({
      _openid: openid
    }).get();

    return {
      success: true,
      data: res.data || []
    };
  } catch (err) {
    console.error('getUserStrategies error:', err);
    return {
      success: false,
      message: err.message
    };
  }
};
