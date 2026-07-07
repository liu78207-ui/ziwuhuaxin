// services/homeService.js
// Phase 6: 页面层瘦身 - Home 页面 Service

const ziwu = require('../utils/ziwu')
const timeService = require('./timeService')
const habitService = require('./habitService')
const checkinService = require('./checkinService')
const storageService = require('./storageService')

const CIRCLE_COLORS = [
  '#F5E6E0', '#E8E4D9', '#D4E5E0', '#E5DED4', '#D9E2E8', '#E8D9D9'
]

// 根据时辰获取养生建议
function getAdviceByShichen(shichen) {
  const adviceMap = {
    '子时': '夜深胆气生，宜熟睡养胆。深度睡眠有助胆汁代谢和排毒。',
    '丑时': '凌晨肝血归，宜熟睡养肝。血液归于肝，熟睡有助肝脏解毒造血。',
    '寅时': '黎明肺气旺，宜深度睡眠。肺主一身气，此时宜静养，避免早起。',
    '卯时': '晨起大肠动，宜起床排便。喝温开水促进肠道蠕动，排出宿便。',
    '辰时': '早养胃气足，宜进食早餐。此时消化吸收最强，吃好早餐养胃气。',
    '巳时': '上午脾运化，宜工作学习。脾主运化水谷，精力充沛，适合事务。',
    '午时': '正午心火旺，宜小憩养心。饭后散步片刻，适当午休，养心安神。',
    '未时': '午后小肠忙，宜多喝水。小肠分清泌浊，多喝水帮助身体排毒。',
    '申时': '下午膀胱经，宜运动排毒。此时精力旺盛，适合运动多喝水。',
    '酉时': '傍晚肾藏精，宜静养藏精。避免剧烈运动，可泡脚按摩涌泉。',
    '戌时': '黄昏心包经，宜放松身心。散步阅读，保持心情愉悦，为入睡准备。',
    '亥时': '夜深水气重，宜温阳驱寒。去泡个脚吧，用热度驱散一天的疲惫。'
  }
  return adviceMap[shichen] || '顺应天时，调养身心。保持规律作息，养成健康习惯。'
}

function getIconUrl(name) {
  const iconMap = require('../utils/iconMap')
  const config = iconMap.getIconConfig(name)
  return config ? config.iconUrl : iconMap.getIconPath(name)
}

function getThemeClass(category) {
  const iconMap = require('../utils/iconMap')
  const themeMap = {
    '运动类': 'theme-jade',
    '理疗类': 'theme-fire',
    '起居类': 'theme-green',
    '自定义': 't-purple'
  }
  return themeMap[category] || 'theme-jade'
}

function getEmojiByCategory(category) {
  const emojiMap = {
    '运动类': '🏃',
    '理疗类': '🔥',
    '起居类': '🍵',
    '自定义': '养'
  }
  return emojiMap[category] || '🧘'
}

function getStateOrderTime(state) {
  return state.updatedAt || state.checkedAt || state.canceledAt || state.createdAt || ''
}

function isLaterDailyState(next, current) {
  if (!current) return true
  const nextTime = getStateOrderTime(next)
  const currentTime = getStateOrderTime(current)
  if (nextTime && currentTime && nextTime !== currentTime) {
    return nextTime > currentTime
  }
  return true
}

function buildPracticeDaysByHabitId(habits, dailyStates) {
  const habitIdsByUserHabitId = new Map()
  habits.forEach(habit => {
    if (habit.userHabitId) {
      habitIdsByUserHabitId.set(habit.userHabitId, String(habit.habitId))
    }
  })
  const finalStatesByUserHabitDate = new Map()

  dailyStates
    .filter(state => state && state.date && state.dateConfidence !== 'low')
    .forEach(state => {
      const habitId = habitIdsByUserHabitId.get(state.userHabitId) || String(state.habitId || '')
      if (!habitId) return
      const key = `${state.userHabitId || habitId}_${state.date}`
      const current = finalStatesByUserHabitDate.get(key)
      if (isLaterDailyState(state, current)) {
        finalStatesByUserHabitDate.set(key, { ...state, habitId })
      }
    })

  const checkedDatesByHabitId = new Map()
  finalStatesByUserHabitDate.forEach(state => {
    if (state.status === 'checked') {
      const habitId = String(state.habitId)
      if (!checkedDatesByHabitId.has(habitId)) {
        checkedDatesByHabitId.set(habitId, new Set())
      }
      checkedDatesByHabitId.get(habitId).add(state.date)
    }
  })

  const practiceDaysByHabitId = new Map()
  checkedDatesByHabitId.forEach((dates, habitId) => {
    practiceDaysByHabitId.set(habitId, dates.size)
  })
  return practiceDaysByHabitId
}

function chooseTodayHabit(current, next, todayStates) {
  if (!current) return next

  const currentState = todayStates.find(s => s.userHabitId === current.userHabitId)
  const nextState = todayStates.find(s => s.userHabitId === next.userHabitId)
  const currentChecked = currentState && currentState.status === 'checked'
  const nextChecked = nextState && nextState.status === 'checked'

  if (nextChecked && !currentChecked) return next
  if (currentChecked && !nextChecked) return current
  if (next.status === 'active' && current.status !== 'active') return next
  return current
}

function mergeTodayHabitsByHabitId(todayHabits, todayStates) {
  const groups = new Map()
  todayHabits.forEach(habit => {
    const habitId = String(habit.habitId)
    groups.set(habitId, chooseTodayHabit(groups.get(habitId), habit, todayStates))
  })
  return Array.from(groups.values())
}

function extractTimestampFromUserHabitId(userHabitId) {
  const value = String(userHabitId || '')
  const match = value.match(/^uh_(?:.+_)?(\d{12,})_[a-z0-9]+$/i)
  return match ? Number(match[1]) : null
}

function parseOrderTime(value) {
  if (!value) return null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function resolveHomeOrderTime(task) {
  const addedAtTime = parseOrderTime(task.addedAt)
  if (addedAtTime !== null) return addedAtTime

  const idTime = extractTimestampFromUserHabitId(task._id)
  if (idTime !== null) return idTime

  return parseOrderTime(task.createdAt)
}

function compareHomeTaskOrder(a, b) {
  const aPinned = Boolean(a.pinnedAt)
  const bPinned = Boolean(b.pinnedAt)
  if (aPinned !== bPinned) {
    return aPinned ? -1 : 1
  }

  const aTime = resolveHomeOrderTime(a)
  const bTime = resolveHomeOrderTime(b)
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return aTime - bTime
  }
  if (aTime !== null && bTime === null) return -1
  if (aTime === null && bTime !== null) return 1

  const sourceCompare = (a.sourceIndex || 0) - (b.sourceIndex || 0)
  if (sourceCompare !== 0) return sourceCompare

  return String(a._id || '').localeCompare(String(b._id || ''))
}

/**
 * 获取首页 ViewModel
 */
async function getHomeViewModel() {
  // 时间信息（使用现有 ziwu utils）
  const timeInfo = ziwu.getTimeInfo()
  timeInfo.advice = getAdviceByShichen(timeInfo.shichen)

  // 今日日期
  const todayKey = timeService.getTodayKey()

  // 今日习惯列表
  let todayHabits = []
  try {
    todayHabits = await habitService.getTodayHabits(todayKey)
  } catch (e) {
    console.error('habitService.getTodayHabits 失败:', e)
  }

  // 今日打卡状态
  const todayStates = checkinService.getDailyStatesByDate(todayKey)
  const todayStatesByUserHabitId = new Map(
    todayStates.map(state => [state.userHabitId, state])
  )
  const allHabits = storageService.getMyHabitsWithMigration()
  const allDailyStates = storageService.getDailyCheckinStates()
  const practiceDaysByHabitId = buildPracticeDaysByHabitId(allHabits, allDailyStates)
  const builtInHabitById = new Map()

  const mergedTodayHabits = mergeTodayHabitsByHabitId(todayHabits, todayStates)

  // 构建 taskList
  const taskList = mergedTodayHabits.map((habit, sourceIndex) => {
    const state = todayStatesByUserHabitId.get(habit.userHabitId)
    const isDone = state && state.status === 'checked'
    const habitId = String(habit.habitId)
    const practiceDays = practiceDaysByHabitId.get(habitId) || 0
    const displayMeta = typeof habitService.getHabitDisplayMeta === 'function'
      ? habitService.getHabitDisplayMeta(habit)
      : null
    if ((!habit.name || !habit.category) && !displayMeta && !builtInHabitById.has(habitId)) {
      const builtInHabit = typeof habitService.getBuiltInHabitDef === 'function'
        ? habitService.getBuiltInHabitDef(habitId)
        : null
      builtInHabitById.set(habitId, builtInHabit || {})
    }
    const builtInHabit = builtInHabitById.get(habitId) || {}
    const name = displayMeta?.name || habit.name || builtInHabit.name || ''
    const category = displayMeta?.category || habit.category || builtInHabit.category || '运动类'

    return {
      _id: habit.userHabitId,
      habitId: habit.habitId,
      sourceIndex,
      title: name,
      name,
      category,
      duration: habit.duration,
      isChecked: isDone,
      isPinned: Boolean(habit.pinnedAt),
      pinnedAt: habit.pinnedAt || null,
      createdAt: habit.createdAt || '',
      addedAt: habit.addedAt || null,
      streak: practiceDays,
      bgColor: '',
      iconUrl: displayMeta?.iconUrl || getIconUrl(name),
      themeClass: displayMeta?.themeClass || getThemeClass(category),
      emoji: displayMeta?.emoji || getEmojiByCategory(category),
      meta: `${habit.duration}分钟`
    }
  }).sort(compareHomeTaskOrder).map((task, index) => ({
    ...task,
    bgColor: CIRCLE_COLORS[index % CIRCLE_COLORS.length]
  }))

  const totalCount = taskList.length
  const checkedCount = taskList.filter(t => t.isChecked).length
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  return {
    timeInfo,
    taskList,
    checkedCount,
    totalCount,
    progressPercent
  }
}

module.exports = {
  getHomeViewModel
}
