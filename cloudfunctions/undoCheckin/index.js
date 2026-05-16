const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { habit_id, checkin_date } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  const targetDate = checkin_date || formatDate(new Date());

  // 统一使用字符串类型的 habit_id
  const habitIdStr = String(habit_id);

  try {
    // 查找今日打卡记录（同时匹配字符串和数字类型）
    const existingLog = await db.collection('checkin_logs').where({
      _openid: openid,
      $or: [
        { habit_id: habitIdStr, checkin_date: targetDate },
        { habit_id: habit_id, checkin_date: targetDate },
        { habit_id: Number(habit_id), checkin_date: targetDate }
      ]
    }).get();

    if (!existingLog.data || existingLog.data.length === 0) {
      return { success: false, message: '今日未打卡，无需取消' };
    }

    // 删除打卡记录
    const logId = existingLog.data[0]._id;
    await db.collection('checkin_logs').doc(logId).remove();

    return { success: true, message: '取消打卡成功' };

  } catch (err) {
    console.error('undoCheckin error:', err);
    return { success: false, message: err.message };
  }
};
