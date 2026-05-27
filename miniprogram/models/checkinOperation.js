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

// ==================== 客户端序列号（单调递增） ====================
// 用于解决同毫秒操作的排序问题，防止旧操作重试覆盖新状态
let _clientSequence = 0

/**
 * 获取下一个单调递增的客户端序列号
 * @returns {number}
 */
function nextClientSequence() {
  _clientSequence += 1
  return _clientSequence
}

/**
 * 重置序列号（仅用于测试）
 */
function resetClientSequence() {
  _clientSequence = 0
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
  // operationId 唯一的，所以拼接在一起保证每次操作唯一
  // 重试时复用同一 operationId，从而复用同一 idempotencyKey
  const idempotencyKey = `${operationId}`

  return {
    operationId,
    idempotencyKey,
    userHabitId,
    habitId,
    date,
    action,
    // 单调递增序列号，解决同毫秒操作的排序问题
    clientSequence: nextClientSequence(),
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
  createUndoOp,
  nextClientSequence,
  resetClientSequence
}