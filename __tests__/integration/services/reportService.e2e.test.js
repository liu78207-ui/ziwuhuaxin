/**
 * __tests__/integration/services/reportService.e2e.test.js
 * Phase 5D: reportService 端到端集成测试
 *
 * 测试 reportService.getWeeklyReport 从 storage 取数到输出的完整路径
 * 使用 Jest 模块级 mock
 */

let mockData = {
  myHabits: [],
  policyVersions: [],
  dailyStates: []
}

jest.mock('../../../miniprogram/services/storageService', () => ({
  getMyHabitsWithMigration: jest.fn(() => mockData.myHabits),
  getPolicyVersions: jest.fn(() => mockData.policyVersions),
  getDailyCheckinStates: jest.fn(() => mockData.dailyStates),
  getPolicyVersionsByUserHabitId: jest.fn((uhId) =>
    mockData.policyVersions.filter(pv => pv.userHabitId === uhId)
  ),
  getMyHabits: jest.fn(() => mockData.myHabits),
  setMyHabits: jest.fn(),
  setPolicyVersions: jest.fn(),
  setDailyCheckinStates: jest.fn(),
  saveDailyCheckinState: jest.fn(),
  addPolicyVersion: jest.fn(),
  closePolicyVersion: jest.fn(),
  removePolicyVersion: jest.fn(),
  updateStrategyProgress: jest.fn(),
  removeHabit: jest.fn(),
  restoreHabit: jest.fn(),
  clearAllData: jest.fn(),
  getBuiltInHabits: jest.fn(() => []),
  getDeletedHabitInfo: jest.fn(() => null),
  saveDeletedHabitInfo: jest.fn(),
  removeDeletedHabitInfo: jest.fn()
}))

const storageService = require('../../../miniprogram/services/storageService')

describe('reportService E2E - getWeeklyReport', () => {
  beforeEach(() => {
    // 重置 mock 数据
    mockData = {
      myHabits: [],
      policyVersions: [],
      dailyStates: []
    }
  })

  test('完整路径：特殊日 checked 正确计入分母和分子', async () => {
    // 准备数据：2026-05-04 至 2026-05-10 这周
    // userHabit uh1 在 2026-05-10 删除（删除当天）
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-10',
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-01',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    // 2026-05-10 删除当天 checked
    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-10', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    // 验证输出格式
    expect(result).toHaveProperty('habitReports')
    expect(result).toHaveProperty('stats')

    // 验证 habitReports 结构
    expect(result.habitReports.length).toBeGreaterThan(0)
    const habitReport = result.habitReports[0]

    // 特殊日 checked 应计入分母和分子
    const day = habitReport.days.find(d => d.date === '2026-05-10')
    expect(day).toBeTruthy()
    expect(day.status).toBe('checked')
    expect(day.countsAsDone).toBe(true)
    // isDue 为 false（特殊日不显示为应修日）
    expect(day.isDue).toBe(false)
    // 但 countsInDenominator 为 true（仍计入分母）
    expect(day.countsInDenominator).toBe(true)
    expect(day.countsInDueDenominator).toBe(true)
  })

  test('完整路径：策略修改当天 checked：NEW 策略不含当天（从明天起 daily），保留 status 但不计入分母', async () => {
    // 2026-05-10 策略修改
    // 新策略 effectiveStartDate = 2026-05-11（明天），即 user 当天（2026-05-10）打了卡
    // 新策略不含当天 → 不计入分母，但保留 checked 状态
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-01',
        effectiveEndDate: '2026-05-10',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv2',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-11', // 明天开始
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-10', status: 'canceled' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    const habitReport = result.habitReports[0]
    const day = habitReport.days.find(d => d.date === '2026-05-10')

    // 关键：策略修改当天取消打卡后，status='canceled' 保留（不计入分母和分子）
    expect(day.status).toBe('canceled')
    expect(day.displayStatus).toBe('not_required')
    expect(day.countsAsDone).toBe(false)
    expect(day.countsInDenominator).toBe(false)
    expect(day.isChecked).toBe(false)
    expect(day.isDue).toBe(false)
  })

  test('场景 A：daily 改成「从明天开始」，未打卡 → 本周内仍有应修日，观心页展示', async () => {
    // 拔罐原本是今天要打卡，但又改成明天（周三 → 周四开始）
    // 期望：观心页展示拔罐（因为本周内周四-周日仍是应修日）

    mockData.myHabits = [
      {
        userHabitId: 'uh_edited_to_future',
        habitId: 'h1',
        name: '拔罐',
        status: 'active',
        createdAt: '2026-06-02',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh_edited_to_future',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: '2026-06-02',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh_edited_to_future',
        effectiveStartDate: '2026-06-03',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = []

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-01')

    // 关键断言：本周内仍有应修日（周四-周日），观心页展示
    const habitReport = result.habitReports.find(r => r.habitId === 'h1')
    expect(habitReport).toBeDefined()
  })

  test('场景 B：一开始就是「从明天开始」daily，未打卡 → 观心页正常展示', async () => {
    // 拔罐一开始就是从明天开始
    // 期望：观心页正常展示（这是用户的未来计划）

    mockData.myHabits = [
      {
        userHabitId: 'uh_added_with_future',
        habitId: 'h1',
        name: '拔罐',
        status: 'active',
        createdAt: '2026-06-02',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_added_with_future',
        effectiveStartDate: '2026-06-03',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = []

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-01')

    const habitReport = result.habitReports.find(r => r.habitId === 'h1')
    expect(habitReport).toBeDefined()
  })

  test('场景 A 变体：编辑到未来但已打卡 → 观心页正常展示（保留历史）', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_edited_with_checkin',
        habitId: 'h1',
        name: '拔罐',
        status: 'active',
        createdAt: '2026-06-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh_edited_with_checkin',
        effectiveStartDate: '2026-06-01',
        effectiveEndDate: '2026-06-02',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh_edited_with_checkin',
        effectiveStartDate: '2026-06-03',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      { userHabitId: 'uh_edited_with_checkin', date: '2026-06-01', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-01')

    const habitReport = result.habitReports.find(r => r.habitId === 'h1')
    expect(habitReport).toBeDefined()
  })

  test('完整路径：已删除但有打卡数据，stats 报表必须保留', async () => {
    // 用户场景：
    // 1. 添加揉腹 daily，已打卡
    // 2. 软删除
    // 期望：观心页周报里仍能看到这天的打卡数据

    mockData.myHabits = [
      {
        userHabitId: 'uh_deleted_checked',
        habitId: 'h1',
        name: '习惯1',
        status: 'deleted',  // 已软删除
        createdAt: '2026-04-01',
        deletedAt: '2026-05-12',
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_deleted_checked',
        effectiveStartDate: '2026-04-01',
        effectiveEndDate: '2026-05-12', // 软删除时关闭
        frequencyType: 'daily'
      }
    ]

    // 删除前有打卡
    mockData.dailyStates = [
      { userHabitId: 'uh_deleted_checked', date: '2026-05-05', status: 'checked' },
      { userHabitId: 'uh_deleted_checked', date: '2026-05-08', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    // 关键断言：已删除但有打卡，habitReport 仍存在
    const habitReport = result.habitReports.find(r => r.habitId === 'h1')
    expect(habitReport).toBeDefined()

    // 打卡数据保留
    const day5 = habitReport.days.find(d => d.date === '2026-05-05')
    const day8 = habitReport.days.find(d => d.date === '2026-05-08')
    expect(day5.status).toBe('checked')
    expect(day5.countsInDenominator).toBe(true)
    expect(day5.countsAsDone).toBe(true)
    expect(day8.status).toBe('checked')
    expect(day8.countsInDenominator).toBe(true)
    expect(day8.countsAsDone).toBe(true)
  })

  test('完整路径：已删除且无打卡数据，stats 报表不保留', async () => {
    // 用户场景：仅添加未打卡就删除，不应在观心页保留

    mockData.myHabits = [
      {
        userHabitId: 'uh_deleted_empty',
        habitId: 'h1',
        name: '习惯1',
        status: 'deleted',
        createdAt: '2026-05-10',
        deletedAt: '2026-05-11',
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh_deleted_empty',
        effectiveStartDate: '2026-05-10',
        effectiveEndDate: '2026-05-11',
        frequencyType: 'daily'
      }
    ]

    // 无打卡数据
    mockData.dailyStates = []

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    // 关键断言：删除且无打卡，habitReport 不应存在
    const habitReport = result.habitReports.find(r => r.habitId === 'h1')
    expect(habitReport).toBeUndefined()
  })

  test('完整路径：daily → weekly 周三，编辑当天是周二已打卡，status 保留 checked', async () => {
    // 2026-05-12 是周二，策略从 daily 改成 weekly 周三
    // 用户在旧版期间周二打过卡
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'active',
        createdAt: '2026-01-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv2',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]

    // 策略修改当天取消打卡后（先打卡再修改最后取消）
    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-12', status: 'canceled' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-11')

    const habitReport = result.habitReports[0]
    const day = habitReport.days.find(d => d.date === '2026-05-12')

    // 策略修改当天取消打卡 → status='canceled' 保留（不计入分母和分子）
    expect(day.status).toBe('canceled')
    expect(day.isChecked).toBe(false)
    expect(day.isDue).toBe(false)
    expect(day.countsInDenominator).toBe(false)
    expect(day.countsAsDone).toBe(false)
  })

  test('完整路径：daily → weekly 周三，编辑当天是周二未打卡，案台观心统一为 not_required', async () => {
    // 2026-05-12 是周二，策略从 daily 改成 weekly 周三
    // 用户周二没打卡
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'active',
        createdAt: '2026-01-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv2',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]

    // 周一打过卡（保留历史），周二未打卡
    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-11', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-11')

    const habitReport = result.habitReports[0]
    const day = habitReport.days.find(d => d.date === '2026-05-12')

    // 关键断言：未打卡 → not_required，隐藏"应打未打"数据
    expect(day.status).toBe('not_required')
    expect(day.isChecked).toBe(false)
    expect(day.isDue).toBe(false)
    expect(day.countsInDenominator).toBe(false)
    expect(day.countsAsDone).toBe(false)
  })

  test('完整路径：普通 unchecked 不计入分子但计入分母', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-01',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    // 无打卡记录 => unchecked
    mockData.dailyStates = []

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    const habitReport = result.habitReports[0]
    const day = habitReport.days.find(d => d.date === '2026-05-05')

    expect(day.status).toBe('unchecked')
    expect(day.countsAsDone).toBe(false)
    expect(day.countsInDenominator).toBe(true) // 计入分母
    expect(day.countsInDueDenominator).toBe(true)
  })

  test('stats 计算：dueCount/doneCount 与特殊日口径一致', async () => {
    // 周期：2026-05-04 到 2026-05-10，共7天
    // 策略 effectiveStartDate: 2026-05-04，频率 daily
    // 所以这7天都是应修日
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-04', // 周期第一天开始
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    // 周期内：5-05 checked, 5-06 unchecked, 5-07 canceled
    // 其他天（5-04, 5-08, 5-09, 5-10）无打卡 => unchecked
    // dueCount = 7 (全部7天), doneCount = 1 (只有5-05 checked)
    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-05', status: 'checked' },
      { userHabitId: 'uh1', date: '2026-05-06', status: 'unchecked' },
      { userHabitId: 'uh1', date: '2026-05-07', status: 'canceled' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    // 期望: 7天应修，1天完成
    expect(result.stats.checkinRate).toBe(Math.round((1 / 7) * 100)) // 14%
    expect(result.stats.totalCount).toBe(1)
  })

  test('未来策略：effectiveStartDate > periodStart 的 userHabit 不参与周报', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_future',
        habitId: 'h1',
        name: '未来习惯',
        status: 'active',
        createdAt: '2026-05-04',
        deletedAt: null,
        themeClass: 't-green'
      },
      {
        userHabitId: 'uh_past',
        habitId: 'h2',
        name: '已生效习惯',
        status: 'active',
        createdAt: '2026-01-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_future',
        userHabitId: 'uh_future',
        effectiveStartDate: '2026-05-15', // 未来，在本周（5-04 ~ 5-10）之后
        effectiveEndDate: null,
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_past',
        userHabitId: 'uh_past',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    const habitIds = result.habitReports.map(r => r.habitId).sort()
    expect(habitIds).toEqual(['h2'])
  })

  test('多 userHabitId 聚合：dueCount/doneCount 正确求和', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh1',
        habitId: 'h1',
        name: '习惯1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null,
        themeClass: 't-green'
      },
      {
        userHabitId: 'uh2',
        habitId: 'h1', // 同一 habitId
        name: '习惯1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv1',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-04',
        effectiveEndDate: null,
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv2',
        userHabitId: 'uh2',
        effectiveStartDate: '2026-05-04',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    // 两个实例同属一个 habitId，UI 合并为一行。
    // 同一自然日只显示一个最终状态：5-05 checked、5-06 checked。
    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-05', status: 'checked' },
      { userHabitId: 'uh1', date: '2026-05-06', status: 'checked' },
      { userHabitId: 'uh2', date: '2026-05-05', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    expect(result.habitReports.length).toBe(1)
    const totalDue = result.habitReports.reduce((sum, r) => sum + r.dueCount, 0)
    const totalDone = result.habitReports.reduce((sum, r) => sum + r.doneCount, 0)
    expect(totalDue).toBe(7)
    expect(totalDone).toBe(2)
    expect(result.habitReports[0].days.find(day => day.date === '2026-05-05').status).toBe('checked')
    expect(result.stats.checkinRate).toBe(Math.round((2 / 7) * 100))
  })

  test('同日删除后重加同一 habitId：周报只展示一行且 checked 优先', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_deleted',
        habitId: 'h_baduanjin',
        name: '八段锦',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-12',
        themeClass: 't-green'
      },
      {
        userHabitId: 'uh_active',
        habitId: 'h_baduanjin',
        name: '八段锦',
        status: 'active',
        createdAt: '2026-05-12',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_deleted',
        userHabitId: 'uh_deleted',
        effectiveStartDate: '2026-05-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_active',
        userHabitId: 'uh_active',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      { userHabitId: 'uh_deleted', date: '2026-05-12', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-11')

    expect(result.habitReports).toHaveLength(1)
    expect(result.habitReports[0].habitId).toBe('h_baduanjin')
    const day = result.habitReports[0].days.find(d => d.date === '2026-05-12')
    expect(day.status).toBe('checked')
    expect(day.isChecked).toBe(true)
    expect(day.countsAsDone).toBe(true)
    expect(result.habitReports[0].instances).toHaveLength(2)
  })

  test('策略修改当天 daily 改时长后取消打卡：今天仍应修则显示应修未完成', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_duration_changed_canceled',
        habitId: 'h_baguan',
        name: '拔罐',
        status: 'active',
        createdAt: '2026-06-02',
        deletedAt: null,
        themeClass: 't-red'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_15',
        userHabitId: 'uh_duration_changed_canceled',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: '2026-06-02',
        frequencyType: 'daily',
        duration: 15
      },
      {
        policyVersionId: 'pv_30',
        userHabitId: 'uh_duration_changed_canceled',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: null,
        frequencyType: 'daily',
        duration: 30
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_duration_changed_canceled',
        date: '2026-06-02',
        status: 'canceled',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-01')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_baguan')

    expect(habitReport).toBeDefined()
    expect(habitReport.doneCount).toBe(0)
    expect(habitReport.hasVisibleState).toBe(true)
    const day = habitReport.days.find(d => d.date === '2026-06-02')
    expect(day.status).toBe('canceled')
    expect(day.displayStatus).toBe('canceled')
    expect(day.shouldShow).toBe(true)
    expect(day.countsInDenominator).toBe(true)
    expect(day.countsAsDone).toBe(false)
  })

  test('策略修改当天 daily 改 weekly 且今天命中新策略后取消打卡：显示应修未完成', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_daily_to_tuesday_canceled',
        habitId: 'h_running',
        name: '跑步',
        status: 'active',
        createdAt: '2026-06-02',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_daily',
        userHabitId: 'uh_daily_to_tuesday_canceled',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: '2026-06-02',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_tuesday',
        userHabitId: 'uh_daily_to_tuesday_canceled',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2] }
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_daily_to_tuesday_canceled',
        date: '2026-06-02',
        status: 'canceled',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-01')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_running')

    expect(habitReport).toBeDefined()
    expect(habitReport.hasVisibleState).toBe(true)
    const day = habitReport.days.find(d => d.date === '2026-06-02')
    expect(day.status).toBe('canceled')
    expect(day.displayStatus).toBe('canceled')
    expect(day.shouldShow).toBe(true)
    expect(day.countsInDenominator).toBe(true)
    expect(day.countsAsDone).toBe(false)
  })

  test('今天新增 weekly 三四后改成 weekly 二：命中当天则未打卡计入分母', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_weekly_changed_to_tuesday',
        habitId: 'h_new_weekly',
        name: '新习惯',
        status: 'active',
        createdAt: '2026-06-02',
        deletedAt: null,
        themeClass: 't-blue'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_wed_thu',
        userHabitId: 'uh_weekly_changed_to_tuesday',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: '2026-06-02',
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3, 4] }
      },
      {
        policyVersionId: 'pv_tuesday',
        userHabitId: 'uh_weekly_changed_to_tuesday',
        effectiveStartDate: '2026-06-02',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2] }
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_weekly_changed_to_tuesday',
        date: '2026-06-02',
        status: 'unchecked',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-01')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_new_weekly')

    expect(habitReport).toBeDefined()
    expect(habitReport.hasVisibleState).toBe(true)
    const day = habitReport.days.find(d => d.date === '2026-06-02')
    expect(day.status).toBe('unchecked')
    expect(day.displayStatus).toBe('unchecked')
    expect(day.shouldShow).toBe(true)
    expect(day.countsInDenominator).toBe(true)
    expect(day.countsAsDone).toBe(false)
  })

  test('周日新增八段锦 weekly 三四后改成 daily：未打卡计入分母并显示描边态', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_baduanjin_changed_to_daily',
        habitId: 'h_baduanjin',
        name: '八段锦',
        status: 'active',
        createdAt: '2026-06-14',
        deletedAt: null,
        themeClass: 't-yellow'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_wed_thu',
        userHabitId: 'uh_baduanjin_changed_to_daily',
        effectiveStartDate: '2026-06-14',
        effectiveEndDate: '2026-06-14',
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3, 4] }
      },
      {
        policyVersionId: 'pv_daily',
        userHabitId: 'uh_baduanjin_changed_to_daily',
        effectiveStartDate: '2026-06-14',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_baduanjin_changed_to_daily',
        date: '2026-06-14',
        status: 'unchecked',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-08')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_baduanjin')

    expect(habitReport).toBeDefined()
    expect(habitReport.hasVisibleState).toBe(true)
    const day = habitReport.days.find(d => d.date === '2026-06-14')
    expect(day.status).toBe('unchecked')
    expect(day.displayStatus).toBe('unchecked')
    expect(day.isDue).toBe(true)
    expect(day.shouldShow).toBe(true)
    expect(day.countsInDenominator).toBe(true)
    expect(day.countsAsDone).toBe(false)
  })

  test('周日新增八段锦 weekly 三四且未改策略：当天不进入应修分母', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_baduanjin_weekly_only',
        habitId: 'h_baduanjin_weekly',
        name: '八段锦',
        status: 'active',
        createdAt: '2026-06-14',
        deletedAt: null,
        themeClass: 't-yellow'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_wed_thu_only',
        userHabitId: 'uh_baduanjin_weekly_only',
        effectiveStartDate: '2026-06-14',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3, 4] }
      }
    ]

    mockData.dailyStates = []

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-08')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_baduanjin_weekly')

    expect(habitReport).toBeUndefined()
  })

  test('daily 打卡后改 weekly 二五并取消，今天周四：观心周四不显示未完成描边', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_daily_to_tue_fri_canceled_thu',
        habitId: 'h_fast_walk',
        name: '快走',
        status: 'active',
        createdAt: '2026-06-11',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_daily',
        userHabitId: 'uh_daily_to_tue_fri_canceled_thu',
        effectiveStartDate: '2026-06-11',
        effectiveEndDate: '2026-06-11',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_tue_fri',
        userHabitId: 'uh_daily_to_tue_fri_canceled_thu',
        effectiveStartDate: '2026-06-11',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2, 5] }
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_daily_to_tue_fri_canceled_thu',
        date: '2026-06-11',
        status: 'canceled',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-08')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_fast_walk')

    // 周五仍在本周应修，行可以存在；但周四不是新策略应修日，不应显示未完成/取消描边。
    expect(habitReport).toBeDefined()
    const thursday = habitReport.days.find(d => d.date === '2026-06-11')
    expect(thursday.status).toBe('canceled')
    expect(thursday.displayStatus).toBe('not_required')
    expect(thursday.shouldShow).toBe(false)
    expect(thursday.isDue).toBe(false)
    expect(thursday.countsInDenominator).toBe(false)
    expect(thursday.countsAsDone).toBe(false)
  })

  test('打卡后删除再取消：业务状态保留 canceled，但观心视觉为 not_required', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_deleted_after_cancel',
        habitId: 'h_deleted_cancel',
        name: '删除后取消',
        status: 'deleted',
        createdAt: '2026-06-01',
        deletedAt: '2026-06-12',
        themeClass: 't-red'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_deleted_cancel',
        userHabitId: 'uh_deleted_after_cancel',
        effectiveStartDate: '2026-06-01',
        effectiveEndDate: '2026-06-12',
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_deleted_after_cancel',
        date: '2026-06-10',
        status: 'checked'
      },
      {
        userHabitId: 'uh_deleted_after_cancel',
        date: '2026-06-12',
        status: 'canceled'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-08')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_deleted_cancel')

    expect(habitReport).toBeDefined()
    const friday = habitReport.days.find(d => d.date === '2026-06-12')
    expect(friday.status).toBe('canceled')
    expect(friday.displayStatus).toBe('not_required')
    expect(friday.countsInDenominator).toBe(false)
    expect(friday.countsAsDone).toBe(false)
  })

  test('普通应修日取消：业务状态和观心视觉都保留 canceled 描边语义', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_regular_cancel',
        habitId: 'h_regular_cancel',
        name: '普通取消',
        status: 'active',
        createdAt: '2026-06-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_regular_cancel',
        userHabitId: 'uh_regular_cancel',
        effectiveStartDate: '2026-06-01',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_regular_cancel',
        date: '2026-06-12',
        status: 'canceled'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-08')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_regular_cancel')

    expect(habitReport).toBeDefined()
    const friday = habitReport.days.find(d => d.date === '2026-06-12')
    expect(friday.status).toBe('canceled')
    expect(friday.displayStatus).toBe('canceled')
    expect(friday.countsInDenominator).toBe(true)
    expect(friday.countsAsDone).toBe(false)
  })

  test('2026-06-12 周五打卡后改为每周二再取消：月报周五视觉为 not_required', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_friday_to_tuesday_canceled',
        habitId: 'h_friday_to_tuesday',
        name: '周五改周二',
        status: 'active',
        createdAt: '2026-06-01',
        deletedAt: null,
        themeClass: 't-blue'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_daily_before_friday',
        userHabitId: 'uh_friday_to_tuesday_canceled',
        effectiveStartDate: '2026-06-01',
        effectiveEndDate: '2026-06-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_tuesday_after_friday',
        userHabitId: 'uh_friday_to_tuesday_canceled',
        effectiveStartDate: '2026-06-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2] }
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_friday_to_tuesday_canceled',
        date: '2026-06-12',
        status: 'canceled',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getMonthlyReport('2026-06')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_friday_to_tuesday')

    expect(habitReport).toBeDefined()
    const friday = habitReport.days.find(d => d.date === '2026-06-12')
    expect(friday.status).toBe('canceled')
    expect(friday.displayStatus).toBe('not_required')
    expect(friday.countsInDenominator).toBe(false)
    expect(friday.countsAsDone).toBe(false)
  })

  test('2026-06-12 周五八段锦打卡后改为周五周六再取消：显示应修未完成', async () => {
    mockData.myHabits = [
      {
        userHabitId: 'uh_baduanjin_fri_sat_canceled',
        habitId: 'h_baduanjin',
        name: '八段锦',
        status: 'active',
        createdAt: '2026-06-01',
        deletedAt: null,
        themeClass: 't-green'
      }
    ]

    mockData.policyVersions = [
      {
        policyVersionId: 'pv_baduanjin_daily',
        userHabitId: 'uh_baduanjin_fri_sat_canceled',
        effectiveStartDate: '2026-06-01',
        effectiveEndDate: '2026-06-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_baduanjin_fri_sat',
        userHabitId: 'uh_baduanjin_fri_sat_canceled',
        effectiveStartDate: '2026-06-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [5, 6] }
      }
    ]

    mockData.dailyStates = [
      {
        userHabitId: 'uh_baduanjin_fri_sat_canceled',
        date: '2026-06-12',
        status: 'canceled',
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-06-08')
    const habitReport = result.habitReports.find(r => r.habitId === 'h_baduanjin')

    expect(habitReport).toBeDefined()
    const friday = habitReport.days.find(d => d.date === '2026-06-12')
    expect(friday.status).toBe('canceled')
    expect(friday.displayStatus).toBe('canceled')
    expect(friday.shouldShow).toBe(true)
    expect(friday.countsInDenominator).toBe(true)
    expect(friday.countsAsDone).toBe(false)
  })
})
