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
 * userHabit 默认字段结构
 */
const USER_HABIT_FIELDS = [
  'userHabitId',
  'habitId',
  'status',
  'createdAt',
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

  // createdAt 可选，需为日期字符串
  if (habit.createdAt !== undefined && typeof habit.createdAt !== 'string') {
    errors.push('createdAt must be a string')
  }

  // latestPolicyVersionId 可选
  if (habit.latestPolicyVersionId !== undefined && typeof habit.latestPolicyVersionId !== 'string') {
    errors.push('latestPolicyVersionId must be a string')
  }

  // syncStatus 可选，需为整数
  if (habit.syncStatus !== undefined) {
    if (!Number.isInteger(habit.syncStatus)) {
      errors.push('syncStatus must be an integer')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 创建 userHabit 默认对象（Phase 2 不生成真实 userHabitId）
 * @param {string} habitId
 * @param {object} overrides
 * @returns {object}
 */
function createDefaultUserHabit(habitId, overrides = {}) {
  return {
    habitId: String(habitId),
    status: USER_HABIT_STATUS.active,
    createdAt: '',
    latestPolicyVersionId: '',
    syncStatus: 1,
    ...overrides
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
    habitId: habit.habitId || '',
    status: habit.status || USER_HABIT_STATUS.active,
    createdAt: habit.createdAt || '',
    latestPolicyVersionId: habit.latestPolicyVersionId || '',
    syncStatus: habit.syncStatus !== undefined ? habit.syncStatus : 1
  }
}

module.exports = {
  USER_HABIT_FIELDS,
  USER_HABIT_STATUS,
  isValidStatus,
  validateUserHabit,
  createDefaultUserHabit,
  isActive,
  isDeleted,
  toViewModel
}