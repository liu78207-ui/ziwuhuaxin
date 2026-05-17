function makeCommand() {
  return {
    gte: jest.fn(value => ({ lte: jest.fn(end => ({ __op: 'range', gte: value, lte: end })) }))
  };
}

function matchesCondition(value, condition) {
  if (condition && condition.__op === 'range') {
    return value >= condition.gte && value <= condition.lte;
  }
  return String(value) === String(condition);
}

function matchesQuery(item, query) {
  if (!query) return true;
  if (query.$or) {
    const { $or, ...rest } = query;
    return matchesQuery(item, rest) && $or.some(part => matchesQuery(item, part));
  }
  return Object.entries(query).every(([key, condition]) => matchesCondition(item[key], condition));
}

function makeCollection(data = []) {
  const collection = {
    query: null,
    where: jest.fn(query => {
      collection.query = query;
      return collection;
    }),
    get: jest.fn(() => Promise.resolve({ data: data.filter(item => matchesQuery(item, collection.query)) })),
    add: jest.fn(payload => {
      data.push({ _id: `new_${data.length + 1}`, ...payload.data });
      return Promise.resolve({ _id: `new_${data.length}` });
    })
  };
  return collection;
}

function loadDoCheckin({ collections, openid = 'test_openid' }) {
  jest.resetModules();
  const db = {
    command: makeCommand(),
    collection: jest.fn(name => collections[name] || makeCollection())
  };
  jest.doMock('wx-server-sdk', () => ({
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: openid }))
  }), { virtual: true });
  return require('../../../cloudfunctions/doCheckin/index.js').main;
}

describe('doCheckin real cloud function strategy guards', () => {
  afterEach(() => {
    jest.dontMock('wx-server-sdk');
  });

  test('rejects checkin when the user has no strategy for the habit', async () => {
    const checkinLogs = makeCollection([]);
    const main = loadDoCheckin({
      collections: {
        user_strategies: makeCollection([]),
        user_strategy_versions: makeCollection([]),
        checkin_logs: checkinLogs
      }
    });

    const result = await main({ habit_id: 'h1', checkin_date: '2026-05-11' }, {});

    expect(result).toMatchObject({ success: false, code: 'STRATEGY_NOT_FOUND' });
    expect(checkinLogs.add).not.toHaveBeenCalled();
  });

  test('rejects checkin after a strategy was deleted', async () => {
    const checkinLogs = makeCollection([]);
    const main = loadDoCheckin({
      collections: {
        user_strategies: makeCollection([
          { _openid: 'test_openid', habit_id: 'h1', freq_type: 'daily', plan_start_date: '2026-05-01', deleted_at: '2026-05-10' }
        ]),
        user_strategy_versions: makeCollection([]),
        checkin_logs: checkinLogs
      }
    });

    const result = await main({ habit_id: 'h1', checkin_date: '2026-05-11' }, {});

    expect(result).toMatchObject({ success: false, code: 'STRATEGY_INACTIVE' });
    expect(checkinLogs.add).not.toHaveBeenCalled();
  });

  test('rejects checkin when today is not due by weekly strategy', async () => {
    const checkinLogs = makeCollection([]);
    const main = loadDoCheckin({
      collections: {
        user_strategies: makeCollection([
          { _openid: 'test_openid', habit_id: 'h1', freq_type: 'weekly', freq_rules: [1], plan_start_date: '2026-05-01' }
        ]),
        user_strategy_versions: makeCollection([]),
        checkin_logs: checkinLogs
      }
    });

    const result = await main({ habit_id: 'h1', checkin_date: '2026-05-12' }, {});

    expect(result).toMatchObject({ success: false, code: 'NOT_DUE_TODAY' });
    expect(checkinLogs.add).not.toHaveBeenCalled();
  });

  test('accepts checkin on due date and returns a stable success code', async () => {
    const checkinLogs = makeCollection([]);
    const main = loadDoCheckin({
      collections: {
        user_strategies: makeCollection([
          { _openid: 'test_openid', habit_id: 'h1', freq_type: 'weekly', freq_rules: [1], plan_start_date: '2026-05-01' }
        ]),
        user_strategy_versions: makeCollection([]),
        checkin_logs: checkinLogs
      }
    });

    const result = await main({ habit_id: 'h1', checkin_date: '2026-05-11' }, {});

    expect(result).toMatchObject({ success: true, code: 'CHECKIN_CREATED' });
    expect(checkinLogs.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        habit_id: 'h1',
        checkin_date: '2026-05-11'
      })
    });
  });

  test('returns a stable duplicate code for existing checkins', async () => {
    const main = loadDoCheckin({
      collections: {
        user_strategies: makeCollection([
          { _openid: 'test_openid', habit_id: 'h1', freq_type: 'daily', plan_start_date: '2026-05-01' }
        ]),
        user_strategy_versions: makeCollection([]),
        checkin_logs: makeCollection([
          { _openid: 'test_openid', habit_id: 'h1', checkin_date: '2026-05-11' }
        ])
      }
    });

    const result = await main({ habit_id: 'h1', checkin_date: '2026-05-11' }, {});

    expect(result).toMatchObject({ success: false, code: 'ALREADY_CHECKED' });
  });

  test('respects deleted interruption segments before a later re-addition', async () => {
    const checkinLogs = makeCollection([]);
    const main = loadDoCheckin({
      collections: {
        user_strategies: makeCollection([
          { _openid: 'test_openid', habit_id: 'h1', freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-05-10' }
        ]),
        user_strategy_versions: makeCollection([
          {
            _openid: 'test_openid',
            habit_id: 'h1',
            freq_type: 'daily',
            freq_rules: 1,
            plan_start_date: '2026-05-01',
            start_date: '2026-05-01',
            end_date: '2026-05-05'
          },
          {
            _openid: 'test_openid',
            habit_id: 'h1',
            deleted: true,
            type: 'deleted',
            start_date: '2026-05-05',
            end_date: '2026-05-10'
          },
          {
            _openid: 'test_openid',
            habit_id: 'h1',
            freq_type: 'daily',
            freq_rules: 1,
            plan_start_date: '2026-05-10',
            start_date: '2026-05-10',
            end_date: null
          }
        ]),
        checkin_logs: checkinLogs
      }
    });

    const gapResult = await main({ habit_id: 'h1', checkin_date: '2026-05-07' }, {});
    const readdResult = await main({ habit_id: 'h1', checkin_date: '2026-05-10' }, {});

    expect(gapResult).toMatchObject({ success: false, code: 'STRATEGY_INACTIVE' });
    expect(readdResult).toMatchObject({ success: true, code: 'CHECKIN_CREATED' });
    expect(checkinLogs.add).toHaveBeenCalledTimes(1);
  });
});
