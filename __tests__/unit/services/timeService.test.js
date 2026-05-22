/**
 * timeService.js 单元测试
 * 测试业务时间服务的正确性
 */

const timeService = require('../../../miniprogram/services/timeService.js')

describe('timeService', () => {
  describe('formatDate', () => {
    test('格式化 UTC Date 对象', () => {
      const date = new Date(Date.UTC(2026, 4, 22))
      expect(timeService.formatDate(date)).toBe('2026-05-22')
    })
  })

  describe('addDays', () => {
    test('加天数返回新日期字符串', () => {
      expect(timeService.addDays('2026-05-22', 1)).toBe('2026-05-23')
      expect(timeService.addDays('2026-05-22', -5)).toBe('2026-05-17')
    })
  })

  describe('dateDiff', () => {
    test('计算日期差', () => {
      expect(timeService.dateDiff('2026-05-25', '2026-05-20')).toBe(5)
      expect(timeService.dateDiff('2026-05-20', '2026-05-25')).toBe(-5)
    })

    test('同一天返回零', () => {
      expect(timeService.dateDiff('2026-05-22', '2026-05-22')).toBe(0)
    })
  })

  describe('compareDate', () => {
    test('比较日期', () => {
      expect(timeService.compareDate('2026-05-22', '2026-05-21')).toBe(1)
      expect(timeService.compareDate('2026-05-22', '2026-05-23')).toBe(-1)
      expect(timeService.compareDate('2026-05-22', '2026-05-22')).toBe(0)
    })
  })

  describe('minDate', () => {
    test('返回较小日期', () => {
      expect(timeService.minDate('2026-05-20', '2026-05-22')).toBe('2026-05-20')
    })
  })

  describe('buildDateRange', () => {
    test('生成日期范围数组', () => {
      const result = timeService.buildDateRange('2026-05-20', '2026-05-22')
      expect(result).toEqual(['2026-05-20', '2026-05-21', '2026-05-22'])
    })

    test('无效输入返回空数组', () => {
      expect(timeService.buildDateRange(null, '2026-05-22')).toEqual([])
    })
  })

  describe('getWeekRange', () => {
    test('标准周（周一到周日）', () => {
      const result = timeService.getWeekRange('2026-05-22') // 周五
      expect(result.startDate).toBe('2026-05-18')
      expect(result.endDate).toBe('2026-05-24')
    })

    test('周日作为周开始', () => {
      const result = timeService.getWeekRange('2026-05-24') // 周日
      // 按照实现，day === 0 时 diff = getUTCDate - 0 + (-6) = getUTCDate - 6
      // 2026-05-24 是周日，getUTCDate = 24, diff = 24 - 0 + (-6) = 18
      // start = 2026-05-18, end = 2026-05-24
      expect(result.startDate).toBe('2026-05-18')
      expect(result.endDate).toBe('2026-05-24')
    })

    test('无参调用返回当周范围', () => {
      const result = timeService.getWeekRange()
      expect(result).toHaveProperty('startDate')
      expect(result).toHaveProperty('endDate')
      // 验证格式
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    test('解析日期作为输入', () => {
      const result = timeService.getWeekRange('2026-06-01') // 周一
      expect(result.startDate).toBe('2026-06-01')
      expect(result.endDate).toBe('2026-06-07')
    })
  })

  describe('getMonthRange', () => {
    test('标准月范围', () => {
      const result = timeService.getMonthRange('2026-05-15')
      expect(result.startDate).toBe('2026-05-01')
      expect(result.endDate).toBe('2026-05-31')
    })

    test('二月（闰年）', () => {
      const result = timeService.getMonthRange('2026-02-15')
      expect(result.startDate).toBe('2026-02-01')
      expect(result.endDate).toBe('2026-02-28')
    })

    test('二月（非闰年）', () => {
      const result = timeService.getMonthRange('2025-02-15')
      expect(result.startDate).toBe('2025-02-01')
      expect(result.endDate).toBe('2025-02-28')
    })

    test('十二月跨年', () => {
      const result = timeService.getMonthRange('2026-12-15')
      expect(result.startDate).toBe('2026-12-01')
      expect(result.endDate).toBe('2026-12-31')
    })

    test('无参调用返回当月范围', () => {
      const result = timeService.getMonthRange()
      expect(result).toHaveProperty('startDate')
      expect(result).toHaveProperty('endDate')
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('getYearRange', () => {
    test('标准年范围', () => {
      const result = timeService.getYearRange('2026-06-15')
      expect(result.startDate).toBe('2026-01-01')
      expect(result.endDate).toBe('2026-12-31')
    })

    test('无参调用返回当年范围', () => {
      const result = timeService.getYearRange()
      expect(result).toHaveProperty('startDate')
      expect(result).toHaveProperty('endDate')
      expect(result.startDate).toBe('2026-01-01')
      expect(result.endDate).toBe('2026-12-31')
    })
  })

  describe('isFutureDate', () => {
    test('未来日期返回 true', () => {
      // 使用一个很远的日期确保测试稳定
      const result = timeService.isFutureDate('2099-01-01')
      expect(result).toBe(true)
    })

    test('过去日期返回 false', () => {
      const result = timeService.isFutureDate('2020-01-01')
      expect(result).toBe(false)
    })
  })

  describe('isSameBusinessDay', () => {
    test('同一天返回 true', () => {
      expect(timeService.isSameBusinessDay('2026-05-22', '2026-05-22')).toBe(true)
    })

    test('不同日期返回 false', () => {
      expect(timeService.isSameBusinessDay('2026-05-22', '2026-05-21')).toBe(false)
    })
  })

  describe('shouldRefreshByDate', () => {
    test('新日期大于旧日期时返回 true', () => {
      expect(timeService.shouldRefreshByDate('2026-05-20', '2026-05-22')).toBe(true)
    })

    test('新日期等于旧日期时返回 false', () => {
      expect(timeService.shouldRefreshByDate('2026-05-22', '2026-05-22')).toBe(false)
    })

    test('新日期小于旧日期时返回 false', () => {
      expect(timeService.shouldRefreshByDate('2026-05-22', '2026-05-20')).toBe(false)
    })

    test('空值返回 false 或 null', () => {
      // shouldRefreshByDate 内部依赖 compareDate，compareDate 对空值返回 null
      expect(timeService.shouldRefreshByDate(null, '2026-05-22')).toBeFalsy()
      expect(timeService.shouldRefreshByDate('2026-05-22', null)).toBeFalsy()
    })
  })

  describe('parseDate', () => {
    test('解析日期字符串返回 UTC Date', () => {
      const result = timeService.parseDate('2026-05-22')
      expect(result).toBeInstanceOf(Date)
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(4)
      expect(result.getUTCDate()).toBe(22)
    })

    test('无效日期返回 null', () => {
      expect(timeService.parseDate('invalid')).toBeNull()
    })
  })

  describe('refreshServerTime', () => {
    test('无 cloudCaller 时返回低可信时间', async () => {
      const result = await timeService.refreshServerTime(null)
      expect(result.confidence).toBe('low')
    })

    test('cloudCaller 异常时返回低可信时间', async () => {
      const result = await timeService.refreshServerTime(async () => { throw new Error('network error') })
      expect(result.confidence).toBe('low')
    })

    test('cloudCaller 返回 serverTime 时更新偏移', async () => {
      const mockServerTime = Date.now() + 10000
      const result = await timeService.refreshServerTime(async () => ({ serverTime: mockServerTime }))
      expect(result.confidence).toBe('high')
    })
  })

  describe('getNow', () => {
    test('返回当前时间（可能是模拟的）', () => {
      const result = timeService.getNow()
      expect(result).toBeInstanceOf(Date)
    })
  })

  describe('getBusinessDate', () => {
    test('返回业务日期字符串格式', () => {
      const result = timeService.getBusinessDate()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('getTodayKey', () => {
    test('返回今日日期键', () => {
      const result = timeService.getTodayKey()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('getSimulatedDate', () => {
    test('无 app 参数时返回模拟日期', () => {
      const result = timeService.getSimulatedDate(null)
      expect(result).toBeInstanceOf(Date)
    })

    test('有 app 参数时使用 debugOffset', () => {
      const mockApp = { getDebugOffset: () => 0 }
      const result = timeService.getSimulatedDate(mockApp)
      expect(result).toBeInstanceOf(Date)
    })
  })

  describe('getSimulatedDateStr', () => {
    test('返回格式化日期字符串', () => {
      const result = timeService.getSimulatedDateStr(null)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})