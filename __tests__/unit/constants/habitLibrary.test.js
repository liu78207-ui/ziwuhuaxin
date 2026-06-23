const habitLibrary = require('../../../miniprogram/constants/habitLibrary')

describe('habitLibrary 内置习惯定义', () => {
  test('包含新增后的 25 个内置习惯并保留新 habitId 有效性', () => {
    expect(habitLibrary.getBuiltInHabitCount()).toBe(25)
    expect(habitLibrary.isValidBuiltInHabitId('25')).toBe(true)
    expect(habitLibrary.isValidBuiltInHabitId('26')).toBe(false)
  })

  test('新增习惯定义使用固定分类与默认时长', () => {
    expect(habitLibrary.getBuiltInHabit('22')).toEqual(expect.objectContaining({
      name: '点穴',
      category: '理疗类',
      defaultDuration: 15
    }))
    expect(habitLibrary.getBuiltInHabit('23')).toEqual(expect.objectContaining({
      name: '舞蹈',
      category: '运动类',
      defaultDuration: 30
    }))
    expect(habitLibrary.getBuiltInHabit('24')).toEqual(expect.objectContaining({
      name: '健体',
      category: '运动类',
      defaultDuration: 20
    }))
    expect(habitLibrary.getBuiltInHabit('25')).toEqual(expect.objectContaining({
      name: '易筋经',
      category: '运动类',
      defaultDuration: 20
    }))
  })
})
