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

  test('完整路径：策略修改当天 checked 正确计入分母和分子', async () => {
    // 2026-05-10 策略修改
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
        effectiveEndDate: '2026-05-10', // 策略修改当天旧版本结束
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv2',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-11', // 新版本次日开始
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-10', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    const habitReport = result.habitReports[0]
    const day = habitReport.days.find(d => d.date === '2026-05-10')

    expect(day.status).toBe('checked')
    expect(day.countsAsDone).toBe(true)
    expect(day.countsInDenominator).toBe(true)
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

    // 两个实例都覆盖 2026-05-04 到 2026-05-10（共7天）
    // uh1: 5-05 checked, 5-06 checked (2 done out of 7 due)
    // uh2: 5-05 checked (1 done out of 7 due)
    // 聚合: 14 due, 3 done
    mockData.dailyStates = [
      { userHabitId: 'uh1', date: '2026-05-05', status: 'checked' },
      { userHabitId: 'uh1', date: '2026-05-06', status: 'checked' },
      { userHabitId: 'uh2', date: '2026-05-05', status: 'checked' }
    ]

    const reportService = require('../../../miniprogram/services/reportService')
    const result = await reportService.getWeeklyReport('2026-05-04')

    // 两个实例各7天应修，共14天应修
    expect(result.habitReports.length).toBe(2) // 两个实例
    const totalDue = result.habitReports.reduce((sum, r) => sum + r.dueCount, 0)
    const totalDone = result.habitReports.reduce((sum, r) => sum + r.doneCount, 0)
    expect(totalDue).toBe(14) // 7 + 7
    expect(totalDone).toBe(3) // 2 + 1
    expect(result.stats.checkinRate).toBe(Math.round((3 / 14) * 100)) // 21%
  })
})