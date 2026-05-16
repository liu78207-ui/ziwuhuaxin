const {
  createManualStrategyScenario,
  MANUAL_SCENARIO_EXPECTED
} = require('../../../cloudfunctions/initTestData/manualStrategyScenario.js');

function getDayOfWeek(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  return weekday === 0 ? 7 : weekday;
}

function makeCollection(data = [], { getError } = {}) {
  const collection = {
    query: null,
    where: jest.fn(query => {
      collection.query = query;
      return collection;
    }),
    orderBy: jest.fn(() => collection),
    get: jest.fn(() => {
      if (getError) {
        return Promise.reject(getError);
      }
      return Promise.resolve({ data: data.filter(item => matchesQuery(item, collection.query)) });
    })
  };
  return collection;
}

function matchesQuery(item, query) {
  if (!query) return true;
  return Object.entries(query).every(([key, condition]) => {
    if (condition && condition.__op === 'in') {
      return condition.values.map(String).includes(String(item[key]));
    }
    return String(item[key]) === String(condition);
  });
}

function loadGetTodayTasks({ collections, openid = 'manual_openid' }) {
  jest.resetModules();

  const command = {
    in: jest.fn(values => ({ __op: 'in', values }))
  };
  const db = {
    command,
    collection: jest.fn(name => collections[name] || makeCollection())
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: openid }))
  };

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true });
  const mod = require('../../../cloudfunctions/getTodayTasks/index.js');
  return { main: mod.main };
}

describe('getTodayTasks strategy version behavior', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.dontMock('wx-server-sdk');
  });

  test.each(['2026-04-01', '2026-04-05', '2026-04-08', '2026-04-10', '2026-04-12', '2026-04-15'])(
    'returns Test A due tasks for %s using strategy versions',
    async dateStr => {
      const scenario = createManualStrategyScenario('manual_openid');
      const row = MANUAL_SCENARIO_EXPECTED.dailyRows.find(item => item.date === dateStr);
      const collections = {
        user_strategies: makeCollection(scenario.strategies),
        user_strategy_versions: makeCollection(scenario.strategyVersions),
        habits: makeCollection(scenario.habits),
        checkin_logs: makeCollection(scenario.logs)
      };
      const { main } = loadGetTodayTasks({ collections });

      const result = await main({ dateStr, dayOfWeek: getDayOfWeek(dateStr) }, {});

      expect(result.success).toBe(true);
      expect(result.data.map(task => task.title)).toEqual(row.habits);
      expect(result.data).toHaveLength(row.dueCount);
      expect(result.data.every(task => task.is_done)).toBe(true);
    }
  );

  test('returns a clear error when strategy version collection is missing', async () => {
    const scenario = createManualStrategyScenario('manual_openid');
    const collections = {
      user_strategies: makeCollection(scenario.strategies),
      user_strategy_versions: makeCollection([], {
        getError: new Error('collection.get:fail -502005 database collection not exists: user_strategy_versions')
      })
    };
    const { main } = loadGetTodayTasks({ collections });

    const result = await main({ dateStr: '2026-04-01', dayOfWeek: 3 }, {});

    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining('user_strategy_versions')
    });
  });
});
