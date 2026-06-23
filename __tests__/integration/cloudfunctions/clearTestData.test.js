function createCollection(name, options = {}) {
  const {
    total = 0,
    deleted = total,
    removeResult,
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
      if (removeResult) {
        return Promise.resolve(removeResult);
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
  const targetOpenidPayload = {
    scope: 'targetOpenid',
    targetOpenid: 'oCt9o12Rj50RtOaGiKKhwqf7QSMg',
    confirmPhrase: 'CLEAR_TARGET_USER_DATA',
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
    expect(users.where).toHaveBeenCalledWith({
      _openid: { $exists: true }
    });
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
    expect(users.where).toHaveBeenCalledWith({
      _openid: { $exists: true }
    });
    expect(dailyStates.where).toHaveBeenCalledWith({
      _openid: { $exists: true }
    });
    expect(habits.where).toHaveBeenCalledWith({
      _openid: { $exists: true }
    });
  });

  test('targetOpenid dryRun only counts data owned by the specified openid', async () => {
    const users = createCollection('users', { total: 1 });
    const userHabits = createCollection('user_habits', { total: 25 });
    const habits = createCollection('habits', { total: 2 });
    const { main } = loadClearTestData({
      collections: {
        users,
        user_habits: userHabits,
        habits
      }
    });

    const result = await main({
      ...targetOpenidPayload,
      dryRun: true
    }, {});

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      scope: 'targetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid
    });
    expect(result.details.users.matched).toBe(1);
    expect(result.details.user_habits.matched).toBe(25);
    expect(result.details.habits.matched).toBe(2);
    expect(users.where).toHaveBeenCalledWith({ _openid: targetOpenidPayload.targetOpenid });
    expect(userHabits.where).toHaveBeenCalledWith({ _openid: targetOpenidPayload.targetOpenid });
    expect(habits.where).toHaveBeenCalledWith({ _openid: targetOpenidPayload.targetOpenid });
    expect(users.queryRef.remove).not.toHaveBeenCalled();
    expect(userHabits.queryRef.remove).not.toHaveBeenCalled();
    expect(habits.queryRef.remove).not.toHaveBeenCalled();
  });

  test('targetOpenid real run deletes only data owned by the specified openid', async () => {
    const users = createCollection('users', { total: 1, deleted: 1 });
    const checkinLogs = createCollection('checkin_logs', { total: 71, deleted: 71 });
    const habits = createCollection('habits', { total: 2, deleted: 2 });
    const { main } = loadClearTestData({
      collections: {
        users,
        checkin_logs: checkinLogs,
        habits
      }
    });

    const result = await main({
      ...targetOpenidPayload,
      dryRun: false
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.scope).toBe('targetOpenid');
    expect(result.details.users).toMatchObject({ matched: 1, deleted: 1 });
    expect(result.details.checkin_logs).toMatchObject({ matched: 71, deleted: 71 });
    expect(result.details.habits).toMatchObject({ matched: 2, deleted: 2 });
    expect(users.queryRef.remove).toHaveBeenCalled();
    expect(checkinLogs.queryRef.remove).toHaveBeenCalled();
    expect(habits.queryRef.remove).toHaveBeenCalled();
    expect(habits.where).toHaveBeenCalledWith({ _openid: targetOpenidPayload.targetOpenid });
  });

  test('targetOpenid real run reads CloudBase stats.removed delete count', async () => {
    const users = createCollection('users', {
      total: 1,
      removeResult: { stats: { removed: 1 } }
    });
    const { main } = loadClearTestData({ collections: { users } });

    const result = await main({
      ...targetOpenidPayload,
      dryRun: false
    }, {});

    expect(result.success).toBe(true);
    expect(result.details.users).toMatchObject({ matched: 1, deleted: 1 });
    expect(users.queryRef.remove).toHaveBeenCalled();
  });

  test('targetOpenid rejects missing targetOpenid before touching collections', async () => {
    const users = createCollection('users', { total: 1 });
    const { main } = loadClearTestData({ collections: { users } });

    const result = await main({
      scope: 'targetOpenid',
      confirmPhrase: 'CLEAR_TARGET_USER_DATA',
      adminToken: 'secret'
    }, {});

    expect(result.success).toBe(false);
    expect(result.message).toContain('targetOpenid 必填');
    expect(users.where).not.toHaveBeenCalled();
  });

  test('targetOpenid rejects allUsers confirmation phrase', async () => {
    const users = createCollection('users', { total: 1 });
    const { main } = loadClearTestData({ collections: { users } });

    const result = await main({
      ...targetOpenidPayload,
      confirmPhrase: 'CLEAR_ALL_USER_DATA'
    }, {});

    expect(result.success).toBe(false);
    expect(result.message).toContain('CLEAR_TARGET_USER_DATA');
    expect(users.where).not.toHaveBeenCalled();
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
