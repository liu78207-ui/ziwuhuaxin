/**
 * __tests__/unit/pages/habits-edit-strategy.test.js
 *
 * 修习页 saveStrategy 路由测试：
 * - 新增：habit.strategy.habit_id 不存在 → habitService.addHabit
 * - 修改：habit.strategy.habit_id 存在且 active → habitService.updateHabitPolicy
 * - 修改：habit.strategy.habit_id 存在但已删除（被 softDeleteHabit 删过）→ 走 addHabit 路径
 */

const mockAddHabit = jest.fn()
const mockUpdateHabitPolicy = jest.fn()
const mockGetHabitByUserHabitId = jest.fn()
const mockBuildStrategyText = jest.fn(() => '每天 1 次')
const mockSoftDeleteHabit = jest.fn()

jest.mock('../../../miniprogram/services/habitService', () => ({
  addHabit: mockAddHabit,
  updateHabitPolicy: mockUpdateHabitPolicy,
  getHabitByUserHabitId: mockGetHabitByUserHabitId,
  buildStrategyText: mockBuildStrategyText,
  softDeleteHabit: mockSoftDeleteHabit,
  buildStrategyObject: jest.fn(),
  buildHabitDisplayList: jest.fn((h) => h),
  getTodayDateStr: jest.fn(() => '2026-06-02'),
  getOffsetDateStr: jest.fn(() => '2026-06-03'),
  getNextMondayStr: jest.fn(() => '2026-06-08')
}))

let sharedPage = null

function loadHabitsPage() {
  // 重置 mock 状态
  mockAddHabit.mockReset()
  mockUpdateHabitPolicy.mockReset()
  mockGetHabitByUserHabitId.mockReset()
  mockBuildStrategyText.mockReset()
  mockSoftDeleteHabit.mockReset()
  mockAddHabit.mockResolvedValue({ userHabitId: 'uh_new' })
  mockUpdateHabitPolicy.mockResolvedValue({ userHabitId: 'uh_existing' })
  mockBuildStrategyText.mockReturnValue('每天 1 次')

  const app = {
    globalData: { MyHabits: [] }
  }
  global.getApp = jest.fn(() => app)
  global.wx = {
    navigateBack: jest.fn(),
    switchTab: jest.fn(),
    showShareMenu: jest.fn(),
    showToast: jest.fn(),
    showModal: jest.fn(),
    getStorageSync: jest.fn(() => []),
    setStorageSync: jest.fn(),
    cloud: {
      callFunction: jest.fn().mockResolvedValue({ result: { success: true } })
    }
  }
  if (!sharedPage) {
    global.Page = jest.fn(config => {
      sharedPage = {
        ...config,
        data: JSON.parse(JSON.stringify(config.data)),
        setData(update) {
          Object.assign(this.data, update)
        }
      }
      Object.keys(config).forEach(key => {
        if (typeof config[key] === 'function') {
          sharedPage[key] = config[key].bind(sharedPage)
        }
      })
    })
    require('../../../miniprogram/pages/habits/habits.js')
  }
  return { page: sharedPage, app }
}

describe('修习页 saveStrategy 路由：新增 vs 修改', () => {
  let consoleErrorSpy
  let consoleLogSpy

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    // 不 mock console.log，让调试信息能输出
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    if (consoleLogSpy) consoleLogSpy.mockRestore()
  })

  test('新增：habit.strategy.habit_id 不存在 → 调 addHabit，不调 updateHabitPolicy', async () => {
    const { page } = loadHabitsPage()
    const habit = {
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      hasStrategy: false
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 10
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'tomorrow'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.habits = [habit]
    page.data.currentTab = 0

    await page.saveStrategy()

    expect(mockAddHabit).toHaveBeenCalledTimes(1)
    expect(mockUpdateHabitPolicy).not.toHaveBeenCalled()
  })

  test('修改：habit.strategy.habit_id 存在且 active → 调 updateHabitPolicy，不调 addHabit', async () => {
    const { page } = loadHabitsPage()

    // 在 loadHabitsPage 之后设置返回值（避免被 loadHabitsPage 中的 mockReset 清除）
    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_existing_20',
      habitId: '20',
      status: 'active'
    })
    const habit = {
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      hasStrategy: true,
      strategy: {
        habit_id: 'uh_existing_20',
        habit_title: '揉腹',
        freq_type: 'daily',
        freq_rules: 1,
        freq_category: 'everyday',
        plan_start_date: '2026-06-02'
      }
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 10
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.habits = [habit]
    page.data.currentTab = 0

    // 验证 mock 在调用前已设置
    // （调试用）process.stderr.write(`mockGetHabitByUserHabitId returns: ${JSON.stringify(mockGetHabitByUserHabitId())}\n`)

    await page.saveStrategy()

    expect(mockAddHabit).not.toHaveBeenCalled()
    expect(mockUpdateHabitPolicy).toHaveBeenCalledTimes(1)
    expect(mockUpdateHabitPolicy).toHaveBeenCalledWith(
      'uh_existing_20',
      expect.objectContaining({
        startDate: '2026-06-02',
        frequencyType: 'daily'
      })
    )
  })

  test('修改未开始策略且未重新选择开始时间 → 只提示不保存', async () => {
    const { page } = loadHabitsPage()

    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_future_20',
      habitId: '20',
      status: 'active'
    })
    const habit = {
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      hasStrategy: true,
      strategy: {
        habit_id: 'uh_future_20',
        habit_title: '揉腹',
        freq_type: 'daily',
        freq_rules: 1,
        freq_category: 'everyday',
        plan_start_date: '2026-06-10'
      }
    }

    page.openEditStrategyModal(habit)
    page.data.habits = [habit]
    page.data.currentTab = 0

    await page.saveStrategy()

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '请重新选择开始时间',
      icon: 'none'
    })
    expect(mockAddHabit).not.toHaveBeenCalled()
    expect(mockUpdateHabitPolicy).not.toHaveBeenCalled()
  })

  test('修改未开始策略重新选择开始时间后 → 调 updateHabitPolicy', async () => {
    const { page } = loadHabitsPage()

    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_future_20',
      habitId: '20',
      status: 'active'
    })
    const habit = {
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      hasStrategy: true,
      strategy: {
        habit_id: 'uh_future_20',
        habit_title: '揉腹',
        freq_type: 'daily',
        freq_rules: 1,
        freq_category: 'everyday',
        plan_start_date: '2026-06-10'
      }
    }

    page.openEditStrategyModal(habit)
    page.onPlanStartOptionClick({ currentTarget: { dataset: { value: 'today' } } })
    page.data.habits = [habit]
    page.data.currentTab = 0

    await page.saveStrategy()

    expect(mockAddHabit).not.toHaveBeenCalled()
    expect(mockUpdateHabitPolicy).toHaveBeenCalledWith(
      'uh_future_20',
      expect.objectContaining({
        startDate: '2026-06-02',
        frequencyType: 'daily'
      })
    )
  })

  test('历史数据：habit.strategy.habit_id 指向已删除 userHabit → 走 addHabit 路径', async () => {
    const { page } = loadHabitsPage()

    // 在 loadHabitsPage 之后设置返回值
    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_deleted_20',
      habitId: '20',
      status: 'deleted',
      deletedAt: '2026-06-01'
    })
    const habit = {
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      hasStrategy: true,
      strategy: {
        habit_id: 'uh_deleted_20',
        habit_title: '揉腹',
        freq_type: 'daily',
        freq_rules: 1,
        freq_category: 'everyday',
        plan_start_date: '2026-05-01'
      }
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 10
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'tomorrow'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.habits = [habit]
    page.data.currentTab = 0

    await page.saveStrategy()

    expect(mockAddHabit).toHaveBeenCalledTimes(1)
    expect(mockUpdateHabitPolicy).not.toHaveBeenCalled()
  })

  test('修改弹窗回填当前策略版本的时长、间隔和星期', () => {
    const { page } = loadHabitsPage()

    page.data.weekdays = [
      { value: 1, label: '周一', checked: false },
      { value: 2, label: '周二', checked: false },
      { value: 3, label: '周三', checked: false },
      { value: 4, label: '周四', checked: false },
      { value: 5, label: '周五', checked: false },
      { value: 6, label: '周六', checked: false },
      { value: 7, label: '周日', checked: false }
    ]

    page.openEditStrategyModal({
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      createdAt: '2026-05-01',
      strategy: {
        habit_id: 'uh_existing_20',
        duration: 30,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2, 4, 6] },
        startDate: '2026-05-01'
      }
    })

    expect(page.data.selectedDuration).toBe(30)
    expect(page.data.freqCategory).toBe('weekly')
    expect(page.data.selectedWeekdays).toEqual([2, 4, 6])
    expect(page.data.selectedWeekdaysText).toBe('周二，周四，周六')
    expect(page.data.weekdays.filter(day => day.checked).map(day => day.value)).toEqual([2, 4, 6])

    page.openEditStrategyModal({
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      createdAt: '2026-05-01',
      strategy: {
        habit_id: 'uh_existing_20',
        duration: 45,
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 3 },
        startDate: '2026-05-01'
      }
    })

    expect(page.data.selectedDuration).toBe(45)
    expect(page.data.freqCategory).toBe('daily-interval')
    expect(page.data.dailyInterval).toBe(3)

    page.openEditStrategyModal({
      _id: 'catalog-20',
      title: '揉腹',
      category: '起居类',
      default_duration: 10,
      createdAt: '2026-05-01',
      strategy: {
        habit_id: 'uh_existing_20',
        duration: 60,
        freq_type: 'weekly',
        freq_rules: [1, 3, 5],
        freq_category: 'weekly',
        plan_start_date: '2026-05-01'
      }
    })

    expect(page.data.selectedDuration).toBe(60)
    expect(page.data.freqCategory).toBe('weekly')
    expect(page.data.selectedWeekdays).toEqual([1, 3, 5])
    expect(page.data.selectedWeekdaysText).toBe('周一，周三，周五')
  })
})
