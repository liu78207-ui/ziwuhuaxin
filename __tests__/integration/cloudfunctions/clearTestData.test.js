function createCollection(name, options = {}) {
  const {
    data,
    total = data ? data.length : 0,
    deleted = total,
    removeResult,
    missing = false
  } = options;
  const rows = data || new Array(total).fill({});
  const docRefs = {};
  const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, expected]) => {
    if (expected && Array.isArray(expected.$in)) {
      return expected.$in.includes(row[key]);
    }
    if (expected && Object.prototype.hasOwnProperty.call(expected, '$exists')) {
      return expected.$exists ? row[key] !== undefined : row[key] === undefined;
    }
    return row[key] === expected;
  });

  const queryRef = {
    count: jest.fn(() => {
      if (missing) {
        return Promise.reject(new Error(`collection.count:fail -502005 database collection not exists: ${name}`));
      }
      if (data) {
        return Promise.resolve({ total: rows.filter(row => matchesQuery(row, queryRef.query)).length });
      }
      return Promise.resolve({ total });
    }),
    get: jest.fn(() => {
      const matchedRows = data ? rows.filter(row => matchesQuery(row, queryRef.query)) : rows;
      const start = queryRef.offset || 0;
      const end = queryRef.limitSize ? start + queryRef.limitSize : undefined;
      return Promise.resolve({ data: matchedRows.slice(start, end) });
    }),
    skip: jest.fn(offset => {
      queryRef.offset = offset;
      return queryRef;
    }),
    limit: jest.fn(limitSize => {
      queryRef.limitSize = limitSize;
      return queryRef;
    }),
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
    add: jest.fn(({ data: payload }) => Promise.resolve({ _id: `${name}_added_${rows.length}`, data: payload })),
    where: jest.fn(query => {
      queryRef.query = query;
      return queryRef;
    }),
    doc: jest.fn(id => {
      if (!docRefs[id]) {
        docRefs[id] = {
          remove: jest.fn(() => Promise.resolve({ deleted: 1 })),
          update: jest.fn(() => Promise.resolve({ updated: 1 }))
        };
      }
      return docRefs[id];
    }),
    docRefs,
    queryRef
  };
}

function loadClearTestData({ collections = {} } = {}) {
  jest.resetModules();

  const db = {
    command: {
      exists: jest.fn(value => ({ $exists: value })),
      in: jest.fn(value => ({ $in: value }))
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

  test('custom habit cleanup dryRun lists only target custom habits and does not remove data', async () => {
    const userHabits = createCollection('user_habits', {
      data: [
        {
          _id: 'custom_doc_1',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'custom_taiji',
          userHabitId: 'uh_custom_1',
          source: 'custom',
          name: '太极',
          status: 'active'
        },
        {
          _id: 'builtin_doc',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'baduanjin',
          userHabitId: 'uh_builtin',
          source: 'builtin',
          name: '八段锦',
          status: 'active'
        },
        {
          _id: 'other_openid_custom_doc',
          _openid: 'other_openid',
          habitId: 'custom_other',
          userHabitId: 'uh_other',
          source: 'custom',
          name: '其他账号',
          status: 'active'
        }
      ]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [
        { _id: 'pv_custom', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_1' },
        { _id: 'pv_builtin', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_builtin' },
        { _id: 'pv_other', _openid: 'other_openid', userHabitId: 'uh_other' }
      ]
    });
    const states = createCollection('daily_checkin_states', {
      data: [
        { _id: 'ds_custom', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_1' }
      ]
    });
    const operations = createCollection('checkin_operations', {
      data: [
        { _id: 'op_custom', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_1' }
      ]
    });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: states,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'cleanupCustomHabitsForTargetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
      adminToken: 'secret',
      dryRun: true
    }, {});

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      action: 'cleanupCustomHabitsForTargetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid
    });
    expect(result.details.user_habits.matched).toBe(1);
    expect(result.details.user_habits.records).toEqual([{
      habitId: 'custom_taiji',
      userHabitId: 'uh_custom_1',
      name: '太极',
      status: 'active'
    }]);
    expect(result.details.habit_policy_versions.matched).toBe(1);
    expect(result.details.daily_checkin_states.matched).toBe(1);
    expect(result.details.checkin_operations.matched).toBe(1);
    expect(userHabits.where).toHaveBeenCalledWith({ _openid: targetOpenidPayload.targetOpenid });
    expect(policies.where).toHaveBeenCalledWith({
      _openid: targetOpenidPayload.targetOpenid,
      userHabitId: { $in: ['uh_custom_1'] }
    });
    expect(userHabits.doc).not.toHaveBeenCalled();
    expect(policies.queryRef.remove).not.toHaveBeenCalled();
    expect(states.queryRef.remove).not.toHaveBeenCalled();
    expect(operations.queryRef.remove).not.toHaveBeenCalled();
  });

  test('custom habit cleanup accepts callFunction-style name/data wrapper', async () => {
    const userHabits = createCollection('user_habits', {
      data: [
        {
          _id: 'custom_doc_1',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'custom_taiji',
          userHabitId: 'uh_custom_1',
          source: 'custom',
          name: '太极',
          status: 'active'
        }
      ]
    });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits
      }
    });

    const result = await main({
      name: 'clearTestData',
      data: {
        action: 'cleanupCustomHabitsForTargetOpenid',
        targetOpenid: targetOpenidPayload.targetOpenid,
        confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
        adminToken: 'secret'
      }
    }, {});

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      action: 'cleanupCustomHabitsForTargetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid
    });
    expect(result.details.user_habits.matched).toBe(1);
    expect(userHabits.queryRef.remove).not.toHaveBeenCalled();
  });

  test('custom habit cleanup paginates all target user habits before filtering custom records', async () => {
    const customRows = Array.from({ length: 101 }, (_, index) => ({
      _id: `custom_doc_${index}`,
      _openid: targetOpenidPayload.targetOpenid,
      habitId: `custom_${index}`,
      userHabitId: `uh_custom_${index}`,
      source: 'custom',
      name: '',
      status: 'deleted'
    }));
    const userHabits = createCollection('user_habits', {
      data: [
        ...customRows,
        {
          _id: 'builtin_doc',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'baduanjin',
          userHabitId: 'uh_builtin',
          source: 'builtin',
          name: '八段锦',
          status: 'active'
        }
      ]
    });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits
      }
    });

    const result = await main({
      action: 'cleanupCustomHabitsForTargetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
      adminToken: 'secret'
    }, {});

    expect(result.success).toBe(true);
    expect(result.details.user_habits.matched).toBe(101);
    expect(userHabits.queryRef.skip).toHaveBeenCalledWith(0);
    expect(userHabits.queryRef.skip).toHaveBeenCalledWith(100);
    expect(userHabits.queryRef.limit).toHaveBeenCalledWith(100);
  });

  test('custom habit cleanup real run deletes only target custom habits and related facts', async () => {
    const userHabits = createCollection('user_habits', {
      data: [
        {
          _id: 'custom_doc_1',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'custom_taiji',
          userHabitId: 'uh_custom_1',
          source: 'custom',
          name: '太极',
          status: 'active'
        },
        {
          _id: 'custom_doc_2',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'custom_yoga',
          userHabitId: 'uh_custom_2',
          name: '瑜伽',
          status: 'deleted'
        },
        {
          _id: 'builtin_doc',
          _openid: targetOpenidPayload.targetOpenid,
          habitId: 'baduanjin',
          userHabitId: 'uh_builtin',
          source: 'builtin',
          name: '八段锦',
          status: 'active'
        },
        {
          _id: 'other_openid_custom_doc',
          _openid: 'other_openid',
          habitId: 'custom_other',
          userHabitId: 'uh_other',
          source: 'custom',
          name: '其他账号',
          status: 'active'
        }
      ]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [
        { _id: 'pv_1', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_1' },
        { _id: 'pv_2', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_2' },
        { _id: 'pv_builtin', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_builtin' },
        { _id: 'pv_other', _openid: 'other_openid', userHabitId: 'uh_other' }
      ],
      deleted: 2
    });
    const states = createCollection('daily_checkin_states', {
      data: [
        { _id: 'ds_1', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_1' },
        { _id: 'ds_2', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_2' },
        { _id: 'ds_builtin', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_builtin' }
      ],
      deleted: 2
    });
    const operations = createCollection('checkin_operations', {
      data: [
        { _id: 'op_1', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_1' },
        { _id: 'op_2', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_custom_2' },
        { _id: 'op_builtin', _openid: targetOpenidPayload.targetOpenid, userHabitId: 'uh_builtin' }
      ],
      deleted: 2
    });
    const users = createCollection('users', { total: 1 });
    const settings = createCollection('user_settings', { total: 1 });
    const { main } = loadClearTestData({
      collections: {
        users,
        user_settings: settings,
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: states,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'cleanupCustomHabitsForTargetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
      adminToken: 'secret',
      dryRun: false
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.details.user_habits).toMatchObject({ matched: 2, deleted: 2 });
    expect(result.details.habit_policy_versions).toMatchObject({ matched: 2, deleted: 2 });
    expect(result.details.daily_checkin_states).toMatchObject({ matched: 2, deleted: 2 });
    expect(result.details.checkin_operations).toMatchObject({ matched: 2, deleted: 2 });
    expect(userHabits.doc).toHaveBeenCalledWith('custom_doc_1');
    expect(userHabits.doc).toHaveBeenCalledWith('custom_doc_2');
    expect(userHabits.doc).not.toHaveBeenCalledWith('builtin_doc');
    expect(userHabits.doc).not.toHaveBeenCalledWith('other_openid_custom_doc');
    expect(userHabits.docRefs.custom_doc_1.remove).toHaveBeenCalled();
    expect(userHabits.docRefs.custom_doc_2.remove).toHaveBeenCalled();
    expect(policies.where).toHaveBeenCalledWith({
      _openid: targetOpenidPayload.targetOpenid,
      userHabitId: { $in: ['uh_custom_1', 'uh_custom_2'] }
    });
    expect(users.where).not.toHaveBeenCalled();
    expect(settings.where).not.toHaveBeenCalled();
  });

  test('custom habit cleanup rejects missing targetOpenid, bad confirmation, and allUsers scope', async () => {
    const userHabits = createCollection('user_habits', { total: 1 });
    const { main } = loadClearTestData({ collections: { user_habits: userHabits } });

    const missingOpenid = await main({
      action: 'cleanupCustomHabitsForTargetOpenid',
      confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
      adminToken: 'secret'
    }, {});
    const badConfirm = await main({
      action: 'cleanupCustomHabitsForTargetOpenid',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'CLEAR_TARGET_USER_DATA',
      adminToken: 'secret'
    }, {});
    const allUsers = await main({
      action: 'cleanupCustomHabitsForTargetOpenid',
      scope: 'allUsers',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
      adminToken: 'secret'
    }, {});

    expect(missingOpenid.success).toBe(false);
    expect(missingOpenid.message).toContain('targetOpenid');
    expect(badConfirm.success).toBe(false);
    expect(badConfirm.message).toContain('DELETE_TARGET_CUSTOM_HABITS');
    expect(allUsers.success).toBe(false);
    expect(allUsers.message).toContain('不支持 allUsers');
    expect(userHabits.where).not.toHaveBeenCalled();
  });

  test('repairTargetUserCheckins dryRun reports missing built-in checkins without writing', async () => {
    const dailyStates = createCollection('daily_checkin_states', {
      data: [
        {
          _id: 'existing_ds',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_17_existing',
          habitId: '17',
          date: '2026-07-06',
          status: 'checked'
        }
      ]
    });
    const operations = createCollection('checkin_operations', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        daily_checkin_states: dailyStates,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'repairTargetUserCheckins',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'REPAIR_TARGET_USER_CHECKINS',
      adminToken: 'secret',
      dailyStates: [
        { userHabitId: 'uh_17_existing', habitId: '17', date: '2026-07-06', status: 'checked' },
        { userHabitId: 'uh_2_missing', habitId: '2', date: '2026-07-07', status: 'checked' },
        { userHabitId: 'uh_custom_bad', habitId: 'custom_bad', date: '2026-07-07', status: 'checked' }
      ],
      checkinOperations: [
        {
          operationId: 'op_repair_1',
          idempotencyKey: 'idem_repair_1',
          userHabitId: 'uh_2_missing',
          habitId: '2',
          date: '2026-07-07',
          action: 'checkin'
        }
      ]
    }, {});

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      action: 'repairTargetUserCheckins',
      targetOpenid: targetOpenidPayload.targetOpenid
    });
    expect(result.details.daily_checkin_states).toMatchObject({
      input: 3,
      willInsert: 1,
      inserted: 0,
      skippedExisting: 1
    });
    expect(result.details.daily_checkin_states.rejected).toEqual([
      expect.objectContaining({ reason: 'custom_record_rejected' })
    ]);
    expect(result.details.checkin_operations).toMatchObject({
      input: 1,
      willInsert: 1,
      inserted: 0,
      skippedExisting: 0
    });
    expect(dailyStates.add).not.toHaveBeenCalled();
    expect(operations.add).not.toHaveBeenCalled();
  });

  test('repairTargetUserCheckins real run inserts only missing built-in checkins', async () => {
    const dailyStates = createCollection('daily_checkin_states', { data: [] });
    const operations = createCollection('checkin_operations', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        daily_checkin_states: dailyStates,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'repairTargetUserCheckins',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'REPAIR_TARGET_USER_CHECKINS',
      adminToken: 'secret',
      dryRun: false,
      dailyStates: [{
        stateId: 'state_repair_1',
        userHabitId: 'uh_2_missing',
        habitId: '2',
        policyVersionId: 'pv_2_current',
        date: '2026-07-07',
        status: 'checked',
        checkedAt: 1783390000000,
        lastOperationId: 'op_repair_1'
      }],
      checkinOperations: [{
        operationId: 'op_repair_1',
        idempotencyKey: 'idem_repair_1',
        userHabitId: 'uh_2_missing',
        habitId: '2',
        policyVersionId: 'pv_2_current',
        date: '2026-07-07',
        action: 'checkin',
        clientTime: '2026-07-07T07:00:00.000Z'
      }]
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.details.daily_checkin_states).toMatchObject({ willInsert: 1, inserted: 1 });
    expect(result.details.checkin_operations).toMatchObject({ willInsert: 1, inserted: 1 });
    expect(dailyStates.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        _openid: targetOpenidPayload.targetOpenid,
        userHabitId: 'uh_2_missing',
        habitId: '2',
        date: '2026-07-07',
        status: 'checked'
      })
    });
    expect(operations.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        _openid: targetOpenidPayload.targetOpenid,
        operationId: 'op_repair_1',
        idempotencyKey: 'idem_repair_1',
        userHabitId: 'uh_2_missing',
        habitId: '2'
      })
    });
  });

  test('repairTargetUserCheckins rejects bad confirmation and allUsers scope', async () => {
    const dailyStates = createCollection('daily_checkin_states', { data: [] });
    const { main } = loadClearTestData({
      collections: { daily_checkin_states: dailyStates }
    });

    const badConfirm = await main({
      action: 'repairTargetUserCheckins',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'DELETE_TARGET_CUSTOM_HABITS',
      adminToken: 'secret'
    }, {});
    const allUsers = await main({
      action: 'repairTargetUserCheckins',
      scope: 'allUsers',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'REPAIR_TARGET_USER_CHECKINS',
      adminToken: 'secret'
    }, {});

    expect(badConfirm.success).toBe(false);
    expect(badConfirm.message).toContain('REPAIR_TARGET_USER_CHECKINS');
    expect(allUsers.success).toBe(false);
    expect(allUsers.message).toContain('不支持 allUsers');
    expect(dailyStates.where).not.toHaveBeenCalled();
    expect(dailyStates.add).not.toHaveBeenCalled();
  });

  test('repairTargetBuiltinCheckinsByHabitDates dryRun reports canceled built-in states to update', async () => {
    const userHabits = createCollection('user_habits', {
      data: [
        {
          _id: 'habit_zhan_zhuang',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2',
          habitId: '2',
          name: '站桩',
          status: 'active'
        }
      ]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [
        {
          _id: 'pv_2',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2',
          policyVersionId: 'pv_2',
          effectiveEndDate: null
        }
      ]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [
        {
          _id: 'ds_2_0701',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2',
          habitId: '2',
          date: '2026-07-01',
          status: 'canceled'
        }
      ]
    });
    const operations = createCollection('checkin_operations', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'repairTargetBuiltinCheckinsByHabitDates',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'REPAIR_TARGET_BUILTIN_CHECKINS',
      adminToken: 'secret',
      habitIds: ['2'],
      dates: ['2026-07-01', '2026-07-02']
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.details).toMatchObject({
      willUpdate: 1,
      willAdd: 1,
      updated: 0,
      added: 0
    });
    expect(result.details.records).toEqual([
      expect.objectContaining({
        habitId: '2',
        userHabitId: 'uh_2',
        date: '2026-07-01',
        previousStatus: 'canceled',
        action: 'update_to_checked'
      }),
      expect.objectContaining({
        habitId: '2',
        userHabitId: 'uh_2',
        date: '2026-07-02',
        previousStatus: '',
        action: 'add_checked'
      })
    ]);
    expect(dailyStates.add).not.toHaveBeenCalled();
    expect(dailyStates.doc).not.toHaveBeenCalled();
  });

  test('repairTargetBuiltinCheckinsByHabitDates real run updates and adds built-in checked states', async () => {
    const userHabits = createCollection('user_habits', {
      data: [
        {
          _id: 'habit_zhan_zhuang',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2',
          habitId: '2',
          name: '站桩',
          status: 'active'
        },
        {
          _id: 'habit_custom',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_custom_1',
          habitId: 'custom_1',
          source: 'custom',
          name: '自定义',
          status: 'active'
        }
      ]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [
        {
          _id: 'pv_2',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2',
          policyVersionId: 'pv_2',
          effectiveEndDate: null
        }
      ]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [
        {
          _id: 'ds_2_0701',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2',
          habitId: '2',
          date: '2026-07-01',
          status: 'canceled',
          canceledAt: 1783300000000
        }
      ]
    });
    const operations = createCollection('checkin_operations', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'repairTargetBuiltinCheckinsByHabitDates',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'REPAIR_TARGET_BUILTIN_CHECKINS',
      adminToken: 'secret',
      dryRun: false,
      habitIds: ['2', 'custom_1'],
      dates: ['2026-07-01', '2026-07-02'],
      checkedAt: 1783390000000
    }, {});

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.details).toMatchObject({
      willUpdate: 1,
      updated: 1,
      willAdd: 1,
      added: 1
    });
    expect(result.details.rejected).toEqual([
      { habitId: 'custom_1', reason: 'not_builtin_habit' }
    ]);
    expect(dailyStates.doc).toHaveBeenCalledWith('ds_2_0701');
    expect(dailyStates.docRefs.ds_2_0701.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'checked',
        checkedAt: 1783390000000,
        lastOperationId: 'op_repair_2026-07-01_uh_2'
      })
    });
    expect(dailyStates.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        _openid: targetOpenidPayload.targetOpenid,
        stateId: 'state_repair_2026-07-02_uh_2',
        userHabitId: 'uh_2',
        habitId: '2',
        date: '2026-07-02',
        status: 'checked'
      })
    });
    expect(operations.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        _openid: targetOpenidPayload.targetOpenid,
        operationId: 'op_repair_2026-07-01_uh_2',
        idempotencyKey: 'repair_2026-07-01_uh_2',
        action: 'checkin',
        source: 'repair'
      })
    });
  });

  test('repairTargetBuiltinCheckinsByHabitDates uses lifecycle and policy effective on each repaired date', async () => {
    const userHabits = createCollection('user_habits', {
      data: [
        {
          _id: 'habit_old',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2_old',
          habitId: '2',
          name: '站桩',
          status: 'deleted',
          createdAt: '2026-06-20',
          deletedAt: '2026-07-05',
          addedAt: '2026-06-20T08:00:00.000Z'
        },
        {
          _id: 'habit_new',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2_new',
          habitId: '2',
          name: '站桩',
          status: 'active',
          createdAt: '2026-07-06',
          addedAt: '2026-07-06T08:00:00.000Z'
        }
      ]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [
        {
          _id: 'pv_old',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2_old',
          policyVersionId: 'pv_old',
          effectiveStartDate: '2026-06-20',
          effectiveEndDate: null
        },
        {
          _id: 'pv_new',
          _openid: targetOpenidPayload.targetOpenid,
          userHabitId: 'uh_2_new',
          policyVersionId: 'pv_new',
          effectiveStartDate: '2026-07-06',
          effectiveEndDate: null
        }
      ]
    });
    const dailyStates = createCollection('daily_checkin_states', { data: [] });
    const operations = createCollection('checkin_operations', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations
      }
    });

    const result = await main({
      action: 'repairTargetBuiltinCheckinsByHabitDates',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'REPAIR_TARGET_BUILTIN_CHECKINS',
      adminToken: 'secret',
      dryRun: false,
      habitIds: ['2'],
      dates: ['2026-07-01', '2026-07-06']
    }, {});

    expect(result.success).toBe(true);
    expect(result.details.records).toEqual([
      expect.objectContaining({
        habitId: '2',
        userHabitId: 'uh_2_old',
        date: '2026-07-01',
        action: 'add_checked'
      }),
      expect.objectContaining({
        habitId: '2',
        userHabitId: 'uh_2_new',
        date: '2026-07-06',
        action: 'add_checked'
      })
    ]);
    expect(dailyStates.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userHabitId: 'uh_2_old',
        policyVersionId: 'pv_old',
        date: '2026-07-01'
      })
    });
    expect(dailyStates.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userHabitId: 'uh_2_new',
        policyVersionId: 'pv_new',
        date: '2026-07-06'
      })
    });
  });

  test('inspectTargetBuiltinCheckinsByHabitDates reports checked cloud state without writes', async () => {
    const userHabits = createCollection('user_habits', {
      data: [{
        _id: 'habit_zhan_zhuang',
        _openid: targetOpenidPayload.targetOpenid,
        userHabitId: 'uh_2',
        habitId: '2',
        name: '站桩',
        status: 'active',
        createdAt: '2026-06-20',
        addedAt: '2026-06-20T08:00:00.000Z'
      }]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [{
        _id: 'pv_2',
        _openid: targetOpenidPayload.targetOpenid,
        userHabitId: 'uh_2',
        policyVersionId: 'pv_2',
        effectiveStartDate: '2026-06-20',
        effectiveEndDate: null
      }]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [{
        _id: 'ds_2_0701',
        _openid: targetOpenidPayload.targetOpenid,
        stateId: 'state_2_0701',
        userHabitId: 'uh_2',
        habitId: '2',
        date: '2026-07-01',
        status: 'checked',
        checkedAt: 1783390000000
      }]
    });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates
      }
    });

    const result = await main({
      action: 'inspectTargetBuiltinCheckinsByHabitDates',
      targetOpenid: targetOpenidPayload.targetOpenid,
      confirmPhrase: 'INSPECT_TARGET_BUILTIN_CHECKINS',
      adminToken: 'secret',
      habitIds: ['2'],
      dates: ['2026-07-01']
    }, {});

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      action: 'inspectTargetBuiltinCheckinsByHabitDates',
      targetOpenid: targetOpenidPayload.targetOpenid
    });
    expect(result.details.summary).toMatchObject({
      checked: 1,
      missingState: 0,
      missingPolicy: 0,
      missingUserHabit: 0
    });
    expect(result.details.records).toEqual([
      expect.objectContaining({
        habitId: '2',
        date: '2026-07-01',
        userHabitId: 'uh_2',
        policyVersionId: 'pv_2',
        stateStatus: 'checked',
        reason: 'checked'
      })
    ]);
    expect(dailyStates.add).not.toHaveBeenCalled();
    expect(dailyStates.doc).not.toHaveBeenCalled();
  });

  test('repairTargetCheckinsFromManifest dryRun validates custom lifecycle and policy without writing', async () => {
    const userHabits = createCollection('user_habits', {
      data: [{
        _openid: 'target_openid',
        userHabitId: 'uh_custom_1',
        habitId: 'custom_yoga',
        source: 'custom',
        createdAt: '2026-07-01',
        status: 'active'
      }]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [{
        _openid: 'target_openid',
        policyVersionId: 'pv_custom_1',
        userHabitId: 'uh_custom_1',
        effectiveStartDate: '2026-07-01',
        effectiveEndDate: null
      }]
    });
    const dailyStates = createCollection('daily_checkin_states', { data: [] });
    const operations = createCollection('checkin_operations', { data: [] });
    const syncLogs = createCollection('sync_logs', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations,
        sync_logs: syncLogs
      }
    });

    const result = await main({
      action: 'repairTargetCheckinsFromManifest',
      targetOpenid: 'target_openid',
      batchId: 'repair_202607',
      confirmPhrase: 'REPAIR_TARGET_CHECKINS_FROM_MANIFEST',
      adminToken: 'secret',
      entries: [{
        userHabitId: 'uh_custom_1',
        habitId: 'custom_yoga',
        date: '2026-07-22',
        status: 'checked',
        evidenceSource: 'screenshot',
        evidenceRef: 'shot-03',
        overwriteExisting: false
      }]
    });

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      batchId: 'repair_202607',
      details: {
        input: 1,
        willAdd: 1,
        added: 0,
        rejected: [],
        conflicts: []
      }
    });
    expect(dailyStates.add).not.toHaveBeenCalled();
    expect(operations.add).not.toHaveBeenCalled();
    expect(syncLogs.add).not.toHaveBeenCalled();
  });

  test('repairTargetCheckinsFromManifest requires confirmation before overwriting canceled state', async () => {
    const userHabits = createCollection('user_habits', {
      data: [{
        _openid: 'target_openid',
        userHabitId: 'uh_1',
        habitId: '17',
        createdAt: '2026-07-01',
        status: 'active'
      }]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [{
        _openid: 'target_openid',
        policyVersionId: 'pv_1',
        userHabitId: 'uh_1',
        effectiveStartDate: '2026-07-01',
        effectiveEndDate: null
      }]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [{
        _id: 'ds_canceled',
        _openid: 'target_openid',
        stateId: 'state_1',
        userHabitId: 'uh_1',
        date: '2026-07-22',
        status: 'canceled'
      }]
    });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: createCollection('checkin_operations', { data: [] }),
        sync_logs: createCollection('sync_logs', { data: [] })
      }
    });
    const basePayload = {
      action: 'repairTargetCheckinsFromManifest',
      targetOpenid: 'target_openid',
      batchId: 'repair_202607',
      confirmPhrase: 'REPAIR_TARGET_CHECKINS_FROM_MANIFEST',
      adminToken: 'secret',
      entries: [{
        userHabitId: 'uh_1',
        habitId: '17',
        date: '2026-07-22',
        status: 'checked',
        evidenceSource: 'screenshot',
        evidenceRef: 'shot-03'
      }]
    };

    const dryRun = await main(basePayload);
    expect(dryRun.success).toBe(false);
    expect(dryRun.details.conflicts).toEqual([
      expect.objectContaining({ reason: 'overwrite_confirmation_required', previousStatus: 'canceled' })
    ]);

    const repaired = await main({
      ...basePayload,
      dryRun: false,
      runtimeEnv: 'test',
      entries: [{ ...basePayload.entries[0], overwriteExisting: true }]
    });
    expect(repaired.success).toBe(true);
    expect(repaired.details.updated).toBe(1);
    expect(dailyStates.docRefs.ds_canceled.update).toHaveBeenCalled();
  });

  test('cancelTargetCheckinsFromManifest dryRun only accepts checked states', async () => {
    const userHabits = createCollection('user_habits', {
      data: [{
        _openid: 'target_openid',
        userHabitId: 'uh_12',
        habitId: '12',
        createdAt: '2026-07-01',
        status: 'active'
      }]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [{
        _openid: 'target_openid',
        policyVersionId: 'pv_12',
        userHabitId: 'uh_12',
        effectiveStartDate: '2026-07-01',
        effectiveEndDate: null
      }]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [{
        _id: 'ds_checked',
        _openid: 'target_openid',
        stateId: 'state_12',
        userHabitId: 'uh_12',
        habitId: '12',
        date: '2026-07-05',
        status: 'checked'
      }]
    });
    const operations = createCollection('checkin_operations', { data: [] });
    const syncLogs = createCollection('sync_logs', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations,
        sync_logs: syncLogs
      }
    });

    const result = await main({
      action: 'cancelTargetCheckinsFromManifest',
      targetOpenid: 'target_openid',
      batchId: 'cancel_202607',
      confirmPhrase: 'CANCEL_TARGET_CHECKINS_FROM_MANIFEST',
      adminToken: 'secret',
      entries: [{
        userHabitId: 'uh_12',
        habitId: '12',
        date: '2026-07-05',
        status: 'canceled',
        evidenceSource: 'spreadsheet',
        evidenceRef: 'july-workbook-blank'
      }]
    });

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      batchId: 'cancel_202607',
      details: {
        input: 1,
        willCancel: 1,
        canceled: 0,
        skippedCanceled: 0,
        rejected: [],
        conflicts: []
      }
    });
    expect(dailyStates.doc).not.toHaveBeenCalled();
    expect(operations.add).not.toHaveBeenCalled();
    expect(syncLogs.add).not.toHaveBeenCalled();
  });

  test('cancelTargetCheckinsFromManifest writes an idempotent undo operation before canceling state', async () => {
    const userHabits = createCollection('user_habits', {
      data: [{
        _openid: 'target_openid',
        userHabitId: 'uh_12',
        habitId: '12',
        createdAt: '2026-07-01',
        status: 'active'
      }]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [{
        _openid: 'target_openid',
        policyVersionId: 'pv_12',
        userHabitId: 'uh_12',
        effectiveStartDate: '2026-07-01',
        effectiveEndDate: null
      }]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [{
        _id: 'ds_checked',
        _openid: 'target_openid',
        stateId: 'state_12',
        userHabitId: 'uh_12',
        habitId: '12',
        date: '2026-07-05',
        status: 'checked',
        checkedAt: 1783200000000
      }]
    });
    const operations = createCollection('checkin_operations', { data: [] });
    const syncLogs = createCollection('sync_logs', { data: [] });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations,
        sync_logs: syncLogs
      }
    });

    const result = await main({
      action: 'cancelTargetCheckinsFromManifest',
      targetOpenid: 'target_openid',
      batchId: 'cancel_202607',
      confirmPhrase: 'CANCEL_TARGET_CHECKINS_FROM_MANIFEST',
      adminToken: 'secret',
      dryRun: false,
      runtimeEnv: 'test',
      entries: [{
        userHabitId: 'uh_12',
        habitId: '12',
        date: '2026-07-05',
        status: 'canceled',
        evidenceSource: 'spreadsheet',
        evidenceRef: 'july-workbook-blank'
      }]
    });

    expect(result.success).toBe(true);
    expect(result.details).toMatchObject({ willCancel: 1, canceled: 1 });
    expect(operations.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        _openid: 'target_openid',
        operationId: 'op_repair_canceled_uh_12_2026-07-05',
        idempotencyKey: 'repair_canceled_uh_12_2026-07-05',
        userHabitId: 'uh_12',
        habitId: '12',
        policyVersionId: 'pv_12',
        date: '2026-07-05',
        action: 'undo',
        source: 'repair',
        repairBatchId: 'cancel_202607'
      })
    });
    expect(dailyStates.docRefs.ds_checked.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'canceled',
        checkedAt: null,
        lastOperationId: 'op_repair_canceled_uh_12_2026-07-05'
      })
    });
    expect(syncLogs.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        _openid: 'target_openid',
        type: 'manual_checkin_cancel_repair',
        status: 'completed',
        repairBatchId: 'cancel_202607',
        canceledCount: 1
      })
    });
  });

  test('cancelTargetCheckinsFromManifest is idempotent and reports non-checked conflicts', async () => {
    const userHabits = createCollection('user_habits', {
      data: [{
        _openid: 'target_openid',
        userHabitId: 'uh_12',
        habitId: '12',
        createdAt: '2026-07-01',
        status: 'active'
      }]
    });
    const policies = createCollection('habit_policy_versions', {
      data: [{
        _openid: 'target_openid',
        policyVersionId: 'pv_12',
        userHabitId: 'uh_12',
        effectiveStartDate: '2026-07-01',
        effectiveEndDate: null
      }]
    });
    const dailyStates = createCollection('daily_checkin_states', {
      data: [
        {
          _id: 'ds_canceled',
          _openid: 'target_openid',
          userHabitId: 'uh_12',
          habitId: '12',
          date: '2026-07-05',
          status: 'canceled'
        },
        {
          _id: 'ds_unchecked',
          _openid: 'target_openid',
          userHabitId: 'uh_12',
          habitId: '12',
          date: '2026-07-06',
          status: 'unchecked'
        }
      ]
    });
    const operations = createCollection('checkin_operations', {
      data: [{
        _openid: 'target_openid',
        idempotencyKey: 'repair_canceled_uh_12_2026-07-05'
      }]
    });
    const { main } = loadClearTestData({
      collections: {
        user_habits: userHabits,
        habit_policy_versions: policies,
        daily_checkin_states: dailyStates,
        checkin_operations: operations,
        sync_logs: createCollection('sync_logs', { data: [] })
      }
    });
    const entry = date => ({
      userHabitId: 'uh_12',
      habitId: '12',
      date,
      status: 'canceled',
      evidenceSource: 'spreadsheet',
      evidenceRef: 'july-workbook-blank'
    });

    const result = await main({
      action: 'cancelTargetCheckinsFromManifest',
      targetOpenid: 'target_openid',
      batchId: 'cancel_202607',
      confirmPhrase: 'CANCEL_TARGET_CHECKINS_FROM_MANIFEST',
      adminToken: 'secret',
      entries: [entry('2026-07-05'), entry('2026-07-06'), entry('2026-07-07')]
    });

    expect(result.success).toBe(false);
    expect(result.details.skippedCanceled).toBe(1);
    expect(result.details.conflicts).toEqual([
      expect.objectContaining({
        date: '2026-07-06',
        previousStatus: 'unchecked',
        reason: 'expected_checked_state'
      }),
      expect.objectContaining({
        date: '2026-07-07',
        previousStatus: '',
        reason: 'daily_state_not_found'
      })
    ]);
    expect(result.details.records).toEqual([
      expect.objectContaining({ date: '2026-07-05', action: 'skip_canceled_idempotent' })
    ]);
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
