const mockDb = {
  get: jest.fn()
};

function parseDate(dateStr) {
  const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayOfWeek(dateStr) {
  const day = parseDate(dateStr).getDay();
  return day === 0 ? 7 : day;
}

function isDueByStrategy(strategy, dateStr, dayOfWeek) {
  const deletedDate = (strategy.deleted_at || strategy.deletedAt || '').split('T')[0];
  if (deletedDate && dateStr >= deletedDate) {
    return false;
  }

  const planStartDate = (strategy.plan_start_date || strategy.created_at || dateStr).split('T')[0];
  if (dateStr < planStartDate) {
    return false;
  }

  if (strategy.freq_type === 'daily') {
    return true;
  }

  if (strategy.freq_type === 'weekly') {
    const weeklyDays = strategy.freq_rules || [];
    return weeklyDays.length === 0 || weeklyDays.includes(dayOfWeek);
  }

  if (strategy.freq_type === 'interval') {
    const diffDays = Math.floor((parseDate(dateStr) - parseDate(planStartDate)) / (24 * 60 * 60 * 1000));
    const intervalDays = Math.max(1, Number(strategy.freq_rules || 1));
    const cycleDays = intervalDays + 1;
    return diffDays >= intervalDays && (diffDays - intervalDays) % cycleDays === 0;
  }

  return true;
}

function calculateLifetimeEffectivePracticeDays(strategy, logs, todayStr) {
  const habitId = String(strategy.habit_id);
  const seenDates = new Set();

  (logs || []).forEach(log => {
    if (!log || log.sync_status === 2 || String(log.habit_id) !== habitId) {
      return;
    }

    const dateStr = String(log.checkin_date || log.date || '').split('T')[0];
    if (!dateStr || dateStr > todayStr || seenDates.has(dateStr)) {
      return;
    }

    if (isDueByStrategy(strategy, dateStr, getDayOfWeek(dateStr))) {
      seenDates.add(dateStr);
    }
  });

  return seenDates.size;
}

async function main(event) {
  const openid = 'test_openid_123';
  const { dateStr, dayOfWeek } = event;

  const strategiesRes = await mockDb.get();
  const strategies = strategiesRes.data || [];
  const todayTasksRaw = strategies.filter(strategy => isDueByStrategy(strategy, dateStr, dayOfWeek));

  if (todayTasksRaw.length === 0) {
    return { success: true, data: [] };
  }

  const habitsRes = await mockDb.get();
  const habits = habitsRes.data || [];

  const todayLogsRes = await mockDb.get();
  const todayLogs = (todayLogsRes.data || []).filter(log => log.sync_status !== 2);
  const finishedHabitIds = new Set(todayLogs.map(log => String(log.habit_id)));

  const finalTasks = await Promise.all(todayTasksRaw.map(async strategy => {
    const habitInfo = habits.find(habit => String(habit._id) === String(strategy.habit_id)) || {};
    const logsRes = await mockDb.get();
    const streakDays = calculateLifetimeEffectivePracticeDays(strategy, logsRes.data || [], dateStr);

    return {
      strategy_id: strategy._id,
      habit_id: strategy.habit_id,
      title: habitInfo.title,
      icon_url: habitInfo.icon_url,
      duration: strategy.duration,
      is_done: finishedHabitIds.has(String(strategy.habit_id)),
      streak_days: streakDays,
      _openid: openid
    };
  }));

  return { success: true, data: finalTasks };
}

describe('getTodayTasks cloud function behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('daily strategies are due from plan start date', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        data: [{ _id: 's1', habit_id: 'h1', freq_type: 'daily', duration: 20, plan_start_date: '2026-04-14' }]
      })
      .mockResolvedValueOnce({ data: [{ _id: 'h1', title: 'zhan zhuang' }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await main({ dateStr: '2026-04-14', dayOfWeek: 2 });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  test('weekly strategies are due only on selected weekdays', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        data: [
          { _id: 's1', habit_id: 'h1', freq_type: 'weekly', freq_rules: [1, 3, 5], duration: 20 },
          { _id: 's2', habit_id: 'h2', freq_type: 'weekly', freq_rules: [2, 4, 6], duration: 15 }
        ]
      })
      .mockResolvedValueOnce({ data: [{ _id: 'h1', title: 'zhan zhuang' }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await main({ dateStr: '2026-04-13', dayOfWeek: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].habit_id).toBe('h1');
  });

  test('interval 2 is first due after two days, then every three days', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        data: [{ _id: 's1', habit_id: 'h1', freq_type: 'interval', freq_rules: 2, duration: 20, plan_start_date: '2026-04-10' }]
      })
      .mockResolvedValueOnce({ data: [{ _id: 'h1', title: 'zhan zhuang' }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const dueResult = await main({ dateStr: '2026-04-12', dayOfWeek: 7 });
    expect(dueResult.data).toHaveLength(1);

    jest.clearAllMocks();
    mockDb.get.mockResolvedValueOnce({
      data: [{ _id: 's1', habit_id: 'h1', freq_type: 'interval', freq_rules: 2, duration: 20, plan_start_date: '2026-04-10' }]
    });

    const inactiveResult = await main({ dateStr: '2026-04-13', dayOfWeek: 1 });
    expect(inactiveResult.data).toEqual([]);
  });

  test('deleted strategies are not returned on or after deleted_at', async () => {
    mockDb.get.mockResolvedValueOnce({
      data: [{ _id: 's1', habit_id: 'h1', freq_type: 'daily', duration: 20, plan_start_date: '2026-04-01', deleted_at: '2026-04-14' }]
    });

    const result = await main({ dateStr: '2026-04-14', dayOfWeek: 2 });

    expect(result.data).toEqual([]);
  });

  test('marks checked status from today logs', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        data: [{ _id: 's1', habit_id: 'h1', freq_type: 'daily', duration: 20, plan_start_date: '2026-04-01' }]
      })
      .mockResolvedValueOnce({ data: [{ _id: 'h1', title: 'zhan zhuang' }] })
      .mockResolvedValueOnce({ data: [{ habit_id: 'h1', checkin_date: '2026-04-14' }] })
      .mockResolvedValueOnce({ data: [{ habit_id: 'h1', checkin_date: '2026-04-14' }] });

    const result = await main({ dateStr: '2026-04-14', dayOfWeek: 2 });

    expect(result.data[0].is_done).toBe(true);
  });

  test('calculates lifetime effective practice days from strategy-valid logs', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        data: [{ _id: 's1', habit_id: 'h1', freq_type: 'weekly', freq_rules: [1], duration: 20, plan_start_date: '2026-04-01' }]
      })
      .mockResolvedValueOnce({ data: [{ _id: 'h1', title: 'zhan zhuang' }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          { habit_id: 'h1', checkin_date: '2026-04-13' },
          { habit_id: 'h1', checkin_date: '2026-04-13' },
          { habit_id: 'h1', checkin_date: '2026-04-07' },
          { habit_id: 'h1', checkin_date: '2026-04-06' },
          { habit_id: 'h1', checkin_date: '2026-03-30' },
          { habit_id: 'h1', checkin_date: '2026-04-20' },
          { habit_id: 'h1', checkin_date: '2026-04-27', sync_status: 2 }
        ]
      });

    const result = await main({ dateStr: '2026-04-13', dayOfWeek: 1 });

    expect(result.data[0].streak_days).toBe(2);
  });

  test('returns empty array when user has no strategies', async () => {
    mockDb.get.mockResolvedValueOnce({ data: [] });

    const result = await main({ dateStr: '2026-04-14', dayOfWeek: 2 });

    expect(result).toEqual({ success: true, data: [] });
  });

  test('handles missing habit details gracefully', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        data: [{ _id: 's1', habit_id: 'h999', freq_type: 'daily', duration: 20, plan_start_date: '2026-04-01' }]
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await main({ dateStr: '2026-04-14', dayOfWeek: 2 });

    expect(result.success).toBe(true);
    expect(result.data[0].title).toBeUndefined();
  });
});
