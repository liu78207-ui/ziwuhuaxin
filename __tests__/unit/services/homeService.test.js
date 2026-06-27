let mockData = {
  todayKey: '2026-05-12',
  todayHabits: [],
  dailyStates: [],
  myHabits: []
}

jest.mock('../../../miniprogram/utils/ziwu', () => ({
  getTimeInfo: jest.fn(() => ({
    hour: '08',
    minute: '00',
    date: '2026-05-12',
    shichen: '辰时',
    meridian: '胃经'
  }))
}))

jest.mock('../../../miniprogram/services/timeService', () => ({
  getTodayKey: jest.fn(() => mockData.todayKey)
}))

jest.mock('../../../miniprogram/services/habitService', () => ({
  getTodayHabits: jest.fn(() => Promise.resolve(mockData.todayHabits))
}))

jest.mock('../../../miniprogram/services/checkinService', () => ({
  getDailyStatesByDate: jest.fn((date) => mockData.dailyStates.filter(state => state.date === date))
}))

jest.mock('../../../miniprogram/services/storageService', () => ({
  getMyHabitsWithMigration: jest.fn(() => mockData.myHabits),
  getDailyCheckinStates: jest.fn(() => mockData.dailyStates)
}))

describe('homeService.getHomeViewModel', () => {
  beforeEach(() => {
    mockData = {
      todayKey: '2026-05-12',
      todayHabits: [],
      dailyStates: [],
      myHabits: []
    }
  })

  test('同日删除后重加同一 habitId，首页只显示一张 checked 卡片并指向已打卡实例', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_deleted',
        habitId: '3',
        name: '八段锦',
        category: '运动类',
        duration: 15,
        status: 'deleted',
        isChecked: true
      },
      {
        userHabitId: 'uh_active',
        habitId: '3',
        name: '八段锦',
        category: '运动类',
        duration: 15,
        status: 'active',
        isChecked: false
      }
    ]
    mockData.myHabits = [
      { userHabitId: 'uh_deleted', habitId: '3', status: 'deleted' },
      { userHabitId: 'uh_active', habitId: '3', status: 'active' }
    ]
    mockData.dailyStates = [
      { userHabitId: 'uh_deleted', habitId: '3', date: '2026-05-12', status: 'checked' }
    ]

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList).toHaveLength(1)
    expect(vm.taskList[0]._id).toBe('uh_deleted')
    expect(vm.taskList[0].habitId).toBe('3')
    expect(vm.taskList[0].isChecked).toBe(true)
    expect(vm.checkedCount).toBe(1)
    expect(vm.totalCount).toBe(1)
  })

  test('首页坚持天数按 habitId 跨生命周期自然日去重', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_active',
        habitId: '3',
        name: '八段锦',
        category: '运动类',
        duration: 15,
        status: 'active',
        isChecked: true
      }
    ]
    mockData.myHabits = [
      { userHabitId: 'uh_old', habitId: '3', status: 'deleted' },
      { userHabitId: 'uh_active', habitId: '3', status: 'active' }
    ]
    mockData.dailyStates = [
      { userHabitId: 'uh_old', habitId: '3', date: '2026-05-10', status: 'checked' },
      { userHabitId: 'uh_old', habitId: '3', date: '2026-05-11', status: 'checked' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-11', status: 'checked' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-12', status: 'checked' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-09', status: 'canceled' }
    ]

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList).toHaveLength(1)
    expect(vm.taskList[0].streak).toBe(3)
  })

  test('新用户首次添加并打卡时首页坚持天数为 1', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_new',
        habitId: '8',
        name: '快走',
        category: '运动类',
        duration: 30,
        status: 'active',
        isChecked: true
      }
    ]
    mockData.myHabits = [
      { userHabitId: 'uh_new', habitId: '8', status: 'active' }
    ]
    mockData.dailyStates = [
      { userHabitId: 'uh_new', habitId: '8', date: '2026-05-12', status: 'checked' }
    ]

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList).toHaveLength(1)
    expect(vm.taskList[0].isChecked).toBe(true)
    expect(vm.taskList[0].streak).toBe(1)
  })

  test('首页坚持天数只读取每日最终状态，取消、未打卡、非应修和低可信日期不计入', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_active',
        habitId: '3',
        name: '八段锦',
        category: '运动类',
        duration: 15,
        status: 'active',
        isChecked: false
      }
    ]
    mockData.myHabits = [
      { userHabitId: 'uh_old', habitId: '3', status: 'deleted' },
      { userHabitId: 'uh_active', habitId: '3', status: 'active' }
    ]
    mockData.dailyStates = [
      {
        userHabitId: 'uh_old',
        habitId: '3',
        date: '2026-05-09',
        status: 'checked',
        updatedAt: '2026-05-09T08:00:00.000Z'
      },
      {
        userHabitId: 'uh_old',
        habitId: '3',
        date: '2026-05-09',
        status: 'canceled',
        updatedAt: '2026-05-09T09:00:00.000Z'
      },
      {
        userHabitId: 'uh_old',
        habitId: '3',
        date: '2026-05-10',
        status: 'checked',
        dateConfidence: 'low'
      },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-11', status: 'checked' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-11', status: 'checked' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-12', status: 'canceled' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-13', status: 'unchecked' },
      { userHabitId: 'uh_active', habitId: '3', date: '2026-05-14', status: 'not_required' }
    ]

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList).toHaveLength(1)
    expect(vm.taskList[0].isChecked).toBe(false)
    expect(vm.taskList[0].streak).toBe(1)
  })

  test('首页习惯默认按添加顺序排序', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_late',
        habitId: '20',
        name: '八段锦',
        category: '起居类',
        duration: 45,
        status: 'active',
        isChecked: true,
        createdAt: '2026-05-12'
      },
      {
        userHabitId: 'uh_early',
        habitId: '3',
        name: '揉腹',
        category: '运动类',
        duration: 15,
        status: 'active',
        isChecked: false,
        createdAt: '2026-05-01'
      }
    ]
    mockData.myHabits = [
      { userHabitId: 'uh_early', habitId: '3', status: 'active' },
      { userHabitId: 'uh_late', habitId: '20', status: 'active' }
    ]
    mockData.dailyStates = [
      { userHabitId: 'uh_late', habitId: '20', date: '2026-05-12', status: 'checked' }
    ]

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList.map(item => item._id)).toEqual(['uh_early', 'uh_late'])
    expect(vm.taskList.find(item => item._id === 'uh_late').meta).toBe('45分钟')
  })

  test('同一天添加多个习惯时按 addedAt 排序，不回退到名称排序', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_late',
        habitId: '20',
        name: '八段锦',
        category: '起居类',
        duration: 10,
        status: 'active',
        createdAt: '2026-05-12',
        addedAt: '2026-05-12T09:00:00.000Z'
      },
      {
        userHabitId: 'uh_early',
        habitId: '3',
        name: '揉腹',
        category: '运动类',
        duration: 15,
        status: 'active',
        createdAt: '2026-05-12',
        addedAt: '2026-05-12T08:00:00.000Z'
      }
    ]
    mockData.myHabits = mockData.todayHabits.map(h => ({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      status: h.status,
      createdAt: h.createdAt,
      addedAt: h.addedAt
    }))

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList.map(item => item._id)).toEqual(['uh_early', 'uh_late'])
    expect(vm.taskList.map(item => item.title)).toEqual(['揉腹', '八段锦'])
  })

  test('旧数据缺少 addedAt 且 createdAt 相同时从 userHabitId 时间戳兜底排序', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_20_1800000000100_abcd',
        habitId: '20',
        name: '八段锦',
        category: '起居类',
        duration: 10,
        status: 'active',
        createdAt: '2026-05-12'
      },
      {
        userHabitId: 'uh_3_1800000000000_wxyz',
        habitId: '3',
        name: '揉腹',
        category: '运动类',
        duration: 15,
        status: 'active',
        createdAt: '2026-05-12'
      }
    ]
    mockData.myHabits = mockData.todayHabits.map(h => ({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      status: h.status,
      createdAt: h.createdAt
    }))

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList.map(item => item._id)).toEqual([
      'uh_3_1800000000000_wxyz',
      'uh_20_1800000000100_abcd'
    ])
  })

  test('混合新旧数据时先还原每条习惯的有效添加时间再排序', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_new',
        habitId: '20',
        name: '八段锦',
        category: '起居类',
        duration: 10,
        status: 'active',
        createdAt: '2026-05-12',
        addedAt: '2026-05-12T09:00:00.000Z'
      },
      {
        userHabitId: 'uh_3_1778572800000_wxyz',
        habitId: '3',
        name: '揉腹',
        category: '运动类',
        duration: 15,
        status: 'active',
        createdAt: '2026-05-12'
      }
    ]
    mockData.myHabits = mockData.todayHabits.map(h => ({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      status: h.status,
      createdAt: h.createdAt,
      addedAt: h.addedAt || null
    }))

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList.map(item => item._id)).toEqual([
      'uh_3_1778572800000_wxyz',
      'uh_new'
    ])
  })

  test('首页置顶习惯排在未置顶习惯前，置顶组内按添加时间排序', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_regular',
        habitId: '20',
        name: '揉腹',
        category: '起居类',
        duration: 10,
        status: 'active',
        createdAt: '2026-05-01'
      },
      {
        userHabitId: 'uh_pin_late',
        habitId: '3',
        name: '八段锦',
        category: '运动类',
        duration: 15,
        status: 'active',
        createdAt: '2026-05-03',
        addedAt: '2026-05-03T09:00:00.000Z',
        pinnedAt: '2026-06-02T09:00:00.000Z'
      },
      {
        userHabitId: 'uh_pin_early',
        habitId: '18',
        name: '梳头',
        category: '起居类',
        duration: 5,
        status: 'active',
        createdAt: '2026-05-04',
        addedAt: '2026-05-03T08:00:00.000Z',
        pinnedAt: '2026-06-01T09:00:00.000Z'
      }
    ]
    mockData.myHabits = mockData.todayHabits.map(h => ({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      status: h.status,
      createdAt: h.createdAt,
      addedAt: h.addedAt || null,
      pinnedAt: h.pinnedAt || null
    }))
    mockData.dailyStates = []

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList.map(item => item._id)).toEqual(['uh_pin_early', 'uh_pin_late', 'uh_regular'])
    expect(vm.taskList.slice(0, 2).every(item => item.isPinned)).toBe(true)
    expect(vm.taskList[2].isPinned).toBe(false)
  })

  test('首页缺少时间字段且无法解析 userHabitId 时按原始列表顺序稳定兜底', async () => {
    mockData.todayHabits = [
      {
        userHabitId: 'uh_b',
        habitId: '20',
        name: '揉腹',
        category: '起居类',
        duration: 10,
        status: 'active'
      },
      {
        userHabitId: 'uh_a',
        habitId: '3',
        name: '八段锦',
        category: '运动类',
        duration: 15,
        status: 'active'
      }
    ]
    mockData.myHabits = mockData.todayHabits.map(h => ({
      userHabitId: h.userHabitId,
      habitId: h.habitId,
      status: h.status
    }))

    const homeService = require('../../../miniprogram/services/homeService')
    const vm = await homeService.getHomeViewModel()

    expect(vm.taskList.map(item => item.title)).toEqual(['揉腹', '八段锦'])
  })
})
