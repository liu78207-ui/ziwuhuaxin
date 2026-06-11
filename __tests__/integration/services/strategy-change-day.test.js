/**
 * __tests__/integration/services/strategy-change-day.test.js
 *
 * 验证「策略修改当天」的低压力锁定口径：
 *
 * - 修改当天报表只看 dailyCheckinState 最终状态。
 * - 最终 checked：分母 1，分子 1。
 * - 最终 canceled / unchecked / not_required：分母 0，分子 0。
 * - 修改后未来日期按最后一次保存成功的新策略计算。
 */

const reportAggregator = require('../../../miniprogram/services/reportAggregator')
const { DAY_STATUS } = reportAggregator

describe('策略修改当天：最终状态 + 低压力锁定', () => {
  test('daily → weekly 周三，编辑当天是周二已打卡：最终 checked 计入分母和分子', () => {
    // 周二 2026-05-12，已打卡
    const userHabit = {
      userHabitId: 'uh1',
      habitId: 'h1',
      status: 'active',
      createdAt: '2026-01-01',
      deletedAt: null
    }
    const policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]
    const dailyStates = [
      {
        userHabitId: 'uh1',
        date: '2026-05-12',
        status: DAY_STATUS.checked,
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_after_checkin'
      }
    ]

    const verdicts = reportAggregator.buildDayVerdicts(
      userHabit, policyVersions, dailyStates,
      '2026-05-12', '2026-05-12', '2026-05-12'
    )

    expect(verdicts).toHaveLength(1)
    const tuesdayVerdict = verdicts[0]

    // 修改当天最终 checked：分母 1，分子 1
    expect(tuesdayVerdict.status).toBe(DAY_STATUS.checked)
    expect(tuesdayVerdict.contributesDenominator).toBe(true)
    expect(tuesdayVerdict.contributesNumerator).toBe(true)
    expect(tuesdayVerdict.reason).toBe('strategy_changed_after_checkin')
  })

  test('daily → weekly 周三，编辑当天是周二未打卡：最终 unchecked 不计分母和分子', () => {
    // 周二 2026-05-12，未打卡
    const userHabit = {
      userHabitId: 'uh1',
      habitId: 'h1',
      status: 'active',
      createdAt: '2026-01-01',
      deletedAt: null
    }
    const policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]
    const dailyStates = [
      {
        userHabitId: 'uh1',
        date: '2026-05-12',
        status: DAY_STATUS.unchecked,
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const verdicts = reportAggregator.buildDayVerdicts(
      userHabit, policyVersions, dailyStates,
      '2026-05-12', '2026-05-12', '2026-05-12'
    )

    expect(verdicts).toHaveLength(1)
    const tuesdayVerdict = verdicts[0]

    expect(tuesdayVerdict.status).toBe(DAY_STATUS.unchecked)
    expect(tuesdayVerdict.contributesDenominator).toBe(false)
    expect(tuesdayVerdict.contributesNumerator).toBe(false)
    expect(tuesdayVerdict.reason).toBe('strategy_changed_without_checkin')
  })

  test('daily → weekly 周三，编辑当天是周三：最终 unchecked 仍不计分母和分子', () => {
    // 周三 2026-05-13
    const userHabit = {
      userHabitId: 'uh1',
      habitId: 'h1',
      status: 'active',
      createdAt: '2026-01-01',
      deletedAt: null
    }
    const policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-13',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-13',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]
    const dailyStates = [
      {
        userHabitId: 'uh1',
        date: '2026-05-13',
        status: DAY_STATUS.unchecked,
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin'
      }
    ]

    const verdicts = reportAggregator.buildDayVerdicts(
      userHabit, policyVersions, dailyStates,
      '2026-05-13', '2026-05-13', '2026-05-13'
    )

    expect(verdicts).toHaveLength(1)
    const wednesdayVerdict = verdicts[0]

    expect(wednesdayVerdict.status).toBe(DAY_STATUS.unchecked)
    expect(wednesdayVerdict.contributesDenominator).toBe(false)
    expect(wednesdayVerdict.contributesNumerator).toBe(false)
    expect(wednesdayVerdict.reason).toBe('strategy_changed_without_checkin')
  })

  test('先打卡、再修改策略、最后取消：最终 canceled 不计分母和分子', () => {
    const userHabit = {
      userHabitId: 'uh1',
      habitId: 'h1',
      status: 'active',
      createdAt: '2026-01-01',
      deletedAt: null
    }
    const policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]
    const dailyStates = [
      {
        userHabitId: 'uh1',
        date: '2026-05-12',
        status: DAY_STATUS.canceled,
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_without_checkin',
        lastOperationId: 'op_cancel_after_policy_change'
      }
    ]

    const verdicts = reportAggregator.buildDayVerdicts(
      userHabit, policyVersions, dailyStates,
      '2026-05-12', '2026-05-12', '2026-05-12'
    )
    const tuesdayVerdict = verdicts[0]

    expect(tuesdayVerdict.status).toBe(DAY_STATUS.canceled)
    expect(tuesdayVerdict.contributesDenominator).toBe(false)
    expect(tuesdayVerdict.contributesNumerator).toBe(false)
    expect(tuesdayVerdict.reason).toBe('strategy_changed_without_checkin')
  })

  test('先修改策略、后打卡：最终 checked 计入分母和分子', () => {
    const userHabit = {
      userHabitId: 'uh1',
      habitId: 'h1',
      status: 'active',
      createdAt: '2026-01-01',
      deletedAt: null
    }
    const policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-06-02',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_new',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-06-03',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]
    const dailyStates = [
      {
        userHabitId: 'uh1',
        date: '2026-06-02',
        status: DAY_STATUS.checked,
        hasPolicyChangedToday: true,
        lockedReason: 'strategy_changed_after_checkin',
        lastOperationId: 'op_checkin_after_policy_change'
      }
    ]

    const verdicts = reportAggregator.buildDayVerdicts(
      userHabit, policyVersions, dailyStates,
      '2026-06-02', '2026-06-02', '2026-06-02'
    )

    expect(verdicts).toHaveLength(1)
    const todayVerdict = verdicts[0]

    expect(todayVerdict.status).toBe(DAY_STATUS.checked)
    expect(todayVerdict.contributesDenominator).toBe(true)
    expect(todayVerdict.contributesNumerator).toBe(true)
    expect(todayVerdict.reason).toBe('strategy_changed_after_checkin')
  })

  test('修改后未来日期按最后一次保存成功的新策略判断', () => {
    const secondWednesday = '2026-05-13'
    const thursday = '2026-05-14'
    const userHabit = {
      userHabitId: 'uh1',
      habitId: 'h1',
      status: 'active',
      createdAt: '2026-01-01',
      deletedAt: null
    }
    const policyVersions = [
      {
        policyVersionId: 'pv_old',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'daily'
      },
      {
        policyVersionId: 'pv_mid',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-12',
        effectiveEndDate: '2026-05-12',
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [2] }
      },
      {
        policyVersionId: 'pv_last',
        userHabitId: 'uh1',
        effectiveStartDate: '2026-05-13',
        effectiveEndDate: null,
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [3] }
      }
    ]

    const verdicts = reportAggregator.buildDayVerdicts(
      userHabit, policyVersions, [],
      secondWednesday, thursday, thursday
    )

    const wednesdayVerdict = verdicts.find(v => v.date === secondWednesday)
    const thursdayVerdict = verdicts.find(v => v.date === thursday)

    expect(wednesdayVerdict.policyVersion.policyVersionId).toBe('pv_last')
    expect(wednesdayVerdict.isDue).toBe(true)
    expect(wednesdayVerdict.status).toBe(DAY_STATUS.unchecked)
    expect(wednesdayVerdict.contributesDenominator).toBe(true)

    expect(thursdayVerdict.policyVersion.policyVersionId).toBe('pv_last')
    expect(thursdayVerdict.isDue).toBe(false)
    expect(thursdayVerdict.status).toBe(DAY_STATUS.not_required)
    expect(thursdayVerdict.contributesDenominator).toBe(false)
  })
})
