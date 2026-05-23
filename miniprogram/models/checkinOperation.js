/**
 * models/checkinOperation.js
 * 打卡操作流水模型
 *
 * Phase 3B: 纯本地操作记录，不涉及云同步
 */

const { generateOperationId } = require('../constants/idPrefixes')

/**
 * checkinOperation 状态机
 */
const OPERATION_STATUS = {
  pending: 0,    // 待同步
  synced: 1,       // 已同步
  failed: 2       // 同步失败
}

/**
 * checkinOperation action 类型
 */
const OPERATION_ACTION = {
  checkin: 'checkin',
  undo: 'undo'
}

/**
 * 验证 operation 对象结构
 * @param {object} op
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateCheckinOperation(op) {
  const errors = []

  if (!op || typeof op !== 'object') {
    return { valid: false, errors: ['operation must be a non-null object'] }
  }

  if (!op.operationId) {
    errors.push('operationId is required')
  }

  if (!op.idempotencyKey) {
    errors.push('idempotencyKey is required')
  }

  if (!op.userHabitId) {
    errors.push('userHabitId is required')
  }

  if (!op.habitId) {
    errors.push('habitId is required')
  }

  if (!op.date) {
    errors.push('date is required')
  }

  if (!op.action) {
    errors.push('action is required')
  } else if (!Object.values(OPERATION_ACTION).includes(op.action)) {
    errors.push(`action must be one of: ${Object.values(OPERATION_ACTION).join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 创建 checkinOperation
 * @param {object} params
 * @returns {object}
 */
function createCheckinOperation({ userHabitId, habitId, date, action }) {
  const operationId = generateOperationId(habitId)
  const idempotencyKey = `${userHabitId}_${date}_${action}`

  return {
    operationId,
    idempotencyKey,
    userHabitId,
    habitId,
    date,
    action,
    syncStatus: OPERATION_STATUS.pending,
    createdAt: new Date().toISOString()
  }
}

/**
 * 创建打卡 operation
 */
function createCheckinOp(userHabitId, habitId, date) {
  return createCheckinOperation({ userHabitId, habitId, date, action: OPERATION_ACTION.checkin })
}

/**
 * 创建取消打卡 operation
 */
function createUndoOp(userHabitId, habitId, date) {
  return createCheckinOperation({ userHabitId, habitId, date, action: OPERATION_ACTION.undo })
}

module.exports = {
  OPERATION_STATUS,
  OPERATION_ACTION,
  validateCheckinOperation,
  createCheckinOperation,
  createCheckinOp,
  createUndoOp
}