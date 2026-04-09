const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { habit_id, duration, freq_type, freq_rules } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  try {
    const existingRes = await db.collection('user_strategies').where({
      _openid: openid,
      habit_id: habit_id
    }).get();

    if (existingRes.data && existingRes.data.length > 0) {
      await db.collection('user_strategies').doc(existingRes.data[0]._id).update({
        data: {
          duration,
          freq_type,
          freq_rules,
          updated_at: new Date()
        }
      });

      return { success: true, message: '更新成功' };
    } else {
      await db.collection('user_strategies').add({
        data: {
          _openid: openid,
          habit_id,
          duration,
          freq_type,
          freq_rules,
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      return { success: true, message: '保存成功' };
    }
  } catch (err) {
    console.error('saveStrategy error:', err);
    return { success: false, message: err.message };
  }
};
