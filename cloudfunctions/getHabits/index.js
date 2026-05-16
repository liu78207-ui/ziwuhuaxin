const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const releaseLog = () => {};

const db = cloud.database();

exports.main = async (event, context) => {
  releaseLog('getHabits 被调用');
  releaseLog('环境ID:', cloud.DYNAMIC_CURRENT_ENV);
  
  try {
    releaseLog('开始查询 habits 集合');
    const res = await db.collection('habits').get();
    
    releaseLog('查询成功，数据条数:', res.data.length);
    releaseLog('第一条数据:', res.data[0]);
    
    return {
      success: true,
      data: res.data || [],
      count: res.data.length
    };
  } catch (err) {
    console.error('getHabits 错误:', err);
    return {
      success: false,
      message: err.message,
      errCode: err.errCode
    };
  }
};
