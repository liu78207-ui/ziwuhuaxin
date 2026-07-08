const {
  getHabitSortName,
  getHabitSortKey,
  compareHabitsByPinyinName
} = require('../../../miniprogram/utils/habitSort')

describe('habitSort 工具函数测试', () => {
  test('按固定字段顺序读取排序名称', () => {
    expect(getHabitSortName({ title: '八段锦', name: '艾灸' })).toBe('八段锦')
    expect(getHabitSortName({ name: '艾灸', habitTitle: '站桩' })).toBe('艾灸')
    expect(getHabitSortName({ habitTitle: '站桩', habit_title: '揉腹' })).toBe('站桩')
    expect(getHabitSortName({ habit_title: '揉腹' })).toBe('揉腹')
    expect(getHabitSortName('  晨起温水  ')).toBe('晨起温水')
  })

  test('中文名称生成稳定无声调拼音 sortKey', () => {
    expect(getHabitSortKey('八段锦')).toBe('baduanjin')
    expect(getHabitSortKey('艾灸')).toBe('aijiu')
    expect(getHabitSortKey('晨起温水')).toBe('chenqiwenshui')
    expect(getHabitSortKey('AI早睡2')).toBe('aizaoshui2')
  })

  test('按拼音排序中文习惯名称', () => {
    const habits = [
      { _id: 'z', title: '站桩' },
      { _id: 'b', title: '八段锦' },
      { _id: 'a', title: '艾灸' },
      { _id: 'c', title: '晨起温水' }
    ]

    expect(habits.sort(compareHabitsByPinyinName).map(h => h.title)).toEqual([
      '艾灸',
      '八段锦',
      '晨起温水',
      '站桩'
    ])
  })

  test('同名或空名时按稳定 ID 兜底', () => {
    const sameName = [
      { _id: 'custom_b', title: '早睡' },
      { _id: 'custom_a', title: '早睡' }
    ]
    const emptyName = [
      { habitId: '2' },
      { habitId: '1' }
    ]

    expect(sameName.sort(compareHabitsByPinyinName).map(h => h._id)).toEqual(['custom_a', 'custom_b'])
    expect(emptyName.sort(compareHabitsByPinyinName).map(h => h.habitId)).toEqual(['1', '2'])
  })

  test('排序不依赖运行时 localeCompare', () => {
    const originalLocaleCompare = String.prototype.localeCompare
    String.prototype.localeCompare = jest.fn(() => {
      throw new Error('localeCompare should not be used')
    })

    try {
      const habits = [
        { _id: 'z', title: '站桩' },
        { _id: 'b', title: '八段锦' },
        { _id: 'a', title: '艾灸' }
      ]

      expect(habits.sort(compareHabitsByPinyinName).map(h => h.title)).toEqual(['艾灸', '八段锦', '站桩'])
    } finally {
      String.prototype.localeCompare = originalLocaleCompare
    }
  })
})
