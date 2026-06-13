const {
  createDynamicThreeDayScenario,
  DYNAMIC_THREE_DAY_EXPECTED
} = require('../../cloudfunctions/initTestData/dynamicThreeDayScenario.js');

describe('dynamic three-day scenario data', () => {
  test('builds fixed 2026-06-11 to 2026-06-13 checkin data', () => {
    const scenario = createDynamicThreeDayScenario('openid_dynamic');

    expect(scenario.name).toBe('三天动态打卡人工测试场景');
    expect(scenario.startDate).toBe('2026-06-11');
    expect(scenario.endDate).toBe('2026-06-13');
    expect(scenario.userHabits).toHaveLength(DYNAMIC_THREE_DAY_EXPECTED.summary.totalUserHabits);
    expect(scenario.policyVersions).toHaveLength(DYNAMIC_THREE_DAY_EXPECTED.summary.totalPolicyVersions);
    expect(scenario.operations).toHaveLength(DYNAMIC_THREE_DAY_EXPECTED.summary.totalOperations);
    expect(scenario.dailyStates).toHaveLength(DYNAMIC_THREE_DAY_EXPECTED.summary.totalDailyStates);
  });

  test('covers modify cancel delete and re-add lifecycle boundaries', () => {
    const scenario = createDynamicThreeDayScenario('openid_dynamic');

    expect(scenario.userHabits.filter(h => h.status === 'active')).toHaveLength(3);
    expect(scenario.userHabits.filter(h => h.status === 'deleted')).toHaveLength(3);

    const pilatesStates = scenario.dailyStates.filter(s => s.userHabitId === 'uh_dyn_pilates_1');
    expect(pilatesStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-06-11', status: 'checked' }),
      expect.objectContaining({ date: '2026-06-12', status: 'checked' }),
      expect.objectContaining({
        date: '2026-06-13',
        status: 'not_required',
        hasPolicyChangedToday: true,
        hasDeletionToday: true,
        lockedReason: 'deleted_without_checkin'
      })
    ]));
    expect(scenario.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: 'op_dyn_pilates_13_checkin', action: 'checkin' }),
      expect.objectContaining({ operationId: 'op_dyn_pilates_13_undo', action: 'undo' })
    ]));

    expect(scenario.userHabits.filter(h => h.habitId === '2').map(h => h.userHabitId)).toEqual([
      'uh_dyn_standing_1',
      'uh_dyn_standing_2'
    ]);
    expect(scenario.dailyStates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userHabitId: 'uh_dyn_standing_1',
        date: '2026-06-12',
        status: 'checked',
        hasDeletionToday: true,
        lockedReason: 'deleted_after_checkin'
      }),
      expect.objectContaining({
        userHabitId: 'uh_dyn_standing_2',
        date: '2026-06-13',
        status: 'checked'
      })
    ]));
  });
});
