// 习惯图标映射表 - 玉露丹青视觉规范
// 图标路径: /assets/icons/habit-{拼音}.png
// 颜色分类：火(红)、木(绿)、土(黄)、水(蓝)、特殊(紫)

const HABIT_ICONS = {
  // 🔴 火属性 / 温阳气血 - 红色 (t-red)
  '金刚功': { file: 'habit-jinganggong.png', theme: 't-red' },
  '快走': { file: 'habit-kuaizou.png', theme: 't-red' },
  '跑步': { file: 'habit-paobu.png', theme: 't-red' },
  '跳绳': { file: 'habit-tiaosheng.png', theme: 't-red' },
  '艾灸': { file: 'habit-aijiu.png', theme: 't-red' },
  '睡前泡脚': { file: 'habit-shuiqian-paojiao.png', theme: 't-red' },

  // 🟢 木属性 / 疏肝理气 - 绿色 (t-green)
  '点穴': { file: 'habit-dianxue.png', theme: 't-green' },
  '舞蹈': { file: 'habit-wudao.png', theme: 't-green' },
  '站桩': { file: 'habit-zhanzhuang.png', theme: 't-green' },
  '刮痧': { file: 'habit-guasha.png', theme: 't-green' },
  '揉腹': { file: 'habit-roufu.png', theme: 't-green' },
  '经络拍打': { file: 'habit-jingluo-paida.png', theme: 't-green' },

  // 🟡 土属性 / 健脾强身 - 黄色 (t-yellow)
  '八段锦': { file: 'habit-baduanjin.png', theme: 't-yellow' },
  '健体': { file: 'habit-jianti.png', theme: 't-yellow' },
  '易筋经': { file: 'habit-yijinjing.png', theme: 't-yellow' },
  '五禽戏': { file: 'habit-wuqinxi.png', theme: 't-yellow' },
  '推拿': { file: 'habit-tuina.png', theme: 't-yellow' },
  '梳头': { file: 'habit-shutou.png', theme: 't-yellow' },

  // 🔵 水属性 / 滋阴降火 - 蓝色 (t-blue)
  '太极拳': { file: 'habit-taijiquan.png', theme: 't-blue' },
  '游泳': { file: 'habit-youyong.png', theme: 't-blue' },
  '拔罐': { file: 'habit-baguan.png', theme: 't-blue' },
  '晨起温水': { file: 'habit-chenqi-wenshui.png', theme: 't-blue' },

  // 🟣 特殊类 / 柔韧与骨相 - 紫色 (t-purple)
  '瑜伽': { file: 'habit-yujia.png', theme: 't-purple' },
  '普拉提': { file: 'habit-pulati.png', theme: 't-purple' },
  '叩齿': { file: 'habit-kouchi.png', theme: 't-purple' }
};

// 根据习惯名称获取图标配置
function getIconConfig(habitName) {
  const config = HABIT_ICONS[habitName];
  if (config) {
    return {
      iconUrl: '/assets/icons/' + config.file,
      themeClass: config.theme
    };
  }
  return null;
}

// 根据习惯名称获取图标路径
function getIconPath(habitName) {
  const config = HABIT_ICONS[habitName];
  return config ? '/assets/icons/' + config.file : null;
}

// 根据习惯名称获取主题类名
function getThemeClass(habitName) {
  const config = HABIT_ICONS[habitName];
  return config ? config.theme : 't-blue';
}

// 根据习惯类别获取默认主题（备用）
function getThemeByCategory(category) {
  const themeMap = {
    '运动类': 't-green',
    '理疗类': 't-red',
    '起居类': 't-yellow',
    '自定义': 't-purple'
  };
  return themeMap[category] || 't-blue';
}

module.exports = {
  HABIT_ICONS,
  getIconConfig,
  getIconPath,
  getThemeClass,
  getThemeByCategory
};
