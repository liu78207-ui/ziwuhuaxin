/**
 * builtInHabit.js
 * 内置习惯模型
 *
 * builtInHabit 是固定 21 个的内置习惯定义，habitId 不可变。
 * 用于：
 * - 习惯库展示
 * - 用户添加习惯时引用
 * - 报表按 habitId 聚合（但生命周期以 userHabitId 为边界）
 */

const { isValidBuiltInHabitId, getBuiltInHabit } = require('../constants/habitLibrary.js')

/**
 * builtInHabit 默认字段结构
 */
const BUILT_IN_HABIT_FIELDS = [
  'habitId',
  'name',
  'category',
  'description',
  'defaultDuration',
  'defaultFrequency',
  'defaultTheme',
  'sortOrder',
  'enabled'
]

/**
 * 验证 builtInHabit 对象结构
 * @param {object} habit
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateBuiltInHabit(habit) {
  const errors = []

  if (!habit || typeof habit !== 'object') {
    return { valid: false, errors: ['habit must be a non-null object'] }
  }

  // habitId 必填，且必须为有效的内置习惯 ID
  if (!habit.habitId) {
    errors.push('habitId is required')
  } else if (!isValidBuiltInHabitId(habit.habitId)) {
    errors.push(`habitId "${habit.habitId}" is not a valid built-in habit ID`)
  }

  // name 必填
  if (!habit.name || typeof habit.name !== 'string') {
    errors.push('name is required and must be a string')
  }

  // category 必填
  if (!habit.category || typeof habit.category !== 'string') {
    errors.push('category is required and must be a string')
  }

  // defaultDuration 可选，需为正数
  if (habit.defaultDuration !== undefined) {
    if (typeof habit.defaultDuration !== 'number' || habit.defaultDuration <= 0) {
      errors.push('defaultDuration must be a positive number')
    }
  }

  // defaultFrequency 可选
  if (habit.defaultFrequency !== undefined && typeof habit.defaultFrequency !== 'string') {
    errors.push('defaultFrequency must be a string')
  }

  // defaultTheme 可选
  if (habit.defaultTheme !== undefined && typeof habit.defaultTheme !== 'string') {
    errors.push('defaultTheme must be a string')
  }

  // sortOrder 可选，需为正整数
  if (habit.sortOrder !== undefined) {
    if (!Number.isInteger(habit.sortOrder) || habit.sortOrder < 0) {
      errors.push('sortOrder must be a non-negative integer')
    }
  }

  // enabled 可选，需为布尔
  if (habit.enabled !== undefined && typeof habit.enabled !== 'boolean') {
    errors.push('enabled must be a boolean')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 从 habitLibrary 获取完整的 builtInHabit 定义
 * @param {string} habitId
 * @returns {object|null}
 */
function getBuiltInHabitDef(habitId) {
  return getBuiltInHabit(habitId)
}

/**
 * 创建 builtInHabit 视图模型（不含 internal 字段）
 * @param {object} habit
 * @returns {object}
 */
function toViewModel(habit) {
  return {
    habitId: habit.habitId,
    name: habit.name,
    category: habit.category,
    description: habit.description || '',
    defaultDuration: habit.defaultDuration || 15,
    defaultFrequency: habit.defaultFrequency || 'daily',
    defaultTheme: habit.defaultTheme || 'sports',
    sortOrder: habit.sortOrder || 0,
    enabled: habit.enabled !== false
  }
}

/**
 * 检查是否为有效的 habitId 字符串
 * @param {string} habitId
 * @returns {boolean}
 */
function isHabitIdString(habitId) {
  return typeof habitId === 'string' && /^\d+$/.test(habitId) && isValidBuiltInHabitId(habitId)
}

module.exports = {
  BUILT_IN_HABIT_FIELDS,
  validateBuiltInHabit,
  getBuiltInHabitDef,
  toViewModel,
  isHabitIdString
}