/**
 * dateUtils.js 单元测试
 * 测试日期基础工具函数的正确性
 */

const dateUtils = require('../../../miniprogram/utils/dateUtils.js')

describe('dateUtils', () => {
  describe('parseDate', () => {
    test('解析有效日期字符串', () => {
      const result = dateUtils.parseDate('2026-05-22')
      expect(result).toBeInstanceOf(Date)
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(4) // 0-indexed
      expect(result.getUTCDate()).toBe(22)
    })

    test('解析 ISO 格式（只取日期部分）', () => {
      const result = dateUtils.parseDate('2026-05-22T12:30:00')
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(4)
      expect(result.getUTCDate()).toBe(22)
    })

    test('返回 null 当输入为空', () => {
      expect(dateUtils.parseDate(null)).toBeNull()
      expect(dateUtils.parseDate(undefined)).toBeNull()
      expect(dateUtils.parseDate('')).toBeNull()
    })

    test('返回 null 当输入无效', () => {
      expect(dateUtils.parseDate('invalid')).toBeNull()
      expect(dateUtils.parseDate('2026-13-01')).toBeNull() // 无效月份
      expect(dateUtils.parseDate('2026-02-30')).toBeNull() // 无效日期
      expect(dateUtils.parseDate('2026')).toBeNull()
    })

    test('非零填充月份和日期也能解析', () => {
      // parseDate 不验证零填充，接受 2026-5-22
      const result = dateUtils.parseDate('2026-5-22')
      expect(result).toBeInstanceOf(Date)
      expect(result.getUTCMonth()).toBe(4)
      expect(result.getUTCDate()).toBe(22)
    })

    test('拒绝伪造的日期', () => {
      // 2026-01-32 会被 Date 规范截断为 2026-02-01
      expect(dateUtils.parseDate('2026-01-32')).toBeNull()
    })
  })

  describe('formatDate', () => {
    test('格式化 Date 对象为 YYYY-MM-DD', () => {
      const date = new Date(Date.UTC(2026, 4, 22))
      expect(dateUtils.formatDate(date)).toBe('2026-05-22')
    })

    test('补零个位数月份和日期', () => {
      const date = new Date(Date.UTC(2026, 0, 5))
      expect(dateUtils.formatDate(date)).toBe('2026-01-05')
    })

    test('处理边界日期', () => {
      expect(dateUtils.formatDate(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01')
      expect(dateUtils.formatDate(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12-31')
    })
  })

  describe('addDays', () => {
    test('正向加天数', () => {
      expect(dateUtils.addDays('2026-05-22', 1)).toBe('2026-05-23')
      expect(dateUtils.addDays('2026-05-22', 10)).toBe('2026-06-01')
    })

    test('负向加天数', () => {
      expect(dateUtils.addDays('2026-05-22', -1)).toBe('2026-05-21')
      expect(dateUtils.addDays('2026-05-01', -1)).toBe('2026-04-30')
    })

    test('加零天返回原日期', () => {
      expect(dateUtils.addDays('2026-05-22', 0)).toBe('2026-05-22')
    })

    test('跨月和跨年', () => {
      expect(dateUtils.addDays('2026-01-31', 1)).toBe('2026-02-01') // 闰年
      expect(dateUtils.addDays('2026-12-31', 1)).toBe('2027-01-01')
    })

    test('非法日期返回 null', () => {
      expect(dateUtils.addDays('invalid', 1)).toBeNull()
      expect(dateUtils.addDays(null, 1)).toBeNull()
    })
  })

  describe('dateDiff', () => {
    test('计算天数差', () => {
      expect(dateUtils.dateDiff('2026-05-22', '2026-05-20')).toBe(2)
      expect(dateUtils.dateDiff('2026-05-20', '2026-05-22')).toBe(-2)
    })

    test('同一天返回零', () => {
      expect(dateUtils.dateDiff('2026-05-22', '2026-05-22')).toBe(0)
    })

    test('跨月计算', () => {
      expect(dateUtils.dateDiff('2026-06-01', '2026-05-22')).toBe(10)
    })

    test('非法日期返回 NaN', () => {
      expect(Number.isNaN(dateUtils.dateDiff('invalid', '2026-05-22'))).toBe(true)
      expect(Number.isNaN(dateUtils.dateDiff('2026-05-22', 'invalid'))).toBe(true)
    })
  })

  describe('compareDate', () => {
    test('相等返回零', () => {
      expect(dateUtils.compareDate('2026-05-22', '2026-05-22')).toBe(0)
    })

    test('前者小于后者返回负一', () => {
      expect(dateUtils.compareDate('2026-05-21', '2026-05-22')).toBe(-1)
    })

    test('前者大于后者返回正一', () => {
      expect(dateUtils.compareDate('2026-05-23', '2026-05-22')).toBe(1)
    })

    test('空值返回 null', () => {
      expect(dateUtils.compareDate(null, '2026-05-22')).toBeNull()
      expect(dateUtils.compareDate('2026-05-22', null)).toBeNull()
      expect(dateUtils.compareDate(null, null)).toBeNull()
    })
  })

  describe('minDate', () => {
    test('返回较小日期', () => {
      expect(dateUtils.minDate('2026-05-20', '2026-05-22')).toBe('2026-05-20')
      expect(dateUtils.minDate('2026-05-22', '2026-05-20')).toBe('2026-05-20')
    })

    test('相等时返回第一个', () => {
      expect(dateUtils.minDate('2026-05-22', '2026-05-22')).toBe('2026-05-22')
    })

    test('处理空值', () => {
      expect(dateUtils.minDate(null, '2026-05-22')).toBe('2026-05-22')
      expect(dateUtils.minDate('2026-05-22', null)).toBe('2026-05-22')
      expect(dateUtils.minDate(null, null)).toBeNull()
    })
  })

  describe('buildDateRange', () => {
    test('生成日期数组', () => {
      const result = dateUtils.buildDateRange('2026-05-20', '2026-05-22')
      expect(result).toEqual(['2026-05-20', '2026-05-21', '2026-05-22'])
    })

    test('单天返回单元素数组', () => {
      const result = dateUtils.buildDateRange('2026-05-22', '2026-05-22')
      expect(result).toEqual(['2026-05-22'])
    })

    test('空输入返回空数组', () => {
      expect(dateUtils.buildDateRange(null, '2026-05-22')).toEqual([])
      expect(dateUtils.buildDateRange('2026-05-22', null)).toEqual([])
      expect(dateUtils.buildDateRange('invalid', '2026-05-22')).toEqual([])
    })

    test('开始日期大于结束日期返回空数组', () => {
      expect(dateUtils.buildDateRange('2026-05-22', '2026-05-20')).toEqual([])
    })
  })

  describe('isValidDateStr', () => {
    test('有效格式返回 true', () => {
      expect(dateUtils.isValidDateStr('2026-05-22')).toBe(true)
      expect(dateUtils.isValidDateStr('2026-01-01')).toBe(true)
      expect(dateUtils.isValidDateStr('2026-12-31')).toBe(true)
    })

    test('无效格式返回 false', () => {
      expect(dateUtils.isValidDateStr('2026-5-22')).toBe(false) // 非零填充
      expect(dateUtils.isValidDateStr('26-05-22')).toBe(false)   // 短年份
      expect(dateUtils.isValidDateStr('2026/05/22')).toBe(false) // 斜杠
      expect(dateUtils.isValidDateStr('invalid')).toBe(false)
      expect(dateUtils.isValidDateStr('')).toBe(false)
    })

    test('非字符串返回 false', () => {
      expect(dateUtils.isValidDateStr(20260522)).toBe(false)
      expect(dateUtils.isValidDateStr(null)).toBe(false)
      expect(dateUtils.isValidDateStr(undefined)).toBe(false)
    })

    test('格式正确但无效日期返回 false', () => {
      expect(dateUtils.isValidDateStr('2026-02-30')).toBe(false)
      expect(dateUtils.isValidDateStr('2026-13-01')).toBe(false)
    })
  })

  describe('asAsiaShanghai', () => {
    test('正确应用 +08:00 偏移', () => {
      // 2026-05-22 00:00 UTC = 2026-05-22 08:00 Asia/Shanghai
      const utcDate = new Date(Date.UTC(2026, 4, 22, 0, 0, 0))
      const asiaDate = dateUtils.asAsiaShanghai(utcDate)
      expect(asiaDate.getUTCHours()).toBe(8)
      expect(asiaDate.getUTCDate()).toBe(22)
    })

    test('保持 Date 对象不变（返回新 Date）', () => {
      const original = new Date(Date.UTC(2026, 4, 22, 0, 0, 0))
      const originalTime = original.getTime()
      dateUtils.asAsiaShanghai(original)
      expect(original.getTime()).toBe(originalTime)
    })

    test('业务日期投影语义：偏移后再用 UTC getter 读', () => {
      // 这说明 asAsiaShanghai 是"投影"函数，不是真正改变 Date 时区
      const utc = new Date(Date.UTC(2026, 4, 22, 20, 0, 0)) // 20:00 UTC = 次日 04:00 Asia/Shanghai
      const asia = dateUtils.asAsiaShanghai(utc)
      expect(asia.getUTCDate()).toBe(23) // 跨到了次日
    })
  })

  describe('常量导出', () => {
    test('MS_PER_DAY 正确', () => {
      expect(dateUtils.MS_PER_DAY).toBe(86400000)
    })

    test('ASIA_SHANGHAI_OFFSET 正确', () => {
      expect(dateUtils.ASIA_SHANGHAI_OFFSET).toBe(8 * 60 * 60 * 1000)
    })
  })
})