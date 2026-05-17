const mockCollections = {
  user_strategies: [],
  user_strategy_versions: [],
  checkin_logs: []
};

const mockWhere = jest.fn(function where() {
  return this;
});
const mockGet = jest.fn(function get() {
  return Promise.resolve({ data: mockCollections[this.name] || [] });
});

jest.mock('wx-server-sdk', () => ({
  DYNAMIC_CURRENT_ENV: 'test-env',
  init: jest.fn(),
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
  database: jest.fn(() => ({
    command: {
      gte: jest.fn(value => ({ lte: jest.fn(end => ({ gte: value, lte: end })) }))
    },
    collection: jest.fn(name => ({
      name,
      where: mockWhere,
      get: mockGet
    }))
  }))
}), { virtual: true });

describe('getStatsReport cloud function', () => {
  let main;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCollections.user_strategies = [];
    mockCollections.user_strategy_versions = [];
    mockCollections.checkin_logs = [];
    ({ main } = require('../../../cloudfunctions/getStatsReport/index.js'));
  });

  test('respects real logs even when the date is not due by strategy', async () => {
    mockCollections.user_strategies = [
      {
        _id: 's1',
        habit_id: 'h1',
        habit_title: 'weekly habit',
        freq_type: 'weekly',
        freq_rules: [1],
        plan_start_date: '2026-04-01'
      }
    ];
    mockCollections.checkin_logs = [
      { habit_id: 'h1', checkin_date: '2026-04-13' },
      { habit_id: 'h1', checkin_date: '2026-04-14' }
    ];

    const result = await main({ startDate: '2026-04-13', endDate: '2026-04-19' }, {});

    expect(result.success).toBe(true);
    expect(result.data.checkinRate).toBe(100);
    expect(result.data.totalCount).toBe(2);
    expect(result.data.checkinDays).toBe(2);
    expect(result.data.matrix[0].dueCount).toBe(2);
    expect(result.data.matrix[0].days.find(day => day.date === '2026-04-14').status).toBe('checked');
  });

  test('dedupes logs and ignores cancelled logs', async () => {
    mockCollections.user_strategies = [
      {
        _id: 's1',
        habit_id: 'h1',
        habit_title: 'daily habit',
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-13'
      }
    ];
    mockCollections.checkin_logs = [
      { habit_id: 'h1', checkin_date: '2026-04-13' },
      { habit_id: 'h1', checkin_date: '2026-04-13' },
      { habit_id: 'h1', checkin_date: '2026-04-14', sync_status: 2 }
    ];

    const result = await main({ startDate: '2026-04-13', endDate: '2026-04-15' }, {});

    expect(result.success).toBe(true);
    expect(result.data.totalCount).toBe(1);
    expect(result.data.checkinRate).toBe(33);
    expect(result.data.matrix[0].dueCount).toBe(3);
  });

  test('handles cloud Date deleted_at values when rendering deleted history', async () => {
    mockCollections.user_strategies = [
      {
        _id: 's1',
        habit_id: 'h1',
        habit_title: 'deleted habit',
        freq_type: 'daily',
        freq_rules: 1,
        plan_start_date: '2026-04-13',
        deleted_at: new Date(2026, 3, 15, 9, 0, 0)
      }
    ];
    mockCollections.checkin_logs = [
      { habit_id: 'h1', checkin_date: '2026-04-14' }
    ];

    const result = await main({ startDate: '2026-04-13', endDate: '2026-04-16' }, {});

    expect(result.success).toBe(true);
    expect(result.data.totalCount).toBe(1);
    expect(result.data.matrix[0].days.find(day => day.date === '2026-04-14').status).toBe('checked');
    expect(result.data.matrix[0].days.find(day => day.date === '2026-04-16').status).toBe('inactive');
  });
});
