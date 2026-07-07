// constants/idPrefixes.js
// ID 前缀常量

const ID_PREFIXES = {
  USER_HABIT: 'uh_',           // 用户习惯实例 ID
  CUSTOM_HABIT: 'custom_',     // 自定义习惯目录 ID
  POLICY_VERSION: 'pv_',        // 策略版本 ID
  CHECKIN_OPERATION: 'op_',    // 打卡操作 ID
  DAILY_STATE: 'ds_',          // 每日状态 ID
  LOG: 'L_'                    // 打卡日志 ID（已有）
}

/**
 * 生成带前缀的 ID
 * @param {string} prefix - 前缀
 * @param {string} habitId - 内置习惯 ID（可选）
 * @returns {string} 格式：prefix{habitId}_{timestamp}_{random}
 */
function generatePrefixedId(prefix, habitId) {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 4)
  if (habitId !== undefined) {
    return `${prefix}${habitId}_${timestamp}_${random}`
  }
  return `${prefix}${timestamp}_${random}`
}

/**
 * 生成 userHabitId
 * @param {string} habitId - 内置习惯 ID
 * @returns {string}
 */
function generateUserHabitId(habitId) {
  return generatePrefixedId(ID_PREFIXES.USER_HABIT, habitId)
}

/**
 * 生成自定义 habitId
 * @returns {string}
 */
function generateCustomHabitId() {
  return generatePrefixedId(ID_PREFIXES.CUSTOM_HABIT)
}

/**
 * 生成 policyVersionId
 * @param {string} habitId - 内置习惯 ID
 * @returns {string}
 */
function generatePolicyVersionId(habitId) {
  return generatePrefixedId(ID_PREFIXES.POLICY_VERSION, habitId)
}

/**
 * 生成 operationId
 * @param {string} habitId - 内置习惯 ID
 * @returns {string}
 */
function generateOperationId(habitId) {
  return generatePrefixedId(ID_PREFIXES.CHECKIN_OPERATION, habitId)
}

/**
 * 生成 stateId
 * @param {string} habitId - 内置习惯 ID
 * @returns {string}
 */
function generateStateId(habitId) {
  return generatePrefixedId(ID_PREFIXES.DAILY_STATE, habitId)
}

module.exports = {
  ID_PREFIXES,
  generatePrefixedId,
  generateCustomHabitId,
  generateUserHabitId,
  generatePolicyVersionId,
  generateOperationId,
  generateStateId
}
