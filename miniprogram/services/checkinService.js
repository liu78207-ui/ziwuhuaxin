/**
 * services/checkinService.js
 * 打卡服务层（纯本地，不含云同步）
 *
 * Phase 3B: 负责 checkin/undoCheckin/DailyCheckinState 管理
 * 不调用 wx.cloud.callFunction，pendingOperations 由 Phase 4 syncService 消费
 */

const { createCheckinOp, createUndoOp, OPERATION_ACTION } = require('../models/checkinOperation')
const { DAILY_STATE_STATUS, createCheckedState, createCanceledState } = require('../models/dailyCheckinState')
const storageService = require('./storageService')
const habitService = require('./habitService')
const syncService = require('./syncService')

/**
 * 打卡
 * @param {string} userHabitId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<object>} DailyCheckinState
 */
async function checkin(userHabitId, date) {
  // 1. 幂等检查
  const existingState = storageService.getDailyState(userHabitId, date)
  if (existingState && existingState.status === DAILY_STATE_STATUS.checked) {
    return existingState
  }

  // 2. 获取 habitInfo
  const habit = habitService.getHabitByUserHabitId(userHabitId)
  if (!habit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }
  if (habit.status !== 'active') {
    throw new Error(`UserHabit is not active: ${userHabitId}`)
  }

  // 3. 创建 operation
  const operation = createCheckinOp(userHabitId, habit.habitId, date)

  // 4. 保存 operation
  storageService.saveCheckinOperation(operation)

  // 5. 创建/更新 DailyCheckinState
  const state = createCheckedState(userHabitId, habit.habitId, date, operation.operationId)
  storageService.setDailyState(state)

  // 6. 进入 pending 队列，等待云端同步（Phase 4）
  // action 字段明确传递给云函数，用于更新 daily_checkin_states
  // clientCreatedAt 用于云端判断操作顺序，防止旧操作重试覆盖新状态
  syncService.pushWithDedup('checkin', 'checkin', {
    userHabitId,
    habitId: habit.habitId,
    date,
    policyVersionId: habit.latestPolicyVersionId,
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    action: 'checkin',
    clientCreatedAt: operation.createdAt
  })

  return state
}

/**
 * 取消打卡
 * @param {string} userHabitId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<object>} DailyCheckinState
 */
async function undoCheckin(userHabitId, date) {
  // 1. 幂等检查
  const existingState = storageService.getDailyState(userHabitId, date)
  if (existingState && existingState.status === DAILY_STATE_STATUS.canceled) {
    return existingState
  }

  // 2. 获取 habitInfo
  const habit = habitService.getHabitByUserHabitId(userHabitId)
  if (!habit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }

  // 3. 如果没有 state，先创建一个 unchecked 记录（用于占位）
  if (!existingState) {
    const { createDailyCheckinState } = require('../models/dailyCheckinState')
    const placeholder = createDailyCheckinState({
      userHabitId,
      habitId: habit.habitId,
      date,
      status: DAILY_STATE_STATUS.unchecked
    })
    storageService.setDailyState(placeholder)
  }

  // 4. 创建 operation
  const operation = createUndoOp(userHabitId, habit.habitId, date)

  // 5. 保存 operation
  storageService.saveCheckinOperation(operation)

  // 6. 更新 DailyCheckinState
  const state = createCanceledState(userHabitId, habit.habitId, date, operation.operationId)
  storageService.setDailyState(state)

  // 7. 进入 pending 队列，等待云端同步（Phase 4）
  // action 字段明确传递给云函数，用于更新 daily_checkin_states
  // clientCreatedAt 用于云端判断操作顺序，防止旧操作重试覆盖新状态
  syncService.pushWithDedup('checkin', 'undoCheckin', {
    userHabitId,
    habitId: habit.habitId,
    date,
    policyVersionId: habit.latestPolicyVersionId,
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    action: 'undo',
    clientCreatedAt: operation.createdAt
  })

  return state
}

/**
 * 切换打卡状态（已打卡 -> 取消；未打卡 -> 已打卡）
 * @param {string} userHabitId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<object>} DailyCheckinState
 */
async function toggleCheckin(userHabitId, date) {
  const currentState = storageService.getDailyState(userHabitId, date)

  if (currentState && currentState.status === DAILY_STATE_STATUS.checked) {
    return undoCheckin(userHabitId, date)
  } else {
    return checkin(userHabitId, date)
  }
}

/**
 * 获取当日状态（单个习惯）
 * @param {string} userHabitId
 * @param {string} date
 * @returns {object|null}
 */
function getDailyState(userHabitId, date) {
  return storageService.getDailyState(userHabitId, date)
}

/**
 * 获取当日状态（所有习惯）
 * @param {string} date
 * @returns {object[]}
 */
function getDailyStatesByDate(date) {
  return storageService.getDailyStatesByDate(date)
}

/**
 * 获取某日期范围的状态
 * @param {string} startDate
 * @param {string} endDate
 * @returns {object[]}
 */
function getDailyStatesByRange(startDate, endDate) {
  const allStates = storageService.getDailyCheckinStates()
  return allStates.filter(s => s.date >= startDate && s.date <= endDate)
}

/**
 * 获取打卡操作历史
 * @param {string} userHabitId
 * @param {string} date
 * @returns {object[]}
 */
function getCheckinHistory(userHabitId, date) {
  const operations = storageService.getCheckinOperationsByUserHabitId(userHabitId)
  return operations.filter(op => op.date === date)
}

module.exports = {
  checkin,
  undoCheckin,
  toggleCheckin,
  getDailyState,
  getDailyStatesByDate,
  getDailyStatesByRange,
  getCheckinHistory
}