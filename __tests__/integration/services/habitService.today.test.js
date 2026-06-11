/**
 * __tests__/integration/services/habitService.today.test.js
 *
 * habitService.getTodayHabits 行为测试
 *
 * 覆盖：
 * - 未来策略：effectiveStartDate > today 的 userHabit 不应在今日出现
 * - 当日策略：effectiveStartDate === today 的 userHabit 应出现
 * - 过期策略：effectiveStartDate < today 的 userHabit 应出现
 * - 多策略版本：只有 effectiveEndDate === null 的最新版参与筛选
 * - 同一 habitId 多个 userHabitId 各自独立判断
 */

let mockData = {
  myHabits: [],
  policyVersions: [],
  dailyStates: []
}

jest.mock('../../../miniprogram/services/storageService', () => ({
  getMyHabitsWithMigration: jest.fn(() => mockData.myHabits),
  setMyHabits: jest.fn(),
  getDailyCheckinStates: jest.fn(() => mockData.dailyStates),
  getDailyStatesByDate: jest.fn((date) => mockData.dailyStates.filter(s => s.date === date)),
  getDailyState: jest.fn((userHabitId, date) =>
    mockData.dailyStates.find(s => s.userHabitId === userHabitId && s.date === date) || null
  ),
  getPolicyVersions: jest.fn(() => mockData.policyVersions),
  getPolicyVersionsByUserHabitId: jest.fn((uhId) =>
    mockData.policyVersions.filter(pv => pv.userHabitId === uhId)
  ),
  getActivePolicyVersion: jest.fn((uhId) => {
    return mockData.policyVersions.find(
      pv => pv.userHabitId === uhId && pv.effectiveEndDate === null
    ) || null
  }),
  getMigrationMeta: jest.fn(() => ({ userHabitInstances: {} })),
  setMigrationMeta: jest.fn()
}))

const storageService = require('../../../miniprogram/services/storageService')

const habitLibrary = require('../../../miniprogram/constants/habitLibrary')
jest.spyOn(habitLibrary, 'getBuiltInHabit').mockImplementation((habitId) => ({
  habitId,
  name: `测试习惯-${habitId}`,
  category: '运动类',
  targetMinutes: 20,
  themeClass: 't-green'
}))
jest.spyOn(habitLibrary, 'getAllBuiltInHabits').mockImplementation(() => [])
jest.spyOn(habitLibrary, 'isValidBuiltInHabitId').mockImplementation(() => true)

describe('habitService.getTodayHabits 未来策略过滤', () => {
  beforeEach(() => {
    mockData = { myHabits: [], policyVersions: [], dailyStates: [] }
  })

  test('今日策略（effectiveStartDate === today）应展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_today', habitId: 'h1', status: 'active', createdAt: '2026-05-10' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv1', userHabitId: 'uh_today', effectiveStartDate: '2026-05-10', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_today')
  })

  test('明天开始的策略（effectiveStartDate = tomorrow）今日不展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_tomorrow', habitId: 'h1', status: 'active', createdAt: '2026-05-10' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv1', userHabitId: 'uh_tomorrow', effectiveStartDate: '2026-05-11', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(0)
  })

  test('未来日期开始的策略（effectiveStartDate = future）今日不展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_future', habitId: 'h1', status: 'active', createdAt: '2026-05-10' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv1', userHabitId: 'uh_future', effectiveStartDate: '2026-06-01', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(0)
  })

  test('已过期策略（effectiveStartDate < today）应展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_past', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv1', userHabitId: 'uh_past', effectiveStartDate: '2026-01-01', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_past')
  })

  test('多策略版本：只有 effectiveEndDate === null 的最新版参与判断', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_multi', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv_old', userHabitId: 'uh_multi', effectiveStartDate: '2026-01-01', effectiveEndDate: '2026-05-09', frequencyType: 'daily' },
      { policyVersionId: 'pv_new', userHabitId: 'uh_multi', effectiveStartDate: '2026-05-10', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_multi')
    expect(result[0].policy.policyVersionId).toBe('pv_new')
  })

  test('多策略版本且最新版在明天：今日不展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_multi_future', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv_old', userHabitId: 'uh_multi_future', effectiveStartDate: '2026-01-01', effectiveEndDate: '2026-05-09', frequencyType: 'daily' },
      { policyVersionId: 'pv_new', userHabitId: 'uh_multi_future', effectiveStartDate: '2026-05-11', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(0)
  })

  test('混合场景：过滤掉未来策略，保留当日/过期策略', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_past', habitId: 'h1', status: 'active', createdAt: '2026-01-01' },
      { userHabitId: 'uh_today', habitId: 'h2', status: 'active', createdAt: '2026-05-10' },
      { userHabitId: 'uh_tomorrow', habitId: 'h3', status: 'active', createdAt: '2026-05-10' },
      { userHabitId: 'uh_future', habitId: 'h4', status: 'active', createdAt: '2026-05-10' }
    ]
    mockData.policyVersions = [
      { policyVersionId: 'pv1', userHabitId: 'uh_past', effectiveStartDate: '2026-01-01', effectiveEndDate: null, frequencyType: 'daily' },
      { policyVersionId: 'pv2', userHabitId: 'uh_today', effectiveStartDate: '2026-05-10', effectiveEndDate: null, frequencyType: 'daily' },
      { policyVersionId: 'pv3', userHabitId: 'uh_tomorrow', effectiveStartDate: '2026-05-11', effectiveEndDate: null, frequencyType: 'daily' },
      { policyVersionId: 'pv4', userHabitId: 'uh_future', effectiveStartDate: '2026-06-01', effectiveEndDate: null, frequencyType: 'daily' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    const ids = result.map(r => r.userHabitId).sort()
    expect(ids).toEqual(['uh_past', 'uh_today'])
  })

  test('每周三频率：今天 (2026-05-12 是周二) 不是应修日，不展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_weekly', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_weekly',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] } // 每周三
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    // 2026-05-12 是周二
    const result = await habitService.getTodayHabits('2026-05-12')

    expect(result).toHaveLength(0)
  })

  test('每周三频率：今天 (2026-05-13 是周三) 是应修日，展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_weekly', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_weekly',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    // 2026-05-13 是周三
    const result = await habitService.getTodayHabits('2026-05-13')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_weekly')
  })

  test('每 3 天间隔：今天 (2026-05-10) 是起算日当天，应展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_interval', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_interval',
        effectiveStartDate: '2026-05-10',
        effectiveEndDate: null,
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 3 }
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-10')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_interval')
  })

  test('每 3 天间隔：今天 (2026-05-11) 非应修日，不展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_interval', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_interval',
        effectiveStartDate: '2026-05-10',
        effectiveEndDate: null,
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 3 }
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-11')

    expect(result).toHaveLength(0)
  })

  test('每 3 天间隔：今天 (2026-05-13) 是应修日 (起算 + 3)，应展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_interval', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_interval',
        effectiveStartDate: '2026-05-10',
        effectiveEndDate: null,
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 3 }
      }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-13')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_interval')
  })

  test('编辑后今天已打卡（未来策略）→ 案台仍展示', async () => {
    // 用户场景：
    // 1. 添加揉腹 daily 今天开始，今天已打卡
    // 2. 编辑为 weekly 周三，startDate = 明天（今天是周二）
    // 期望：案台今天仍展示（因为已打卡），但仅展示，不可重复打卡

    mockData.myHabits = [
      { userHabitId: 'uh_edited', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      // 旧策略（已关闭）
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh_edited',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12', // 周二旧版结束
        frequencyType: 'daily'
      },
      // 新策略（active，但今天不是周三）
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh_edited',
        effectiveStartDate: '2026-05-13', // 周三新版开始
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]
    // 今天 (周二) 已打卡
    mockData.dailyStates = [
      { userHabitId: 'uh_edited', date: '2026-05-12', status: 'checked' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-12')

    // 关键断言：今天已打卡，案台仍展示
    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_edited')
    expect(result[0].isChecked).toBe(true)
  })

  test('编辑后今天未打卡（未来策略）→ 案台不展示', async () => {
    mockData.myHabits = [
      { userHabitId: 'uh_edited', habitId: 'h1', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh_edited',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh_edited',
        effectiveStartDate: '2026-05-13',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]
    // 今天未打卡
    mockData.dailyStates = []

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-12')

    expect(result).toHaveLength(0)
  })

  test('删除当天已打卡 → 案台仍展示已打卡实例', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_deleted_checked',
        habitId: 'h1',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-12'
      }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh_deleted_checked',
        effectiveStartDate: '2026-05-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      }
    ]
    mockData.dailyStates = [
      { userHabitId: 'uh_deleted_checked', date: '2026-05-12', status: 'checked' }
    ]

    const habitService = require('../../../miniprogram/services/habitService')
    const result = await habitService.getTodayHabits('2026-05-12')

    expect(result).toHaveLength(1)
    expect(result[0].userHabitId).toBe('uh_deleted_checked')
    expect(result[0].status).toBe('deleted')
    expect(result[0].isChecked).toBe(true)
  })

  test('案台与观心用同一个 isDueOnDateByFrequency：观心的判定结果应与案台一致', async () => {
    // 此测试的语义：
    // - 在同一个 userHabit 上，案台 getTodayHabits 的「应展示」集合
    //   必须等于观心 buildDayVerdicts 的「isDue=true 且非 future」集合
    // 验证两个服务用同一个 reportAggregator.isDueOnDateByFrequency

    mockData.myHabits = [
      { userHabitId: 'uh_a', habitId: 'h_a', status: 'active', createdAt: '2026-01-01' },
      { userHabitId: 'uh_b', habitId: 'h_b', status: 'active', createdAt: '2026-01-01' }
    ]
    mockData.policyVersions = [
      {
        policyVersionId: 'pv_a',
        userHabitId: 'uh_a',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [1, 3, 5] } // 周一三五
      },
      {
        policyVersionId: 'pv_b',
        userHabitId: 'uh_b',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null,
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 2 }
      }
    ]

    const reportAggregator = require('../../../miniprogram/services/reportAggregator')
    const habitService = require('../../../miniprogram/services/habitService')

    // 案台 2026-05-13（周三）：uh_a 展示，uh_b 看是否间隔
    const homeResult = await habitService.getTodayHabits('2026-05-13')
    const homeIds = homeResult.map(r => r.userHabitId).sort()

    // 观心 buildDayVerdicts 2026-05-13
    const verdictsA = reportAggregator.buildDayVerdicts(
      mockData.myHabits[0], [mockData.policyVersions[0]], [], '2026-05-13', '2026-05-13', '2026-05-13'
    )
    const verdictsB = reportAggregator.buildDayVerdicts(
      mockData.myHabits[1], [mockData.policyVersions[1]], [], '2026-05-13', '2026-05-13', '2026-05-13'
    )
    const statsIds = []
    if (verdictsA[0] && verdictsA[0].isDue) statsIds.push('uh_a')
    if (verdictsB[0] && verdictsB[0].isDue) statsIds.push('uh_b')
    statsIds.sort()

    expect(homeIds).toEqual(statsIds)
  })
})
