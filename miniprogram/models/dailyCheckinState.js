/**
 * models/dailyCheckinState.js
 * 每日最终状态模型
 *
 * Phase 3B: 纯本地状态，不涉及云端
 * 本阶段只实现 checked / canceled / unchecked 三个状态
 */

const { generateStateId } = require('../constants/idPrefixes')

/**
 * dailyCheckinState 状态枚举
 * 本阶段只实现这三个状态，not_required 等作为预留
 */
const DAILY_STATE_STATUS = {
  unchecked: 'unchecked',       // 未打卡（默认）
  checked: 'checked',            // 已打卡
  canceled: 'canceled',          // 已取消
  not_required: 'not_required', // 不应修
  // locked: 'locked'              // 锁定
}

/**
 * 验证 dailyCheckinState 对象结构
 * @param {object} state
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateDailyCheckinState(state) {
  const errors = []

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['state must be a non-null object'] }
  }

  if (!state.stateId) {
    errors.push('stateId is required')
  }

  if (!state.userHabitId) {
    errors.push('userHabitId is required')
  }

  if (!state.habitId) {
    errors.push('habitId is required')
  }

  if (!state.date) {
    errors.push('date is required')
  }

  if (!state.status) {
    errors.push('status is required')
  } else if (!Object.values(DAILY_STATE_STATUS).includes(state.status)) {
    errors.push(`status must be one of: ${Object.values(DAILY_STATE_STATUS).join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 创建 DailyCheckinState
 * @param {object} params
 * @returns {object}
 */
function createDailyCheckinState({ userHabitId, habitId, date, status }) {
  const stateId = generateStateId(habitId)
  const now = new Date().toISOString()

  return {
    stateId,
    userHabitId,
    habitId,
    date,
    status: status || DAILY_STATE_STATUS.unchecked,
    checkedAt: status === DAILY_STATE_STATUS.checked ? now : null,
    canceledAt: status === DAILY_STATE_STATUS.canceled ? now : null,
    lastOperationId: null,
    lastServerOperationId: null,
    serverRevision: 0,
    syncStatus: 0, // 0=待同步, 1=已同步
    updatedAt: now
  }
}

/**
 * 创建 checked 状态
 */
function createCheckedState(userHabitId, habitId, date, operationId) {
  const state = createDailyCheckinState({ userHabitId, habitId, date, status: DAILY_STATE_STATUS.checked })
  state.lastOperationId = operationId
  return state
}

/**
 * 创建 canceled 状态
 */
function createCanceledState(userHabitId, habitId, date, operationId) {
  const state = createDailyCheckinState({ userHabitId, habitId, date, status: DAILY_STATE_STATUS.canceled })
  state.lastOperationId = operationId
  return state
}

/**
 * 检查状态是否为 checked
 */
function isChecked(state) {
  return state && state.status === DAILY_STATE_STATUS.checked
}

/**
 * 检查状态是否为 canceled
 */
function isCanceled(state) {
  return state && state.status === DAILY_STATE_STATUS.canceled
}

module.exports = {
  DAILY_STATE_STATUS,
  validateDailyCheckinState,
  createDailyCheckinState,
  createCheckedState,
  createCanceledState,
  isChecked,
  isCanceled
}
