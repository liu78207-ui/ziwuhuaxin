/**
 * Real undoCheckin cloud function behavior for offline delayed cancellation.
 * Covers: UC-021, COM-009, INT-005.
 */

function loadUndoCheckin({ openid = 'test_openid', collections } = {}) {
  jest.resetModules();
  const dbCollections = collections || {};
  const db = {
    collection: jest.fn(name => dbCollections[name])
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: openid }))
  };
  jest.doMock('wx-server-sdk', () => cloud, { virtual: true });
  const mod = require('../../../cloudfunctions/undoCheckin/index.js');
  return { main: mod.main, dbCollections };
}

describe('undoCheckin real cloud function', () => {
  afterEach(() => {
    jest.dontMock('wx-server-sdk');
  });

  test('INT-005: cancels the requested checkin_date instead of always using today', async () => {
    const checkinLogs = {
      where: jest.fn(() => checkinLogs),
      get: jest.fn().mockResolvedValue({
        data: [{ _id: 'log_20260510', habit_id: '1', checkin_date: '2026-05-10' }]
      }),
      doc: jest.fn(() => checkinLogs),
      update: jest.fn().mockResolvedValue({ stats: { updated: 1 } }),
      remove: jest.fn()
    };
    const operations = {
      where: jest.fn(() => operations),
      get: jest.fn().mockResolvedValue({ data: [] }),
      add: jest.fn().mockResolvedValue({ _id: 'op_1' })
    };
    const dailyStates = {
      where: jest.fn(() => dailyStates),
      get: jest.fn().mockResolvedValue({ data: [] }),
      add: jest.fn().mockResolvedValue({ _id: 'state_1' }),
      doc: jest.fn(() => dailyStates),
      update: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
    };
    const { main } = loadUndoCheckin({
      collections: {
        checkin_logs: checkinLogs,
        checkin_operations: operations,
        daily_checkin_states: dailyStates
      }
    });

    const result = await main({ habit_id: '1', checkin_date: '2026-05-10' }, {});

    expect(result.success).toBe(true);
    expect(result.code).toBe('CHECKIN_CANCELED');
    expect(checkinLogs.where).toHaveBeenCalledWith({
      _openid: 'test_openid',
      $or: [
        { habit_id: '1', checkin_date: '2026-05-10' },
        { habit_id: '1', checkin_date: '2026-05-10' },
        { habit_id: 1, checkin_date: '2026-05-10' }
      ]
    });
    expect(checkinLogs.doc).toHaveBeenCalledWith('log_20260510');
    expect(checkinLogs.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sync_status: 2,
        cancel_operation_id: 'legacy_undo_1_2026-05-10'
      })
    });
    expect(checkinLogs.remove).not.toHaveBeenCalled();
    expect(operations.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'undo',
        idempotencyKey: 'legacy:1:2026-05-10:undo'
      })
    });
    expect(dailyStates.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'canceled',
        userHabitId: '1',
        date: '2026-05-10'
      })
    });
  });
});
