/**
 * 子午流注工具函数单元测试
 * 测试时辰计算、经络当令、养生建议等功能
 */

const { getCurrentZiwu, getTimeInfo, ZIWU_DATA } = require('../../../miniprogram/utils/ziwu.js');

describe('子午流注工具函数测试', () => {
  
  describe('ZIWU_DATA 数据结构测试', () => {
    test('应该包含12个时辰数据', () => {
      expect(ZIWU_DATA).toHaveLength(12);
    });

    test('每个时辰数据应该包含必要字段', () => {
      ZIWU_DATA.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('shichen');
        expect(item).toHaveProperty('jingluo');
        expect(item).toHaveProperty('time');
        expect(item).toHaveProperty('advice');
      });
    });

    test('时辰名称应该正确', () => {
      const shichenNames = ZIWU_DATA.map(item => item.shichen);
      expect(shichenNames).toEqual([
        '子时', '丑时', '寅时', '卯时', '辰时', '巳时',
        '午时', '未时', '申时', '酉时', '戌时', '亥时'
      ]);
    });

    test('id应该从0到11连续', () => {
      const ids = ZIWU_DATA.map(item => item.id);
      expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });
  });

  describe('getCurrentZiwu 函数测试', () => {
    test('应该返回当前时辰对象', () => {
      const result = getCurrentZiwu();
      expect(result).toHaveProperty('shichen');
      expect(result).toHaveProperty('jingluo');
      expect(result).toHaveProperty('advice');
    });

    test('返回的时辰应该在有效范围内', () => {
      const result = getCurrentZiwu();
      const validShichen = ZIWU_DATA.map(item => item.shichen);
      expect(validShichen).toContain(result.shichen);
    });

    test('子时(23:00-01:00)应该返回正确数据', () => {
      // 模拟23:30
      const mockDate = new Date('2026-04-14T23:30:00');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate);
      global.Date.now = originalDate.now;

      const result = getCurrentZiwu();
      expect(result.shichen).toBe('子时');
      expect(result.jingluo).toBe('胆经当令');

      global.Date = originalDate;
    });

    test('午时(11:00-13:00)应该返回正确数据', () => {
      const mockDate = new Date('2026-04-14T12:00:00');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate);
      global.Date.now = originalDate.now;

      const result = getCurrentZiwu();
      expect(result.shichen).toBe('午时');
      expect(result.jingluo).toBe('心经当令');

      global.Date = originalDate;
    });
  });

  describe('getTimeInfo 函数测试', () => {
    test('应该返回完整的时间信息对象', () => {
      const result = getTimeInfo();
      expect(result).toHaveProperty('hour');
      expect(result).toHaveProperty('minute');
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('shichen');
      expect(result).toHaveProperty('meridian');
      expect(result).toHaveProperty('advice');
    });

    test('hour和minute应该是两位数格式', () => {
      const mockDate = new Date('2026-04-14T09:05:00');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate);
      global.Date.now = originalDate.now;

      const result = getTimeInfo();
      expect(result.hour).toMatch(/^\d{2}$/);
      expect(result.minute).toMatch(/^\d{2}$/);
      expect(result.hour).toBe('09');
      expect(result.minute).toBe('05');

      global.Date = originalDate;
    });

    test('date格式应该正确', () => {
      const mockDate = new Date('2026-04-14T10:00:00');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate);
      global.Date.now = originalDate.now;

      const result = getTimeInfo();
      expect(result.date).toMatch(/^\d{1,2}月\d{1,2}日 周[一二三四五六日]$/);

      global.Date = originalDate;
    });
  });
});
