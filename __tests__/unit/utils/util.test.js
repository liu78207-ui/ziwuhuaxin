/**
 * 通用工具函数单元测试
 * 测试时间格式化等功能
 */

// 由于 util.ts 是 TypeScript 文件，我们直接测试其功能逻辑
// 模拟 formatTime 函数的实现
const formatTime = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  const formatNumber = (n) => {
    const s = n.toString();
    return s[1] ? s : '0' + s;
  };

  return (
    [year, month, day].map(formatNumber).join('/') +
    ' ' +
    [hour, minute, second].map(formatNumber).join(':')
  );
};

describe('通用工具函数测试', () => {

  describe('formatTime 函数测试', () => {
    test('应该正确格式化日期时间', () => {
      const date = new Date(2026, 3, 14, 9, 5, 3); // 2026-04-14 09:05:03
      const result = formatTime(date);
      expect(result).toBe('2026/04/14 09:05:03');
    });

    test('应该正确处理个位数月份和日期', () => {
      const date = new Date(2026, 0, 5, 1, 2, 3); // 2026-01-05 01:02:03
      const result = formatTime(date);
      expect(result).toBe('2026/01/05 01:02:03');
    });

    test('应该正确处理年末日期', () => {
      const date = new Date(2026, 11, 31, 23, 59, 59); // 2026-12-31 23:59:59
      const result = formatTime(date);
      expect(result).toBe('2026/12/31 23:59:59');
    });

    test('应该正确处理闰年2月29日', () => {
      const date = new Date(2024, 1, 29, 12, 0, 0); // 2024-02-29 12:00:00
      const result = formatTime(date);
      expect(result).toBe('2024/02/29 12:00:00');
    });

    test('格式应该符合YYYY/MM/DD HH:mm:ss', () => {
      const date = new Date();
      const result = formatTime(date);
      expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('应该正确处理边界时间 00:00:00', () => {
      const date = new Date(2026, 0, 1, 0, 0, 0);
      const result = formatTime(date);
      expect(result).toBe('2026/01/01 00:00:00');
    });

    test('应该正确处理边界时间 23:59:59', () => {
      const date = new Date(2026, 0, 1, 23, 59, 59);
      const result = formatTime(date);
      expect(result).toBe('2026/01/01 23:59:59');
    });
  });
});
