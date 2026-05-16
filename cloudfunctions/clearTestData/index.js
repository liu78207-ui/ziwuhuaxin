/**
 * 清空测试数据云函数
 * 
 * 使用方式：
 * 在小程序中调用：
 * 
 * wx.cloud.callFunction({
 *   name: 'clearTestData',
 *   data: { confirm: true },
 *   success: res => releaseLog(res)
 * })
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const releaseLog = () => {};

const db = cloud.database();
const _ = db.command;
const TEST_DATA_CONFIRMATION = 'ALLOW_TEST_DATA_WRITE';

function isTestDataFunctionEnabled(event = {}) {
  return process.env.ALLOW_TEST_DATA_FUNCTIONS === 'true' &&
    event.confirmTestDataWrite === TEST_DATA_CONFIRMATION;
}

function testDataFunctionDisabledResponse() {
  return {
    success: false,
    message: '测试数据清理云函数默认禁用。仅测试环境可设置 ALLOW_TEST_DATA_FUNCTIONS=true 并传入 confirmTestDataWrite 后执行。'
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!isTestDataFunctionEnabled(event)) {
    return testDataFunctionDisabledResponse();
  }

  if (!event.confirm) {
    return { 
      success: false, 
      message: '请确认清空数据，传入 { confirm: true }' 
    };
  }

  try {
    // 删除用户策略
    const strategiesRes = await db.collection('user_strategies').where({
      _openid: openid
    }).remove();

    // 删除打卡记录
    const logsRes = await db.collection('checkin_logs').where({
      _openid: openid
    }).remove();

    // 删除用户信息
    const usersRes = await db.collection('users').where({
      _openid: openid
    }).remove();

    let versionsRemoved = 0;
    try {
      const versionsRes = await db.collection('user_strategy_versions').where({
        _openid: openid
      }).remove();
      versionsRemoved = versionsRes.deleted || 0;
    } catch (e) {
      releaseLog('user_strategy_versions 集合不存在，跳过');
    }

    let habitsRemoved = 0;
    try {
      const habitsRes = await db.collection('habits').where({
        _openid: openid
      }).remove();
      habitsRemoved = habitsRes.deleted || 0;
    } catch (e) {
      releaseLog('habits 集合不存在，跳过');
    }

    return {
      success: true,
      message: '云端数据已清空',
      details: {
        strategiesRemoved: strategiesRes.deleted || 0,
        logsRemoved: logsRes.deleted || 0,
        versionsRemoved: versionsRemoved,
        usersRemoved: usersRes.deleted || 0,
        habitsRemoved: habitsRemoved
      }
    };
  } catch (err) {
    console.error('clearTestData error:', err);
    return { success: false, message: err.message };
  }
};
