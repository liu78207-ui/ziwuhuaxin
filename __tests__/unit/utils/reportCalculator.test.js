const reportCalculator = require('../../../miniprogram/utils/reportCalculator.js');

describe('reportCalculator', () => {
  test('counts daily strategy from plan start date', () => {
    const habit = {
      habitId: 'daily',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-05-01'
    };

    const report = reportCalculator.buildHabitPeriodReport(
      habit,
      [],
      '2026-05-01',
      '2026-05-03',
      '2026-05-03'
    );

    expect(report.days.filter(day => day.shouldShow).map(day => day.date)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03'
    ]);
    expect(report.dueCount).toBe(3);
  });

  test('treats interval 2 as first due after 2 days, then every 3 days', () => {
    const habit = {
      habitId: 'interval',
      freq_type: 'interval',
      freq_rules: 2,
      plan_start_date: '2026-05-01'
    };

    const report = reportCalculator.buildHabitPeriodReport(
      habit,
      [],
      '2026-05-01',
      '2026-05-10',
      '2026-05-10'
    );

    expect(report.days.filter(day => day.shouldShow).map(day => day.date)).toEqual([
      '2026-05-03',
      '2026-05-06',
      '2026-05-09'
    ]);
    expect(report.dueCount).toBe(3);
  });

  test('counts weekly strategy from plan start date when target weekday matches', () => {
    const habit = {
      habitId: 'weekly',
      freq_type: 'weekly',
      freq_rules: [5],
      plan_start_date: '2026-05-01'
    };

    const report = reportCalculator.buildHabitPeriodReport(
      habit,
      [],
      '2026-05-01',
      '2026-05-08',
      '2026-05-08'
    );

    expect(report.days.filter(day => day.shouldShow).map(day => day.date)).toEqual([
      '2026-05-01',
      '2026-05-08'
    ]);
  });

  test('caps current period at today and leaves future periods with no due days', () => {
    const habit = {
      habitId: 'daily',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-05-01'
    };

    const currentPeriod = reportCalculator.buildHabitPeriodReport(
      habit,
      [],
      '2026-05-01',
      '2026-05-31',
      '2026-05-09'
    );
    const futurePeriod = reportCalculator.buildHabitPeriodReport(
      habit,
      [],
      '2026-06-01',
      '2026-06-30',
      '2026-05-09'
    );

    expect(currentPeriod.dueCount).toBe(9);
    expect(currentPeriod.days.find(day => day.date === '2026-05-10').status).toBe('future');
    expect(futurePeriod.dueCount).toBe(0);
    expect(futurePeriod.visible).toBe(false);
  });

  test('stops due days on deletion date unless deletion day already has a log', () => {
    const habit = {
      habitId: 'deleted',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-05-01',
      isDeleted: true,
      deletedAt: '2026-05-05T09:00:00.000Z'
    };
    const logs = [{ habitId: 'deleted', date: '2026-05-05' }];

    const report = reportCalculator.buildHabitPeriodReport(
      habit,
      logs,
      '2026-05-01',
      '2026-05-07',
      '2026-05-07'
    );

    expect(report.days.find(day => day.date === '2026-05-04').status).toBe('unchecked');
    expect(report.days.find(day => day.date === '2026-05-05').status).toBe('checked');
    expect(report.days.find(day => day.date === '2026-05-06').status).toBe('deleted');
    expect(report.dueCount).toBe(5);
    expect(report.doneCount).toBe(1);
  });

  test('hides deleted habits in later periods when deletedAt is missing', () => {
    const habit = {
      habitId: 'deleted-missing-date',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-04-01',
      isDeleted: true
    };
    const logs = [{ habitId: 'deleted-missing-date', date: '2026-04-20' }];

    const laterReport = reportCalculator.buildHabitPeriodReport(
      habit,
      logs,
      '2026-05-04',
      '2026-05-10',
      '2026-05-10'
    );

    expect(laterReport.dueCount).toBe(0);
    expect(laterReport.doneCount).toBe(0);
    expect(laterReport.visible).toBe(false);
    expect(laterReport.days.every(day => day.status === 'deleted')).toBe(true);
  });

  test('keeps deleted habit history visible in periods with checkins when deletedAt is missing', () => {
    const habit = {
      habitId: 'deleted-history',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-04-01',
      isDeleted: true
    };

    const report = reportCalculator.buildHabitPeriodReport(
      habit,
      [{ habitId: 'deleted-history', date: '2026-04-20' }],
      '2026-04-20',
      '2026-04-26',
      '2026-04-26'
    );

    expect(report.days.find(day => day.date === '2026-04-20').status).toBe('checked');
    expect(report.dueCount).toBe(1);
    expect(report.doneCount).toBe(1);
    expect(report.visible).toBe(true);
  });

  test('merges deleted and re-added strategy segments into one habit report', () => {
    const habit = {
      habitId: 'readd',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-05-06',
      strategyVersions: [
        {
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-05-01',
          start_date: '2026-05-01',
          end_date: '2026-05-03'
        },
        {
          deleted: true,
          start_date: '2026-05-03',
          end_date: '2026-05-06'
        },
        {
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-05-06',
          start_date: '2026-05-06',
          end_date: null
        }
      ]
    };

    const report = reportCalculator.buildHabitPeriodReport(
      habit,
      [{ habitId: 'readd', date: '2026-05-01' }, { habitId: 'readd', date: '2026-05-06' }],
      '2026-05-01',
      '2026-05-07',
      '2026-05-07'
    );

    expect(report.days.map(day => [day.date, day.status])).toEqual([
      ['2026-05-01', 'checked'],
      ['2026-05-02', 'unchecked'],
      ['2026-05-03', 'deleted'],
      ['2026-05-04', 'deleted'],
      ['2026-05-05', 'deleted'],
      ['2026-05-06', 'checked'],
      ['2026-05-07', 'unchecked']
    ]);
    expect(report.dueCount).toBe(4);
    expect(report.doneCount).toBe(2);
  });

  test('calculates period stats from unique natural checkin dates', () => {
    const habits = [
      { habitId: 'h1', freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-05-01' },
      { habitId: 'h2', freq_type: 'weekly', freq_rules: [1], plan_start_date: '2026-05-01' }
    ];
    const logs = [
      { habitId: 'h1', date: '2026-05-01' },
      { habitId: 'h1', date: '2026-05-01' },
      { habitId: 'h2', date: '2026-05-02' },
      { habitId: 'h1', date: '2026-05-03' },
      { habitId: 'h1', date: '2026-05-05' }
    ];

    const report = reportCalculator.calculatePeriodReport(
      habits,
      logs,
      '2026-05-01',
      '2026-05-07',
      '2026-05-07'
    );

    expect(report.stats.totalCount).toBe(3);
    expect(report.stats.checkinDays).toBe(3);
    expect(report.stats.maxStreak).toBe(1);
  });

  test('does not let non-due dirty logs expand due denominator or checked UI state', () => {
    const habits = [
      { habitId: 'h1', freq_type: 'weekly', freq_rules: [1], plan_start_date: '2026-05-01' },
      { habitId: 'h2', freq_type: 'interval', freq_rules: 2, plan_start_date: '2026-05-01' }
    ];
    const logs = [
      { habitId: 'h1', date: '2026-05-04' },
      { habitId: 'h1', date: '2026-05-05' },
      { habitId: 'h2', date: '2026-05-03' },
      { habitId: 'h2', date: '2026-05-06' }
    ];

    const report = reportCalculator.calculatePeriodReport(
      habits,
      logs,
      '2026-05-04',
      '2026-05-10',
      '2026-05-09'
    );

    const visibleCells = report.habitReports.reduce(
      (sum, habitReport) => sum + habitReport.days.filter(day => day.status === 'checked' || day.status === 'unchecked').length,
      0
    );
    const dirtyDay = report.habitReports
      .find(habitReport => habitReport.habitId === 'h1')
      .days.find(day => day.date === '2026-05-05');

    expect(visibleCells).toBe(3);
    expect(dirtyDay.isDue).toBe(false);
    expect(dirtyDay.isChecked).toBe(true);
    expect(dirtyDay.status).toBe('inactive');
    expect(dirtyDay.countsInDueDenominator).toBe(false);
    expect(report.stats.totalCount).toBe(2);
    expect(report.stats.checkinRate).toBe(67);
  });

  test('filters cancelled logs from cumulative practice count', () => {
    const report = reportCalculator.calculatePeriodReport(
      [{ habitId: 'h1', freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-05-01' }],
      [
        { habitId: 'h1', date: '2026-05-01' },
        { habitId: 'h1', date: '2026-05-02', sync_status: 2 },
        { habitId: 'h1', date: '2026-05-03' }
      ],
      '2026-05-01',
      '2026-05-03',
      '2026-05-03'
    );

    expect(report.stats.totalCount).toBe(2);
    expect(report.stats.checkinRate).toBe(67);
  });

  test('counts habit history days uniquely across deletion and re-addition', () => {
    const logs = [
      { habitId: 'h1', date: '2026-05-02' },
      { habitId: 'h1', date: '2026-05-02' },
      { habitId: 'h1', date: '2026-05-10' },
      { habitId: 'h2', date: '2026-05-10' }
    ];

    expect(reportCalculator.calculateHabitHistoryDays('h1', logs)).toBe(2);
  });

  test('calculates lifetime effective practice days across years', () => {
    const habit = {
      habitId: 'cross-year',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2025-12-30'
    };
    const logs = [
      { habitId: 'cross-year', date: '2025-12-30' },
      { habitId: 'cross-year', date: '2025-12-31' },
      { habitId: 'cross-year', date: '2026-01-01' },
      { habitId: 'cross-year', date: '2026-01-01' },
      { habitId: 'cross-year', date: '2026-01-02', sync_status: 2 },
      { habitId: 'cross-year', date: '2026-01-03' }
    ];

    const lifetime = reportCalculator.calculateLifetimeEffectivePracticeDays(habit, logs, '2026-01-03');
    const yearReport = reportCalculator.buildHabitPeriodReport(
      habit,
      logs,
      '2026-01-01',
      '2026-12-31',
      '2026-01-03'
    );

    expect(lifetime).toBe(4);
    expect(yearReport.doneCount).toBe(2);
  });

  test('lifetime effective practice days follow strategy versions and ignore dirty logs', () => {
    const habit = {
      habitId: 'versioned-life',
      freq_type: 'daily',
      freq_rules: 1,
      plan_start_date: '2026-01-10',
      strategyVersions: [
        {
          freq_type: 'weekly',
          freq_rules: [1],
          plan_start_date: '2025-12-29',
          start_date: '2025-12-29',
          end_date: '2026-01-05'
        },
        {
          deleted: true,
          start_date: '2026-01-05',
          end_date: '2026-01-10'
        },
        {
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-01-10',
          start_date: '2026-01-10'
        }
      ]
    };
    const logs = [
      { habitId: 'versioned-life', date: '2025-12-29' },
      { habitId: 'versioned-life', date: '2025-12-30' },
      { habitId: 'versioned-life', date: '2026-01-06' },
      { habitId: 'versioned-life', date: '2026-01-10' },
      { habitId: 'versioned-life', date: '2026-01-11' }
    ];

    expect(reportCalculator.calculateLifetimeEffectivePracticeDays(habit, logs, '2026-01-11')).toBe(3);
  });
});
