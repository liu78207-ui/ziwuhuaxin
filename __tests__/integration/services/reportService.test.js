/**
 * __tests__/integration/services/reportService.test.js
 * Phase 5D: reportService 集成测试
 *
 * 测试 resolveReportDayStatus 在真实数据路径下的特殊日裁决
 * 直接使用 reportAggregator，不依赖 storageService
 */

const reportAggregator = require('../../../miniprogram/services/reportAggregator')
const { DAY_STATUS } = reportAggregator

describe('reportService 集成测试 - 特殊日裁决', () => {
  describe('resolveReportDayStatus 真实路径', () => {
    test('删除当天 checked 通过 buildDayVerdicts：正确计入分母和分子', () => {
      // 场景：删除当天已打卡，dailyState.status = checked
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-10'
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-10', status: DAY_STATUS.checked }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04', // start
        '2026-05-10', // end (包含删除当天)
        '2026-05-15', // todayKey
        'high',
        [] // 无额外 lockSnapshot
      )

      // 找到删除当天的 verdict
      const deletedDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(deletedDayVerdict).toBeTruthy()
      expect(deletedDayVerdict.status).toBe(DAY_STATUS.checked)
      expect(deletedDayVerdict.contributesDenominator).toBe(true)
      expect(deletedDayVerdict.contributesNumerator).toBe(true)
    })

    test('删除当天 unchecked 通过 buildDayVerdicts：不计入分母和分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-10'
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [] // 无打卡记录

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-10',
        '2026-05-15',
        'high',
        []
      )

      const deletedDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(deletedDayVerdict).toBeTruthy()
      expect(deletedDayVerdict.status).toBe(DAY_STATUS.unchecked)
      expect(deletedDayVerdict.contributesDenominator).toBe(false)
      expect(deletedDayVerdict.contributesNumerator).toBe(false)
    })

    test('删除当天 canceled 通过 buildDayVerdicts：不计入分母和分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'deleted',
        createdAt: '2026-05-01',
        deletedAt: '2026-05-10'
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-10', status: DAY_STATUS.canceled }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-10',
        '2026-05-15',
        'high',
        []
      )

      const deletedDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(deletedDayVerdict).toBeTruthy()
      expect(deletedDayVerdict.status).toBe(DAY_STATUS.canceled)
      expect(deletedDayVerdict.contributesDenominator).toBe(false)
      expect(deletedDayVerdict.contributesNumerator).toBe(false)
    })

    test('策略修改当天 checked：即使新策略不含当天，也按低压力锁定计入分母和分子', () => {
      // 场景：daily 改成「从明天开始」，编辑当天已打卡
      // V1 低压力口径：最终状态 checked => 分母 1，分子 1
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-05-10',
          frequencyType: 'daily'
        },
        {
          policyVersionId: 'pv2',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-11', // 从明天开始
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        {
          userHabitId: 'uh1',
          date: '2026-05-10',
          status: DAY_STATUS.checked,
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_after_checkin'
        }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-15',
        '2026-05-15',
        'high',
        []
      )

      const changeDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(changeDayVerdict).toBeTruthy()
      expect(changeDayVerdict.status).toBe(DAY_STATUS.checked)
      expect(changeDayVerdict.contributesDenominator).toBe(true)
      expect(changeDayVerdict.contributesNumerator).toBe(true)
      expect(changeDayVerdict.reason).toBe('strategy_changed_after_checkin')
    })

    test('策略修改当天 unchecked 且最新策略命中当天：计入分母不计分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-05-10',
          frequencyType: 'daily'
        },
        {
          policyVersionId: 'pv2',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-10', // 同日开始（修改当天）
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        {
          userHabitId: 'uh1',
          date: '2026-05-10',
          status: DAY_STATUS.unchecked,
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_without_checkin'
        }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-10',
        '2026-05-15',
        'high',
        []
      )

      const changeDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(changeDayVerdict).toBeTruthy()
      expect(changeDayVerdict.status).toBe(DAY_STATUS.unchecked)
      expect(changeDayVerdict.isDue).toBe(true)
      expect(changeDayVerdict.contributesDenominator).toBe(true)
      expect(changeDayVerdict.contributesNumerator).toBe(false)
      expect(changeDayVerdict.reason).toBe('strategy_changed_without_checkin')
    })

    test('策略修改当天 canceled 且最新策略命中当天：计分母不计分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-05-10',
          frequencyType: 'daily'
        },
        {
          policyVersionId: 'pv2',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-10',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        {
          userHabitId: 'uh1',
          date: '2026-05-10',
          status: DAY_STATUS.canceled,
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_without_checkin',
          lastOperationId: 'op_cancel_after_policy_change'
        }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-10',
        '2026-05-15',
        'high',
        []
      )

      const changeDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(changeDayVerdict).toBeTruthy()
      expect(changeDayVerdict.status).toBe(DAY_STATUS.canceled)
      expect(changeDayVerdict.contributesDenominator).toBe(true)
      expect(changeDayVerdict.contributesNumerator).toBe(false)
      expect(changeDayVerdict.reason).toBe('strategy_changed_canceled')
    })

    test('策略修改当天 not_required：没有最终打卡，不计入分母和分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-01-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-01-01',
          effectiveEndDate: '2026-05-12', // 周二
          frequencyType: 'daily'
        },
        {
          policyVersionId: 'pv2',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-12', // 同日（周二）
          effectiveEndDate: null,
          frequencyType: 'weekly',
          frequencyConfig: { weekdays: [3] } // 周三
        }
      ]
      const dailyStates = [
        {
          userHabitId: 'uh1',
          date: '2026-05-12',
          status: DAY_STATUS.not_required,
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_without_checkin'
        }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-12',
        '2026-05-12',
        '2026-05-12',
        'high',
        []
      )

      const changeDayVerdict = verdicts.find(v => v.date === '2026-05-12')
      expect(changeDayVerdict).toBeTruthy()
      expect(changeDayVerdict.status).toBe(DAY_STATUS.not_required)
      expect(changeDayVerdict.contributesDenominator).toBe(false)
      expect(changeDayVerdict.contributesNumerator).toBe(false)
      expect(changeDayVerdict.reason).toBe('strategy_changed_without_checkin')
    })

    test('策略修改当天先修改后打卡：最终 checked 计入分母和分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-05-10',
          frequencyType: 'daily'
        },
        {
          policyVersionId: 'pv2',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-10',
          effectiveEndDate: null,
          frequencyType: 'weekly',
          frequencyConfig: { weekdays: [1] }
        }
      ]
      const dailyStates = [
        {
          userHabitId: 'uh1',
          date: '2026-05-10',
          status: DAY_STATUS.checked,
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_after_checkin',
          lastOperationId: 'op_checkin_after_policy_change'
        }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-10',
        '2026-05-10',
        '2026-05-15',
        'high',
        []
      )

      const changeDayVerdict = verdicts.find(v => v.date === '2026-05-10')
      expect(changeDayVerdict).toBeTruthy()
      expect(changeDayVerdict.status).toBe(DAY_STATUS.checked)
      expect(changeDayVerdict.contributesDenominator).toBe(true)
      expect(changeDayVerdict.contributesNumerator).toBe(true)
      expect(changeDayVerdict.reason).toBe('strategy_changed_after_checkin')
    })
  })

  describe('普通应修日通过 buildDayVerdicts', () => {
    test('checked 计入分母和分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-05', status: DAY_STATUS.checked }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-07',
        '2026-05-15',
        'high',
        []
      )

      const day5 = verdicts.find(v => v.date === '2026-05-05')
      expect(day5.status).toBe(DAY_STATUS.checked)
      expect(day5.contributesDenominator).toBe(true)
      expect(day5.contributesNumerator).toBe(true)
    })

    test('unchecked 计入分母不计入分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-05', status: DAY_STATUS.unchecked }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-07',
        '2026-05-15',
        'high',
        []
      )

      const day5 = verdicts.find(v => v.date === '2026-05-05')
      expect(day5.status).toBe(DAY_STATUS.unchecked)
      expect(day5.contributesDenominator).toBe(true)
      expect(day5.contributesNumerator).toBe(false)
    })

    test('canceled 计入分母不计入分子', () => {
      const userHabit = {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      }
      const policyVersions = [
        {
          policyVersionId: 'pv1',
          userHabitId: 'uh1',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-05', status: DAY_STATUS.canceled }
      ]

      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-04',
        '2026-05-07',
        '2026-05-15',
        'high',
        []
      )

      const day5 = verdicts.find(v => v.date === '2026-05-05')
      expect(day5.status).toBe(DAY_STATUS.canceled)
      expect(day5.contributesDenominator).toBe(true)
      expect(day5.contributesNumerator).toBe(false)
    })
  })

  describe('aggregateByHabitId 多 userHabitId 聚合', () => {
    test('同一 habitId 两个 userHabitId 正确聚合分母和分子', () => {
      // 第一个实例：7天应修，4天完成
      // 第二个实例：3天应修，2天完成
      // 聚合后：10天应修，6天完成
      const instanceReports = [
        {
          habitId: 'h1',
          name: '习惯1',
          theme: 't-green',
          userHabitId: 'uh1',
          dueCount: 7,
          doneCount: 4,
          streak: 2
        },
        {
          habitId: 'h1',
          name: '习惯1',
          theme: 't-green',
          userHabitId: 'uh2',
          dueCount: 3,
          doneCount: 2,
          streak: 1
        }
      ]

      const result = reportAggregator.aggregateByHabitId(instanceReports)

      expect(result.habitGroups).toHaveLength(1)
      const h1Group = result.habitGroups[0]
      expect(h1Group.summary.dueCount).toBe(10)
      expect(h1Group.summary.doneCount).toBe(6)
      expect(h1Group.summary.completionRate).toBe(60)
      expect(h1Group.summary.maxStreak).toBe(2) // max of 2 and 1
      expect(result.summary.dueCount).toBe(10)
      expect(result.summary.doneCount).toBe(6)
    })
  })

  describe('streak 计算', () => {
    test('非应修日不打断 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-03', isDue: false, status: DAY_STATUS.not_required }, // 非应修日，跳过
        { date: '2026-05-04', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-05', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(4)
    })

    test('unchecked 应修日会重置 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.unchecked }, // 重置
        { date: '2026-05-03', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(1)
    })

    test('canceled 应修日会重置 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.canceled }, // 重置
        { date: '2026-05-03', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(1)
    })
  })
})
