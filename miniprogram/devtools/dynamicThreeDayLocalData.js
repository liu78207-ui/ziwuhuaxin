const TARGET_DATE = '2026-06-13'

const HABITS = {
  '2': { habitId: '2', name: '站桩', category: '运动类', targetMinutes: 20, themeClass: 't-green' },
  '7': { habitId: '7', name: '瑜伽', category: '运动类', targetMinutes: 45, themeClass: 't-green' },
  '8': { habitId: '8', name: '普拉提', category: '运动类', targetMinutes: 40, themeClass: 't-green' },
  '12': { habitId: '12', name: '艾灸', category: '理疗类', targetMinutes: 30, themeClass: 't-red' },
  '17': { habitId: '17', name: '晨起温水', category: '起居类', targetMinutes: 5, themeClass: 't-blue' }
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function calculateDebugOffset(targetDate) {
  const today = new Date()
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((parseLocalDate(targetDate) - todayLocal) / (24 * 60 * 60 * 1000))
}

function ts(date, time = '08:00:00') {
  return new Date(`${date}T${time}+08:00`).getTime()
}

function makeHabit({
  userHabitId,
  habitId,
  status = 'active',
  createdAt,
  deletedAt = null,
  latestPolicyVersionId
}) {
  const habit = HABITS[habitId]
  return {
    userHabitId,
    habitId,
    name: habit.name,
    category: habit.category,
    targetMinutes: habit.targetMinutes,
    themeClass: habit.themeClass,
    status,
    createdAt,
    deletedAt,
    latestPolicyVersionId,
    syncStatus: 1
  }
}

function makePolicy({
  policyVersionId,
  userHabitId,
  habitId,
  duration,
  frequencyType,
  frequencyConfig,
  startDate,
  effectiveStartDate,
  effectiveEndDate
}) {
  return {
    policyVersionId,
    userHabitId,
    habitId,
    duration,
    frequencyType,
    frequencyConfig,
    startDate,
    effectiveStartDate,
    effectiveEndDate,
    syncStatus: 1,
    createdAt: `${effectiveStartDate}T07:00:00+08:00`,
    updatedAt: ts(effectiveEndDate || TARGET_DATE, '21:00:00')
  }
}

function makeOp({
  operationId,
  userHabitId,
  habitId,
  policyVersionId,
  date,
  action,
  sequence,
  time
}) {
  return {
    operationId,
    idempotencyKey: operationId,
    userHabitId,
    habitId,
    policyVersionId,
    date,
    action,
    clientTime: `${date}T${time}+08:00`,
    clientSequence: sequence,
    syncStatus: 1,
    createdAt: `${date}T${time}+08:00`
  }
}

function makeState({
  stateId,
  userHabitId,
  habitId,
  policyVersionId,
  date,
  status,
  lastOperationId = null,
  checkedAt = null,
  canceledAt = null,
  sequence = 0,
  hasPolicyChangedToday = false,
  hasDeletionToday = false,
  lockedReason = null
}) {
  const eventTime = canceledAt || checkedAt || '20:00:00'
  return {
    stateId,
    userHabitId,
    habitId,
    policyVersionId,
    date,
    status,
    checkedAt: checkedAt ? ts(date, checkedAt) : null,
    canceledAt: canceledAt ? ts(date, canceledAt) : null,
    lastOperationId,
    lastOperationClientTime: lastOperationId ? `${date}T${eventTime}+08:00` : null,
    lastOperationClientSequence: sequence,
    ...(hasPolicyChangedToday ? { hasPolicyChangedToday: true } : {}),
    ...(hasDeletionToday ? { hasDeletionToday: true, isLocked: true } : {}),
    ...(lockedReason ? { lockedReason, lockReason: lockedReason } : {}),
    syncStatus: 1,
    updatedAt: ts(date, eventTime)
  }
}

function createDynamicThreeDayLocalData({ targetDate = TARGET_DATE } = {}) {
  const MyHabits = [
    makeHabit({ userHabitId: 'uh_dyn_pilates_1', habitId: '8', status: 'deleted', createdAt: '2026-06-11', deletedAt: '2026-06-13', latestPolicyVersionId: 'pv_dyn_pilates_weekly_13' }),
    makeHabit({ userHabitId: 'uh_dyn_yoga_1', habitId: '7', createdAt: '2026-06-12', latestPolicyVersionId: 'pv_dyn_yoga_weekly_13' }),
    makeHabit({ userHabitId: 'uh_dyn_moxa_1', habitId: '12', status: 'deleted', createdAt: '2026-06-12', deletedAt: '2026-06-13', latestPolicyVersionId: 'pv_dyn_moxa_daily_12' }),
    makeHabit({ userHabitId: 'uh_dyn_standing_1', habitId: '2', status: 'deleted', createdAt: '2026-06-11', deletedAt: '2026-06-12', latestPolicyVersionId: 'pv_dyn_standing_daily_11' }),
    makeHabit({ userHabitId: 'uh_dyn_standing_2', habitId: '2', createdAt: '2026-06-13', latestPolicyVersionId: 'pv_dyn_standing_daily_13' }),
    makeHabit({ userHabitId: 'uh_dyn_water_1', habitId: '17', createdAt: '2026-06-11', latestPolicyVersionId: 'pv_dyn_water_daily_11' })
  ]

  const policyVersions = [
    makePolicy({ policyVersionId: 'pv_dyn_pilates_daily_11', userHabitId: 'uh_dyn_pilates_1', habitId: '8', duration: 40, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-06-11', effectiveStartDate: '2026-06-11', effectiveEndDate: '2026-06-13' }),
    makePolicy({ policyVersionId: 'pv_dyn_pilates_weekly_13', userHabitId: 'uh_dyn_pilates_1', habitId: '8', duration: 30, frequencyType: 'weekly', frequencyConfig: { weekdays: [1] }, startDate: '2026-06-13', effectiveStartDate: '2026-06-13', effectiveEndDate: '2026-06-13' }),
    makePolicy({ policyVersionId: 'pv_dyn_yoga_daily_12', userHabitId: 'uh_dyn_yoga_1', habitId: '7', duration: 45, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-06-12', effectiveStartDate: '2026-06-12', effectiveEndDate: '2026-06-13' }),
    makePolicy({ policyVersionId: 'pv_dyn_yoga_weekly_13', userHabitId: 'uh_dyn_yoga_1', habitId: '7', duration: 30, frequencyType: 'weekly', frequencyConfig: { weekdays: [6] }, startDate: '2026-06-13', effectiveStartDate: '2026-06-13', effectiveEndDate: null }),
    makePolicy({ policyVersionId: 'pv_dyn_moxa_daily_12', userHabitId: 'uh_dyn_moxa_1', habitId: '12', duration: 30, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-06-12', effectiveStartDate: '2026-06-12', effectiveEndDate: '2026-06-13' }),
    makePolicy({ policyVersionId: 'pv_dyn_standing_daily_11', userHabitId: 'uh_dyn_standing_1', habitId: '2', duration: 20, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-06-11', effectiveStartDate: '2026-06-11', effectiveEndDate: '2026-06-12' }),
    makePolicy({ policyVersionId: 'pv_dyn_standing_daily_13', userHabitId: 'uh_dyn_standing_2', habitId: '2', duration: 25, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-06-13', effectiveStartDate: '2026-06-13', effectiveEndDate: null }),
    makePolicy({ policyVersionId: 'pv_dyn_water_daily_11', userHabitId: 'uh_dyn_water_1', habitId: '17', duration: 5, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-06-11', effectiveStartDate: '2026-06-11', effectiveEndDate: null })
  ]

  const checkinOperations = [
    makeOp({ operationId: 'op_dyn_pilates_11_checkin', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-11', action: 'checkin', sequence: 1, time: '08:10:00' }),
    makeOp({ operationId: 'op_dyn_pilates_12_checkin', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-12', action: 'checkin', sequence: 2, time: '08:10:00' }),
    makeOp({ operationId: 'op_dyn_pilates_13_checkin', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-13', action: 'checkin', sequence: 3, time: '08:10:00' }),
    makeOp({ operationId: 'op_dyn_pilates_13_undo', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_weekly_13', date: '2026-06-13', action: 'undo', sequence: 4, time: '20:30:00' }),
    makeOp({ operationId: 'op_dyn_yoga_12_checkin', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_daily_12', date: '2026-06-12', action: 'checkin', sequence: 5, time: '09:00:00' }),
    makeOp({ operationId: 'op_dyn_yoga_13_checkin', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_daily_12', date: '2026-06-13', action: 'checkin', sequence: 6, time: '09:00:00' }),
    makeOp({ operationId: 'op_dyn_moxa_12_checkin', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-12', action: 'checkin', sequence: 7, time: '10:00:00' }),
    makeOp({ operationId: 'op_dyn_moxa_12_undo', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-12', action: 'undo', sequence: 8, time: '10:20:00' }),
    makeOp({ operationId: 'op_dyn_standing_11_checkin', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-11', action: 'checkin', sequence: 9, time: '07:30:00' }),
    makeOp({ operationId: 'op_dyn_standing_12_checkin', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-12', action: 'checkin', sequence: 10, time: '07:30:00' }),
    makeOp({ operationId: 'op_dyn_standing_13_checkin', userHabitId: 'uh_dyn_standing_2', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_13', date: '2026-06-13', action: 'checkin', sequence: 11, time: '07:30:00' }),
    makeOp({ operationId: 'op_dyn_water_11_checkin', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-11', action: 'checkin', sequence: 12, time: '06:30:00' }),
    makeOp({ operationId: 'op_dyn_water_12_checkin', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-12', action: 'checkin', sequence: 13, time: '06:30:00' }),
    makeOp({ operationId: 'op_dyn_water_13_checkin', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-13', action: 'checkin', sequence: 14, time: '06:30:00' })
  ]

  const dailyCheckinStates = [
    makeState({ stateId: 'state_dyn_pilates_11', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-11', status: 'checked', checkedAt: '08:10:00', lastOperationId: 'op_dyn_pilates_11_checkin', sequence: 1 }),
    makeState({ stateId: 'state_dyn_pilates_12', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_daily_11', date: '2026-06-12', status: 'checked', checkedAt: '08:10:00', lastOperationId: 'op_dyn_pilates_12_checkin', sequence: 2 }),
    makeState({ stateId: 'state_dyn_pilates_13', userHabitId: 'uh_dyn_pilates_1', habitId: '8', policyVersionId: 'pv_dyn_pilates_weekly_13', date: '2026-06-13', status: 'not_required', canceledAt: '20:30:00', lastOperationId: 'op_dyn_pilates_13_undo', sequence: 4, hasPolicyChangedToday: true, hasDeletionToday: true, lockedReason: 'deleted_without_checkin' }),
    makeState({ stateId: 'state_dyn_yoga_12', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_daily_12', date: '2026-06-12', status: 'checked', checkedAt: '09:00:00', lastOperationId: 'op_dyn_yoga_12_checkin', sequence: 5 }),
    makeState({ stateId: 'state_dyn_yoga_13', userHabitId: 'uh_dyn_yoga_1', habitId: '7', policyVersionId: 'pv_dyn_yoga_weekly_13', date: '2026-06-13', status: 'checked', checkedAt: '09:00:00', lastOperationId: 'op_dyn_yoga_13_checkin', sequence: 6, hasPolicyChangedToday: true, lockedReason: 'strategy_changed_after_checkin' }),
    makeState({ stateId: 'state_dyn_moxa_12', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-12', status: 'canceled', canceledAt: '10:20:00', lastOperationId: 'op_dyn_moxa_12_undo', sequence: 8 }),
    makeState({ stateId: 'state_dyn_moxa_13', userHabitId: 'uh_dyn_moxa_1', habitId: '12', policyVersionId: 'pv_dyn_moxa_daily_12', date: '2026-06-13', status: 'not_required', hasDeletionToday: true, lockedReason: 'deleted_without_checkin' }),
    makeState({ stateId: 'state_dyn_standing_11', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-11', status: 'checked', checkedAt: '07:30:00', lastOperationId: 'op_dyn_standing_11_checkin', sequence: 9 }),
    makeState({ stateId: 'state_dyn_standing_12', userHabitId: 'uh_dyn_standing_1', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_11', date: '2026-06-12', status: 'checked', checkedAt: '07:30:00', lastOperationId: 'op_dyn_standing_12_checkin', sequence: 10, hasDeletionToday: true, lockedReason: 'deleted_after_checkin' }),
    makeState({ stateId: 'state_dyn_standing_13', userHabitId: 'uh_dyn_standing_2', habitId: '2', policyVersionId: 'pv_dyn_standing_daily_13', date: '2026-06-13', status: 'checked', checkedAt: '07:30:00', lastOperationId: 'op_dyn_standing_13_checkin', sequence: 11 }),
    makeState({ stateId: 'state_dyn_water_11', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-11', status: 'checked', checkedAt: '06:30:00', lastOperationId: 'op_dyn_water_11_checkin', sequence: 12 }),
    makeState({ stateId: 'state_dyn_water_12', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-12', status: 'checked', checkedAt: '06:30:00', lastOperationId: 'op_dyn_water_12_checkin', sequence: 13 }),
    makeState({ stateId: 'state_dyn_water_13', userHabitId: 'uh_dyn_water_1', habitId: '17', policyVersionId: 'pv_dyn_water_daily_11', date: '2026-06-13', status: 'checked', checkedAt: '06:30:00', lastOperationId: 'op_dyn_water_13_checkin', sequence: 14 })
  ]

  const AllHabitsInfo = Object.keys(HABITS).reduce((map, habitId) => {
    map[habitId] = HABITS[habitId]
    return map
  }, {})

  return {
    MyHabits,
    CheckinLogs: [],
    policyVersions,
    checkinOperations,
    dailyCheckinStates,
    AllHabitsInfo,
    allHabitIds: Object.keys(HABITS),
    debugOffset: calculateDebugOffset(targetDate),
    targetDate,
    summary: {
      targetDate,
      habits: MyHabits.length,
      policyVersions: policyVersions.length,
      operations: checkinOperations.length,
      dailyStates: dailyCheckinStates.length
    }
  }
}

module.exports = {
  createDynamicThreeDayLocalData
}
