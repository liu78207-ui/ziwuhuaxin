/**
 * reportService.test.js
 * Phase 5B: reportService 单元测试
 *
 * 注意：本测试主要验证服务层的 mock 数据流
 * 真实数据流的集成测试见 __tests__/integration/reportService.test.js
 */

// 由于 reportService 依赖 storageService/habitService 等 storage 调用
// 单元测试需要 mock 这些依赖
// 这里先验证 buildPeriod 等纯函数

const reportService = require('../../../miniprogram/services/reportService')
const storageService = require('../../../miniprogram/services/storageService')
const habitService = require('../../../miniprogram/services/habitService')
const timeService = require('../../../miniprogram/services/timeService')

describe('reportService', () => {
  beforeEach(() => {
    if (typeof reportService.clearYearlyReportCache === 'function') {
      reportService.clearYearlyReportCache()
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (typeof reportService.clearYearlyReportCache === 'function') {
      reportService.clearYearlyReportCache()
    }
  })

  describe('buildPeriod', () => {
    test('构建周报周期', () => {
      const result = reportService.buildPeriod('weekly', '2026-05-06')
      expect(result.type).toBe('weekly')
      expect(result.startDate).toBe('2026-05-04') // 周一开始
      expect(result.endDate).toBe('2026-05-10')    // 周日结束
    })

    test('构建月报周期', () => {
      const result = reportService.buildPeriod('monthly', '2026-05')
      expect(result.type).toBe('monthly')
      expect(result.startDate).toBe('2026-05-01')
      expect(result.endDate).toBe('2026-05-31')
    })

    test('月报处理 2 月', () => {
      const result = reportService.buildPeriod('monthly', '2026-02')
      expect(result.startDate).toBe('2026-02-01')
      expect(result.endDate).toBe('2026-02-28')
    })

    test('月报处理闰年 2 月', () => {
      const result = reportService.buildPeriod('monthly', '2024-02')
      expect(result.startDate).toBe('2024-02-01')
      expect(result.endDate).toBe('2024-02-29')
    })

    test('构建年报周期', () => {
      const result = reportService.buildPeriod('yearly', '2026')
      expect(result.type).toBe('yearly')
      expect(result.startDate).toBe('2026-01-01')
      expect(result.endDate).toBe('2026-12-31')
    })

    test('未知周期类型抛出错误', () => {
      expect(() => reportService.buildPeriod('unknown', '2026-05')).toThrow('Unknown period type: unknown')
    })
  })

  describe('reportService 集成（mock 数据）', () => {
    // 由于需要 mock storageService，这里只测试逻辑结构
    // 完整的集成测试需要真实数据或更复杂的 mock

    test('fetchUserHabits 返回数组', () => {
      const habits = reportService.fetchUserHabits()
      expect(Array.isArray(habits)).toBe(true)
    })

    test('fetchPolicyVersions 返回数组', () => {
      const versions = reportService.fetchPolicyVersions()
      expect(Array.isArray(versions)).toBe(true)
    })

    test('fetchDailyStates 返回数组', () => {
      const states = reportService.fetchDailyStates('2026-05-01', '2026-05-07')
      expect(Array.isArray(states)).toBe(true)
    })

    test('同一次年报构建不会按习惯数重复读取 storage', async () => {
      const userHabits = [
        {
          userHabitId: 'uh_perf_1',
          habitId: 'h_perf_1',
          name: '性能习惯一',
          themeClass: 't-green',
          status: 'active',
          createdAt: '2026-01-01'
        },
        {
          userHabitId: 'uh_perf_2',
          habitId: 'h_perf_2',
          name: '性能习惯二',
          themeClass: 't-red',
          status: 'active',
          createdAt: '2026-01-01'
        }
      ]
      const policyVersions = userHabits.map(habit => ({
        policyVersionId: `pv_${habit.userHabitId}`,
        userHabitId: habit.userHabitId,
        habitId: habit.habitId,
        frequencyType: 'daily',
        frequencyConfig: {},
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null
      }))
      const dailyStates = [
        {
          stateId: 'state_uh_perf_1_2026-01-01',
          userHabitId: 'uh_perf_1',
          habitId: 'h_perf_1',
          date: '2026-01-01',
          status: 'checked'
        }
      ]

      const habitsSpy = jest.spyOn(storageService, 'getMyHabitsWithMigration').mockReturnValue(userHabits)
      const policiesSpy = jest.spyOn(storageService, 'getPolicyVersions').mockReturnValue(policyVersions)
      const statesSpy = jest.spyOn(storageService, 'getDailyCheckinStates').mockReturnValue(dailyStates)
      const policiesByUserHabitSpy = jest.spyOn(storageService, 'getPolicyVersionsByUserHabitId')
      const builtInSpy = jest.spyOn(habitService, 'getBuiltInHabits').mockReturnValue([])
      const todaySpy = jest.spyOn(timeService, 'getTodayKey').mockReturnValue('2026-12-31')

      const getItemSpy = jest.spyOn(storageService, 'getItem').mockReturnValue({
        openid: 'test_openid',
        dataVersion: 1,
        reportVersion: 1,
        cacheVersion: 1
      })

      const report = await reportService.getYearlyReport('2026')

      expect(report.habitReports).toHaveLength(2)
      expect(habitsSpy).toHaveBeenCalledTimes(1)
      expect(policiesSpy).toHaveBeenCalledTimes(1)
      expect(statesSpy).toHaveBeenCalledTimes(1)
      expect(builtInSpy).toHaveBeenCalledTimes(1)
      expect(policiesByUserHabitSpy).not.toHaveBeenCalled()
      expect(getItemSpy).toHaveBeenCalledWith('cacheMeta')
    })

    test('年报返回给页面的结构不携带实例和裁决重字段', async () => {
      const userHabits = [{
        userHabitId: 'uh_light_1',
        habitId: 'h_light_1',
        name: '轻量年报',
        themeClass: 't-green',
        status: 'active',
        createdAt: '2026-01-01'
      }]
      const policyVersions = [{
        policyVersionId: 'pv_light_1',
        userHabitId: 'uh_light_1',
        habitId: 'h_light_1',
        frequencyType: 'daily',
        frequencyConfig: {},
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null
      }]
      const dailyStates = [{
        stateId: 'state_light_1',
        userHabitId: 'uh_light_1',
        habitId: 'h_light_1',
        date: '2026-01-01',
        status: 'checked'
      }]

      jest.spyOn(storageService, 'getMyHabitsWithMigration').mockReturnValue(userHabits)
      jest.spyOn(storageService, 'getPolicyVersions').mockReturnValue(policyVersions)
      jest.spyOn(storageService, 'getDailyCheckinStates').mockReturnValue(dailyStates)
      jest.spyOn(storageService, 'getItem').mockReturnValue({
        openid: 'test_openid',
        dataVersion: 1,
        reportVersion: 1,
        cacheVersion: 1
      })
      jest.spyOn(habitService, 'getBuiltInHabits').mockReturnValue([])
      jest.spyOn(timeService, 'getTodayKey').mockReturnValue('2026-12-31')

      const report = await reportService.getYearlyReport('2026')
      const habitReport = report.habitReports[0]

      expect(habitReport.instances).toBeUndefined()
      expect(habitReport.days).toHaveLength(365)
      expect(habitReport.days[0]).not.toHaveProperty('reason')
      expect(habitReport.days[0]).not.toHaveProperty('policyVersion')
      expect(habitReport.days[0]).not.toHaveProperty('dailyState')
      expect(report.stats.totalCount).toBe(1)
      expect(report.stats.checkinDays).toBe(1)
    })

    test('年报缓存命中时不重复读取报表依赖数据', async () => {
      const userHabits = [{
        userHabitId: 'uh_cache_1',
        habitId: 'h_cache_1',
        name: '缓存年报',
        themeClass: 't-blue',
        status: 'active',
        createdAt: '2026-01-01'
      }]
      const policyVersions = [{
        policyVersionId: 'pv_cache_1',
        userHabitId: 'uh_cache_1',
        habitId: 'h_cache_1',
        frequencyType: 'daily',
        frequencyConfig: {},
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null
      }]

      const habitsSpy = jest.spyOn(storageService, 'getMyHabitsWithMigration').mockReturnValue(userHabits)
      const policiesSpy = jest.spyOn(storageService, 'getPolicyVersions').mockReturnValue(policyVersions)
      const statesSpy = jest.spyOn(storageService, 'getDailyCheckinStates').mockReturnValue([])
      jest.spyOn(storageService, 'getItem').mockReturnValue({
        openid: 'test_openid',
        dataVersion: 8,
        reportVersion: 8,
        cacheVersion: 1
      })
      jest.spyOn(habitService, 'getBuiltInHabits').mockReturnValue([])
      jest.spyOn(timeService, 'getTodayKey').mockReturnValue('2026-12-31')

      const first = await reportService.getYearlyReport('2026')
      const second = await reportService.getYearlyReport('2026')

      expect(second).toBe(first)
      expect(habitsSpy).toHaveBeenCalledTimes(1)
      expect(policiesSpy).toHaveBeenCalledTimes(1)
      expect(statesSpy).toHaveBeenCalledTimes(1)
    })

    test('年报缓存随 dataVersion/reportVersion 变化失效', async () => {
      const userHabits = [{
        userHabitId: 'uh_cache_version_1',
        habitId: 'h_cache_version_1',
        name: '版本缓存年报',
        themeClass: 't-purple',
        status: 'active',
        createdAt: '2026-01-01'
      }]
      const policyVersions = [{
        policyVersionId: 'pv_cache_version_1',
        userHabitId: 'uh_cache_version_1',
        habitId: 'h_cache_version_1',
        frequencyType: 'daily',
        frequencyConfig: {},
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: null
      }]
      let cacheMeta = {
        openid: 'test_openid',
        dataVersion: 1,
        reportVersion: 1,
        cacheVersion: 1
      }

      const habitsSpy = jest.spyOn(storageService, 'getMyHabitsWithMigration').mockReturnValue(userHabits)
      const policiesSpy = jest.spyOn(storageService, 'getPolicyVersions').mockReturnValue(policyVersions)
      const statesSpy = jest.spyOn(storageService, 'getDailyCheckinStates').mockReturnValue([])
      jest.spyOn(storageService, 'getItem').mockImplementation(() => cacheMeta)
      jest.spyOn(habitService, 'getBuiltInHabits').mockReturnValue([])
      jest.spyOn(timeService, 'getTodayKey').mockReturnValue('2026-12-31')

      const first = await reportService.getYearlyReport('2026')
      cacheMeta = {
        ...cacheMeta,
        dataVersion: 2,
        reportVersion: 2
      }
      const second = await reportService.getYearlyReport('2026')

      expect(second).not.toBe(first)
      expect(habitsSpy).toHaveBeenCalledTimes(2)
      expect(policiesSpy).toHaveBeenCalledTimes(2)
      expect(statesSpy).toHaveBeenCalledTimes(2)
    })
  })
})
