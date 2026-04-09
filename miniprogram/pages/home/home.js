const ziwu = require('../../utils/ziwu.js');

// 习惯圆圈背景色 - 柔和的国风色调
const CIRCLE_COLORS = [
  '#F5E6E0', // 浅粉
  '#E8E4D9', // 米灰
  '#D4E5E0', // 浅青
  '#E5DED4', // 暖灰
  '#D9E2E8', // 浅蓝
  '#E8D9D9'  // 浅玫瑰
];

// 根据时辰获取养生建议
function getAdviceByShichen(shichen) {
  const adviceMap = {
    '子时': '子时胆经当令，宜熟睡养胆。此时进入深度睡眠，有助于胆汁代谢和排毒。',
    '丑时': '丑时肝经当令，宜熟睡养肝。血液归于肝，熟睡有助于肝脏解毒和造血。',
    '寅时': '寅时肺经当令，宜深度睡眠。肺主气，此时宜静养，避免早起运动。',
    '卯时': '卯时大肠经当令，宜起床排便。喝温水促进肠道蠕动，排出宿便。',
    '辰时': '辰时胃经当令，宜进食早餐。此时消化吸收能力最强，吃好早餐养胃气。',
    '巳时': '巳时脾经当令，宜工作学习。脾主运化，此时精力充沛，适合处理复杂事务。',
    '午时': '午时心经当令，宜小憩养心。饭后散步，适当午休，养心安神。',
    '未时': '未时小肠经当令，宜多喝水。小肠分清泌浊，多喝水帮助排毒。',
    '申时': '申时膀胱经当令，宜运动排毒。此时精力旺盛，适合运动和多喝水。',
    '酉时': '酉时肾经当令，宜静养藏精。避免剧烈运动，可泡脚按摩涌泉穴。',
    '戌时': '戌时心包经当令，宜放松身心。散步、阅读，为睡眠做准备。',
    '亥时': '亥时三焦经当令，宜准备入睡。温水泡脚，放松身心，酝酿睡意。'
  };
  return adviceMap[shichen] || '顺应天时，调养身心。保持规律作息，养成健康习惯。';
}

// 模拟数据 - 用于测试
const MOCK_TASKS = [
  { _id: '1', title: '八段锦', category: '运动类', isChecked: true, streak: 12 },
  { _id: '2', title: '艾灸', category: '理疗类', isChecked: true, streak: 12 },
  { _id: '3', title: '泡脚', category: '起居类', isChecked: false, streak: 12 },
  { _id: '4', title: '瑜伽', category: '运动类', isChecked: true, streak: 12 },
  { _id: '5', title: '站桩', category: '运动类', isChecked: false, streak: 12 },
  { _id: '6', title: '梳头', category: '起居类', isChecked: true, streak: 12 }
];

Page({
  data: {
    timeInfo: {
      hour: '00',
      minute: '00',
      date: '',
      shichen: '亥时',
      meridian: '三焦经',
      advice: ''
    },
    taskList: [],
    loading: false,
    circleColors: CIRCLE_COLORS
  },

  onLoad() {
    this.initTimeInfo();
    // 使用模拟数据，避免数据库查询导致死循环
    this.setData({
      taskList: MOCK_TASKS.map((item, index) => ({
        ...item,
        bgColor: CIRCLE_COLORS[index % CIRCLE_COLORS.length],
        emoji: this.getEmojiByCategory(item.category)
      }))
    });
  },

  onShow() {
    this.initTimeInfo();
  },

  initTimeInfo() {
    const timeInfo = ziwu.getTimeInfo();
    timeInfo.advice = getAdviceByShichen(timeInfo.shichen);
    this.setData({ timeInfo });
  },

  // 根据分类获取表情符号
  getEmojiByCategory(category) {
    const emojiMap = {
      '运动类': '🏃',
      '理疗类': '🔥',
      '起居类': '🍵'
    };
    return emojiMap[category] || '🧘';
  },

  handleCheckin(e) {
    const { habitId, isChecked } = e.currentTarget.dataset;

    if (isChecked) {
      wx.showToast({
        title: '今日已打卡',
        icon: 'none'
      });
      return;
    }

    // 更新本地状态
    const taskList = this.data.taskList.map(item => {
      if (item._id === habitId) {
        return { ...item, isChecked: true };
      }
      return item;
    });

    this.setData({ taskList });
    wx.showToast({ title: '打卡成功', icon: 'success' });
  }
});
