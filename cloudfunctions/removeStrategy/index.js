const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { habit_id } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  // 统一使用字符串类型的 habit_id
  const habitIdStr = String(habit_id);

  try {
    // 查找用户策略（同时匹配字符串和数字类型）
    const strategyRes = await db.collection('user_strategies').where({
      _openid: openid,
      $or: [
        { habit_id: habitIdStr },
        { habit_id: habit_id },
        { habit_id: Number(habit_id) }
      ]
    }).get();

    if (!strategyRes.data || strategyRes.data.length === 0) {
      return { success: false, message: '未找到该习惯策略' };
    }

    // 软删除：将 deleted_at 字段设置为当前时间，保留打卡记录
    const deletePromises = strategyRes.data.map(item => {
      return db.collection('user_strategies').doc(item._id).update({
        data: {
          deleted_at: new Date()
        }
      });
    });
    await Promise.all(deletePromises);

    // 保留打卡记录（不清空）
    // 如果需要真正删除，可以取消注释以下代码
    // const logsRes = await db.collection('checkin_logs').where({
    //   _openid: openid,
    //   $or: [
    //     { habit_id: habitIdStr },
    //     { habit_id: habit_id },
    //     { habit_id: Number(habit_id) }
    //   ]
    // }).get();

    return { success: true, message: '删除成功' };

  } catch (err) {
    console.error('removeStrategy error:', err);
    return { success: false, message: err.message };
  }
};
