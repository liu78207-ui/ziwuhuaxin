/**
 * Real undoCheckin cloud function behavior for offline delayed cancellation.
 * Covers: UC-021, COM-009, INT-005.
 */

function loadUndoCheckin({ openid = 'test_openid', collection } = {}) {
  jest.resetModules();
  const dbCollection = collection || {
    where: jest.fn(() => dbCollection),
    get: jest.fn().mockResolvedValue({ data: [] }),
    doc: jest.fn(() => dbCollection),
    remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
  };
  const db = {
    collection: jest.fn(() => dbCollection)
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: openid }))
  };
  jest.doMock('wx-server-sdk', () => cloud, { virtual: true });
  const mod = require('../../../cloudfunctions/undoCheckin/index.js');
  return { main: mod.main, dbCollection };
}

describe('undoCheckin real cloud function', () => {
  afterEach(() => {
    jest.dontMock('wx-server-sdk');
  });

  test('INT-005: cancels the requested checkin_date instead of always using today', async () => {
    const collection = {
      where: jest.fn(() => collection),
      get: jest.fn().mockResolvedValue({
        data: [{ _id: 'log_20260510', habit_id: '1', checkin_date: '2026-05-10' }]
      }),
      doc: jest.fn(() => collection),
      remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
    };
    const { main, dbCollection } = loadUndoCheckin({ collection });

    const result = await main({ habit_id: '1', checkin_date: '2026-05-10' }, {});

    expect(result.success).toBe(true);
    expect(dbCollection.where).toHaveBeenCalledWith({
      _openid: 'test_openid',
      $or: [
        { habit_id: '1', checkin_date: '2026-05-10' },
        { habit_id: '1', checkin_date: '2026-05-10' },
        { habit_id: 1, checkin_date: '2026-05-10' }
      ]
    });
    expect(dbCollection.doc).toHaveBeenCalledWith('log_20260510');
    expect(dbCollection.remove).toHaveBeenCalled();
  });
});
