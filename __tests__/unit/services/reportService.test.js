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

describe('reportService', () => {
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
  })
})
