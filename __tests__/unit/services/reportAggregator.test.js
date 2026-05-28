/**
 * reportAggregator.test.js
 * Phase 5A: reportAggregator 单元测试
 */

const reportAggregator = require('../../../miniprogram/services/reportAggregator')
const { DAY_STATUS } = reportAggregator

describe('reportAggregator', () => {
  describe('resolveEffectivePolicyVersion', () => {
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
        effectiveStartDate: '2026-05-11',
        effectiveEndDate: null,
        frequencyType: 'daily'
      }
    ]

    test('命中第一阶段策略版本', () => {
      const result = reportAggregator.resolveEffectivePolicyVersion(policyVersions, '2026-05-05')
      expect(result).toBeTruthy()
      expect(result.policyVersionId).toBe('pv1')
    })

    test('命中第二阶段策略版本', () => {
      const result = reportAggregator.resolveEffectivePolicyVersion(policyVersions, '2026-05-15')
      expect(result).toBeTruthy()
      expect(result.policyVersionId).toBe('pv2')
    })

    test('早于所有策略版本返回 null', () => {
      const result = reportAggregator.resolveEffectivePolicyVersion(policyVersions, '2026-04-30')
      expect(result).toBeNull()
    })

    test('无策略版本返回 null', () => {
      const result = reportAggregator.resolveEffectivePolicyVersion(null, '2026-05-05')
      expect(result).toBeNull()
    })
  })

  describe('isDueOnDateByFrequency', () => {
    test('daily 频率每日应修', () => {
      const pv = {
        effectiveStartDate: '2026-05-01',
        frequencyType: 'daily'
      }
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-01')).toBe(true)
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-05')).toBe(true)
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-10')).toBe(true)
    })

    test('daily 频率早于开始日期不应修', () => {
      const pv = {
        effectiveStartDate: '2026-05-05',
        frequencyType: 'daily'
      }
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-01')).toBe(false)
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-04')).toBe(false)
    })

    test('weekly 频率按星期应修', () => {
      const pv = {
        effectiveStartDate: '2026-05-01',
        frequencyType: 'weekly',
        frequencyConfig: { weekdays: [1, 3, 5] } // 周一、周三、周五
      }
      // 2026-05-01 是周五
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-01')).toBe(true)
      // 2026-05-04 是周一
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-04')).toBe(true)
      // 2026-05-06 是周三
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-06')).toBe(true)
      // 2026-05-02 是周六
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-02')).toBe(false)
      // 2026-05-03 是周日
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-03')).toBe(false)
    })

    test('interval 频率按间隔应修', () => {
      const pv = {
        effectiveStartDate: '2026-05-01',
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 2 }
      }
      // 锚定日期 2026-05-01，间隔 2 天
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-01')).toBe(true) // diff=0
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-03')).toBe(true) // diff=2
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-05')).toBe(true) // diff=4
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-02')).toBe(false) // diff=1
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-04')).toBe(false) // diff=3
    })

    test('早于锚定日期不应修', () => {
      const pv = {
        effectiveStartDate: '2026-05-05',
        frequencyType: 'interval',
        frequencyConfig: { intervalDays: 2 }
      }
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-01')).toBe(false)
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-04')).toBe(false)
      expect(reportAggregator.isDueOnDateByFrequency(pv, '2026-05-05')).toBe(true)
    })
  })

  describe('resolveReportDayStatus', () => {
    const baseContext = {
      userHabit: {
        userHabitId: 'uh1',
        habitId: 'h1',
        status: 'active',
        createdAt: '2026-05-01',
        deletedAt: null
      },
      policyVersion: {
        policyVersionId: 'pv1',
        effectiveStartDate: '2026-05-01',
        effectiveEndDate: null,
        frequencyType: 'daily'
      },
      dailyState: null,
      todayKey: '2026-05-15',
      dateConfidence: 'high',
      lockSnapshot: null
    }

    test('未来日期返回 future', () => {
      const context = { ...baseContext, date: '2026-05-20' }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.future)
      expect(result.isDue).toBe(false)
      expect(result.contributesDenominator).toBe(false)
    })

    test('低可信日期返回 low_confidence', () => {
      const context = { ...baseContext, date: '2026-05-10', dateConfidence: 'low' }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.low_confidence)
      expect(result.contributesDenominator).toBe(false)
    })

    test('早于创建日返回 not_required', () => {
      const context = { ...baseContext, date: '2026-04-30' }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.not_required)
    })

    test('已删除实例删除日之后返回 not_required', () => {
      const context = {
        ...baseContext,
        userHabit: {
          ...baseContext.userHabit,
          status: 'deleted',
          deletedAt: '2026-05-10'
        },
        date: '2026-05-11'
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.not_required)
      expect(result.reason).toBe('deleted_after')
    })

    test('无 policyVersion 返回 not_required', () => {
      const context = { ...baseContext, policyVersion: null, date: '2026-05-05' }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.not_required)
      expect(result.reason).toBe('no_policy_version')
    })

    test('应修日 checked 计入分母和分子', () => {
      const context = {
        ...baseContext,
        date: '2026-05-05',
        dailyState: { status: DAY_STATUS.checked }
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.checked)
      expect(result.contributesDenominator).toBe(true)
      expect(result.contributesNumerator).toBe(true)
    })

    test('应修日 unchecked 计入分母不计入分子', () => {
      const context = {
        ...baseContext,
        date: '2026-05-05',
        dailyState: { status: DAY_STATUS.unchecked }
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.unchecked)
      expect(result.contributesDenominator).toBe(true)
      expect(result.contributesNumerator).toBe(false)
    })

    test('应修日 canceled 计入分母不计入分子', () => {
      const context = {
        ...baseContext,
        date: '2026-05-05',
        dailyState: { status: DAY_STATUS.canceled }
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.canceled)
      expect(result.contributesDenominator).toBe(true)
      expect(result.contributesNumerator).toBe(false)
    })
  })

  describe('resolveReportDayStatus - 删除当天', () => {
    test('删除当天已打卡 checked 计分母分子', () => {
      const context = {
        userHabit: {
          userHabitId: 'uh1',
          habitId: 'h1',
          status: 'deleted',
          createdAt: '2026-05-01',
          deletedAt: '2026-05-10'
        },
        policyVersion: null,
        dailyState: { status: DAY_STATUS.checked },
        date: '2026-05-10',
        todayKey: '2026-05-15',
        dateConfidence: 'high',
        lockSnapshot: null
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.checked)
      expect(result.contributesDenominator).toBe(true)
      expect(result.contributesNumerator).toBe(true)
      expect(result.reason).toBe('deleted_after_checkin')
    })

    test('删除当天未打卡不计分母分子', () => {
      const context = {
        userHabit: {
          userHabitId: 'uh1',
          habitId: 'h1',
          status: 'deleted',
          createdAt: '2026-05-01',
          deletedAt: '2026-05-10'
        },
        policyVersion: null,
        dailyState: { status: DAY_STATUS.unchecked },
        date: '2026-05-10',
        todayKey: '2026-05-15',
        dateConfidence: 'high',
        lockSnapshot: null
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.unchecked)
      expect(result.contributesDenominator).toBe(false)
      expect(result.contributesNumerator).toBe(false)
      expect(result.reason).toBe('deleted_without_checkin')
    })

    test('删除当天已打卡后取消不计分母分子', () => {
      const context = {
        userHabit: {
          userHabitId: 'uh1',
          habitId: 'h1',
          status: 'deleted',
          createdAt: '2026-05-01',
          deletedAt: '2026-05-10'
        },
        policyVersion: null,
        dailyState: { status: DAY_STATUS.canceled },
        date: '2026-05-10',
        todayKey: '2026-05-15',
        dateConfidence: 'high',
        lockSnapshot: null
      }
      const result = reportAggregator.resolveReportDayStatus(context)
      expect(result.status).toBe(DAY_STATUS.canceled)
      expect(result.contributesDenominator).toBe(false)
      expect(result.contributesNumerator).toBe(false)
      expect(result.reason).toBe('deleted_canceled')
    })
  })

  describe('buildDayVerdicts', () => {
    test('生成周期内每天的裁决结果', () => {
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
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = []
      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-01',
        '2026-05-07',
        '2026-05-15',
        'high',
        []
      )
      expect(verdicts).toHaveLength(7)
      expect(verdicts[0].date).toBe('2026-05-01')
      expect(verdicts[6].date).toBe('2026-05-07')
    })

    test('包含 checked/unchecked/canceled 状态的日正确映射', () => {
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
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-02', status: DAY_STATUS.checked },
        { userHabitId: 'uh1', date: '2026-05-03', status: DAY_STATUS.canceled },
        { userHabitId: 'uh1', date: '2026-05-04', status: DAY_STATUS.unchecked }
      ]
      const verdicts = reportAggregator.buildDayVerdicts(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-01',
        '2026-05-07',
        '2026-05-15',
        'high',
        []
      )
      expect(verdicts[1].status).toBe(DAY_STATUS.checked)
      expect(verdicts[1].contributesDenominator).toBe(true)
      expect(verdicts[2].status).toBe(DAY_STATUS.canceled)
      expect(verdicts[2].contributesDenominator).toBe(true)
      expect(verdicts[2].contributesNumerator).toBe(false)
      expect(verdicts[3].status).toBe(DAY_STATUS.unchecked)
      expect(verdicts[3].contributesDenominator).toBe(true)
      expect(verdicts[3].contributesNumerator).toBe(false)
    })
  })

  describe('calculateDueCount / calculateDoneCount', () => {
    test('统计应修天数', () => {
      const verdicts = [
        { date: '2026-05-01', contributesDenominator: true },
        { date: '2026-05-02', contributesDenominator: true },
        { date: '2026-05-03', contributesDenominator: false },
        { date: '2026-05-04', contributesDenominator: true }
      ]
      expect(reportAggregator.calculateDueCount(verdicts)).toBe(3)
    })

    test('统计完成天数', () => {
      const verdicts = [
        { date: '2026-05-01', contributesNumerator: true },
        { date: '2026-05-02', contributesNumerator: true },
        { date: '2026-05-03', contributesNumerator: false },
        { date: '2026-05-04', contributesNumerator: true }
      ]
      expect(reportAggregator.calculateDoneCount(verdicts)).toBe(3)
    })

    test('空数组返回 0', () => {
      expect(reportAggregator.calculateDueCount([])).toBe(0)
      expect(reportAggregator.calculateDoneCount([])).toBe(0)
      expect(reportAggregator.calculateDueCount(null)).toBe(0)
      expect(reportAggregator.calculateDoneCount(null)).toBe(0)
    })
  })

  describe('calculateCompletionRate', () => {
    test('正常计算', () => {
      expect(reportAggregator.calculateCompletionRate(7, 10)).toBe(70)
      expect(reportAggregator.calculateCompletionRate(3, 3)).toBe(100)
      expect(reportAggregator.calculateCompletionRate(0, 10)).toBe(0)
    })

    test('dueCount 为 0 返回 0', () => {
      expect(reportAggregator.calculateCompletionRate(0, 0)).toBe(0)
      expect(reportAggregator.calculateCompletionRate(5, 0)).toBe(0)
    })

    test('四舍五入', () => {
      expect(reportAggregator.calculateCompletionRate(1, 3)).toBe(33)
      expect(reportAggregator.calculateCompletionRate(2, 3)).toBe(67)
    })
  })

  describe('calculateStreak', () => {
    test('连续 checked 增加 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-03', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(3)
    })

    test('非应修日不打断 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-03', isDue: false, status: DAY_STATUS.not_required },
        { date: '2026-05-04', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-05', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(2)
    })

    test('unchecked 不打断也不增加 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.unchecked },
        { date: '2026-05-03', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(1)
    })

    test('canceled 不打断也不增加 streak', () => {
      const verdicts = [
        { date: '2026-05-01', isDue: true, status: DAY_STATUS.checked },
        { date: '2026-05-02', isDue: true, status: DAY_STATUS.canceled },
        { date: '2026-05-03', isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.calculateStreak(verdicts)).toBe(1)
    })

    test('空数组返回 0', () => {
      expect(reportAggregator.calculateStreak([])).toBe(0)
      expect(reportAggregator.calculateStreak(null)).toBe(0)
    })
  })

  describe('aggregateByHabitId', () => {
    test('聚合多个 userHabitId', () => {
      const instanceReports = [
        {
          habitId: 'h1',
          name: '习惯1',
          theme: 't-green',
          userHabitId: 'uh1',
          dueCount: 5,
          doneCount: 3,
          streak: 2
        },
        {
          habitId: 'h1',
          name: '习惯1',
          theme: 't-green',
          userHabitId: 'uh2',
          dueCount: 7,
          doneCount: 5,
          streak: 4
        },
        {
          habitId: 'h2',
          name: '习惯2',
          theme: 't-blue',
          userHabitId: 'uh3',
          dueCount: 10,
          doneCount: 8,
          streak: 6
        }
      ]
      const result = reportAggregator.aggregateByHabitId(instanceReports)
      expect(result.habitGroups).toHaveLength(2)

      const h1Group = result.habitGroups.find(g => g.habitId === 'h1')
      expect(h1Group.instances).toHaveLength(2)
      expect(h1Group.summary.dueCount).toBe(12)
      expect(h1Group.summary.doneCount).toBe(8)
      expect(h1Group.summary.maxStreak).toBe(4)

      const h2Group = result.habitGroups.find(g => g.habitId === 'h2')
      expect(h2Group.summary.dueCount).toBe(10)
      expect(h2Group.summary.doneCount).toBe(8)

      expect(result.summary.dueCount).toBe(22)
      expect(result.summary.doneCount).toBe(16)
    })

    test('空数组返回默认结构', () => {
      const result = reportAggregator.aggregateByHabitId([])
      expect(result.habitGroups).toHaveLength(0)
      expect(result.summary.dueCount).toBe(0)
    })
  })

  describe('buildInstanceReport', () => {
    test('构建单 userHabitId 报表', () => {
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
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: null,
          frequencyType: 'daily'
        }
      ]
      const dailyStates = [
        { userHabitId: 'uh1', date: '2026-05-02', status: DAY_STATUS.checked },
        { userHabitId: 'uh1', date: '2026-05-04', status: DAY_STATUS.checked }
      ]
      const report = reportAggregator.buildInstanceReport(
        userHabit,
        policyVersions,
        dailyStates,
        '2026-05-01',
        '2026-05-07',
        '2026-05-15',
        'high',
        []
      )
      expect(report.userHabitId).toBe('uh1')
      expect(report.habitId).toBe('h1')
      expect(report.dueCount).toBe(7)
      expect(report.doneCount).toBe(2)
      expect(report.days).toHaveLength(7)
    })
  })

  describe('buildCalendarDayStatus', () => {
    test('全部 checked 返回 checked', () => {
      const verdicts = [
        { isDue: true, status: DAY_STATUS.checked },
        { isDue: true, status: DAY_STATUS.checked }
      ]
      expect(reportAggregator.buildCalendarDayStatus(verdicts)).toBe(DAY_STATUS.checked)
    })

    test('部分 checked 返回 partial', () => {
      const verdicts = [
        { isDue: true, status: DAY_STATUS.checked },
        { isDue: true, status: DAY_STATUS.unchecked }
      ]
      expect(reportAggregator.buildCalendarDayStatus(verdicts)).toBe(DAY_STATUS.partial)
    })

    test('全部 unchecked 返回 unchecked', () => {
      const verdicts = [
        { isDue: true, status: DAY_STATUS.unchecked },
        { isDue: true, status: DAY_STATUS.canceled }
      ]
      expect(reportAggregator.buildCalendarDayStatus(verdicts)).toBe(DAY_STATUS.unchecked)
    })

    test('全部非应修返回 not_required', () => {
      const verdicts = [
        { isDue: false, status: DAY_STATUS.not_required },
        { isDue: false, status: DAY_STATUS.future }
      ]
      expect(reportAggregator.buildCalendarDayStatus(verdicts)).toBe(DAY_STATUS.not_required)
    })

    test('空数组返回 not_required', () => {
      expect(reportAggregator.buildCalendarDayStatus([])).toBe(DAY_STATUS.not_required)
    })
  })
})
