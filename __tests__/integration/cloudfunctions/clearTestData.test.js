function createCollection(name, options = {}) {
  const {
    total = 0,
    deleted = total,
    missing = false
  } = options;

  const queryRef = {
    count: jest.fn(() => {
      if (missing) {
        return Promise.reject(new Error(`collection.count:fail -502005 database collection not exists: ${name}`));
      }
      return Promise.resolve({ total });
    }),
    get: jest.fn(() => Promise.resolve({ data: new Array(total).fill({}) })),
    remove: jest.fn(() => {
      if (missing) {
        return Promise.reject(new Error(`collection.remove:fail -502005 database collection not exists: ${name}`));
      }
      return Promise.resolve({ deleted });
    })
  };

  return {
    where: jest.fn(query => {
      queryRef.query = query;
      return queryRef;
    }),
    queryRef
  };
}

function loadClearTestData({ collections = {} } = {}) {
  jest.resetModules();

  const db = {
    command: {
      exists: jest.fn(value => ({ $exists: value }))
    },
    collection: jest.fn(name => collections[name] || createCollection(name))
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: 'admin_openid' }))
  };

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true });
  const mod = require('../../../cloudfunctions/clearTestData/index.js');
  return { main: mod.main, db, collections };
}

describe('clearTestData cloud function', () => {
  const validPayload = {
    scope: 'allUsers',
    confirmPhrase: 'CLEAR_ALL_USER_DATA',
    adminToken: 'secret'
  };

  beforeEach(() => {
    process.env.CLEAR_USER_DATA_ADMIN_TOKEN = 'secret';
  });

  afterEach(() => {
    delete process.env.CLEAR_USER_DATA_ADMIN_TOKEN;
    jest.dontMock('wx-server-sdk');
  });

  test('rejects by default when token and confirmation are missing', async () => {
    const users = createCollection('users', { total: 2 });
    const { main } = loadClearTestData({ collections: { users } });

    const result = await main({}, {});

    expect(result).toMatchObject({
      success: false,
      dryRun: true,
      details: {}
    });
    expect(users.where).not.toHaveBeenCalled();
  });

  test('dryRun counts every target collection and does not remove data', async () => {
    const users = createCollection('users', { total: 2 });
    const habits = createCollection('habits', { total: 3 });
    const { main, db } = loadClearTestData({
      collections: { users, habits }
    });

    const result = await main({
      ...validPayload,
      dryRun: true
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.details.users).toEqual({
      matched: 2,
      deleted: 0,
      skipped: false,
      reason: ''
    });
    expect(result.details.habits.matched).toBe(3);
    expect(users.queryRef.remove).not.toHaveBeenCalled();
    expect(habits.queryRef.remove).not.toHaveBeenCalled();
    expect(habits.where).toHaveBeenCalledWith({
      _openid: { $exists: true }
    });
    expect(db.collection).toHaveBeenCalledWith('user_habits');
  });

  test('real run deletes all target user data when strongly confirmed', async () => {
    const users = createCollection('users', { total: 2, deleted: 2 });
    const dailyStates = createCollection('daily_checkin_states', { total: 5, deleted: 5 });
    const habits = createCollection('habits', { total: 1, deleted: 1 });
    const { main } = loadClearTestData({
      collections: {
        users,
        daily_checkin_states: dailyStates,
        habits
      }
    });

    const result = await main({
      ...validPayload,
      dryRun: false
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.details.users).toMatchObject({ matched: 2, deleted: 2 });
    expect(result.details.daily_checkin_states).toMatchObject({ matched: 5, deleted: 5 });
    expect(result.details.habits).toMatchObject({ matched: 1, deleted: 1 });
    expect(users.queryRef.remove).toHaveBeenCalled();
    expect(dailyStates.queryRef.remove).toHaveBeenCalled();
    expect(habits.where).toHaveBeenCalledWith({
      _openid: { $exists: true }
    });
  });

  test('skips missing collections without failing the whole cleanup', async () => {
    const aiLogs = createCollection('ai_logs', { missing: true });
    const users = createCollection('users', { total: 1 });
    const { main } = loadClearTestData({
      collections: { ai_logs: aiLogs, users }
    });

    const result = await main({
      ...validPayload,
      dryRun: true
    }, {});

    expect(result.success).toBe(true);
    expect(result.details.ai_logs).toEqual({
      matched: 0,
      deleted: 0,
      skipped: true,
      reason: 'collection_missing'
    });
    expect(result.details.users.matched).toBe(1);
  });
});
