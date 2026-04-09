const ZIWU_DATA = [
  { id: 0, shichen: '子时', jingluo: '胆经', time: '23:00-01:00', advice: '宜入睡。胆汁推陈出新，熬夜易生暗疮。' },
  { id: 1, shichen: '丑时', jingluo: '肝经', time: '01:00-03:00', advice: '宜熟睡。肝血推陈出新，此时切忌熬夜。' },
  { id: 2, shichen: '寅时', jingluo: '肺经', time: '03:00-05:00', advice: '宜深睡。肺部将气血输送全身，醒来面色红润。' },
  { id: 3, shichen: '卯时', jingluo: '大肠经', time: '05:00-07:00', advice: '宜清肠。起床喝杯温水，排毒正当时。' },
  { id: 4, shichen: '辰时', jingluo: '胃经', time: '07:00-09:00', advice: '宜进食。吃一顿丰盛的早餐，利于消化吸收。' },
  { id: 5, shichen: '巳时', jingluo: '脾经', time: '09:00-11:00', advice: '宜饮水。脾主管运化，多喝水有助于运化营养。' },
  { id: 6, shichen: '午时', jingluo: '心经', time: '11:00-13:00', advice: '宜小憩。吃完午饭休息片刻，养心安神。' },
  { id: 7, shichen: '未时', jingluo: '小肠经', time: '13:00-15:00', advice: '宜吸收。小肠分清浊，此时可喝杯养生茶。' },
  { id: 8, shichen: '申时', jingluo: '膀胱经', time: '15:00-17:00', advice: '宜运动。多喝水，多排泄，适合做些拉伸。' },
  { id: 9, shichen: '酉时', jingluo: '肾经', time: '17:00-19:00', advice: '宜静养。肾藏精，不宜剧烈运动，适合做些舒缓动作。' },
  { id: 10, shichen: '戌时', jingluo: '心包经', time: '19:00-21:00', advice: '宜愉悦。保持心情舒畅，可阅读或散步。' },
  { id: 11, shichen: '亥时', jingluo: '三焦经', time: '21:00-23:00', advice: '夜深水气重，宜温阳。去泡个脚吧，用热度驱散一天的疲惫。' }
];

function getCurrentZiwu() {
  const now = new Date();
  const hour = now.getHours();
  let index = Math.floor((hour + 1) / 2) % 12;
  return ZIWU_DATA[index];
}

function getTimeInfo() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[now.getDay()];
  
  const ziwu = getCurrentZiwu();
  
  return {
    hour,
    minute,
    date: `${month}月${day}日 周${weekday}`,
    shichen: ziwu.shichen,
    meridian: ziwu.jingluo,
    advice: ziwu.advice
  };
}

module.exports = {
  getCurrentZiwu,
  getTimeInfo,
  ZIWU_DATA
};
