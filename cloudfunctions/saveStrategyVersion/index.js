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

  const { habit_id, freq_type, freq_rules, plan_start_date, change_date } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  const habitIdStr = String(habit_id);
  const changeDateStr = change_date || formatDate(new Date());

  try {
    const existingRes = await db.collection('user_strategy_versions').where({
      _openid: openid,
      habit_id: habitIdStr,
      end_date: null
    }).get();

    if (existingRes.data && existingRes.data.length > 0) {
      const currentVersion = existingRes.data[0];

      await db.collection('user_strategy_versions').doc(currentVersion._id).update({
        data: {
          end_date: changeDateStr
        }
      });
    }

    await db.collection('user_strategy_versions').add({
      data: {
        _openid: openid,
        habit_id: habitIdStr,
        freq_type: freq_type || 'daily',
        freq_rules: freq_rules !== undefined ? freq_rules : 1,
        plan_start_date: plan_start_date || null,
        start_date: changeDateStr,
        end_date: null,
        created_at: new Date()
      }
    });

    return { success: true, message: '策略版本保存成功' };

  } catch (err) {
    console.error('saveStrategyVersion error:', err);
    return { success: false, message: err.message };
  }
};