const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const releaseLog = () => {};

const db = cloud.database();

const HABITS_DATA = [
  // 运动类
  { title: '金刚功', category: '运动类', icon_url: '', description: '道家养生功法，强身健体', default_duration: 15 },
  { title: '站桩', category: '运动类', icon_url: '', description: '静心养气，固本培元', default_duration: 20 },
  { title: '八段锦', category: '运动类', icon_url: '', description: '传统养生功法，强身健体', default_duration: 15 },
  { title: '五禽戏', category: '运动类', icon_url: '', description: '模仿五禽动作，舒筋活络', default_duration: 20 },
  { title: '太极拳', category: '运动类', icon_url: '', description: '舒缓柔和，调和气血', default_duration: 30 },
  { title: '快走', category: '运动类', icon_url: '', description: '有氧运动，促进代谢', default_duration: 30 },
  { title: '瑜伽', category: '运动类', icon_url: '', description: '身心合一，柔韧身体', default_duration: 45 },
  { title: '普拉提', category: '运动类', icon_url: '', description: '核心训练，塑形美体', default_duration: 40 },
  { title: '游泳', category: '运动类', icon_url: '', description: '全身运动，增强心肺', default_duration: 45 },
  { title: '跑步', category: '运动类', icon_url: '', description: '有氧运动，释放压力', default_duration: 30 },
  { title: '跳绳', category: '运动类', icon_url: '', description: '简单高效，燃脂塑形', default_duration: 15 },
  { title: '舞蹈', category: '运动类', icon_url: '/assets/icons/habit-wudao.png', description: '舒展身体，愉悦身心', default_duration: 30, habit_id: '23', theme_class: 't-green' },
  { title: '健体', category: '运动类', icon_url: '/assets/icons/habit-jianti.png', description: '综合训练，强健体魄', default_duration: 20, habit_id: '24', theme_class: 't-yellow' },
  { title: '易筋经', category: '运动类', icon_url: '/assets/icons/habit-yijinjing.png', description: '传统功法，强筋健骨', default_duration: 20, habit_id: '25', theme_class: 't-yellow' },
  
  // 理疗类
  { title: '艾灸', category: '理疗类', icon_url: '', description: '温阳散寒，提升免疫力', default_duration: 30 },
  { title: '刮痧', category: '理疗类', icon_url: '', description: '活血化瘀，排毒养颜', default_duration: 20 },
  { title: '拔罐', category: '理疗类', icon_url: '', description: '疏通经络，祛湿排毒', default_duration: 15 },
  { title: '推拿', category: '理疗类', icon_url: '', description: '放松肌肉，缓解疲劳', default_duration: 30 },
  { title: '经络拍打', category: '理疗类', icon_url: '', description: '疏通经络，促进循环', default_duration: 15 },
  { title: '点穴', category: '理疗类', icon_url: '/assets/icons/habit-dianxue.png', description: '按压穴位，疏通经络', default_duration: 15, habit_id: '22', theme_class: 't-green' },
  
  // 起居类
  { title: '晨起温水', category: '起居类', icon_url: '', description: '清肠排毒，唤醒身体', default_duration: 5 },
  { title: '梳头', category: '起居类', icon_url: '', description: '疏通头部经络，提神醒脑', default_duration: 5 },
  { title: '叩齿', category: '起居类', icon_url: '', description: '固肾健齿，生津养咽', default_duration: 5 },
  { title: '揉腹', category: '起居类', icon_url: '', description: '调理脾胃，促进消化', default_duration: 10 },
  { title: '睡前泡脚', category: '起居类', icon_url: '', description: '活血通络，促进睡眠', default_duration: 20 }
];

exports.main = async (event, context) => {
  releaseLog('initHabits 开始执行');
  
  try {
    const now = new Date();
    let created = 0;
    let updated = 0;

    for (const habit of HABITS_DATA) {
      const existing = await db.collection('habits').where({ title: habit.title }).get();
      if (existing.data && existing.data.length > 0) {
        await db.collection('habits').doc(existing.data[0]._id).update({
          data: {
            ...habit,
            updated_at: now
          }
        });
        updated += 1;
      } else {
        await db.collection('habits').add({
          data: {
            ...habit,
            created_at: now,
            updated_at: now
          }
        });
        created += 1;
      }
    }

    releaseLog('幂等初始化完成，新增:', created, '更新:', updated);

    return {
      success: true,
      message: 'habits 初始化成功',
      count: HABITS_DATA.length,
      created,
      updated
    };

  } catch (err) {
    console.error('initHabits error:', err);
    return {
      success: false,
      message: err.message
    };
  }
};
