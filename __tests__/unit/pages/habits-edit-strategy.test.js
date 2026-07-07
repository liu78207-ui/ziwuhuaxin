/**
 * __tests__/unit/pages/habits-edit-strategy.test.js
 *
 * 修习页 saveStrategy 路由测试：
 * - 新增：habit.strategy.userHabitId 不存在 → habitService.addHabit
 * - 修改：habit.strategy.userHabitId 存在且 active → habitService.updateHabitPolicy
 * - 修改：habit.strategy.userHabitId 存在但已删除（被 softDeleteHabit 删过）→ 走 addHabit 路径
 */

const mockAddHabit = jest.fn()
const mockAddCustomHabit = jest.fn()
const mockAddCustomHabitInstance = jest.fn()
const mockUpdateHabitPolicy = jest.fn()
const mockUpdateCustomHabitMeta = jest.fn()
const mockRenameCustomHabitAsNew = jest.fn()
const mockGetHabitByUserHabitId = jest.fn()
const mockFindCustomHabitByName = jest.fn()
const mockIsHabitCheckedOnDate = jest.fn()
const mockBuildStrategyText = jest.fn(() => '每天 1 次')
const mockBuildHabitDisplayList = jest.fn((h) => h)
const mockSoftDeleteHabit = jest.fn()
const fs = require('fs')
const path = require('path')

jest.mock('../../../miniprogram/services/habitService', () => ({
  addHabit: mockAddHabit,
  addCustomHabit: mockAddCustomHabit,
  addCustomHabitInstance: mockAddCustomHabitInstance,
  updateHabitPolicy: mockUpdateHabitPolicy,
  updateCustomHabitMeta: mockUpdateCustomHabitMeta,
  renameCustomHabitAsNew: mockRenameCustomHabitAsNew,
  getHabitByUserHabitId: mockGetHabitByUserHabitId,
  findCustomHabitByName: mockFindCustomHabitByName,
  isHabitCheckedOnDate: mockIsHabitCheckedOnDate,
  normalizeCustomHabitName: jest.fn(value => String(value || '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12)),
  buildStrategyText: mockBuildStrategyText,
  softDeleteHabit: mockSoftDeleteHabit,
  cleanupNamelessCustomHabits: jest.fn(),
  buildStrategyObject: jest.fn(),
  buildHabitDisplayList: mockBuildHabitDisplayList,
  getTodayDateStr: jest.fn(() => '2026-06-02'),
  getOffsetDateStr: jest.fn(() => '2026-06-03'),
  getNextMondayStr: jest.fn(() => '2026-06-08')
}))

let sharedPage = null

function loadHabitsPage() {
  // 重置 mock 状态
  mockAddHabit.mockReset()
  mockAddCustomHabit.mockReset()
  mockAddCustomHabitInstance.mockReset()
  mockUpdateHabitPolicy.mockReset()
  mockUpdateCustomHabitMeta.mockReset()
  mockRenameCustomHabitAsNew.mockReset()
  mockGetHabitByUserHabitId.mockReset()
  mockFindCustomHabitByName.mockReset()
  mockIsHabitCheckedOnDate.mockReset()
  mockBuildStrategyText.mockReset()
  mockBuildHabitDisplayList.mockReset()
  mockSoftDeleteHabit.mockReset()
  mockAddHabit.mockResolvedValue({ userHabitId: 'uh_new' })
  mockAddCustomHabit.mockResolvedValue({
    userHabitId: 'uh_custom_new',
    habitId: 'custom_new',
    source: 'custom',
    name: '早睡',
    category: '自定义',
    themeClass: 't-purple'
  })
  mockAddCustomHabitInstance.mockResolvedValue({
    userHabitId: 'uh_custom_reactive',
    habitId: 'custom_existing',
    source: 'custom',
    name: '早睡',
    category: '自定义',
    themeClass: 't-purple'
  })
  mockUpdateHabitPolicy.mockResolvedValue({ userHabitId: 'uh_existing' })
  mockUpdateCustomHabitMeta.mockResolvedValue({ userHabitId: 'uh_existing' })
  mockRenameCustomHabitAsNew.mockResolvedValue({
    userHabitId: 'uh_custom_new_name',
    habitId: 'custom_new_name',
    source: 'custom',
    name: '击剑',
    category: '自定义',
    themeClass: 't-purple'
  })
  mockFindCustomHabitByName.mockReturnValue(null)
  mockIsHabitCheckedOnDate.mockReturnValue(false)
  mockBuildStrategyText.mockReturnValue('每天 1 次')
  mockBuildHabitDisplayList.mockImplementation(h => h)

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

  test('新增：habit.strategy.userHabitId 不存在 → 调 addHabit，不调 updateHabitPolicy', async () => {
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

  test('修改：habit.strategy.userHabitId 存在且 active → 调 updateHabitPolicy，不调 addHabit', async () => {
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
        userHabitId: 'uh_existing_20',
        habitTitle: '揉腹',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
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
        userHabitId: 'uh_future_20',
        habitTitle: '揉腹',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-10'
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
        userHabitId: 'uh_future_20',
        habitTitle: '揉腹',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-10'
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

  test('canonical 数据：habit.strategy.userHabitId 指向已删除 userHabit → 走 addHabit 路径', async () => {
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
        userHabitId: 'uh_deleted_20',
        habitTitle: '揉腹',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-05-01'
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

  test('已停用自定义习惯再次保存 → 复用 custom habitId 创建新 userHabitId', async () => {
    const { page } = loadHabitsPage()
    const habit = {
      _id: 'custom_existing',
      title: '早睡',
      name: '早睡',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: false,
      strategy: null
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 25
    page.data.freqCategory = 'weekly'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = [1, 3, 5]
    page.data.planStartDate = 'tomorrow'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '早睡'
    page.data.habits = [
      { _id: '1', title: '八段锦', category: '运动类', source: 'system', hasStrategy: false },
      habit
    ]
    page.data.currentTab = 4
    page.scheduleUserHabitsStatusRefresh = jest.fn()
    mockBuildHabitDisplayList.mockReturnValue([
      { _id: '1', title: '八段锦', category: '运动类', source: 'system', hasStrategy: false },
      {
        _id: 'custom_existing',
        userHabitId: 'uh_custom_reactive',
        title: '早睡',
        name: '早睡',
        source: 'custom',
        category: '自定义',
        iconUrl: '/assets/icons/habit-zidingyi.png',
        hasStrategy: true,
        strategy: {
          userHabitId: 'uh_custom_reactive',
          duration: 25,
          frequencyType: 'weekly',
          frequencyConfig: { weekdays: [1, 3, 5] },
          startDate: '2026-06-03'
        },
        strategyText: '每周 3 次 · 25分钟'
      }
    ])

    await page.saveStrategy()

    expect(mockAddCustomHabitInstance).toHaveBeenCalledWith(
      'custom_existing',
      { name: '早睡' },
      expect.objectContaining({
        duration: 25,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [1, 3, 5] },
        startDate: '2026-06-03'
      })
    )
    expect(mockAddCustomHabit).not.toHaveBeenCalled()
    expect(mockAddHabit).not.toHaveBeenCalled()
    expect(mockUpdateHabitPolicy).not.toHaveBeenCalled()
    expect(mockBuildHabitDisplayList).toHaveBeenCalledWith([
      expect.objectContaining({ _id: '1', source: 'system' })
    ])
    expect(page.scheduleUserHabitsStatusRefresh).not.toHaveBeenCalled()
    const customCards = page.data.filteredHabits.filter(h => h._id === 'custom_existing')
    expect(customCards).toHaveLength(1)
    expect(customCards[0]).toEqual(expect.objectContaining({
      hasStrategy: true,
      strategy: expect.objectContaining({
        userHabitId: 'uh_custom_reactive'
      })
    }))
  })

  test('已添加自定义习惯改成全新名称时先弹出分流确认', async () => {
    const { page } = loadHabitsPage()
    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_custom_active',
      habitId: 'custom_active',
      status: 'active'
    })
    const habit = {
      _id: 'custom_active',
      title: '跆拳道',
      name: '跆拳道',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: true,
      strategy: {
        userHabitId: 'uh_custom_active',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }

    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '击剑'
    page.data.habits = [habit]
    page.data.currentTab = 4

    await page.saveStrategy()

    expect(page.data.showRenameChoiceModal).toBe(true)
    expect(page.data.renameChoiceContent).toContain('仅改名称连续记录不变。\n作为新习惯会重新记录，原历史保留。')
    expect(mockUpdateCustomHabitMeta).not.toHaveBeenCalled()
    expect(mockRenameCustomHabitAsNew).not.toHaveBeenCalled()
    expect(mockUpdateHabitPolicy).not.toHaveBeenCalled()
  })

  test('改名分流弹窗只渲染两个选项且不显示取消按钮', () => {
    const template = fs.readFileSync(
      path.join(process.cwd(), 'miniprogram/pages/habits/habits.wxml'),
      'utf8'
    )
    const modalStart = template.indexOf('<!-- 自定义习惯改名确认弹窗 -->')
    const modalEnd = template.indexOf('<!-- 删除习惯确认弹窗 -->')
    const modalTemplate = template.slice(modalStart, modalEnd)

    expect(modalTemplate).toContain('仅改名称')
    expect(modalTemplate).toContain('作为新习惯')
    expect(modalTemplate.indexOf('>作为新习惯</button>')).toBeLessThan(modalTemplate.indexOf('{{renameChoicePrimaryText'))
    expect(modalTemplate).toContain('rename-choice-secondary')
    expect(modalTemplate).not.toContain('>取消</button>')
    expect((modalTemplate.match(/rename-choice-btn/g) || []).length).toBe(2)
  })

  test('自定义名称输入框和占位文字字重保持一致', () => {
    const styles = fs.readFileSync(
      path.join(process.cwd(), 'miniprogram/pages/habits/habits.wxss'),
      'utf8'
    )
    const inputStyle = styles.slice(
      styles.indexOf('.custom-title-input'),
      styles.indexOf('.custom-title-placeholder')
    )
    const placeholderStyle = styles.slice(
      styles.indexOf('.custom-title-placeholder'),
      styles.indexOf('.custom-name-error')
    )

    expect(inputStyle).toContain('font-weight: 500;')
    expect(placeholderStyle).toContain('font-weight: 500;')
  })

  test('改名分流弹窗点击遮罩关闭后不保存', () => {
    const { page } = loadHabitsPage()
    page.data.showRenameChoiceModal = true
    page.data.pendingRenameChoice = {
      habit: { _id: 'custom_active' },
      existingUserHabitId: 'uh_custom_active',
      customHabitName: '击剑'
    }
    page.data.renameChoiceContent = '仅改名称连续记录不变。\n作为新习惯会重新记录，原历史保留。'
    page.data.renameChoiceTodayChecked = false
    page.data.isConfirmingRenameChoice = false

    page.closeRenameChoiceModal()

    expect(page.data.showRenameChoiceModal).toBe(false)
    expect(page.data.pendingRenameChoice).toBe(null)
    expect(mockUpdateCustomHabitMeta).not.toHaveBeenCalled()
    expect(mockRenameCustomHabitAsNew).not.toHaveBeenCalled()
    expect(mockUpdateHabitPolicy).not.toHaveBeenCalled()
  })

  test('自定义弹窗关闭动画期间保留自定义标题状态避免闪出策略标题', () => {
    jest.useFakeTimers()
    const { page } = loadHabitsPage()
    page.data.showModal = true
    page.data.selectedHabit = {
      _id: 'custom_active',
      title: '跆拳道',
      source: 'custom'
    }
    page.data.isCustomHabitModal = true
    page.data.isEditingStrategy = true
    page.data.customHabitName = '跆拳道'

    page.closeModal()

    expect(page.data.showModal).toBe(false)
    expect(page.data.isCustomHabitModal).toBe(true)
    expect(page.data.customHabitName).toBe('跆拳道')
    expect(page.data.selectedHabit).toEqual(expect.objectContaining({
      title: '跆拳道'
    }))

    jest.advanceTimersByTime(300)

    expect(page.data.isCustomHabitModal).toBe(false)
    expect(page.data.customHabitName).toBe('')
    expect(page.data.selectedHabit).toBe(null)
    jest.useRealTimers()
  })

  test('自定义弹窗关闭动画未结束时重新打开不会被旧定时器清空', () => {
    jest.useFakeTimers()
    const { page } = loadHabitsPage()
    page.data.showModal = true
    page.data.selectedHabit = {
      _id: 'custom_active',
      title: '跆拳道',
      source: 'custom'
    }
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '跆拳道'

    page.closeModal()
    page.openAddCustomHabitModal()
    page.data.customHabitName = '新习惯'
    jest.advanceTimersByTime(300)

    expect(page.data.showModal).toBe(true)
    expect(page.data.isCustomHabitModal).toBe(true)
    expect(page.data.customHabitName).toBe('新习惯')
    expect(page.data.selectedHabit).toEqual(expect.objectContaining({
      source: 'custom'
    }))
    jest.useRealTimers()
  })

  test('今天已完成时改名分流弹窗不重复显示完成记录归属提示', async () => {
    const { page } = loadHabitsPage()
    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_custom_active',
      habitId: 'custom_active',
      status: 'active'
    })
    mockIsHabitCheckedOnDate.mockReturnValue(true)
    const habit = {
      _id: 'custom_active',
      title: '跆拳道',
      name: '跆拳道',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: true,
      strategy: {
        userHabitId: 'uh_custom_active',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '击剑'
    page.data.habits = [habit]
    page.data.currentTab = 4

    await page.saveStrategy()

    expect(page.data.renameChoiceContent).toBe('仅改名称连续记录不变。\n作为新习惯会重新记录，原历史保留。')
    expect(page.data.renameChoiceContent).not.toContain('今天的完成记录留在原习惯。')
  })

  test('已停用自定义习惯再次启用且名称变化时先弹出分流确认', async () => {
    const { page } = loadHabitsPage()
    const habit = {
      _id: 'custom_existing',
      title: '早睡',
      name: '早睡',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: false,
      strategy: null
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '冥想'
    page.data.habits = [habit]
    page.data.currentTab = 4

    await page.saveStrategy()

    expect(page.data.showRenameChoiceModal).toBe(true)
    expect(page.data.renameChoiceContent).toBe('沿用原习惯会保留历史归属。\n作为新习惯会重新记录，原历史保留。')
    expect(page.data.renameChoicePrimaryText).toBe('沿用原习惯')
    expect(page.data.pendingRenameChoice).toEqual(expect.objectContaining({
      habit,
      existingCustomHabitId: 'custom_existing',
      customHabitName: '冥想',
      renameChoiceType: 'reactivate'
    }))
    expect(mockAddCustomHabitInstance).not.toHaveBeenCalled()
    expect(mockAddCustomHabit).not.toHaveBeenCalled()
  })

  test('已停用自定义改名选择沿用原习惯时复用 custom habitId', async () => {
    const { page } = loadHabitsPage()
    const habit = {
      _id: 'custom_existing',
      title: '早睡',
      name: '早睡',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: false,
      strategy: null
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '冥想'
    page.data.habits = [{ _id: '1', title: '八段锦', category: '运动类', source: 'system' }, habit]
    page.data.currentTab = 4
    page.data.pendingRenameChoice = {
      habit,
      existingCustomHabitId: 'custom_existing',
      customHabitName: '冥想',
      renameChoiceType: 'reactivate',
      policyInput: {
        duration: 20,
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }

    await page.saveStrategy({ renameDecision: 'reuseExisting', renameContext: page.data.pendingRenameChoice })

    expect(mockAddCustomHabitInstance).toHaveBeenCalledWith(
      'custom_existing',
      { name: '冥想' },
      expect.objectContaining({
        frequencyType: 'daily'
      })
    )
    expect(mockAddCustomHabit).not.toHaveBeenCalled()
  })

  test('已停用自定义改名选择作为新习惯时创建新 custom habitId', async () => {
    const { page } = loadHabitsPage()
    const habit = {
      _id: 'custom_existing',
      title: '早睡',
      name: '早睡',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: false,
      strategy: null
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '冥想'
    page.data.habits = [{ _id: '1', title: '八段锦', category: '运动类', source: 'system' }, habit]
    page.data.currentTab = 4
    page.data.pendingRenameChoice = {
      habit,
      existingCustomHabitId: 'custom_existing',
      customHabitName: '冥想',
      renameChoiceType: 'reactivate',
      policyInput: {
        duration: 20,
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }

    await page.saveStrategy({ renameDecision: 'asNew', renameContext: page.data.pendingRenameChoice })

    expect(mockAddCustomHabit).toHaveBeenCalledWith(
      { name: '冥想' },
      expect.objectContaining({
        frequencyType: 'daily'
      })
    )
    expect(mockAddCustomHabitInstance).not.toHaveBeenCalled()
  })

  test('改名选择仅修改名称时保留原 userHabitId 并更新策略', async () => {
    const { page } = loadHabitsPage()
    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_custom_active',
      habitId: 'custom_active',
      status: 'active'
    })
    const habit = {
      _id: 'custom_active',
      title: '跆拳道',
      name: '跆拳道',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: true,
      strategy: {
        userHabitId: 'uh_custom_active',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '击剑'
    page.data.habits = [habit]
    page.data.currentTab = 4
    page.data.pendingRenameChoice = {
      habit,
      existingUserHabitId: 'uh_custom_active',
      customHabitName: '击剑',
      policyInput: {
        duration: 20,
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }

    await page.saveStrategy({ renameDecision: 'renameOnly', renameContext: page.data.pendingRenameChoice })

    expect(mockUpdateCustomHabitMeta).toHaveBeenCalledWith('uh_custom_active', { name: '击剑' })
    expect(mockUpdateHabitPolicy).toHaveBeenCalledWith('uh_custom_active', expect.objectContaining({
      frequencyType: 'daily'
    }))
    expect(mockRenameCustomHabitAsNew).not.toHaveBeenCalled()
  })

  test('改名选择作为新习惯时创建新生命周期', async () => {
    const { page } = loadHabitsPage()
    mockGetHabitByUserHabitId.mockReturnValue({
      userHabitId: 'uh_custom_active',
      habitId: 'custom_active',
      status: 'active'
    })
    const habit = {
      _id: 'custom_active',
      title: '跆拳道',
      name: '跆拳道',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: true,
      strategy: {
        userHabitId: 'uh_custom_active',
        frequencyType: 'daily',
        frequencyConfig: { intervalDays: 1 },
        startDate: '2026-06-02'
      }
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 30
    page.data.freqCategory = 'weekly'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = [2, 4]
    page.data.planStartDate = 'tomorrow'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '击剑'
    page.data.habits = [habit]
    page.data.currentTab = 4

    await page.saveStrategy({ renameDecision: 'asNew' })

    expect(mockRenameCustomHabitAsNew).toHaveBeenCalledWith(
      'uh_custom_active',
      { name: '击剑' },
      expect.objectContaining({
        duration: 30,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2, 4] },
        startDate: '2026-06-03'
      })
    )
    expect(mockUpdateCustomHabitMeta).not.toHaveBeenCalled()
  })

  test('自定义库达到上限时展示上限提示且保留弹窗', async () => {
    const { page } = loadHabitsPage()
    mockAddCustomHabit.mockRejectedValue(new Error('CUSTOM_HABIT_LIBRARY_LIMIT_REACHED'))
    const habit = {
      _id: 'custom-add-draft',
      title: '',
      name: '',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: false,
      strategy: null
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '新习惯'
    page.data.showModal = true
    page.data.habits = [habit]
    page.data.currentTab = 4

    await page.saveStrategy()

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '自定义习惯已满 12 个',
      icon: 'none'
    })
    expect(page.data.showModal).toBe(true)
    expect(page.data.isSavingStrategy).toBe(false)
  })

  test('活跃自定义达到上限时展示 active 上限提示且保留弹窗', async () => {
    const { page } = loadHabitsPage()
    mockAddCustomHabitInstance.mockRejectedValue(new Error('CUSTOM_ACTIVE_HABIT_LIMIT_REACHED'))
    const habit = {
      _id: 'custom_existing',
      title: '早睡',
      name: '早睡',
      source: 'custom',
      category: '自定义',
      default_duration: 20,
      hasStrategy: false,
      strategy: null
    }
    page.data.selectedHabit = habit
    page.data.selectedDuration = 20
    page.data.freqCategory = 'everyday'
    page.data.dailyInterval = 2
    page.data.selectedWeekdays = []
    page.data.planStartDate = 'today'
    page.data.planStartDateCustom = ''
    page.data.planStartNeedsReselect = false
    page.data.isCustomHabitModal = true
    page.data.customHabitName = '早睡'
    page.data.showModal = true
    page.data.habits = [habit]
    page.data.currentTab = 4

    await page.saveStrategy()

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '自定义最多启用 5 个',
      icon: 'none'
    })
    expect(page.data.showModal).toBe(true)
    expect(page.data.isSavingStrategy).toBe(false)
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
        userHabitId: 'uh_existing_20',
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
        userHabitId: 'uh_existing_20',
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
        userHabitId: 'uh_existing_20',
        duration: 60,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [1, 3, 5] },
        startDate: '2026-05-01'
      }
    })

    expect(page.data.selectedDuration).toBe(60)
    expect(page.data.freqCategory).toBe('weekly')
    expect(page.data.selectedWeekdays).toEqual([1, 3, 5])
    expect(page.data.selectedWeekdaysText).toBe('周一，周三，周五')
  })
})
