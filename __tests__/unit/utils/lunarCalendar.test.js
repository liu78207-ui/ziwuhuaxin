const lunarCalendar = require('../../../miniprogram/utils/lunarCalendar.js');

describe('lunarCalendar', () => {
  test('converts Gregorian date to exact lunar date', () => {
    const lunar = lunarCalendar.solarToLunar(new Date(2026, 1, 17));

    expect(lunar).toMatchObject({
      lunarYear: 2026,
      lunarYearName: '丙午年',
      lunarMonth: 1,
      lunarMonthName: '正月',
      lunarDay: 1,
      lunarDayName: '初一',
      isLeapMonth: false
    });
  });

  test('formats a same lunar month range without lunar prefix or year', () => {
    const range = lunarCalendar.formatLunarRange(
      new Date(2026, 4, 4),
      new Date(2026, 4, 10)
    );

    expect(range).toBe('三月十八 - 廿四');
  });

  test('formats a same lunar year cross-month range without year', () => {
    const range = lunarCalendar.formatLunarRange(
      new Date(2026, 4, 1),
      new Date(2026, 4, 31)
    );

    expect(range).toBe('三月十五 - 四月十五');
  });

  test('formats a cross lunar year range with both Ganzhi year names but no prefix', () => {
    const range = lunarCalendar.formatLunarRange(
      new Date(2026, 0, 1),
      new Date(2026, 11, 31)
    );

    expect(range).toBe('乙巳年冬月十三 - 丙午年冬月廿三');
  });

  test('formats leap lunar month names without prefix or year', () => {
    const range = lunarCalendar.formatLunarRange(
      new Date(2025, 6, 27),
      new Date(2025, 6, 27)
    );

    expect(range).toBe('闰六月初三 - 初三');
  });

  test('returns empty subtitle outside supported conversion range', () => {
    expect(lunarCalendar.formatLunarRange(
      new Date(1899, 11, 31),
      new Date(1900, 0, 1)
    )).toBe('');
  });
});
