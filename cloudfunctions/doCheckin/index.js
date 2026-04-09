const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  
  const today = new Date();
  const todayStr = formatDate(today);
  
  try {
    const existingLog = await db.collection('checkin_logs').where({
      _openid: openid,
      habit_id: habit_id,
      checkin_date: todayStr
    }).get();
    
    if (existingLog.data && existingLog.data.length > 0) {
      return { success: false, message: '今日已打卡' };
    }
    
    const strategyRes = await db.collection('user_strategies').where({
      _openid: openid,
      habit_id: habit_id
    }).get();
    
    if (!strategyRes.data || strategyRes.data.length === 0) {
      return { success: false, message: '未找到该习惯的策略' };
    }
    
    await db.collection('checkin_logs').add({
      data: {
        _openid: openid,
        habit_id: habit_id,
        checkin_date: todayStr,
        created_at: new Date()
      }
    });
    
    return { success: true, message: '打卡成功' };
    
  } catch (err) {
    console.error('doCheckin error:', err);
    return { success: false, message: err.message };
  }
};
