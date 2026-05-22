// constants/frequencyTypes.js
// 频率类型常量

const FREQ_TYPES = {
  DAILY: 'daily',       // 每天
  INTERVAL: 'interval',  // 间隔天数
  WEEKLY: 'weekly'       // 每周固定
}

const FREQ_LABELS = {
  daily: '每天',
  interval: '间隔天',
  weekly: '每周'
}

const DEFAULT_FREQ_TYPE = FREQ_TYPES.DAILY

module.exports = {
  FREQ_TYPES,
  FREQ_LABELS,
  DEFAULT_FREQ_TYPE
}