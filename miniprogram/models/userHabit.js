/**
 * userHabit.js
 * 用户习惯实例模型
 *
 * userHabit 是用户添加的每个内置习惯的生命周期实例。
 * 每次用户添加同一个内置习惯，都会生成一个新的 userHabitId。
 *
 * 重要约束：
 * - userHabitId 必须独立于 habitId，不得用 habitId 替代
 * - 同一 habitId 可以有多个活跃的 userHabit（删除后重加生成新实例）
 * - userHabit 关联 builtInHabit.habitId，不关联其他 userHabit
 * - Phase 2 只定义字段和校验，不生成真实 userHabitId
 */

const { isValidBuiltInHabitId } = require('../constants/habitLibrary.js')

/**
 * userHabit 默认字段结构（完整定义）
 */
const USER_HABIT_FIELDS = [
  'userHabitId',
  'openid',
  'habitId',
  'status',
  'isDeleted',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'latestPolicyVersionId',
  'syncStatus'
]

/**
 * userHabit 状态机
 */
const USER_HABIT_STATUS = {
  active: 'active',
  deleted: 'deleted'
}

/**
 * 验证 userHabit 状态是否有效
 * @param {string} status
 * @returns {boolean}
 */
function isValidStatus(status) {
  return Object.values(USER_HABIT_STATUS).includes(status)
}

/**
 * 验证 userHabit 对象结构
 * @param {object} habit
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateUserHabit(habit) {
  const errors = []

  if (!habit || typeof habit !== 'object') {
    return { valid: false, errors: ['habit must be a non-null object'] }
  }

  // userHabitId 必填，且应为字符串（真实生成在 Phase 3）
  if (!habit.userHabitId) {
    errors.push('userHabitId is required')
  } else if (typeof habit.userHabitId !== 'string') {
    errors.push('userHabitId must be a string')
  }

  // openid 可选（云端持久化时由云函数填入）
  if (habit.openid !== undefined && typeof habit.openid !== 'string') {
    errors.push('openid must be a string')
  }

  // habitId 必填，且必须为有效的内置习惯 ID
  if (!habit.habitId) {
    errors.push('habitId is required')
  } else if (!isValidBuiltInHabitId(habit.habitId)) {
    errors.push(`habitId "${habit.habitId}" is not a valid built-in habit ID`)
  }

  // status 必填，且必须为有效状态
  if (!habit.status) {
    errors.push('status is required')
  } else if (!isValidStatus(habit.status)) {
    errors.push(`status "${habit.status}" is invalid, must be one of: ${Object.values(USER_HABIT_STATUS).join(', ')}`)
  }

  // isDeleted 可选，需为布尔
  if (habit.isDeleted !== undefined && typeof habit.isDeleted !== 'boolean') {
    errors.push('isDeleted must be a boolean')
  }

  // createdAt 可选，需为日期字符串
  if (habit.createdAt !== undefined && typeof habit.createdAt !== 'string') {
    errors.push('createdAt must be a string')
  }

  // updatedAt 可选，需为日期字符串
  if (habit.updatedAt !== undefined && typeof habit.updatedAt !== 'string') {
    errors.push('updatedAt must be a string')
  }

  // deletedAt 可选，需为日期字符串
  if (habit.deletedAt !== undefined && habit.deletedAt !== null && typeof habit.deletedAt !== 'string') {
    errors.push('deletedAt must be a string or null')
  }

  // latestPolicyVersionId 可选
  if (habit.latestPolicyVersionId !== undefined && typeof habit.latestPolicyVersionId !== 'string') {
    errors.push('latestPolicyVersionId must be a string')
  }

  // syncStatus 可选，需为整数
  if (habit.syncStatus !== undefined && !Number.isInteger(habit.syncStatus)) {
    errors.push('syncStatus must be an integer')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 检查 userHabit 是否为活跃状态
 * @param {object} habit
 * @returns {boolean}
 */
function isActive(habit) {
  return habit && habit.status === USER_HABIT_STATUS.active
}

/**
 * 检查 userHabit 是否为已删除状态
 * @param {object} habit
 * @returns {boolean}
 */
function isDeleted(habit) {
  return habit && habit.status === USER_HABIT_STATUS.deleted
}

/**
 * 创建 userHabit 视图模型
 * @param {object} habit
 * @returns {object}
 */
function toViewModel(habit) {
  return {
    userHabitId: habit.userHabitId || '',
    openid: habit.openid || '',
    habitId: habit.habitId || '',
    status: habit.status || USER_HABIT_STATUS.active,
    isDeleted: habit.isDeleted || false,
    createdAt: habit.createdAt || '',
    updatedAt: habit.updatedAt || '',
    deletedAt: habit.deletedAt || null,
    latestPolicyVersionId: habit.latestPolicyVersionId || '',
    syncStatus: habit.syncStatus !== undefined ? habit.syncStatus : 1
  }
}

module.exports = {
  USER_HABIT_FIELDS,
  USER_HABIT_STATUS,
  isValidStatus,
  validateUserHabit,
  isActive,
  isDeleted,
  toViewModel
}