const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const cloudFunction = cloud.Cloud;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { habit_id, duration, freq_type, freq_rules, plan_start_date } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  const habitIdStr = String(habit_id);
  const todayStr = formatDate(new Date());

  try {
    const existingRes = await db.collection('user_strategies').where({
      _openid: openid,
      $or: [
        { habit_id: habitIdStr },
        { habit_id: habit_id },
        { habit_id: Number(habit_id) }
      ]
    }).get();

    if (existingRes.data && existingRes.data.length > 0) {
      if (existingRes.data.length > 1) {
        const idsToDelete = existingRes.data.slice(1).map(item => item._id);
        for (const id of idsToDelete) {
          await db.collection('user_strategies').doc(id).remove();
        }
      }

      const currentStrategy = existingRes.data[0];
      const isSoftDeleted = Boolean(currentStrategy.deleted_at || currentStrategy.deletedAt);
      const isStrategyChanged = 
        isSoftDeleted ||
        currentStrategy.duration !== duration ||
        currentStrategy.freq_type !== freq_type ||
        JSON.stringify(currentStrategy.freq_rules) !== JSON.stringify(freq_rules) ||
        currentStrategy.plan_start_date !== plan_start_date;

      if (isStrategyChanged) {
        try {
          await cloudFunction.callFunction({
            name: 'saveStrategyVersion',
            data: {
              habit_id: habitIdStr,
              freq_type: freq_type,
              freq_rules: freq_rules,
              plan_start_date: plan_start_date,
              change_date: todayStr
            }
          });
        } catch (versionErr) {
          console.error('saveStrategyVersion error:', versionErr);
        }
      }

      await db.collection('user_strategies').doc(currentStrategy._id).update({
        data: {
          habit_id: habitIdStr,
          duration,
          freq_type,
          freq_rules,
          plan_start_date: plan_start_date || null,
          deleted_at: null,
          deletedAt: null,
          restored_at: isSoftDeleted ? new Date() : currentStrategy.restored_at || null,
          updated_at: new Date()
        }
      });

      return { success: true, message: '更新成功' };
    } else {
      await db.collection('user_strategies').add({
        data: {
          _openid: openid,
          habit_id: habitIdStr,
          duration,
          freq_type,
          freq_rules,
          plan_start_date: plan_start_date || null,
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      try {
        await cloudFunction.callFunction({
          name: 'saveStrategyVersion',
          data: {
            habit_id: habitIdStr,
            duration: duration,
            freq_type: freq_type || 'daily',
            freq_rules: freq_rules !== undefined ? freq_rules : 1,
            plan_start_date: plan_start_date || todayStr,
            change_date: todayStr
          }
        });
      } catch (versionErr) {
        console.error('saveStrategyVersion error:', versionErr);
      }

      return { success: true, message: '保存成功' };
    }
  } catch (err) {
    console.error('saveStrategy error:', err);
    return { success: false, message: err.message };
  }
};
