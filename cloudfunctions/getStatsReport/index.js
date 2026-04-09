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

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

async function calculateMaxStreak(openid, habitId) {
  const logsRes = await db.collection('checkin_logs').where({
    _openid: openid,
    habit_id: habitId
  }).orderBy('checkin_date', 'desc').get();
  
  if (logsRes.data.length === 0) {
    return 0;
  }
  
  const dates = logsRes.data.map(log => log.checkin_date).sort();
  const dateSet = new Set(dates);
  
  let maxStreak = 0;
  let currentStreak = 1;
  
  for (let i = 1; i < dates.length; i++) {
    const prevDate = parseDate(dates[i - 1]);
    const currDate = parseDate(dates[i]);
    
    const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      currentStreak++;
    } else {
      maxStreak = Math.max(maxStreak, currentStreak);
      currentStreak = 1;
    }
  }
  
  maxStreak = Math.max(maxStreak, currentStreak);
  
  return maxStreak;
}

async function calculateAllHabitsMaxStreak(openid) {
  const strategiesRes = await db.collection('user_strategies').where({
    _openid: openid
  }).get();
  
  const strategies = strategiesRes.data || [];
  
  let globalMaxStreak = 0;
  
  for (const strategy of strategies) {
    const streak = await calculateMaxStreak(openid, strategy.habit_id);
    globalMaxStreak = Math.max(globalMaxStreak, streak);
  }
  
  return globalMaxStreak;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  const { startDate, endDate } = event;
  
  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }
  
  if (!startDate || !endDate) {
    return { success: false, message: '缺少日期参数' };
  }
  
  try {
    const strategiesRes = await db.collection('user_strategies').where({
      _openid: openid
    }).get();
    
    const strategies = strategiesRes.data || [];
    
    if (strategies.length === 0) {
      return {
        success: true,
        data: {
          matrix: [],
          checkinRate: 0,
          totalCount: 0,
          checkinDays: 0,
          maxStreak: 0
        }
      };
    }
    
    const habitIds = strategies.map(s => s.habit_id);
    
    const habitsRes = await db.collection('habits').where({
      _id: _.in(habitIds)
    }).get();
    
    const habitsMap = {};
    (habitsRes.data || []).forEach(h => {
      habitsMap[h._id] = h;
    });
    
    const logsRes = await db.collection('checkin_logs').where({
      _openid: openid,
      checkin_date: _.gte(startDate).lte(endDate)
    }).get();
    
    const weekLogs = logsRes.data || [];
    const uniqueDates = new Set(weekLogs.map(log => log.checkin_date));
    const checkinDays = uniqueDates.size;
    const totalCount = weekLogs.length;
    
    const startDateObj = parseDate(startDate);
    const endDateObj = parseDate(endDate);
    const totalDays = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;
    
    const expectedCount = strategies.length * totalDays;
    const checkinRate = expectedCount > 0 ? Math.round((totalCount / expectedCount) * 100) : 0;
    
    const maxStreak = await calculateAllHabitsMaxStreak(openid);
    
    const matrix = strategies.map(strategy => {
      const habit = habitsMap[strategy.habit_id];
      const days = [];
      
      const currentDate = new Date(startDateObj);
      const todayStr = formatDate(new Date());
      
      for (let i = 0; i < 7; i++) {
        const dateStr = formatDate(currentDate);
        const hasCheckin = weekLogs.some(
          log => log.habit_id === strategy.habit_id && log.checkin_date === dateStr
        );
        
        days.push({
          date: dateStr,
          status: hasCheckin ? 'done' : (dateStr === todayStr ? 'today' : ''),
          dayIndex: i
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return {
        habit_id: strategy.habit_id,
        habit_name: habit?.title || '未知',
        days
      };
    });
    
    return {
      success: true,
      data: {
        matrix,
        checkinRate,
        totalCount,
        checkinDays,
        maxStreak
      }
    };
    
  } catch (err) {
    console.error('getStatsReport error:', err);
    return { success: false, message: err.message };
  }
};
