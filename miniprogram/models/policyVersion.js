/**
 * policyVersion.js
 * 策略版本模型
 *
 * policyVersion 是某个 userHabit 的策略版本记录。
 *
 * 重要约束：
 * - policyVersion 必须归属 userHabitId（必填），不得只靠 habitId 归属
 * - habitId 仅作为内置习惯引用和报表聚合辅助字段
 * - 同一 userHabitId 下，策略版本的有效时间段不得重叠（业务约束，Phase 2 不实现校验）
 * - Phase 2 只定义字段和校验，不生成真实 policyVersionId
 */

const { isValidBuiltInHabitId } = require('../constants/habitLibrary.js')
const { isValidStatus: isUserHabitValidStatus } = require('./userHabit.js')

/**
 * policyVersion 默认字段结构
 */
const POLICY_VERSION_FIELDS = [
  'policyVersionId',
  'userHabitId',
  'habitId',
  'duration',
  'frequencyType',
  'frequencyConfig',
  'startDate',
  'effectiveStartDate',
  'effectiveEndDate',
  'syncStatus'
]

/**
 * 频率类型枚举
 */
const FREQUENCY_TYPES = {
  daily: 'daily',       // 每天
  interval: 'interval', // 间隔天数
  weekly: 'weekly'       // 每周固定
}

/**
 * 验证频率类型是否有效
 * @param {string} type
 * @returns {boolean}
 */
function isValidFrequencyType(type) {
  return Object.values(FREQUENCY_TYPES).includes(type)
}

/**
 * 验证 frequencyConfig 结构
 * @param {object} config
 * @param {string} frequencyType
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateFrequencyConfig(config, frequencyType) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['frequencyConfig must be an object'] }
  }

  if (frequencyType === FREQUENCY_TYPES.interval) {
    if (!config.intervalDays || typeof config.intervalDays !== 'number' || config.intervalDays < 1) {
      errors.push('intervalDays is required and must be a positive number for interval frequency')
    }
  }

  if (frequencyType === FREQUENCY_TYPES.weekly) {
    if (!Array.isArray(config.weekdays) || config.weekdays.length === 0) {
      errors.push('weekdays is required and must be a non-empty array for weekly frequency')
    } else if (!config.weekdays.every(d => typeof d === 'number' && d >= 1 && d <= 7)) {
      errors.push('weekdays must be an array of integers between 1 (Monday) and 7 (Sunday)')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 验证 policyVersion 对象结构
 * @param {object} version
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validatePolicyVersion(version) {
  const errors = []

  if (!version || typeof version !== 'object') {
    return { valid: false, errors: ['version must be a non-null object'] }
  }

  // policyVersionId 必填，且应为字符串（真实生成在 Phase 3）
  if (!version.policyVersionId) {
    errors.push('policyVersionId is required')
  } else if (typeof version.policyVersionId !== 'string') {
    errors.push('policyVersionId must be a string')
  }

  // userHabitId 必填（关键约束）
  if (!version.userHabitId) {
    errors.push('userHabitId is required - policyVersion must belong to a userHabit, not just habitId')
  } else if (typeof version.userHabitId !== 'string') {
    errors.push('userHabitId must be a string')
  }

  // habitId 必填，且必须为有效的内置习惯 ID
  if (!version.habitId) {
    errors.push('habitId is required')
  } else if (!isValidBuiltInHabitId(version.habitId)) {
    errors.push(`habitId "${version.habitId}" is not a valid built-in habit ID`)
  }

  // duration 可选，需为正数
  if (version.duration !== undefined) {
    if (typeof version.duration !== 'number' || version.duration <= 0) {
      errors.push('duration must be a positive number')
    }
  }

  // frequencyType 可选，需为有效枚举
  if (version.frequencyType !== undefined) {
    if (!isValidFrequencyType(version.frequencyType)) {
      errors.push(`frequencyType "${version.frequencyType}" is invalid, must be one of: ${Object.values(FREQUENCY_TYPES).join(', ')}`)
    }
  }

  // frequencyConfig 可选，需通过结构校验
  if (version.frequencyConfig !== undefined) {
    const configValidation = validateFrequencyConfig(version.frequencyConfig, version.frequencyType || FREQUENCY_TYPES.daily)
    if (!configValidation.valid) {
      errors.push(...configValidation.errors.map(e => `frequencyConfig: ${e}`))
    }
  }

  // startDate 可选，需为日期字符串
  if (version.startDate !== undefined && typeof version.startDate !== 'string') {
    errors.push('startDate must be a string')
  }

  // effectiveStartDate 可选，需为日期字符串
  if (version.effectiveStartDate !== undefined && typeof version.effectiveStartDate !== 'string') {
    errors.push('effectiveStartDate must be a string')
  }

  // effectiveEndDate 可选，为 null 表示当前有效
  if (version.effectiveEndDate !== undefined && version.effectiveEndDate !== null && typeof version.effectiveEndDate !== 'string') {
    errors.push('effectiveEndDate must be a string or null')
  }

  // syncStatus 可选，需为整数
  if (version.syncStatus !== undefined && !Number.isInteger(version.syncStatus)) {
    errors.push('syncStatus must be an integer')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 创建 policyVersion 默认对象（Phase 2 不生成真实 policyVersionId）
 * @param {string} userHabitId
 * @param {string} habitId
 * @param {object} overrides
 * @returns {object}
 */
function createDefaultPolicyVersion(userHabitId, habitId, overrides = {}) {
  return {
    userHabitId: String(userHabitId),
    habitId: String(habitId),
    duration: 20,
    frequencyType: FREQUENCY_TYPES.daily,
    frequencyConfig: { intervalDays: 1 },
    startDate: '',
    effectiveStartDate: '',
    effectiveEndDate: null,
    syncStatus: 1,
    ...overrides
  }
}

/**
 * 检查 policyVersion 是否为当前有效
 * @param {object} version
 * @returns {boolean}
 */
function isEffective(version) {
  if (!version) return false
  if (version.effectiveEndDate === null) return true
  // 如果有 effectiveEndDate，需判断是否在有效期内
  // 此处仅做基础判断，具体日期比较由 timeService 处理
  return true
}

/**
 * 创建 policyVersion 视图模型
 * @param {object} version
 * @returns {object}
 */
function toViewModel(version) {
  return {
    policyVersionId: version.policyVersionId || '',
    userHabitId: version.userHabitId || '',
    habitId: version.habitId || '',
    duration: version.duration || 20,
    frequencyType: version.frequencyType || FREQUENCY_TYPES.daily,
    frequencyConfig: version.frequencyConfig || { intervalDays: 1 },
    startDate: version.startDate || '',
    effectiveStartDate: version.effectiveStartDate || '',
    effectiveEndDate: version.effectiveEndDate || null,
    syncStatus: version.syncStatus !== undefined ? version.syncStatus : 1
  }
}

module.exports = {
  POLICY_VERSION_FIELDS,
  FREQUENCY_TYPES,
  isValidFrequencyType,
  validateFrequencyConfig,
  validatePolicyVersion,
  createDefaultPolicyVersion,
  isEffective,
  toViewModel
}