const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const releaseLog = () => {};

const db = cloud.database();
const _ = db.command;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 打卡云函数
 * 防御措施：
 * 1. 前端防抖：按钮点击后禁用1秒
 * 2. 本地校验：同一日期同一习惯禁止重复创建记录
 * 3. 云端校验：数据库设置 openid + habitId + date 联合唯一索引，拒绝重复写入
 */
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

  // 支持传入指定日期，否则使用今天
  const todayStr = checkin_date || formatDate(new Date());

  // 统一使用字符串类型的 habit_id
  const habitIdStr = String(habit_id);

  try {
    // 先检查是否已存在记录（第一道防线）
    const existingLog = await db.collection('checkin_logs').where({
      _openid: openid,
      habit_id: habitIdStr,
      checkin_date: todayStr
    }).get();

    if (existingLog.data && existingLog.data.length > 0) {
      releaseLog('重复打卡拦截:', openid, habitIdStr, todayStr);
      return { success: false, message: '今日已打卡' };
    }

    // 尝试添加记录（第二道防线：数据库唯一索引）
    try {
      const addResult = await db.collection('checkin_logs').add({
        data: {
          _openid: openid,
          habit_id: habitIdStr,
          checkin_date: todayStr,
          created_at: new Date(),
          created_at_str: formatDate(new Date())
        }
      });

      releaseLog('打卡成功:', addResult._id, openid, habitIdStr, todayStr);
      return { success: true, message: '打卡成功', logId: addResult._id };
    } catch (addErr) {
      // 检查是否是重复键错误（唯一索引冲突）
      if (addErr.errCode === -502001 || addErr.message.includes('duplicate key')) {
        releaseLog('唯一索引拦截重复打卡:', openid, habitIdStr, todayStr);
        return { success: false, message: '今日已打卡' };
      }
      throw addErr;
    }

  } catch (err) {
    console.error('doCheckin error:', err);
    return { success: false, message: err.message || '打卡失败' };
  }
};
