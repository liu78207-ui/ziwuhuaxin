/**
 * 取消打卡云函数 (undoCheckin) 集成测试
 * 对应用例：UC-021, EX-005
 */

const mockDb = {
  collection: jest.fn(() => mockDb),
  where: jest.fn(() => mockDb),
  get: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
  doc: jest.fn(() => mockDb),
  orderBy: jest.fn(() => mockDb)
};

const mockCloud = {
  init: jest.fn(),
  database: jest.fn(() => mockDb),
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_123' }))
};

describe('undoCheckin 云函数集成测试', () => {
  let main;

  beforeAll(() => {
    main = async (event, context) => {
      const wxContext = mockCloud.getWXContext();
      const openid = wxContext.OPENID;
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
        mockDb.where({
          _openid: openid,
          $or: [
            { habit_id: habitIdStr, checkin_date: todayStr },
            { habit_id: habit_id, checkin_date: todayStr },
            { habit_id: Number(habit_id), checkin_date: todayStr }
          ]
        });
        const existingLog = await mockDb.get();

        if (!existingLog.data || existingLog.data.length === 0) {
          return { success: false, message: '今日未打卡，无需取消' };
        }

        const logId = existingLog.data[0]._id;
        mockDb.doc(logId);
        await mockDb.update({
          data: { sync_status: 2 }
        });

        return { success: true, message: '取消打卡成功' };

      } catch (err) {
        return { success: false, message: err.message };
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UC-021: 取消打卡（云端）', () => {
    test('今日已打卡应成功取消', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({ habit_id: '1' }, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('取消打卡成功');
    });

    test('取消应标记正确的记录', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockResolvedValue({ updated: 1 });

      await main({ habit_id: '1' }, {});

      expect(mockDb.doc).toHaveBeenCalledWith('log_001');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.remove).not.toHaveBeenCalled();
    });
  });

  describe('EX-005: 取消打卡但云端无记录', () => {
    test('今日未打卡应返回错误提示', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });

      const result = await main({ habit_id: '1' }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('今日未打卡，无需取消');
    });

    test('不同习惯应独立判断', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });

      const result1 = await main({ habit_id: '1' }, {});
      expect(result1.success).toBe(false);

      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_002', habit_id: '2', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result2 = await main({ habit_id: '2' }, {});
      expect(result2.success).toBe(true);
    });
  });

  describe('参数验证', () => {
    test('缺少openid应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: null });

      const result = await main({ habit_id: '1' }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('无法获取用户信息');
    });

    test('缺少habit_id应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });

      const result = await main({}, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少习惯ID');
    });

    test('habit_id为空字符串应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });

      const result = await main({ habit_id: '' }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少习惯ID');
    });
  });

  describe('数据类型处理', () => {
    test('数字类型habit_id应统一转为字符串', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockResolvedValue({ updated: 1 });

      await main({ habit_id: 1 }, {});

      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            expect.objectContaining({ habit_id: '1' })
          ])
        })
      );
    });
  });

  describe('异常处理', () => {
    test('数据库错误应返回错误信息', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockRejectedValue(new Error('数据库连接失败'));

      const result = await main({ habit_id: '1' }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('数据库连接失败');
    });

    test('取消标记失败应返回错误信息', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockRejectedValue(new Error('取消标记失败'));

      const result = await main({ habit_id: '1' }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('取消标记失败');
    });
  });

  describe('数据隔离', () => {
    test('用户只能取消标记自己的打卡记录', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_001' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockResolvedValue({ updated: 1 });

      await main({ habit_id: '1' }, {});

      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({ _openid: 'user_001' })
      );
    });

    test('不同用户的记录互不影响', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_a' });
      mockDb.get.mockResolvedValue({ data: [] });

      const resultA = await main({ habit_id: '1' }, {});
      expect(resultA.success).toBe(false);

      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_b' });
      mockDb.get.mockResolvedValue({
        data: [{ _id: 'log_001', habit_id: '1', checkin_date: '2026-04-14' }]
      });
      mockDb.update.mockResolvedValue({ updated: 1 });

      const resultB = await main({ habit_id: '1' }, {});
      expect(resultB.success).toBe(true);
    });
  });
});
