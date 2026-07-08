const { pinyin } = require('./pinyin-pro')

function getHabitSortName(habit) {
  if (typeof habit === 'string') {
    return habit.trim()
  }
  return String((habit && (habit.title || habit.name || habit.habitTitle || habit.habit_title)) || '').trim()
}

function normalizeSortToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function compareStrings(a, b) {
  if (a === b) return 0
  return a > b ? 1 : -1
}

function getHabitSortKey(habitOrName) {
  const name = getHabitSortName(habitOrName)
  if (!name) return ''

  return pinyin(name, {
    toneType: 'none',
    type: 'array'
  })
    .map(normalizeSortToken)
    .filter(Boolean)
    .join('')
}

function getHabitStableSortId(habit) {
  return String((habit && (habit._id || habit.habitId || habit.userHabitId)) || '')
}

function compareHabitsByPinyinName(a, b) {
  const keyCompare = compareStrings(getHabitSortKey(a), getHabitSortKey(b))
  if (keyCompare !== 0) {
    return keyCompare
  }

  const nameCompare = compareStrings(getHabitSortName(a), getHabitSortName(b))
  if (nameCompare !== 0) {
    return nameCompare
  }

  return compareStrings(getHabitStableSortId(a), getHabitStableSortId(b))
}

module.exports = {
  getHabitSortName,
  getHabitSortKey,
  compareHabitsByPinyinName
}
