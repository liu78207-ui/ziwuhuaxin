const reportCalculator = require('../../miniprogram/utils/reportCalculator.js');
const {
  createManualStrategyScenario,
  MANUAL_SCENARIO_EXPECTED
} = require('../../cloudfunctions/initTestData/manualStrategyScenario.js');

function getDueNamesForDate(habits, logs, date, today = MANUAL_SCENARIO_EXPECTED.endDate) {
  return reportCalculator
    .calculatePeriodReport(habits, logs, date, date, today)
    .habitReports
    .filter(report => report.dueCount > 0)
    .map(report => report.habit.name);
}

function getPeriodTotals(habits, logs, startDate, endDate, today = MANUAL_SCENARIO_EXPECTED.endDate) {
  const report = reportCalculator.calculatePeriodReport(habits, logs, startDate, endDate, today);
  const dueCount = report.habitReports.reduce((sum, habit) => sum + habit.dueCount, 0);
  return {
    dueCount,
    doneCount: report.stats.totalCount,
    checkinRate: dueCount > 0 ? Math.round((report.stats.totalCount / dueCount) * 100) : 0
  };
}

describe('manual strategy scenario data', () => {
  test('matches the expected daily home-page task list and counts', () => {
    const scenario = createManualStrategyScenario('openid_manual');

    MANUAL_SCENARIO_EXPECTED.dailyRows.forEach(row => {
      const dueNames = getDueNamesForDate(scenario.local.MyHabits, scenario.local.CheckinLogs, row.date);

      expect(dueNames).toEqual(row.habits);
      expect(dueNames).toHaveLength(row.dueCount);
      expect(scenario.local.CheckinLogs.filter(log => log.date === row.date)).toHaveLength(row.doneCount);
    });
  });

  test('matches the expected period metrics', () => {
    const scenario = createManualStrategyScenario('openid_manual');

    MANUAL_SCENARIO_EXPECTED.periods.forEach(period => {
      expect(getPeriodTotals(
        scenario.local.MyHabits,
        scenario.local.CheckinLogs,
        period.startDate,
        period.endDate
      )).toEqual({
        dueCount: period.dueCount,
        doneCount: period.doneCount,
        checkinRate: period.checkinRate
      });
    });
  });

  test('matches the expected due dates per habit', () => {
    const scenario = createManualStrategyScenario('openid_manual');

    MANUAL_SCENARIO_EXPECTED.habitRows.forEach(row => {
      const habit = scenario.local.MyHabits.find(item => item.name === row.name);
      const report = reportCalculator.buildHabitPeriodReport(
        habit,
        scenario.local.CheckinLogs,
        MANUAL_SCENARIO_EXPECTED.startDate,
        MANUAL_SCENARIO_EXPECTED.endDate,
        MANUAL_SCENARIO_EXPECTED.endDate
      );

      expect(report.days.filter(day => day.isDue).map(day => day.date)).toEqual(row.dueDates);
      expect(report.dueCount).toBe(row.dueCount);
      expect(report.doneCount).toBe(row.dueCount);
    });
  });

  test('every generated checkin log lands on a real due date for that habit', () => {
    const scenario = createManualStrategyScenario('openid_manual');

    expect(scenario.local.CheckinLogs).toHaveLength(84);
    scenario.local.CheckinLogs.forEach(log => {
      const habit = scenario.local.MyHabits.find(item => item.habitId === log.habitId);

      expect(habit).toBeTruthy();
      expect(reportCalculator.isDueDate(habit, log.date, true)).toBe(true);
    });
  });
});
