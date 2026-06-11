const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const releaseLog = () => {};

const db = cloud.database();
const _ = db.command;

/**
 * 获取打卡记录范围查询
 * 用于设备切换时全量同步数据
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { startDate, endDate } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  try {
    let query = {
      _openid: openid
    };

    // 如果提供了日期范围，则添加日期过滤
    if (startDate && endDate) {
      query.checkin_date = _.gte(startDate).lte(endDate);
    }

    const logsRes = await db.collection('checkin_logs').where(query).get();

    releaseLog(`获取打卡记录: ${logsRes.data.length} 条, openid: ${openid}`);

    return {
      success: true,
      logs: logsRes.data || [],
      count: logsRes.data.length
    };

  } catch (err) {
    console.error('getCheckinLogsByRange error:', err);
    return { success: false, message: err.message };
  }
};
