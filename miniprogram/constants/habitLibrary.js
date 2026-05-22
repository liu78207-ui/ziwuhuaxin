/**
 * habitLibrary.js
 * 21个内置习惯常量定义
 *
 * 字段映射（旧字段 -> 新模型规范）：
 *   _id            -> habitId
 *   title          -> name
 *   default_duration -> defaultDuration
 *   category       -> category（保持不变）
 *   description    -> description（保持不变）
 *
 * habitId 固定为字符串 '1' 到 '21'，不可变，不重排。
 */

const { habitThemes } = require('./habitThemes.js')

const HABIT_LIBRARY = [
  // 运动类 (habitId 1-11)
  {
    habitId: '1',
    name: '金刚功',
    category: '运动类',
    description: '道家养生功法，强身健体',
    defaultDuration: 15,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 1,
    enabled: true
  },
  {
    habitId: '2',
    name: '站桩',
    category: '运动类',
    description: '静心养气，固本培元',
    defaultDuration: 20,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 2,
    enabled: true
  },
  {
    habitId: '3',
    name: '八段锦',
    category: '运动类',
    description: '传统养生功法，强身健体',
    defaultDuration: 15,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 3,
    enabled: true
  },
  {
    habitId: '4',
    name: '五禽戏',
    category: '运动类',
    description: '模仿五禽动作，舒筋活络',
    defaultDuration: 20,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 4,
    enabled: true
  },
  {
    habitId: '5',
    name: '太极拳',
    category: '运动类',
    description: '舒缓柔和，调和气血',
    defaultDuration: 30,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 5,
    enabled: true
  },
  {
    habitId: '6',
    name: '快走',
    category: '运动类',
    description: '有氧运动，促进代谢',
    defaultDuration: 30,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 6,
    enabled: true
  },
  {
    habitId: '7',
    name: '瑜伽',
    category: '运动类',
    description: '身心合一，柔韧身体',
    defaultDuration: 45,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 7,
    enabled: true
  },
  {
    habitId: '8',
    name: '普拉提',
    category: '运动类',
    description: '核心训练，塑形美体',
    defaultDuration: 40,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 8,
    enabled: true
  },
  {
    habitId: '9',
    name: '游泳',
    category: '运动类',
    description: '全身运动，增强心肺',
    defaultDuration: 45,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 9,
    enabled: true
  },
  {
    habitId: '10',
    name: '跑步',
    category: '运动类',
    description: '有氧运动，释放压力',
    defaultDuration: 30,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 10,
    enabled: true
  },
  {
    habitId: '11',
    name: '跳绳',
    category: '运动类',
    description: '简单高效，燃脂塑形',
    defaultDuration: 15,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.sports,
    sortOrder: 11,
    enabled: true
  },

  // 理疗类 (habitId 12-16)
  {
    habitId: '12',
    name: '艾灸',
    category: '理疗类',
    description: '温阳散寒，提升免疫力',
    defaultDuration: 30,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.therapy,
    sortOrder: 12,
    enabled: true
  },
  {
    habitId: '13',
    name: '刮痧',
    category: '理疗类',
    description: '活血化瘀，排毒养颜',
    defaultDuration: 20,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.therapy,
    sortOrder: 13,
    enabled: true
  },
  {
    habitId: '14',
    name: '拔罐',
    category: '理疗类',
    description: '疏通经络，祛湿排毒',
    defaultDuration: 15,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.therapy,
    sortOrder: 14,
    enabled: true
  },
  {
    habitId: '15',
    name: '推拿',
    category: '理疗类',
    description: '放松肌肉，缓解疲劳',
    defaultDuration: 30,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.therapy,
    sortOrder: 15,
    enabled: true
  },
  {
    habitId: '16',
    name: '经络拍打',
    category: '理疗类',
    description: '疏通经络，促进循环',
    defaultDuration: 15,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.therapy,
    sortOrder: 16,
    enabled: true
  },

  // 起居类 (habitId 17-21)
  {
    habitId: '17',
    name: '晨起温水',
    category: '起居类',
    description: '清肠排毒，唤醒身体',
    defaultDuration: 5,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.daily,
    sortOrder: 17,
    enabled: true
  },
  {
    habitId: '18',
    name: '梳头',
    category: '起居类',
    description: '疏通头部经络，提神醒脑',
    defaultDuration: 5,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.daily,
    sortOrder: 18,
    enabled: true
  },
  {
    habitId: '19',
    name: '叩齿',
    category: '起居类',
    description: '固肾健齿，生津养咽',
    defaultDuration: 5,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.daily,
    sortOrder: 19,
    enabled: true
  },
  {
    habitId: '20',
    name: '揉腹',
    category: '起居类',
    description: '调理脾胃，促进消化',
    defaultDuration: 10,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.daily,
    sortOrder: 20,
    enabled: true
  },
  {
    habitId: '21',
    name: '睡前泡脚',
    category: '起居类',
    description: '活血通络，促进睡眠',
    defaultDuration: 20,
    defaultFrequency: 'daily',
    defaultTheme: habitThemes.daily,
    sortOrder: 21,
    enabled: true
  }
]

/**
 * 根据 habitId 获取内置习惯定义
 * @param {string} habitId
 * @returns {object|null}
 */
function getBuiltInHabit(habitId) {
  return HABIT_LIBRARY.find(h => h.habitId === String(habitId)) || null
}

/**
 * 获取所有内置习惯（返回浅拷贝，防止外部修改）
 * @returns {Array}
 */
function getAllBuiltInHabits() {
  return HABIT_LIBRARY.map(h => ({ ...h }))
}

/**
 * 按 category 获取内置习惯
 * @param {string} category
 * @returns {Array}
 */
function getBuiltInHabitsByCategory(category) {
  return HABIT_LIBRARY.filter(h => h.category === category)
}

/**
 * 获取所有启用的内置习惯
 * @returns {Array}
 */
function getEnabledBuiltInHabits() {
  return HABIT_LIBRARY.filter(h => h.enabled)
}

/**
 * 验证 habitId 是否为有效的内置习惯 ID
 * @param {string} habitId
 * @returns {boolean}
 */
function isValidBuiltInHabitId(habitId) {
  return HABIT_LIBRARY.some(h => h.habitId === String(habitId))
}

/**
 * 获取内置习惯数量
 * @returns {number}
 */
function getBuiltInHabitCount() {
  return HABIT_LIBRARY.length
}

module.exports = {
  HABIT_LIBRARY,
  getBuiltInHabit,
  getAllBuiltInHabits,
  getBuiltInHabitsByCategory,
  getEnabledBuiltInHabits,
  isValidBuiltInHabitId,
  getBuiltInHabitCount
}