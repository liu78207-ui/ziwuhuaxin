/**
 * services/habitService.js
 * 习惯服务层
 *
 * Phase 3A: 负责 userHabitId 生成、用户习惯实例 CRUD、策略版本管理
 * Phase 6B: 负责习惯列表展示模型构建、策略文本生成、日期计算辅助
 */

const { getBuiltInHabit, getAllBuiltInHabits, isValidBuiltInHabitId } = require('../constants/habitLibrary')
const { generateCustomHabitId, generateUserHabitId, generatePolicyVersionId } = require('../constants/idPrefixes')
const storageService = require('./storageService')
const timeService = require('./timeService')
const syncService = require('./syncService')
const cloudService = require('./cloudService')
const eventBus = require('./eventBus')
const reportAggregator = require('./reportAggregator')
const { DAILY_STATE_STATUS, createDailyCheckinState } = require('../models/dailyCheckinState')

const HABIT_SOURCE = {
  system: 'system',
  custom: 'custom'
}

const CUSTOM_CATEGORY = '自定义'
const CUSTOM_THEME_CLASS = 't-purple'
const CUSTOM_ICON_URL = '/assets/icons/habit-zidingyi.png'
const CUSTOM_DEFAULT_DURATION = 20
const CUSTOM_NAME_MIN_LENGTH = 2
const CUSTOM_NAME_MAX_LENGTH = 12
const CUSTOM_HABIT_LIBRARY_LIMIT = 12
const CUSTOM_ACTIVE_HABIT_LIMIT = 5

function bumpDataVersions() {
  if (typeof storageService.bumpDataVersions === 'function') {
    storageService.bumpDataVersions()
  }
}

function schedulePendingAfterLocalWrite() {
  if (typeof syncService.requestProcessQueue === 'function') {
    syncService.requestProcessQueue()
    return
  }
  if (typeof syncService.processQueue !== 'function') return
  try {
    syncService.processQueue().catch(e => {
      console.warn('habitService flush pending failed:', e && e.message ? e.message : String(e || 'unknown error'))
    })
  } catch (e) {
    console.warn('habitService flush pending failed:', e && e.message ? e.message : String(e || 'unknown error'))
  }
}

function emitHabitUpdated(action, payload = {}) {
  eventBus.emit('habit:updated', {
    action,
    userHabitId: payload.userHabitId || '',
    habitId: payload.habitId || '',
    policyVersionId: payload.policyVersionId || '',
    date: payload.date || timeService.getBusinessDate()
  })
  eventBus.emit('report:updated', {
    source: 'habit',
    action,
    userHabitId: payload.userHabitId || '',
    habitId: payload.habitId || '',
    date: payload.date || timeService.getBusinessDate()
  })
}

function emitHabitPreferenceUpdated(action, habit) {
  emitHabitUpdated(action, {
    userHabitId: habit.userHabitId,
    habitId: habit.habitId,
    policyVersionId: habit.latestPolicyVersionId || ''
  })
}

function getPinnedAtValue() {
  return timeService.getNow().toISOString()
}

function getAddedAtValue() {
  return timeService.getNow().toISOString()
}

function normalizeCustomHabitName(value) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CUSTOM_NAME_MAX_LENGTH)
}

function getCustomHabitRawName(userHabit) {
  return userHabit?.name || userHabit?.title || userHabit?.habitTitle || userHabit?.habit_title || ''
}

function getCustomHabitNormalizedName(userHabit) {
  return normalizeCustomHabitName(getCustomHabitRawName(userHabit))
}

function hasValidCustomHabitName(userHabit) {
  return getCustomHabitNormalizedName(userHabit).length > 0
}

function validateCustomHabitName(value) {
  const name = normalizeCustomHabitName(value)
  if (name.length < CUSTOM_NAME_MIN_LENGTH) {
    throw new Error('CUSTOM_HABIT_NAME_TOO_SHORT')
  }
  if (name.length > CUSTOM_NAME_MAX_LENGTH) {
    throw new Error('CUSTOM_HABIT_NAME_TOO_LONG')
  }
  return name
}

function normalizeCustomRemark(value) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function isCustomHabit(userHabit) {
  return userHabit && (userHabit.source === HABIT_SOURCE.custom || String(userHabit.habitId || '').indexOf('custom_') === 0)
}

function getHabitDisplayMeta(userHabit) {
  if (!userHabit) {
    return {
      source: HABIT_SOURCE.system,
      name: '',
      category: '',
      themeClass: 't-blue',
      iconUrl: '',
      emoji: '养'
    }
  }

  if (isCustomHabit(userHabit)) {
    return {
      source: HABIT_SOURCE.custom,
      name: getCustomHabitNormalizedName(userHabit),
      category: userHabit.category || CUSTOM_CATEGORY,
      themeClass: userHabit.themeClass || CUSTOM_THEME_CLASS,
      iconUrl: userHabit.iconUrl || CUSTOM_ICON_URL,
      emoji: userHabit.emoji || '养',
      remark: userHabit.remark || ''
    }
  }

  const builtIn = getBuiltInHabitDef(userHabit.habitId) || {}
  return {
    source: userHabit.source || HABIT_SOURCE.system,
    name: builtIn.name || userHabit.name || userHabit.title || userHabit.habitTitle || userHabit.habit_title || '',
    category: builtIn.category || userHabit.category || '',
    themeClass: userHabit.themeClass || builtIn.themeClass || '',
    iconUrl: userHabit.iconUrl || '',
    emoji: userHabit.emoji || ''
  }
}

function findCustomHabitByName(name, options = {}) {
  const normalizedName = normalizeCustomHabitName(name)
  if (!normalizedName) return null

  const excludeUserHabitId = options.excludeUserHabitId || ''
  const habits = storageService.getMyHabitsWithMigration()
    .filter(habit => {
      if (!isCustomHabit(habit)) return false
      if (excludeUserHabitId && habit.userHabitId === excludeUserHabitId) return false
      return getCustomHabitNormalizedName(habit) === normalizedName
    })

  const active = habits.find(habit => habit.status === 'active') || null
  if (active) {
    return {
      status: 'active',
      habit: active,
      habitId: active.habitId,
      userHabitId: active.userHabitId,
      name: normalizedName
    }
  }

  const deleted = habits
    .filter(habit => habit.status === 'deleted')
    .sort((a, b) => String(b.addedAt || b.createdAt || '').localeCompare(String(a.addedAt || a.createdAt || '')))[0] || null

  if (deleted) {
    return {
      status: 'deleted',
      habit: deleted,
      habitId: deleted.habitId,
      userHabitId: deleted.userHabitId,
      name: normalizedName
    }
  }

  return null
}

function ensureNoActiveCustomHabitName(name, options = {}) {
  const match = findCustomHabitByName(name, options)
  if (match && match.status === 'active') {
    throw new Error('CUSTOM_HABIT_NAME_DUPLICATED_ACTIVE')
  }
  return match
}

function getCustomHabitLimitSnapshot(options = {}) {
  const excludeActiveUserHabitId = options.excludeActiveUserHabitId || ''
  const habits = storageService.getMyHabitsWithMigration()
  const libraryHabitIds = new Set()
  let activeCount = 0

  habits.forEach(habit => {
    if (!isCustomHabit(habit) || !hasValidCustomHabitName(habit)) return
    if (habit.habitId) {
      libraryHabitIds.add(String(habit.habitId))
    }
    if (habit.status === 'active' && habit.userHabitId !== excludeActiveUserHabitId) {
      activeCount += 1
    }
  })

  return {
    libraryCount: libraryHabitIds.size,
    activeCount,
    libraryHabitIds
  }
}

function assertCustomHabitLimitForCreate(habitId, options = {}) {
  const targetHabitId = String(habitId || '')
  const snapshot = getCustomHabitLimitSnapshot(options)
  const willCreateLibraryEntry = targetHabitId && !snapshot.libraryHabitIds.has(targetHabitId)

  if (willCreateLibraryEntry && snapshot.libraryCount >= CUSTOM_HABIT_LIBRARY_LIMIT) {
    throw new Error('CUSTOM_HABIT_LIBRARY_LIMIT_REACHED')
  }
  if (snapshot.activeCount >= CUSTOM_ACTIVE_HABIT_LIMIT) {
    throw new Error('CUSTOM_ACTIVE_HABIT_LIMIT_REACHED')
  }
}

// ==================== 内置习惯 ====================

/**
 * 获取所有内置习惯（25个固定定义）
 * @returns {BuiltInHabit[]}
 */
function getBuiltInHabits() {
  return getAllBuiltInHabits()
}

/**
 * 获取单个内置习惯定义
 * @param {string} habitId
 * @returns {BuiltInHabit|null}
 */
function getBuiltInHabitDef(habitId) {
  return getBuiltInHabit(habitId)
}

// ==================== 用户习惯实例 CRUD ====================

/**
 * 添加习惯（生成新 userHabitId，创建首个策略版本）
 * @param {string} habitId - 内置习惯 ID
 * @param {object} policyInput - 策略配置 { duration, frequencyType, frequencyConfig, startDate }
 * @returns {Promise<UserHabit>} 新增的用户习惯实例
 */
async function addHabit(habitId, policyInput) {
  // 1. 校验 habitId
  if (!isValidBuiltInHabitId(habitId)) {
    throw new Error(`Invalid habitId: ${habitId}`)
  }

  // 2. 校验 policyInput
  const duration = policyInput.duration || 20
  const frequencyType = policyInput.frequencyType || 'daily'
  const frequencyConfig = policyInput.frequencyConfig || { intervalDays: 1 }
  const startDate = policyInput.startDate || timeService.getBusinessDate()

  // 3. 生成新的 userHabitId（不复用已删除的）
  const userHabitId = generateUserHabitId(habitId)
  const addedAt = getAddedAtValue()
  const businessDate = timeService.getBusinessDate()

  // 4. 创建 UserHabit 对象
  const userHabit = {
    userHabitId,
    habitId,
    source: HABIT_SOURCE.system,
    status: 'active',
    createdAt: businessDate,
    addedAt,
    pinnedAt: null,
    deletedAt: null,
    latestPolicyVersionId: ''
  }

  // 5. 保存到 storage（触发迁移补齐其他字段）
  const existingHabits = storageService.getMyHabitsWithMigration()
  existingHabits.push(userHabit)
  storageService.setMyHabits(existingHabits)

  // 6. 更新 migrationMeta
  const meta = storageService.getMigrationMeta()
  if (!meta.userHabitInstances) {
    meta.userHabitInstances = {}
  }
  meta.userHabitInstances[userHabitId] = {
    userHabitId,
    habitId,
    source: HABIT_SOURCE.system,
    status: 'active',
    createdAt: businessDate,
    addedAt,
    pinnedAt: null,
    deletedAt: null
  }
  storageService.setMigrationMeta(meta)

  // 7. 创建首个策略版本（skipSync=true，避免重复入队）
  const policyVersion = await createPolicyVersion(userHabitId, {
    duration,
    frequencyType,
    frequencyConfig,
    startDate
  }, { skipSync: true })

  // 8. 更新 latestPolicyVersionId
  userHabit.latestPolicyVersionId = policyVersion.policyVersionId
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index >= 0) {
    habits[index] = userHabit
    storageService.setMyHabits(habits)
  }

  // 9. 进入 pending 队列，等待云端同步（Phase 4）
  // 携带完整的 userHabit 和 policyVersion 数据，一次同步完成
  syncService.pushWithDedup('habit', 'addHabit', {
    userHabitId,
    habitId,
    source: HABIT_SOURCE.system,
    createdAt: userHabit.createdAt,
    addedAt: userHabit.addedAt,
    pinnedAt: userHabit.pinnedAt,
    policyVersionId: policyVersion.policyVersionId,
    duration: policyVersion.duration,
    frequencyType: policyVersion.frequencyType,
    frequencyConfig: policyVersion.frequencyConfig,
    startDate: policyVersion.startDate,
    idempotencyKey: `habit_${userHabitId}_add`
  })
  bumpDataVersions()
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('addHabit', {
    userHabitId,
    habitId,
    policyVersionId: policyVersion.policyVersionId,
    date: startDate
  })

  return userHabit
}

/**
 * 添加自定义习惯（生成 custom habitId 和新的 userHabitId）
 * @param {object} metaInput - { name, remark? }
 * @param {object} policyInput - 策略配置
 * @returns {Promise<UserHabit>}
 */
async function addCustomHabitInstance(habitId, metaInput = {}, policyInput = {}) {
  if (!habitId || String(habitId).indexOf('custom_') !== 0) {
    throw new Error(`Invalid custom habitId: ${habitId}`)
  }

  const name = validateCustomHabitName(metaInput.name)
  const nameMatch = ensureNoActiveCustomHabitName(name)
  if (nameMatch && nameMatch.status === 'active') {
    throw new Error('CUSTOM_HABIT_NAME_DUPLICATED_ACTIVE')
  }
  assertCustomHabitLimitForCreate(habitId, {
    excludeActiveUserHabitId: metaInput.excludeActiveUserHabitId || ''
  })
  const remark = normalizeCustomRemark(metaInput.remark)
  const userHabitId = generateUserHabitId(habitId)
  const addedAt = getAddedAtValue()
  const businessDate = timeService.getBusinessDate()

  const duration = policyInput.duration || CUSTOM_DEFAULT_DURATION
  const frequencyType = policyInput.frequencyType || 'daily'
  const frequencyConfig = policyInput.frequencyConfig || { intervalDays: 1 }
  const startDate = policyInput.startDate || businessDate

  const userHabit = {
    userHabitId,
    habitId,
    source: HABIT_SOURCE.custom,
    name,
    category: CUSTOM_CATEGORY,
    remark,
    themeClass: CUSTOM_THEME_CLASS,
    iconUrl: CUSTOM_ICON_URL,
    status: 'active',
    createdAt: businessDate,
    addedAt,
    pinnedAt: null,
    deletedAt: null,
    latestPolicyVersionId: ''
  }

  const existingHabits = storageService.getMyHabitsWithMigration()
  existingHabits.push(userHabit)
  storageService.setMyHabits(existingHabits)

  const meta = storageService.getMigrationMeta()
  if (!meta.userHabitInstances) {
    meta.userHabitInstances = {}
  }
  meta.userHabitInstances[userHabitId] = {
    userHabitId,
    habitId,
    source: HABIT_SOURCE.custom,
    name,
    category: CUSTOM_CATEGORY,
    remark,
    themeClass: CUSTOM_THEME_CLASS,
    iconUrl: CUSTOM_ICON_URL,
    status: 'active',
    createdAt: businessDate,
    addedAt,
    pinnedAt: null,
    deletedAt: null
  }
  storageService.setMigrationMeta(meta)

  const policyVersion = await createPolicyVersion(userHabitId, {
    duration,
    frequencyType,
    frequencyConfig,
    startDate
  }, { skipSync: true })

  userHabit.latestPolicyVersionId = policyVersion.policyVersionId
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index >= 0) {
    habits[index] = userHabit
    storageService.setMyHabits(habits)
  }

  syncService.pushWithDedup('habit', 'addHabit', {
    userHabitId,
    habitId,
    source: HABIT_SOURCE.custom,
    name,
    category: CUSTOM_CATEGORY,
    remark,
    themeClass: CUSTOM_THEME_CLASS,
    iconUrl: CUSTOM_ICON_URL,
    createdAt: userHabit.createdAt,
    addedAt: userHabit.addedAt,
    pinnedAt: userHabit.pinnedAt,
    policyVersionId: policyVersion.policyVersionId,
    duration: policyVersion.duration,
    frequencyType: policyVersion.frequencyType,
    frequencyConfig: policyVersion.frequencyConfig,
    startDate: policyVersion.startDate,
    idempotencyKey: `habit_${userHabitId}_add`
  })
  bumpDataVersions()
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('addCustomHabit', {
    userHabitId,
    habitId,
    policyVersionId: policyVersion.policyVersionId,
    date: startDate
  })

  return userHabit
}

async function addCustomHabit(metaInput = {}, policyInput = {}) {
  const name = validateCustomHabitName(metaInput.name)
  const nameMatch = findCustomHabitByName(name)
  if (nameMatch && nameMatch.status === 'active') {
    throw new Error('CUSTOM_HABIT_NAME_DUPLICATED_ACTIVE')
  }
  if (nameMatch && nameMatch.status === 'deleted') {
    throw new Error('CUSTOM_HABIT_NAME_EXISTS_DELETED')
  }
  const habitId = generateCustomHabitId()
  assertCustomHabitLimitForCreate(habitId)
  return addCustomHabitInstance(habitId, metaInput, policyInput)
}

async function updateCustomHabitMeta(userHabitId, patch = {}) {
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index < 0) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }

  const habit = habits[index]
  if (habit.status !== 'active') {
    throw new Error(`UserHabit is not active: ${userHabitId}`)
  }
  if (!isCustomHabit(habit)) {
    throw new Error(`UserHabit is not custom: ${userHabitId}`)
  }

  const next = {
    ...habit,
    source: HABIT_SOURCE.custom,
    category: CUSTOM_CATEGORY,
    themeClass: habit.themeClass || CUSTOM_THEME_CLASS,
    iconUrl: habit.iconUrl || CUSTOM_ICON_URL,
    updatedAt: getAddedAtValue()
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    next.name = validateCustomHabitName(patch.name)
    ensureNoActiveCustomHabitName(next.name, { excludeUserHabitId: userHabitId })
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'remark')) {
    next.remark = normalizeCustomRemark(patch.remark)
  }

  habits[index] = next
  storageService.setMyHabits(habits)

  const meta = storageService.getMigrationMeta()
  if (meta.userHabitInstances && meta.userHabitInstances[userHabitId]) {
    meta.userHabitInstances[userHabitId] = {
      ...meta.userHabitInstances[userHabitId],
      source: HABIT_SOURCE.custom,
      name: next.name,
      category: CUSTOM_CATEGORY,
      remark: next.remark || '',
      themeClass: next.themeClass,
      iconUrl: next.iconUrl || CUSTOM_ICON_URL
    }
    storageService.setMigrationMeta(meta)
  }

  syncService.pushWithDedup('habit', 'updateHabitMeta', {
    userHabitId,
    habitId: next.habitId,
    source: HABIT_SOURCE.custom,
    name: next.name,
    category: CUSTOM_CATEGORY,
    remark: next.remark || '',
    themeClass: next.themeClass,
    iconUrl: next.iconUrl || CUSTOM_ICON_URL,
    idempotencyKey: `habit_${userHabitId}_meta_${next.updatedAt}`
  })
  bumpDataVersions()
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('updateHabitMeta', {
    userHabitId,
    habitId: next.habitId,
    policyVersionId: next.latestPolicyVersionId || ''
  })

  return next
}

async function renameCustomHabitAsNew(userHabitId, metaInput = {}, policyInput = {}) {
  const oldHabit = getHabitByUserHabitId(userHabitId)
  if (!oldHabit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }
  if (oldHabit.status !== 'active') {
    throw new Error(`UserHabit is not active: ${userHabitId}`)
  }
  if (!isCustomHabit(oldHabit)) {
    throw new Error(`UserHabit is not custom: ${userHabitId}`)
  }

  const name = validateCustomHabitName(metaInput.name)
  const nameMatch = ensureNoActiveCustomHabitName(name, { excludeUserHabitId: userHabitId })
  const nextHabitId = nameMatch && nameMatch.status === 'deleted'
    ? nameMatch.habitId
    : generateCustomHabitId()
  assertCustomHabitLimitForCreate(nextHabitId, {
    excludeActiveUserHabitId: userHabitId
  })

  await softDeleteHabit(userHabitId)
  return addCustomHabitInstance(nextHabitId, {
    ...metaInput,
    name
  }, policyInput)
}

function cleanupNamelessCustomHabits(options = {}) {
  const habits = storageService.getMyHabitsWithMigration()
  const removed = habits.filter(habit => isCustomHabit(habit) && !hasValidCustomHabitName(habit))
  if (!removed.length) {
    return { removedCount: 0, userHabitIds: [], habitIds: [] }
  }

  const removedUserHabitIds = new Set(removed.map(habit => habit.userHabitId).filter(Boolean))
  const removedHabitIds = new Set(removed.map(habit => habit.habitId).filter(Boolean))

  storageService.setMyHabits(habits.filter(habit => !removedUserHabitIds.has(habit.userHabitId)))
  storageService.setPolicyVersions(storageService.getPolicyVersions().filter(policy => !removedUserHabitIds.has(policy.userHabitId)))
  storageService.setDailyCheckinStates(storageService.getDailyCheckinStates().filter(state => !removedUserHabitIds.has(state.userHabitId)))
  storageService.setCheckinOperations(storageService.getCheckinOperations().filter(operation => !removedUserHabitIds.has(operation.userHabitId)))
  storageService.setPendingOperations(storageService.getPendingOperations().filter(item => {
    const payload = item.payload || {}
    return !removedUserHabitIds.has(payload.userHabitId || item.entityId)
  }))

  const meta = storageService.getMigrationMeta()
  if (meta.userHabitInstances) {
    removedUserHabitIds.forEach(id => {
      delete meta.userHabitInstances[id]
    })
    storageService.setMigrationMeta(meta)
  }

  emitHabitUpdated('cleanupNamelessCustomHabits', {
    userHabitId: Array.from(removedUserHabitIds).join(','),
    habitId: Array.from(removedHabitIds).join(',')
  })
  eventBus.emit('cache:invalidated', {
    source: 'habit',
    action: 'cleanupNamelessCustomHabits',
    removedCount: removed.length
  })

  if (options.cloud !== false) {
    cloudService.callFunction('syncHabit', {
      action: 'cleanupNamelessCustomHabits',
      userHabitId: '__cleanup__',
      habitId: '__cleanup__'
    }).catch(e => {
      console.warn('cleanupNamelessCustomHabits cloud cleanup failed:', e && e.message ? e.message : String(e || 'unknown error'))
    })
  }

  return {
    removedCount: removed.length,
    userHabitIds: Array.from(removedUserHabitIds),
    habitIds: Array.from(removedHabitIds)
  }
}

/**
 * 获取所有活跃用户习惯实例
 * @returns {UserHabit[]}
 */
function getActiveUserHabits() {
  const habits = storageService.getMyHabitsWithMigration()
  return habits.filter(h => h.status === 'active')
}

/**
 * 获取用户习惯实例（按 userHabitId）
 * @param {string} userHabitId
 * @returns {UserHabit|null}
 */
function getHabitByUserHabitId(userHabitId) {
  const habits = storageService.getMyHabitsWithMigration()
  return habits.find(h => h.userHabitId === userHabitId) || null
}

/**
 * 获取用户习惯实例（按 habitId，含已删除）
 * @param {string} habitId
 * @returns {UserHabit[]}
 */
function getHabitsByHabitId(habitId) {
  const habits = storageService.getMyHabitsWithMigration()
  return habits.filter(h => h.habitId === habitId)
}

function isHabitCheckedOnDate(userHabitId, date) {
  const state = storageService.getDailyState(userHabitId, date)
  return state && state.status === DAILY_STATE_STATUS.checked
}

/**
 * 软删除用户习惯实例
 * @param {string} userHabitId
 * @returns {Promise<boolean>}
 */
async function softDeleteHabit(userHabitId) {
  const habits = storageService.getMyHabitsWithMigration()
  const habit = habits.find(h => h.userHabitId === userHabitId)

  if (!habit) {
    return false
  }

  const businessDate = timeService.getBusinessDate()
  const deletionDailyState = markDeletionToday(userHabitId, businessDate)

  // 更新为 deleted 状态
  habit.status = 'deleted'
  habit.deletedAt = businessDate

  storageService.setMyHabits(habits)

  // 关闭当前策略版本
  const policy = storageService.getActivePolicyVersion(userHabitId)
  if (policy) {
    storageService.closePolicyVersion(policy.policyVersionId, businessDate)
  }

  // 更新 migrationMeta
  const meta = storageService.getMigrationMeta()
  if (meta.userHabitInstances && meta.userHabitInstances[userHabitId]) {
    meta.userHabitInstances[userHabitId].status = 'deleted'
    meta.userHabitInstances[userHabitId].deletedAt = habit.deletedAt
    storageService.setMigrationMeta(meta)
  }

  // 进入 pending 队列，等待云端同步（Phase 4）
  // 携带 deletedAt（本地业务日期），云端使用此日期而非同步当天
  syncService.pushWithDedup('habit', 'deleteHabit', {
    userHabitId,
    habitId: habit.habitId,
    deletedAt: habit.deletedAt,
    deletionDailyState,
    idempotencyKey: `habit_${userHabitId}_delete_${habit.deletedAt}`
  })
  bumpDataVersions()
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('deleteHabit', {
    userHabitId,
    habitId: habit.habitId,
    policyVersionId: habit.latestPolicyVersionId,
    date: habit.deletedAt
  })

  return true
}

async function updateHabitPinnedAt(userHabitId, pinnedAt) {
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)

  if (index < 0) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }

  const habit = habits[index]
  if (habit.status !== 'active') {
    throw new Error(`UserHabit is not active: ${userHabitId}`)
  }

  const nextHabit = {
    ...habit,
    pinnedAt: pinnedAt || null
  }
  habits[index] = nextHabit
  storageService.setMyHabits(habits)

  const meta = storageService.getMigrationMeta()
  if (meta.userHabitInstances && meta.userHabitInstances[userHabitId]) {
    meta.userHabitInstances[userHabitId].pinnedAt = nextHabit.pinnedAt
    storageService.setMigrationMeta(meta)
  }

  syncService.pushWithDedup('habit', 'updatePinned', {
    userHabitId,
    habitId: habit.habitId,
    pinnedAt: nextHabit.pinnedAt,
    idempotencyKey: `habit_${userHabitId}_pinned_${nextHabit.pinnedAt || 'none'}`
  })
  bumpDataVersions()
  schedulePendingAfterLocalWrite()
  emitHabitPreferenceUpdated(nextHabit.pinnedAt ? 'pinHabit' : 'unpinHabit', nextHabit)

  return nextHabit
}

async function pinHabit(userHabitId) {
  return updateHabitPinnedAt(userHabitId, getPinnedAtValue())
}

async function unpinHabit(userHabitId) {
  return updateHabitPinnedAt(userHabitId, null)
}

// ==================== 策略版本 ====================

/**
 * 创建新策略版本（关闭旧版本）
 * @param {string} userHabitId
 * @param {object} policyInput
 * @param {object} options - { skipSync?: boolean } 跳过 syncService 入队（addHabit 内部调用时使用）
 * @returns {Promise<PolicyVersion>}
 */
async function createPolicyVersion(userHabitId, policyInput, options = {}) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }

  const duration = policyInput.duration || 20
  const frequencyType = policyInput.frequencyType || 'daily'
  const frequencyConfig = policyInput.frequencyConfig || { intervalDays: 1 }
  const startDate = policyInput.startDate || timeService.getBusinessDate()

  // 1. 查找当前有效策略版本，关闭旧版本
  const currentPolicy = storageService.getActivePolicyVersion(userHabitId)
  if (currentPolicy) {
    storageService.closePolicyVersion(currentPolicy.policyVersionId, startDate)
  }

  // 2. 创建新版本
  const policyVersionId = generatePolicyVersionId(habit.habitId)
  const businessDate = timeService.getBusinessDate()

  const newPolicy = {
    policyVersionId,
    userHabitId,
    habitId: habit.habitId,
    duration,
    frequencyType,
    frequencyConfig,
    startDate,
    effectiveStartDate: startDate,
    effectiveEndDate: null,
    createdAt: businessDate,
    updatedAt: businessDate
  }

  // 3. 保存
  storageService.savePolicyVersion(newPolicy)

  // 4. 更新 UserHabit.latestPolicyVersionId
  habit.latestPolicyVersionId = policyVersionId
  const habits = storageService.getMyHabitsWithMigration()
  const index = habits.findIndex(h => h.userHabitId === userHabitId)
  if (index >= 0) {
    habits[index] = habit
    storageService.setMyHabits(habits)
  }

  // 5. 进入 pending 队列，等待云端同步（Phase 4）
  // skipSync 用于 addHabit 内部调用（避免重复入队）
  // payload 携带完整 policyVersion 数据，供云端重建 habit_policy_versions
  // previousPolicyVersionId 用于云端关闭旧版本
  if (!options.skipSync) {
    const previousPolicy = currentPolicy
    syncService.pushWithDedup('habit', 'updatePolicy', {
      userHabitId,
      habitId: habit.habitId,
      policyVersionId: newPolicy.policyVersionId,
      duration: newPolicy.duration,
      frequencyType: newPolicy.frequencyType,
      frequencyConfig: newPolicy.frequencyConfig,
      startDate: newPolicy.startDate,
      effectiveStartDate: newPolicy.effectiveStartDate,
      previousPolicyVersionId: previousPolicy ? previousPolicy.policyVersionId : null,
      previousEffectiveEndDate: previousPolicy ? startDate : null,
      idempotencyKey: `habit_${userHabitId}_policy_${newPolicy.policyVersionId}`
    })
    bumpDataVersions()
    schedulePendingAfterLocalWrite()
    emitHabitUpdated('updatePolicy', {
      userHabitId,
      habitId: habit.habitId,
      policyVersionId: newPolicy.policyVersionId,
      date: newPolicy.effectiveStartDate
    })
  }

  return newPolicy
}

/**
 * 获取用户习惯实例的当前有效策略版本
 * @param {string} userHabitId
 * @returns {PolicyVersion|null}
 */
function getActivePolicyVersion(userHabitId) {
  return storageService.getActivePolicyVersion(userHabitId)
}

/**
 * 获取用户习惯实例的所有策略版本
 * @param {string} userHabitId
 * @returns {PolicyVersion[]}
 */
function getPolicyVersionsByUserHabitId(userHabitId) {
  return storageService.getPolicyVersionsByUserHabitId(userHabitId)
}

/**
 * 更新用户习惯的策略
 *
 * 复用现有 userHabitId，关闭当前有效策略版本并创建新版本。
 * 适用于「修习」页面修改策略的场景。
 *
 * @param {string} userHabitId - 必须已存在的 userHabitId
 * @param {object} policyInput - 策略配置 { duration, frequencyType, frequencyConfig, startDate }
 * @returns {Promise<UserHabit>} 更新后的 userHabit
 */
async function updateHabitPolicy(userHabitId, policyInput) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit) {
    throw new Error(`UserHabit not found: ${userHabitId}`)
  }
  if (habit.status !== 'active') {
    throw new Error(`UserHabit is not active: ${userHabitId}`)
  }

  const previousPolicy = storageService.getActivePolicyVersion(userHabitId)

  // 复用 createPolicyVersion：它会关闭旧版本并创建新版本。
  // updateHabitPolicy 自己入队，才能携带策略修改当天的 dailyState 锁定字段。
  const policyVersion = await createPolicyVersion(userHabitId, policyInput, { skipSync: true })
  const strategyChangedDailyState = markStrategyChangedToday(
    userHabitId,
    timeService.getBusinessDate(),
    policyVersion.policyVersionId
  )

  syncService.pushWithDedup('habit', 'updatePolicy', {
    userHabitId,
    habitId: habit.habitId,
    policyVersionId: policyVersion.policyVersionId,
    duration: policyVersion.duration,
    frequencyType: policyVersion.frequencyType,
    frequencyConfig: policyVersion.frequencyConfig,
    startDate: policyVersion.startDate,
    effectiveStartDate: policyVersion.effectiveStartDate,
    previousPolicyVersionId: previousPolicy ? previousPolicy.policyVersionId : null,
    previousEffectiveEndDate: previousPolicy ? policyVersion.effectiveStartDate : null,
    strategyChangedDailyState,
    idempotencyKey: `habit_${userHabitId}_policy_${policyVersion.policyVersionId}`
  })
  bumpDataVersions()
  schedulePendingAfterLocalWrite()
  emitHabitUpdated('updatePolicy', {
    userHabitId,
    habitId: habit.habitId,
    policyVersionId: policyVersion.policyVersionId,
    date: policyVersion.effectiveStartDate
  })

  // 重新读取 userHabit（latestPolicyVersionId 已被 createPolicyVersion 更新）
  return getHabitByUserHabitId(userHabitId)
}

function resolveStrategyChangeLockedReason(status) {
  return status === DAILY_STATE_STATUS.checked
    ? 'strategy_changed_after_checkin'
    : 'strategy_changed_without_checkin'
}

function markStrategyChangedToday(userHabitId, date, policyVersionId) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit || !date) return null

  const existingState = storageService.getDailyState(userHabitId, date)
  const status = existingState?.status || DAILY_STATE_STATUS.unchecked
  const baseState = existingState || createDailyCheckinState({
    userHabitId,
    habitId: habit.habitId,
    date,
    status
  })

  const state = {
    ...baseState,
    status,
    policyVersionId,
    hasPolicyChangedToday: true,
    lockReason: resolveStrategyChangeLockedReason(status),
    updatedAt: new Date().toISOString()
  }

  storageService.setDailyState(state)
  return state
}

function resolveDeletionLockedReason(status) {
  return status === DAILY_STATE_STATUS.checked
    ? 'deleted_after_checkin'
    : 'deleted_without_checkin'
}

function markDeletionToday(userHabitId, date) {
  const habit = getHabitByUserHabitId(userHabitId)
  if (!habit || !date) return null

  const existingState = storageService.getDailyState(userHabitId, date)
  const finalStatus = existingState?.status === DAILY_STATE_STATUS.checked
    ? DAILY_STATE_STATUS.checked
    : DAILY_STATE_STATUS.not_required
  const lockReason = resolveDeletionLockedReason(finalStatus)
  const baseState = existingState || createDailyCheckinState({
    userHabitId,
    habitId: habit.habitId,
    date,
    status: finalStatus
  })

  const state = {
    ...baseState,
    status: finalStatus,
    policyVersionId: habit.latestPolicyVersionId || baseState.policyVersionId || '',
    hasDeletionToday: true,
    isLocked: true,
    lockReason,
    updatedAt: new Date().toISOString()
  }

  storageService.setDailyState(state)
  return state
}

/**
 * 关闭策略版本
 * @param {string} policyVersionId
 * @param {string} effectiveEndDate
 */
function closePolicyVersion(policyVersionId, effectiveEndDate) {
  storageService.closePolicyVersion(policyVersionId, effectiveEndDate)
}

// ==================== 今日习惯 ====================

/**
 * 获取今日应修习惯列表
 *
 * 过滤规则（与观心页 isDueOnDateByFrequency 完全统一）：
 * 1. 仅 status === 'active' 的 userHabit。
 * 2. 必须存在 effectiveEndDate === null 的最新版策略（不存在则视为未来，跳过）。
 * 3. 策略 effectiveStartDate <= date 视为今日有效；否则视为未来策略，不展示。
 * 4. 同一 userHabit 的多个策略版本只考虑最新版（effectiveEndDate === null）。
 * 5. 今日必须为该策略的应修日（基于频率规则：daily / weekly / interval），
 *    调用 reportAggregator.isDueOnDateByFrequency。
 *    这是关键：与观心页的应修裁决共用同一函数，避免出现「案台显示但观心不计分」
 *    或「观心应修但案台不显示」的不一致。
 *
 * @param {string} date - 业务日期 YYYY-MM-DD
 * @returns {Promise<TodayHabit[]>}
 */
async function getTodayHabits(date) {
  const allHabits = storageService.getMyHabitsWithMigration()
  const states = storageService.getDailyStatesByDate(date)

  return allHabits
    .map(habit => {
      const policy = storageService.getActivePolicyVersion(habit.userHabitId)
      const state = states.find(s => s.userHabitId === habit.userHabitId)
      return { habit, policy, state }
    })
    .filter(({ habit, policy, state }) => {
      if (isCustomHabit(habit) && !hasValidCustomHabitName(habit)) return false
      const deletedAt = habit.deletedAt ? String(habit.deletedAt).split('T')[0] : null
      const deletedCheckedToday = habit.status === 'deleted' &&
        deletedAt === date &&
        state &&
        state.status === 'checked'

      if (deletedCheckedToday) return true
      if (habit.status !== 'active') return false
      if (!policy) return false
      if (!policy.effectiveStartDate) return false
      // 关键例外：用户今天已打卡 → 无论新策略如何，都展示（让用户看到自己的打卡）
      // 覆盖两种场景：
      // (a) 新策略在今天之后（被改成明天/未来）
      // (b) 新策略频率不包含今天（如改成 weekly 周三，今天是周二）
      if (state && state.status === 'checked') {
        return true
      }
      if (policy.effectiveStartDate > date) return false
      // 应修日判定：与观心页的 buildDayVerdicts 使用同一个函数
      return reportAggregator.isDueOnDateByFrequency(policy, date)
    })
    .map(({ habit, policy, state }) => {
      const displayMeta = getHabitDisplayMeta(habit)
      return {
        userHabitId: habit.userHabitId,
        habitId: habit.habitId,
        source: displayMeta.source,
        name: displayMeta.name,
        category: displayMeta.category,
        themeClass: displayMeta.themeClass,
        iconUrl: displayMeta.iconUrl,
        emoji: displayMeta.emoji,
        duration: habit.targetMinutes || policy?.duration || 20,
        policy,
        isChecked: state && state.status === 'checked',
        stateId: state ? state.stateId : null,
        status: habit.status,
        createdAt: habit.createdAt,
        addedAt: habit.addedAt || null,
        pinnedAt: habit.pinnedAt || null,
        deletedAt: habit.deletedAt || null
      }
    })
}

// ==================== 迁移辅助 ====================

/**
 * 获取迁移元数据
 */
function getMigrationMeta() {
  return storageService.getMigrationMeta()
}

/**
 * 执行完整迁移（供外部调用）
 */
async function runMigration() {
  // 1. 备份
  const habitsBackup = storageService.backupMyHabitsForMigration()
  const logsBackup = storageService.backupCheckinLogsForMigration()
  const versionsBackup = storageService.backupPolicyVersionsForMigration()

  // 2. 触发迁移读取
  storageService.getMyHabitsWithMigration()
  storageService.getCheckinLogsWithMigration()

  return {
    habitsBackup,
    logsBackup,
    versionsBackup
  }
}

// ==================== Phase 6B 展示辅助 ====================

/**
 * 构建策略显示文本
 * @param {Object} strategy - 策略对象
 * @returns {string}
 */
function buildStrategyText(strategy) {
  const frequencyType = strategy.frequencyType || 'daily'
  const frequencyConfig = strategy.frequencyConfig || {}
  const freqRules = frequencyType === 'weekly'
    ? (frequencyConfig.weekdays || [])
    : (frequencyConfig.intervalDays || 1)
  const freqCategory = frequencyType === 'weekly'
    ? 'weekly'
    : (frequencyType === 'interval' || Number(freqRules) > 1 ? 'daily-interval' : 'everyday')

  // 间隔打卡
  if (frequencyType === 'interval') {
    const interval = freqRules || 1
    return `每${interval + 1}天`
  }

  // 每天或按天间隔
  if (freqCategory === 'daily-interval' || frequencyType === 'daily') {
    if (freqRules && freqRules > 1) {
      return `每${freqRules + 1}天`
    }
    return '每天'
  }

  // 每周固定
  if (freqCategory === 'weekly' || frequencyType === 'weekly') {
    if (freqRules && freqRules.length > 0) {
      const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日']
      const days = freqRules.map(d => weekdayNames[d]).join('、')
      return `每周${days}`
    }
    return '每周'
  }

  return '每天'
}

/**
 * 构建策略对象（供习惯添加/编辑使用）
 * @param {string} userHabitId - 习惯实例ID
 * @param {Object} policyInput - 策略输入（来自页面 picker 等）
 * @param {Object} options - 额外选项 { habitTitle, category }
 * @returns {Object}
 */
function buildStrategyObject(userHabitId, policyInput, options = {}) {
  const freqType = policyInput.frequencyType || 'daily'
  const frequencyConfig = policyInput.frequencyConfig
  // 规范化 frequencyConfig：支持数字、数组、{ intervalDays }、{ weekdays }
  let freqRules
  if (typeof frequencyConfig === 'number') {
    freqRules = frequencyConfig
  } else if (Array.isArray(frequencyConfig)) {
    freqRules = frequencyConfig
  } else if (freqType === 'weekly') {
    freqRules = frequencyConfig?.weekdays || []
  } else {
    freqRules = frequencyConfig?.intervalDays || 1
  }
  return {
    userHabitId,
    habitTitle: options.habitTitle || '',
    category: options.category || '',
    duration: policyInput.duration,
    frequencyType: freqType,
    frequencyConfig: freqType === 'weekly'
      ? { weekdays: Array.isArray(freqRules) ? freqRules : [] }
      : { intervalDays: Number(freqRules) || 1 },
    startDate: policyInput.startDate || ''
  }
}

/**
 * 构建习惯列表展示模型（Phase 6B）
 * 将内置习惯列表转换为带策略状态的展示列表
 * @param {Array} builtInHabits - 内置习惯定义列表（来自页面 hardcoded）
 * @returns {Array} - 带策略状态的展示列表
 */
function buildHabitDisplayList(builtInHabits) {
  const allUserHabits = storageService.getMyHabitsWithMigration()
  const activeUserHabits = allUserHabits.filter(h => h.status === 'active')

  // 构建 habitId -> userHabit 映射
  const userHabitMap = {}
  activeUserHabits.forEach(uh => {
    if (!isCustomHabit(uh)) {
      userHabitMap[uh.habitId] = uh
    }
  })

  const systemHabits = builtInHabits.map(habit => {
    const habitId = String(habit._id)
    const userHabit = userHabitMap[habitId]

    if (!userHabit) {
      return {
        ...habit,
        source: HABIT_SOURCE.system,
        hasStrategy: false
      }
    }

    const policy = getActivePolicyVersion(userHabit.userHabitId)
    const freqType = policy ? policy.frequencyType : 'daily'
    const freqRules = policy
      ? (policy.frequencyType === 'weekly' ? policy.frequencyConfig.weekdays : policy.frequencyConfig.intervalDays)
      : 1
    const duration = policy ? policy.duration : (habit.default_duration || 20)

    const strategy = buildStrategyObject(userHabit.userHabitId, {
      duration,
      frequencyType: freqType,
      frequencyConfig: freqRules,
      startDate: policy ? policy.startDate : ''
    }, {
      habitTitle: habit.title,
      category: habit.category
    })

    const freqText = buildStrategyText(strategy)
    const strategyText = `${freqText} · ${duration}分钟`

    return {
      ...habit,
      source: HABIT_SOURCE.system,
      hasStrategy: true,
      createdAt: userHabit.createdAt,
      addedAt: userHabit.addedAt || null,
      pinnedAt: userHabit.pinnedAt || null,
      strategy,
      strategyText
    }
  })

  const customHabitMap = {}
  allUserHabits
    .filter(habit => isCustomHabit(habit) && hasValidCustomHabitName(habit))
    .forEach(userHabit => {
      const habitId = userHabit.habitId
      if (!habitId) return
      if (!customHabitMap[habitId]) {
        customHabitMap[habitId] = []
      }
      customHabitMap[habitId].push(userHabit)
    })

  const customHabits = Object.keys(customHabitMap)
    .map(habitId => {
      const instances = customHabitMap[habitId]
      const activeInstance = instances.find(item => item.status === 'active')
      const userHabit = activeInstance || instances
        .slice()
        .sort((a, b) => String(b.addedAt || b.createdAt || '').localeCompare(String(a.addedAt || a.createdAt || '')))[0]
      const displayMeta = getHabitDisplayMeta(userHabit)
      const policy = getActivePolicyVersion(userHabit.userHabitId)
      const duration = policy ? policy.duration : (userHabit.targetMinutes || CUSTOM_DEFAULT_DURATION)
      const hasStrategy = userHabit.status === 'active'
      const strategy = hasStrategy ? buildStrategyObject(userHabit.userHabitId, {
        duration,
        frequencyType: policy ? policy.frequencyType : 'daily',
        frequencyConfig: policy
          ? (policy.frequencyType === 'weekly' ? policy.frequencyConfig.weekdays : policy.frequencyConfig.intervalDays)
          : 1,
        startDate: policy ? policy.startDate : ''
      }, {
        habitTitle: displayMeta.name,
        category: displayMeta.category
      }) : null
      const freqText = strategy ? buildStrategyText(strategy) : ''

      return {
        _id: habitId,
        userHabitId: hasStrategy ? userHabit.userHabitId : '',
        source: HABIT_SOURCE.custom,
        title: displayMeta.name,
        name: displayMeta.name,
        category: displayMeta.category,
        description: userHabit.remark || '自定义修习',
        default_duration: duration,
        iconUrl: displayMeta.iconUrl,
        emoji: displayMeta.emoji,
        themeClass: displayMeta.themeClass,
        hasStrategy,
        createdAt: userHabit.createdAt,
        addedAt: userHabit.addedAt || null,
        pinnedAt: userHabit.pinnedAt || null,
        deletedAt: userHabit.deletedAt || null,
        strategy: strategy || null,
        strategyText: strategy ? `${freqText} · ${duration}分钟` : ''
      }
    })

  return systemHabits.concat(customHabits)
}

/**
 * 获取今天的日期字符串（支持模拟日期）
 * @param {Object} app - 可选，微信小程序 app 对象，用于支持 DEBUG_DAY_OFFSET
 * @returns {string} YYYY-MM-DD
 */
function getTodayDateStr(app) {
  return timeService.getSimulatedDateStr(app || null)
}

/**
 * 获取偏移日期字符串
 * @param {number} days - 偏移天数
 * @param {Object} app - 可选，微信小程序 app 对象
 * @returns {string} YYYY-MM-DD
 */
function getOffsetDateStr(days, app) {
  return timeService.addDays(timeService.getSimulatedDateStr(app || null), days)
}

/**
 * 获取下个星期一的日期字符串
 * @param {Object} app - 可选，微信小程序 app 对象
 * @returns {string} YYYY-MM-DD
 */
function getNextMondayStr(app) {
  const today = timeService.parseDate(timeService.getSimulatedDateStr(app || null))
  const dayOfWeek = today.getUTCDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  return timeService.addDays(timeService.getSimulatedDateStr(app || null), daysUntilMonday)
}

// ==================== Phase 6 跨页 Tab Intent（轻量状态） ====================

let _pendingTabIntent = null

/**
 * 设置待消费的分页 tab 意图（home -> habits）
 * @param {string} tab - 'sports' 等
 */
function requestPendingTab(tab) {
  _pendingTabIntent = tab
}

/**
 * 消费并返回待处理的 tab 意图（habits onLoad 时调用）
 * @returns {string|null}
 */
function consumePendingTabIntent() {
  const intent = _pendingTabIntent
  _pendingTabIntent = null
  return intent
}

module.exports = {
  // 内置习惯
  getBuiltInHabits,
  getBuiltInHabitDef,
  getHabitDisplayMeta,

  // userHabitId
  generateUserHabitId,

  // 用户习惯实例
  addHabit,
  addCustomHabit,
  addCustomHabitInstance,
  renameCustomHabitAsNew,
  updateCustomHabitMeta,
  cleanupNamelessCustomHabits,
  findCustomHabitByName,
  normalizeCustomHabitName,
  getActiveUserHabits,
  getHabitByUserHabitId,
  getHabitsByHabitId,
  isHabitCheckedOnDate,
  softDeleteHabit,
  pinHabit,
  unpinHabit,

  // 策略版本
  createPolicyVersion,
  getActivePolicyVersion,
  getPolicyVersionsByUserHabitId,
  closePolicyVersion,
  updateHabitPolicy,
  markStrategyChangedToday,
  markDeletionToday,

  // 今日习惯
  getTodayHabits,

  // 迁移
  getMigrationMeta,
  runMigration,

  // Phase 6B 展示辅助
  buildStrategyText,
  buildStrategyObject,
  buildHabitDisplayList,
  getTodayDateStr,
  getOffsetDateStr,
  getNextMondayStr,

  // Phase 6 跨页 tab intent
  requestPendingTab,
  consumePendingTabIntent
}
