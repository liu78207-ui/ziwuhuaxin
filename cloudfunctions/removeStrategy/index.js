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
  const { habit_id, habit_title, category, icon_url, theme_class, target_minutes } = event;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  if (!habit_id) {
    return { success: false, message: '缺少习惯ID' };
  }

  const habitIdStr = String(habit_id);

  try {
    const deletedAt = new Date();
    const deletedDate = formatDate(deletedAt);

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

    const deletePromises = strategyRes.data.map(item => {
      const updateData = {
        deleted_at: deletedAt,
        habit_title: habit_title || item.habit_title,
        category: category || item.category,
        icon_url: icon_url || item.icon_url,
        theme_class: theme_class || item.theme_class,
        target_minutes: target_minutes || item.target_minutes
      };
      return db.collection('user_strategies').doc(item._id).update({
        data: updateData
      });
    });
    await Promise.all(deletePromises);

    try {
      const activeVersionsRes = await db.collection('user_strategy_versions').where({
        _openid: openid,
        habit_id: habitIdStr,
        end_date: null
      }).get();

      const activeVersions = activeVersionsRes.data || [];
      await Promise.all(activeVersions.map(version =>
        db.collection('user_strategy_versions').doc(version._id).update({
          data: {
            end_date: deletedDate
          }
        })
      ));

      await db.collection('user_strategy_versions').add({
        data: {
          _openid: openid,
          habit_id: habitIdStr,
          deleted: true,
          type: 'deleted',
          status: 'deleted',
          start_date: deletedDate,
          end_date: null,
          created_at: deletedAt
        }
      });
    } catch (versionErr) {
      console.error('removeStrategy version segment error:', versionErr);
    }

    return { success: true, message: '删除成功' };
  } catch (err) {
    console.error('removeStrategy error:', err);
    return { success: false, message: err.message };
  }
};
