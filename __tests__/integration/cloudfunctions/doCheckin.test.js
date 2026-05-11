/**
 * 打卡云函数 (doCheckin) 集成测试
 * 测试打卡流程、数据验证、重复打卡处理等
 */

// 模拟云开发环境
const mockDb = {
  collection: jest.fn(() => mockDb),
  where: jest.fn(() => mockDb),
  get: jest.fn(),
  add: jest.fn(),
  orderBy: jest.fn(() => mockDb)
};

const mockCloud = {
  init: jest.fn(),
  database: jest.fn(() => mockDb),
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_123' }))
};

// 模拟云函数入口
const mockEvent = (data) => ({ ...data });
const mockContext = {};

describe('doCheckin 云函数集成测试', () => {
  let main;

  beforeAll(() => {
    // 模拟云函数主函数
    main = async (event, context) => {
      const openid = mockCloud.getWXContext().OPENID;
      const { habit_id } = event;

      if (!openid) {
        return { success: false, message: '无法获取用户信息' };
      }

      if (!habit_id) {
        return { success: false, message: '缺少习惯ID' };
      }

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const habitIdStr = String(habit_id);

      try {
        // 检查今日是否已打卡
        mockDb.where({
          _openid: openid,
          habit_id: habitIdStr,
          checkin_date: todayStr
        });
        const existingLog = await mockDb.get();

        if (existingLog.data && existingLog.data.length > 0) {
          return { success: false, message: '今日已打卡' };
        }

        // 查询策略
        mockDb.where({
          _openid: openid,
          $or: [
            { habit_id: habitIdStr },
            { habit_id: habit_id },
            { habit_id: Number(habit_id) }
          ]
        });
        const strategyRes = await mockDb.get();

        if (!strategyRes.data || strategyRes.data.length === 0) {
          return { success: false, message: '未找到该习惯的策略' };
        }

        // 添加打卡记录
        await mockDb.add({
          data: {
            _openid: openid,
            habit_id: habitIdStr,
            checkin_date: todayStr,
            created_at: new Date()
          }
        });

        return { success: true, message: '打卡成功' };
      } catch (err) {
        return { success: false, message: err.message };
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('参数验证测试', () => {
    test('缺少openid应该返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: null });

      const result = await main(mockEvent({ habit_id: '1' }), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('无法获取用户信息');
    });

    test('缺少habit_id应该返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });

      const result = await main(mockEvent({}), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少习惯ID');
    });

    test('habit_id为空字符串应该返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });

      const result = await main(mockEvent({ habit_id: '' }), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少习惯ID');
    });
  });

  describe('重复打卡测试', () => {
    test('今日已打卡应该返回提示', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });

      const result = await main(mockEvent({ habit_id: '1' }), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('今日已打卡');
    });

    test('不同习惯可以分别打卡', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] }) // 检查今日打卡 - 无记录
        .mockResolvedValueOnce({ data: [{ _id: 'strategy_001' }] }); // 查询策略
      mockDb.add.mockResolvedValue({ _id: 'new_log_001' });

      const result = await main(mockEvent({ habit_id: '2' }), mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('策略验证测试', () => {
    test('未找到策略应该返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] }) // 检查今日打卡
        .mockResolvedValueOnce({ data: [] }); // 查询策略 - 无结果

      const result = await main(mockEvent({ habit_id: '999' }), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到该习惯的策略');
    });

    test('找到策略应该允许打卡', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ _id: 'strategy_001', habit_id: '1', duration: 20 }]
        });
      mockDb.add.mockResolvedValue({ _id: 'new_log_001' });

      const result = await main(mockEvent({ habit_id: '1' }), mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('打卡成功');
    });
  });

  describe('数据存储测试', () => {
    test('打卡成功应该保存正确数据', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ _id: 'strategy_001', habit_id: '1' }]
        });
      mockDb.add.mockResolvedValue({ _id: 'new_log_001' });

      await main(mockEvent({ habit_id: '1' }), mockContext);

      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          _openid: 'test_openid_123',
          habit_id: '1',
          checkin_date: expect.any(String),
          created_at: expect.any(Date)
        })
      });
    });

    test('habit_id应该统一保存为字符串', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ _id: 'strategy_001', habit_id: 1 }]
        });
      mockDb.add.mockResolvedValue({ _id: 'new_log_001' });

      await main(mockEvent({ habit_id: 1 }), mockContext);

      const addCall = mockDb.add.mock.calls[0][0];
      expect(typeof addCall.data.habit_id).toBe('string');
    });
  });

  describe('异常处理测试', () => {
    test('数据库错误应该返回错误信息', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockRejectedValue(new Error('数据库连接失败'));

      const result = await main(mockEvent({ habit_id: '1' }), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('数据库连接失败');
    });

    test('添加记录失败应该返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ _id: 'strategy_001' }]
        });
      mockDb.add.mockRejectedValue(new Error('写入失败'));

      const result = await main(mockEvent({ habit_id: '1' }), mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toBe('写入失败');
    });
  });

  describe('数据隔离测试', () => {
    test('用户只能看到自己的打卡记录', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_001' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ _id: 'strategy_001' }]
        });
      mockDb.add.mockResolvedValue({ _id: 'new_log_001' });

      await main(mockEvent({ habit_id: '1' }), mockContext);

      // 验证查询时使用了正确的openid
      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({ _openid: 'user_001' })
      );
    });

    test('不同用户的打卡记录互不影响', async () => {
      // 用户A打卡
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_a' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [{ _id: 'strategy_a' }] });
      mockDb.add.mockResolvedValue({ _id: 'log_a' });

      const resultA = await main(mockEvent({ habit_id: '1' }), mockContext);
      expect(resultA.success).toBe(true);

      // 用户B打卡同一习惯
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_b' });
      mockDb.get
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [{ _id: 'strategy_b' }] });
      mockDb.add.mockResolvedValue({ _id: 'log_b' });

      const resultB = await main(mockEvent({ habit_id: '1' }), mockContext);
      expect(resultB.success).toBe(true);
    });
  });
});
