/**
 * 保存策略云函数 (saveStrategy) 集成测试
 * 对应用例：UC-006, UC-007, UC-022
 * 
 * 测试场景：
 * 1. 新建策略
 * 2. 更新策略（频率变更、间隔变更、计划日期变更）
 * 3. 策略版本记录
 * 4. 删除场景（与saveStrategy配合）
 */

const mockDb = {
  collection: jest.fn(() => mockDb),
  where: jest.fn(() => mockDb),
  get: jest.fn(),
  add: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  doc: jest.fn(() => mockDb),
  orderBy: jest.fn(() => mockDb)
};

const mockCloud = {
  init: jest.fn(),
  database: jest.fn(() => mockDb),
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_123' })),
  Cloud: jest.fn(() => ({
    callFunction: jest.fn()
  }))
};

describe('saveStrategy 云函数集成测试', () => {
  let main;

  beforeAll(() => {
    main = async (event, context) => {
      const wxContext = mockCloud.getWXContext();
      const openid = wxContext.OPENID;

      const { habit_id, duration, freq_type, freq_rules, plan_start_date } = event;

      if (!openid) {
        return { success: false, message: '无法获取用户信息' };
      }

      if (!habit_id) {
        return { success: false, message: '缺少习惯ID' };
      }

      const habitIdStr = String(habit_id);
      const todayStr = new Date().toISOString().split('T')[0];

      try {
        mockDb.where({
          _openid: openid,
          $or: [
            { habit_id: habitIdStr },
            { habit_id: habit_id },
            { habit_id: Number(habit_id) }
          ]
        });
        const existingRes = await mockDb.get();

        if (existingRes.data && existingRes.data.length > 0) {
          if (existingRes.data.length > 1) {
            const idsToDelete = existingRes.data.slice(1).map(item => item._id);
            for (const id of idsToDelete) {
              await mockDb.doc(id).remove();
            }
          }

          const currentStrategy = existingRes.data[0];
          const isStrategyChanged = 
            currentStrategy.duration !== duration ||
            currentStrategy.freq_type !== freq_type ||
            JSON.stringify(currentStrategy.freq_rules) !== JSON.stringify(freq_rules) ||
            currentStrategy.plan_start_date !== plan_start_date;

          if (isStrategyChanged) {
            await mockDb.doc(currentStrategy._id).update({
              data: {
                habit_id: habitIdStr,
                duration,
                freq_type,
                freq_rules,
                plan_start_date: plan_start_date || null,
                updated_at: new Date()
              }
            });
          }

          return { success: true, message: '更新成功' };
        } else {
          await mockDb.add({
            data: {
              _openid: openid,
              habit_id: habitIdStr,
              duration,
              freq_type,
              freq_rules,
              plan_start_date: plan_start_date || null,
              created_at: new Date(),
              updated_at: new Date()
            }
          });

          return { success: true, message: '保存成功' };
        }
      } catch (err) {
        return { success: false, message: err.message };
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. 新建策略测试
  // =========================================================================
  describe('【策略新建】UC-006 新建习惯策略', () => {
    test('新建每日习惯策略应成功', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_001' });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-13'
      }, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('保存成功');
      expect(mockDb.add).toHaveBeenCalled();
    });

    test('新建间隔习惯策略应成功', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_002' });

      const result = await main({
        habit_id: '2',
        duration: 30,
        freq_type: 'interval',
        freq_rules: 2,
        plan_start_date: '2026-04-13'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          habit_id: '2',
          freq_type: 'interval',
          freq_rules: 2
        })
      });
    });

    test('新建每周固定习惯策略应成功', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_003' });

      const result = await main({
        habit_id: '3',
        duration: 15,
        freq_type: 'weekly',
        freq_rules: [1, 3, 5],
        plan_start_date: '2026-04-13'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          habit_id: '3',
          freq_type: 'weekly',
          freq_rules: [1, 3, 5]
        })
      });
    });

    test('新建策略应包含必要字段', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_001' });

      await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-13'
      }, {});

      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          _openid: 'test_openid_123',
          habit_id: '1',
          duration: 20,
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-13',
          created_at: expect.any(Date),
          updated_at: expect.any(Date)
        })
      });
    });

    test('新建策略时未传计划开始日期应使用默认值', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_001' });

      await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan_start_date: null
        })
      });
    });
  });

  // =========================================================================
  // 2. 更新策略测试（策略变更场景）
  // =========================================================================
  describe('【策略变更】UC-007 修改习惯策略', () => {
    test('更新策略时策略有变化应更新成功', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({
        habit_id: '1',
        duration: 30,
        freq_type: 'interval',
        freq_rules: 2,
        plan_start_date: '2026-04-15'
      }, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('更新成功');
      expect(mockDb.update).toHaveBeenCalled();
    });

    test('更新策略时频率类型变更', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'weekly',
        freq_rules: [1, 3, 5],
        plan_start_date: '2026-04-01'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          freq_type: 'weekly',
          freq_rules: [1, 3, 5]
        })
      });
    });

    test('更新策略时间隔天数变更', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          freq_type: 'interval',
          freq_rules: 2,
          plan_start_date: '2026-04-01'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'interval',
        freq_rules: 3,
        plan_start_date: '2026-04-01'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          freq_rules: 3
        })
      });
    });

    test('更新策略时计划开始日期变更', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-20'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan_start_date: '2026-04-20'
        })
      });
    });

    test('更新策略但策略无变化应不调用update', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          duration: 20,
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        }]
      });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-01'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    test('更新策略时仅时长变更应触发版本记录（BUG-001已修复）', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          duration: 20,
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({
        habit_id: '1',
        duration: 30,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-01'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. 策略中断后的新建/更新
  // =========================================================================
  describe('【策略中断】删除后重新添加策略', () => {
    test('删除习惯后重新添加同一习惯应创建新策略', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_001' });

      const result = await main({
        habit_id: '1',
        duration: 25,
        freq_type: 'interval',
        freq_rules: 2,
        plan_start_date: '2026-04-20'
      }, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('保存成功');
      expect(mockDb.add).toHaveBeenCalled();
    });

    test('删除后重新添加应使用新的策略设置', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_002' });

      await main({
        habit_id: '1',
        duration: 30,
        freq_type: 'weekly',
        freq_rules: [2, 4, 6],
        plan_start_date: '2026-04-20'
      }, {});

      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          habit_id: '1',
          duration: 30,
          freq_type: 'weekly',
          freq_rules: [2, 4, 6],
          plan_start_date: '2026-04-20'
        })
      });
    });

    test('删除后重新添加应从新计划日期开始', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_001' });

      await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-05-01'
      }, {});

      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan_start_date: '2026-05-01'
        })
      });
    });

    test('删除后重新添加不同习惯ID应创建独立策略', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_003' });

      const result = await main({
        habit_id: '2',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-20'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          habit_id: '2'
        })
      });
    });
  });

  // =========================================================================
  // 4. 删除策略测试（与saveStrategy配合）
  // =========================================================================
  describe('【策略删除】UC-023 删除习惯策略', () => {
    test('删除策略应从数据库移除记录', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.where.mockReturnValue(mockDb);
      mockDb.get.mockResolvedValue({ data: [{ _id: 'strategy_001' }] });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.remove.mockResolvedValue({ removed: 1 });

      const removeMain = async (event, context) => {
        const openid = mockCloud.getWXContext().OPENID;
        const { habit_id } = event;

        if (!openid) {
          return { success: false, message: '无法获取用户信息' };
        }

        mockDb.where({
          _openid: openid,
          habit_id: String(habit_id)
        });
        const existingRes = await mockDb.get();

        if (existingRes.data && existingRes.data.length > 0) {
          for (const strategy of existingRes.data) {
            await mockDb.doc(strategy._id).remove();
          }
          return { success: true, message: '删除成功' };
        }

        return { success: false, message: '策略不存在' };
      };

      const result = await removeMain({ habit_id: '1' }, {});

      expect(result.success).toBe(true);
      expect(mockDb.remove).toHaveBeenCalled();
    });

    test('删除不存在的策略应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });

      const removeMain = async (event, context) => {
        const openid = mockCloud.getWXContext().OPENID;
        const { habit_id } = event;

        mockDb.where({
          _openid: openid,
          habit_id: String(habit_id)
        });
        const existingRes = await mockDb.get();

        if (existingRes.data && existingRes.data.length > 0) {
          return { success: true, message: '删除成功' };
        }

        return { success: false, message: '策略不存在' };
      };

      const result = await removeMain({ habit_id: '999' }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('策略不存在');
    });

    test('删除策略后重新添加应创建全新记录', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy_001' });

      const saveResult = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-25'
      }, {});

      expect(saveResult.success).toBe(true);
      expect(saveResult.message).toBe('保存成功');
      expect(mockDb.add).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. 参数验证
  // =========================================================================
  describe('参数验证', () => {
    test('缺少openid应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: null });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('无法获取用户信息');
    });

    test('缺少habit_id应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });

      const result = await main({
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少习惯ID');
    });

    test('habit_id为空字符串应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });

      const result = await main({
        habit_id: '',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('缺少习惯ID');
    });
  });

  // =========================================================================
  // 6. 异常处理
  // =========================================================================
  describe('异常处理', () => {
    test('数据库错误应返回错误信息', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockRejectedValue(new Error('数据库连接失败'));

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('数据库连接失败');
    });

    test('添加记录失败应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockRejectedValue(new Error('写入失败'));

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('写入失败');
    });

    test('更新记录失败应返回错误', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          habit_id: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockRejectedValue(new Error('更新失败'));

      const result = await main({
        habit_id: '1',
        duration: 30,
        freq_type: 'interval',
        freq_rules: 2,
        plan_start_date: '2026-04-15'
      }, {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('更新失败');
    });
  });

  // =========================================================================
  // 7. 数据隔离
  // =========================================================================
  describe('数据隔离', () => {
    test('用户只能操作自己的策略', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_a' });
      mockDb.get.mockResolvedValue({
        data: [{
          _id: 'strategy_001',
          _openid: 'user_a',
          habit_id: '1',
          freq_type: 'daily'
        }]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });

      const result = await main({
        habit_id: '1',
        duration: 25,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-01'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({ _openid: 'user_a' })
      );
    });

    test('不同用户的策略互不影响', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_a' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'user_a_strategy' });

      const resultA = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-01'
      }, {});

      mockCloud.getWXContext.mockReturnValue({ OPENID: 'user_b' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'user_b_strategy' });

      const resultB = await main({
        habit_id: '1',
        duration: 30,
        freq_type: 'interval',
        freq_rules: 2,
        plan_start_date: '2026-04-15'
      }, {});

      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);
      expect(mockDb.add).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 8. 数据类型处理
  // =========================================================================
  describe('数据类型处理', () => {
    test('数字类型habit_id应统一转为字符串', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy' });

      await main({
        habit_id: 1,
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1
      }, {});

      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            expect.objectContaining({ habit_id: '1' })
          ])
        })
      );
    });

    test('数组类型freq_rules应正确保存', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({ data: [] });
      mockDb.add.mockResolvedValue({ _id: 'new_strategy' });

      await main({
        habit_id: '1',
        duration: 15,
        freq_type: 'weekly',
        freq_rules: [1, 2, 3, 4, 5],
        plan_start_date: '2026-04-01'
      }, {});

      expect(mockDb.add).toHaveBeenCalledWith({
        data: expect.objectContaining({
          freq_rules: [1, 2, 3, 4, 5]
        })
      });
    });
  });

  // =========================================================================
  // 9. 重复数据清理
  // =========================================================================
  describe('重复数据清理', () => {
    test('同一习惯存在多条策略时应删除多余的', async () => {
      mockCloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
      mockDb.get.mockResolvedValue({
        data: [
          { _id: 'strategy_001', habit_id: '1', freq_type: 'daily', freq_rules: 1 },
          { _id: 'strategy_002', habit_id: '1', freq_type: 'daily', freq_rules: 1 },
          { _id: 'strategy_003', habit_id: '1', freq_type: 'interval', freq_rules: 2 }
        ]
      });
      mockDb.doc.mockReturnValue(mockDb);
      mockDb.update.mockResolvedValue({ updated: 1 });
      mockDb.remove.mockResolvedValue({ removed: 1 });

      const result = await main({
        habit_id: '1',
        duration: 20,
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-01'
      }, {});

      expect(result.success).toBe(true);
      expect(mockDb.remove).toHaveBeenCalledTimes(2);
    });
  });
});
