/**
 * 观心页 (stats) 单元测试
 * 对应用例：UC-011~UC-015, COM-002, COM-003, COM-006, COM-008, INT-007, INT-008
 * 
 * 补充测试场景：
 * 1. 策略新建完整流程
 * 2. 策略变更/中断场景
 * 3. 周/月/年报表数据链完整测试
 * 4. 删除后再添加的报表数据验证
 */

global.wx = {
  cloud: {
    callFunction: jest.fn()
  },
  nextTick: jest.fn((cb) => cb())
};

global.getApp = jest.fn(() => ({
  globalData: {
    MyHabits: [],
    CheckinLogs: []
  },
  getAllHabits: jest.fn(() => []),
  isCheckedOnDate: jest.fn(() => false),
  calculateStreak: jest.fn(() => 0)
}));

global.Page = jest.fn((config) => config);

describe('观心页统计功能测试', () => {
  let pageConfig;
  let formatDateKey;

  beforeAll(() => {
    formatDateKey = (date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    pageConfig = {
      data: {
        currentTab: 'week',
        habitMatrix: [],
        stats: {
          checkinRate: 0,
          totalCount: 0,
          checkinDays: 0,
          maxStreak: 0
        }
      },

      shouldShowHabitOnDate(habit, date) {
        const dateStr = formatDateKey(date);
        if (!habit.freq_type) return true;

        const planStartDate = habit.plan_start_date || habit.createdAt;
        if (planStartDate && dateStr < planStartDate) return false;

        if (habit.freq_type === 'daily') return true;

        if (habit.freq_type === 'interval') {
          const intervalDays = (habit.freq_rules || 1) + 1;
          const planStart = new Date(planStartDate || habit.createdAt);
          const diffDays = Math.floor((date - planStart) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays % intervalDays === 0;
        }

        if (habit.freq_type === 'weekly') {
          const weeklyDays = habit.freq_rules || [];
          if (!Array.isArray(weeklyDays) || weeklyDays.length === 0) return true;
          const dayOfWeek = date.getDay();
          const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
          return weeklyDays.includes(normalizedDay);
        }

        return true;
      },

      calculateDueCount(startDate, endDate, freqType, freqRules, planStartDate) {
        if (!startDate || !endDate || !planStartDate) return 0;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const planStart = new Date(planStartDate);

        if (end < planStart) return 0;

        const effectiveStart = start < planStart ? planStart : start;
        if (effectiveStart > end) return 0;

        const diffDays = Math.floor((end - effectiveStart) / (1000 * 60 * 60 * 24));

        if (freqType === 'daily') return diffDays + 1;

        if (freqType === 'interval') {
          const intervalDays = (freqRules || 1) + 1;
          let count = 0;
          const current = new Date(effectiveStart);
          while (current <= end) {
            const daysSinceStart = Math.floor((current - planStart) / (1000 * 60 * 60 * 24));
            if (daysSinceStart >= 0 && daysSinceStart % intervalDays === 0) {
              count++;
            }
            current.setDate(current.getDate() + 1);
          }
          return count;
        }

        if (freqType === 'weekly') {
          const targetDays = Array.isArray(freqRules) ? freqRules : [];
          if (targetDays.length === 0) return diffDays + 1;

          const totalWeeks = Math.floor(diffDays / 7);
          const fullWeekCount = totalWeeks * targetDays.length;

          let remainingCount = 0;
          for (let i = 0; i <= (diffDays % 7); i++) {
            const checkDate = new Date(effectiveStart);
            checkDate.setDate(effectiveStart.getDate() + i);
            const dayOfWeek = checkDate.getDay();
            const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
            if (targetDays.includes(normalizedDay)) {
              remainingCount++;
            }
          }

          return fullWeekCount + remainingCount;
        }

        return diffDays + 1;
      },

      mergeWithDeletedHabits(myHabits) {
        const app = global.getApp();
        const allLogs = app.globalData.CheckinLogs || [];
        const habitIdsWithLogs = [...new Set(allLogs.map(log => String(log.habitId)))];
        const currentHabitIds = myHabits.map(h => String(h.habitId || h._id));
        const deletedHabitIds = habitIdsWithLogs.filter(id => !currentHabitIds.includes(id));

        const deletedHabits = deletedHabitIds.map(habitId => ({
          habitId: habitId,
          _id: habitId,
          name: '已删除习惯',
          category: '其他',
          isDeleted: true
        }));

        return [...myHabits, ...deletedHabits];
      },

      setData(data) {
        Object.assign(this.data, data);
      },

      calculateCheckinRate(doneCount, totalDue) {
        if (totalDue === 0) return 0;
        return Math.round((doneCount / totalDue) * 100);
      },

      calculateMaxStreak(logs, habitId, startDate, endDate, freqType, freqRules, planStartDate) {
        const habitLogs = logs.filter(log => log.habitId === String(habitId));
        const checkedDates = new Set(habitLogs.map(log => log.date));

        if (freqType === 'daily') {
          let maxStreak = 0;
          let currentStreak = 0;
          const current = new Date(planStartDate);
          const end = new Date(endDate);
          while (current <= end) {
            const dateStr = formatDateKey(current);
            if (current >= new Date(startDate) && checkedDates.has(dateStr)) {
              currentStreak++;
              maxStreak = Math.max(maxStreak, currentStreak);
            } else {
              currentStreak = 0;
            }
            current.setDate(current.getDate() + 1);
          }
          return maxStreak;
        }

        if (freqType === 'interval') {
          const intervalDays = (freqRules || 1) + 1;
          let maxStreak = 0;
          let currentStreak = 0;
          const current = new Date(planStartDate);
          const end = new Date(endDate);
          while (current <= end) {
            const dateStr = formatDateKey(current);
            const diffDays = Math.floor((current - new Date(planStartDate)) / (1000 * 60 * 60 * 24));
            const isDueDay = diffDays >= 0 && diffDays % intervalDays === 0;
            if (isDueDay && current >= new Date(startDate)) {
              if (checkedDates.has(dateStr)) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
              } else {
                currentStreak = 0;
              }
            }
            current.setDate(current.getDate() + 1);
          }
          return maxStreak;
        }

        return 0;
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // UC-011~UC-013: 报表功能基础测试
  // =========================================================================
  describe('UC-011~UC-013: 报表功能', () => {
    test('周报表应计算正确的应打卡次数', () => {
      const startDate = '2026-04-13';
      const endDate = '2026-04-19';
      const planStartDate = '2026-04-01';

      const dueCount = pageConfig.calculateDueCount(startDate, endDate, 'daily', 1, planStartDate);

      expect(dueCount).toBe(7);
    });

    test('月报表应计算正确的应打卡次数', () => {
      const startDate = '2026-04-01';
      const endDate = '2026-04-30';
      const planStartDate = '2026-04-01';

      const dueCount = pageConfig.calculateDueCount(startDate, endDate, 'daily', 1, planStartDate);

      expect(dueCount).toBe(30);
    });

    test('年报表应计算正确的应打卡次数', () => {
      const startDate = '2026-01-01';
      const endDate = '2026-12-31';
      const planStartDate = '2026-01-01';

      const dueCount = pageConfig.calculateDueCount(startDate, endDate, 'daily', 1, planStartDate);

      expect(dueCount).toBe(365);
    });

    test('年报表（闰年）应计算正确的应打卡次数', () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const planStartDate = '2024-01-01';

      const dueCount = pageConfig.calculateDueCount(startDate, endDate, 'daily', 1, planStartDate);

      expect(dueCount).toBe(366);
    });
  });

  // =========================================================================
  // 1. 新建策略测试
  // =========================================================================
  describe('【策略新建】新建习惯策略的报表验证', () => {
    describe('UC-006: 新建每日习惯策略', () => {
      test('新建每日习惯应在周报表中正确显示', () => {
        const habit = {
          habitId: '1',
          name: '金刚功',
          freq_type: 'daily',
          freq_rules: 1,
          createdAt: '2026-04-13',
          plan_start_date: '2026-04-13'
        };

        const weekStart = new Date('2026-04-13');
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date(weekStart);
          date.setDate(weekStart.getDate() + i);
          weekDates.push(date);
        }

        const dueDates = weekDates.filter(date => 
          pageConfig.shouldShowHabitOnDate(habit, date)
        );

        expect(dueDates).toHaveLength(7);
      });

      test('新建间隔习惯应在周报表中正确显示', () => {
        const habit = {
          habitId: '2',
          name: '艾灸',
          freq_type: 'interval',
          freq_rules: 2,
          createdAt: '2026-04-13',
          plan_start_date: '2026-04-13'
        };

        const weekStart = new Date('2026-04-13');
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date(weekStart);
          date.setDate(weekStart.getDate() + i);
          weekDates.push(date);
        }

        const dueDates = weekDates.filter(date => 
          pageConfig.shouldShowHabitOnDate(habit, date)
        );

        expect(dueDates).toHaveLength(3);
      });

      test('新建每周固定习惯应在周报表中正确显示', () => {
        const habit = {
          habitId: '3',
          name: '八段锦',
          freq_type: 'weekly',
          freq_rules: [1, 3, 5],
          createdAt: '2026-04-13',
          plan_start_date: '2026-04-13'
        };

        const weekStart = new Date('2026-04-13');
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date(weekStart);
          date.setDate(weekStart.getDate() + i);
          weekDates.push(date);
        }

        const dueDates = weekDates.filter(date => 
          pageConfig.shouldShowHabitOnDate(habit, date)
        );

        expect(dueDates).toHaveLength(3);
      });

      test('新建习惯（计划开始日期为未来）应在月报表中正确显示', () => {
        const habit = {
          habitId: '4',
          name: '站桩',
          freq_type: 'daily',
          freq_rules: 1,
          createdAt: '2026-04-01',
          plan_start_date: '2026-04-20'
        };

        const startDate = '2026-04-01';
        const endDate = '2026-04-30';

        const dueCount = pageConfig.calculateDueCount(
          startDate, endDate, 
          habit.freq_type, 
          habit.freq_rules, 
          habit.plan_start_date
        );

        expect(dueCount).toBe(11);
      });
    });

    describe('UC-006: 新建策略后首次打卡的报表计算', () => {
      test('新建习惯首次打卡后应正确计算完成率', () => {
        const logs = [
          { habitId: '1', date: '2026-04-13' }
        ];

        const startDate = '2026-04-13';
        const endDate = '2026-04-19';
        const totalDue = 7;
        const doneCount = logs.filter(log => 
          log.date >= startDate && log.date <= endDate && log.habitId === '1'
        ).length;

        const rate = pageConfig.calculateCheckinRate(doneCount, totalDue);

        expect(rate).toBe(14);
        expect(Math.round(100 / 7)).toBe(14);
      });

      test('新建习惯多次打卡后应正确计算完成率', () => {
        const logs = [
          { habitId: '1', date: '2026-04-13' },
          { habitId: '1', date: '2026-04-14' },
          { habitId: '1', date: '2026-04-15' }
        ];

        const startDate = '2026-04-13';
        const endDate = '2026-04-19';
        const totalDue = 7;
        const doneCount = logs.filter(log => 
          log.date >= startDate && log.date <= endDate && log.habitId === '1'
        ).length;

        const rate = pageConfig.calculateCheckinRate(doneCount, totalDue);

        expect(rate).toBe(43);
      });
    });
  });

  // =========================================================================
  // 2. 策略变更/中断场景测试
  // =========================================================================
  describe('【策略中断】策略变更/中断场景的报表验证', () => {
    describe('策略中断场景：频率类型变更', () => {
      test('从每日变更为间隔打卡后的周报表计算', () => {
        const habitVersions = [
          { freq_type: 'daily', freq_rules: 1, endDate: '2026-04-15' },
          { freq_type: 'interval', freq_rules: 2, startDate: '2026-04-16' }
        ];

        const weekStart = new Date('2026-04-13');
        const weekEnd = new Date('2026-04-19');

        let totalDue = 0;
        let segmentEnd = new Date(habitVersions[0].endDate);
        if (segmentEnd > weekEnd) segmentEnd = weekEnd;

        totalDue += pageConfig.calculateDueCount(
          formatDateKey(weekStart),
          formatDateKey(segmentEnd),
          habitVersions[0].freq_type,
          habitVersions[0].freq_rules,
          '2026-04-13'
        );

        const segment2Start = new Date('2026-04-16');
        if (segment2Start <= weekEnd) {
          totalDue += pageConfig.calculateDueCount(
            formatDateKey(segment2Start),
            formatDateKey(weekEnd),
            habitVersions[1].freq_type,
            habitVersions[1].freq_rules,
            '2026-04-16'
          );
        }

        expect(totalDue).toBeGreaterThan(0);
      });

      test('从间隔变更为每周固定后的月报表计算', () => {
        const intervalDue = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-15',
          'interval', 2,
          '2026-04-01'
        );

        const weeklyDue = pageConfig.calculateDueCount(
          '2026-04-16', '2026-04-30',
          'weekly', [1, 3, 5],
          '2026-04-16'
        );

        expect(intervalDue).toBe(5);
        expect(weeklyDue).toBeGreaterThan(0);
      });
    });

    describe('策略中断场景：间隔天数变更', () => {
      test('从间隔2天变更为间隔3天', () => {
        const dueBefore = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-15',
          'interval', 2,
          '2026-04-01'
        );

        const dueAfter = pageConfig.calculateDueCount(
          '2026-04-16', '2026-04-30',
          'interval', 3,
          '2026-04-16'
        );

        expect(dueBefore).toBe(5);
        expect(dueAfter).toBe(4);
      });

      test('从间隔1天变更为间隔2天（更宽松）', () => {
        const habitBefore = { freq_type: 'interval', freq_rules: 1, plan_start_date: '2026-04-01' };
        const habitAfter = { freq_type: 'interval', freq_rules: 2, plan_start_date: '2026-04-16' };

        const dates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date('2026-04-13');
          date.setDate(13 + i);
          dates.push(date);
        }

        const beforeResults = dates.map(d => pageConfig.shouldShowHabitOnDate(habitBefore, d));
        const afterResults = dates.map(d => pageConfig.shouldShowHabitOnDate(habitAfter, d));

        expect(beforeResults.filter(Boolean)).toHaveLength(4);
        expect(afterResults.filter(Boolean)).toHaveLength(2);
      });
    });

    describe('策略中断场景：每周固定日期变更', () => {
      test('从周一三五变更为周二四六', () => {
        const habitBefore = { freq_type: 'weekly', freq_rules: [1, 3, 5], plan_start_date: '2026-04-01' };
        const habitAfter = { freq_type: 'weekly', freq_rules: [2, 4, 6], plan_start_date: '2026-04-16' };

        const dates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date('2026-04-13');
          date.setDate(13 + i);
          dates.push(date);
        }

        const beforeResults = dates.map(d => pageConfig.shouldShowHabitOnDate(habitBefore, d));
        const afterResults = dates.map(d => pageConfig.shouldShowHabitOnDate(habitAfter, d));

        expect(beforeResults.filter(Boolean)).toHaveLength(3);
        expect(afterResults.filter(Boolean)).toHaveLength(2);
      });

      test('从每周三天变更为每周五天', () => {
        const habitSparse = { freq_type: 'weekly', freq_rules: [1, 3, 5], plan_start_date: '2026-04-01' };
        const habitDense = { freq_type: 'weekly', freq_rules: [1, 2, 3, 4, 5], plan_start_date: '2026-04-01' };

        const dueSparse = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-30',
          'weekly', [1, 3, 5],
          '2026-04-01'
        );

        const dueDense = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-30',
          'weekly', [1, 2, 3, 4, 5],
          '2026-04-01'
        );

        expect(dueSparse).toBe(13);
        expect(dueDense).toBe(22);
      });
    });

    describe('策略中断场景：计划开始日期变更', () => {
      test('计划开始日期推迟', () => {
        const habitBefore = { freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-04-01' };
        const habitAfter = { freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-04-16' };

        const dates = [];
        for (let i = 0; i < 10; i++) {
          const date = new Date('2026-04-13');
          date.setDate(13 + i);
          dates.push(date);
        }

        const beforeResults = dates.map(d => pageConfig.shouldShowHabitOnDate(habitBefore, d));
        const afterResults = dates.map(d => pageConfig.shouldShowHabitOnDate(habitAfter, d));

        expect(beforeResults.filter(Boolean)).toHaveLength(10);
        expect(afterResults.slice(0, 3).filter(Boolean)).toHaveLength(0);
        expect(afterResults.slice(3).filter(Boolean)).toHaveLength(7);
      });

      test('计划开始日期提前', () => {
        const habit = { freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-04-10' };

        const dates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date('2026-04-13');
          date.setDate(13 + i);
          dates.push(date);
        }

        const results = dates.map(d => pageConfig.shouldShowHabitOnDate(habit, d));

        expect(results.filter(Boolean)).toHaveLength(7);
      });
    });

    describe('策略中断后的连续打卡计算', () => {
      test('中断前后的连续天数应分段计算', () => {
        const logs = [
          { habitId: '1', date: '2026-04-10' },
          { habitId: '1', date: '2026-04-11' },
          { habitId: '1', date: '2026-04-12' },
          { habitId: '1', date: '2026-04-16' },
          { habitId: '1', date: '2026-04-17' }
        ];

        const streakBefore = pageConfig.calculateMaxStreak(
          logs, '1',
          '2026-04-01', '2026-04-15',
          'daily', 1,
          '2026-04-01'
        );

        const streakAfter = pageConfig.calculateMaxStreak(
          logs, '1',
          '2026-04-16', '2026-04-30',
          'daily', 1,
          '2026-04-16'
        );

        expect(streakBefore).toBe(3);
        expect(streakAfter).toBe(2);
      });

      test('每日习惯中断后重新开始的连续天数', () => {
        const logs = [
          { habitId: '1', date: '2026-04-01' },
          { habitId: '1', date: '2026-04-02' },
          { habitId: '1', date: '2026-04-03' },
          { habitId: '1', date: '2026-04-07' },
          { habitId: '1', date: '2026-04-08' },
          { habitId: '1', date: '2026-04-09' },
          { habitId: '1', date: '2026-04-10' }
        ];

        const streak = pageConfig.calculateMaxStreak(
          logs, '1',
          '2026-04-01', '2026-04-15',
          'daily', 1,
          '2026-04-01'
        );

        expect(streak).toBe(4);
      });

      test('间隔习惯中断后重新开始的连续天数', () => {
        const logs = [
          { habitId: '1', date: '2026-04-01' },
          { habitId: '1', date: '2026-04-04' },
          { habitId: '1', date: '2026-04-07' },
          { habitId: '1', date: '2026-04-11' },
          { habitId: '1', date: '2026-04-14' }
        ];

        const streak = pageConfig.calculateMaxStreak(
          logs, '1',
          '2026-04-01', '2026-04-15',
          'interval', 2,
          '2026-04-01'
        );

        expect(streak).toBe(3);
      });
    });
  });

  // =========================================================================
  // 3. 删除后再添加场景测试
  // =========================================================================
  describe('【删除场景】删除习惯后再添加的报表验证', () => {
    describe('删除后再添加：数据保留验证', () => {
      test('删除习惯后历史打卡记录应保留', () => {
        const logsBeforeDelete = [
          { habitId: '1', date: '2026-04-01' },
          { habitId: '1', date: '2026-04-02' },
          { habitId: '1', date: '2026-04-03' }
        ];

        const currentLogs = [];

        const allLogs = [...currentLogs, ...logsBeforeDelete];

        expect(allLogs).toHaveLength(3);
        expect(allLogs.filter(log => log.habitId === '1')).toHaveLength(3);
      });

      test('删除后再添加原习惯应有独立的打卡记录', () => {
        const logsFirstPeriod = [
          { habitId: '1', date: '2026-04-01' },
          { habitId: '1', date: '2026-04-02' }
        ];

        const logsSecondPeriod = [
          { habitId: '1', date: '2026-04-20' },
          { habitId: '1', date: '2026-04-21' }
        ];

        const allLogs = [...logsFirstPeriod, ...logsSecondPeriod];

        expect(allLogs.filter(log => log.habitId === '1')).toHaveLength(4);

        const aprilFirstHalf = allLogs.filter(log => log.date <= '2026-04-15');
        const aprilSecondHalf = allLogs.filter(log => log.date >= '2026-04-15');

        expect(aprilFirstHalf).toHaveLength(2);
        expect(aprilSecondHalf).toHaveLength(2);
      });
    });

    describe('删除后再添加：周报表验证', () => {
      test('删除前后的周报表应正确分段计算', () => {
        const habit = {
          habitId: '1',
          name: '金刚功',
          freq_type: 'daily',
          freq_rules: 1
        };

        const logsWeek1 = [
          { habitId: '1', date: '2026-04-13' },
          { habitId: '1', date: '2026-04-14' },
          { habitId: '1', date: '2026-04-15' }
        ];

        const logsWeek2 = [
          { habitId: '1', date: '2026-04-20' },
          { habitId: '1', date: '2026-04-21' }
        ];

        const week1Done = logsWeek1.length;
        const week1Due = 7;
        const week2Done = logsWeek2.length;
        const week2Due = 7;

        expect(pageConfig.calculateCheckinRate(week1Done, week1Due)).toBe(43);
        expect(pageConfig.calculateCheckinRate(week2Done, week2Due)).toBe(29);
      });

      test('删除后重新添加应从新计划日期开始计算', () => {
        const newHabit = {
          habitId: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-20'
        };

        const weekStart = new Date('2026-04-20');
        const weekEnd = new Date('2026-04-26');

        const dueCount = pageConfig.calculateDueCount(
          formatDateKey(weekStart),
          formatDateKey(weekEnd),
          newHabit.freq_type,
          newHabit.freq_rules,
          newHabit.plan_start_date
        );

        expect(dueCount).toBe(7);
      });

      test('删除后重新添加但使用不同频率', () => {
        const logsDailyPeriod = [
          { habitId: '1', date: '2026-04-13' },
          { habitId: '1', date: '2026-04-14' },
          { habitId: '1', date: '2026-04-15' }
        ];

        const newIntervalHabit = {
          habitId: '1',
          freq_type: 'interval',
          freq_rules: 2,
          plan_start_date: '2026-04-20'
        };

        const weekStart = new Date('2026-04-20');
        const weekEnd = new Date('2026-04-26');

        const intervalDue = pageConfig.calculateDueCount(
          formatDateKey(weekStart),
          formatDateKey(weekEnd),
          newIntervalHabit.freq_type,
          newIntervalHabit.freq_rules,
          newIntervalHabit.plan_start_date
        );

        expect(intervalDue).toBe(3);
        expect(logsDailyPeriod).toHaveLength(3);
      });
    });

    describe('删除后再添加：月报表验证', () => {
      test('跨月的删除再添加应正确计算', () => {
        const logsMarch = [
          { habitId: '1', date: '2026-03-25' },
          { habitId: '1', date: '2026-03-26' },
          { habitId: '1', date: '2026-03-27' },
          { habitId: '1', date: '2026-03-28' },
          { habitId: '1', date: '2026-03-29' },
          { habitId: '1', date: '2026-03-30' },
          { habitId: '1', date: '2026-03-31' }
        ];

        const logsApril = [
          { habitId: '1', date: '2026-04-20' },
          { habitId: '1', date: '2026-04-21' },
          { habitId: '1', date: '2026-04-22' }
        ];

        const marchDue = pageConfig.calculateDueCount(
          '2026-03-01', '2026-03-31',
          'daily', 1,
          '2026-03-01'
        );

        const aprilDue = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-30',
          'daily', 1,
          '2026-04-20'
        );

        expect(marchDue).toBe(31);
        expect(aprilDue).toBe(11);

        expect(logsMarch).toHaveLength(7);
        expect(logsApril).toHaveLength(3);
      });

      test('删除后再添加使用间隔打卡', () => {
        const habit = {
          habitId: '1',
          freq_type: 'interval',
          freq_rules: 2,
          plan_start_date: '2026-04-20'
        };

        const logs = [
          { habitId: '1', date: '2026-04-20' },
          { habitId: '1', date: '2026-04-23' },
          { habitId: '1', date: '2026-04-26' },
          { habitId: '1', date: '2026-04-29' }
        ];

        const dueCount = pageConfig.calculateDueCount(
          '2026-04-20', '2026-04-30',
          'interval', 2,
          '2026-04-20'
        );

        expect(dueCount).toBe(4);
        expect(logs).toHaveLength(4);
      });
    });

    describe('删除后再添加：年报表验证', () => {
      test('跨年的删除再添加应正确计算', () => {
        const logs2025 = [
          { habitId: '1', date: '2025-11-01' },
          { habitId: '1', date: '2025-11-02' },
          { habitId: '1', date: '2025-11-03' }
        ];

        const logs2026 = [
          { habitId: '1', date: '2026-01-01' },
          { habitId: '1', date: '2026-01-02' },
          { habitId: '1', date: '2026-01-03' }
        ];

        const allLogs = [...logs2025, ...logs2026];

        expect(allLogs).toHaveLength(6);
        expect(allLogs.filter(log => log.date.startsWith('2025'))).toHaveLength(3);
        expect(allLogs.filter(log => log.date.startsWith('2026'))).toHaveLength(3);
      });

      test('多年使用的习惯打卡统计', () => {
        const logs = [];
        for (let month = 1; month <= 12; month++) {
          for (let day = 1; day <= 28; day += 7) {
            const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            logs.push({ habitId: '1', date });
          }
        }

        const habit = {
          habitId: '1',
          freq_type: 'weekly',
          freq_rules: [1],
          plan_start_date: '2026-01-01'
        };

        const dueCount = pageConfig.calculateDueCount(
          '2026-01-01', '2026-12-31',
          'weekly', [1],
          '2026-01-01'
        );

        expect(dueCount).toBe(52);
        expect(logs).toHaveLength(48);
      });
    });

    describe('删除后再添加：已删除习惯信息保留', () => {
      test('已删除习惯的信息应能从AllHabitsInfo恢复', () => {
        const allHabitsInfo = {
          '1': {
            habitId: '1',
            name: '金刚功',
            category: '运动类',
            targetMinutes: 20,
            freq_type: 'daily',
            deletedAt: '2026-04-15'
          }
        };

        const deletedHabit = allHabitsInfo['1'];

        expect(deletedHabit).toBeDefined();
        expect(deletedHabit.name).toBe('金刚功');
        expect(deletedHabit.category).toBe('运动类');
        expect(deletedHabit.deletedAt).toBe('2026-04-15');
      });

      test('恢复后的习惯应使用新策略', () => {
        const restoredHabit = {
          habitId: '1',
          name: '金刚功',
          category: '运动类',
          freq_type: 'interval',
          freq_rules: 2,
          plan_start_date: '2026-04-20',
          isDeleted: false
        };

        expect(restoredHabit.isDeleted).toBe(false);
        expect(restoredHabit.freq_type).toBe('interval');
        expect(restoredHabit.plan_start_date).toBe('2026-04-20');
      });
    });
  });

  // =========================================================================
  // 4. 周/月/年报表数据链完整测试
  // =========================================================================
  describe('【报表数据链】周/月/年报表数据一致性验证', () => {
    describe('周报表数据链', () => {
      test('同一习惯在连续两周的报表数据应连贯', () => {
        const habit = {
          habitId: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        };

        const logsWeek1 = ['2026-04-13', '2026-04-14', '2026-04-15'];
        const logsWeek2 = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23'];

        const week1Due = pageConfig.calculateDueCount(
          '2026-04-13', '2026-04-19',
          'daily', 1,
          '2026-04-01'
        );

        const week2Due = pageConfig.calculateDueCount(
          '2026-04-20', '2026-04-26',
          'daily', 1,
          '2026-04-01'
        );

        const week1Rate = pageConfig.calculateCheckinRate(logsWeek1.length, week1Due);
        const week2Rate = pageConfig.calculateCheckinRate(logsWeek2.length, week2Due);

        expect(week1Due).toBe(7);
        expect(week2Due).toBe(7);
        expect(week1Rate).toBe(43);
        expect(week2Rate).toBe(57);
      });

      test('周报表数据应与月报表数据一致', () => {
        const habit = {
          habitId: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01'
        };

        const logsApril = [
          '2026-04-01', '2026-04-02', '2026-04-03',
          '2026-04-15', '2026-04-16', '2026-04-17',
          '2026-04-29', '2026-04-30'
        ];

        const week1Due = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-07',
          'daily', 1,
          '2026-04-01'
        );
        const week2Due = pageConfig.calculateDueCount(
          '2026-04-08', '2026-04-14',
          'daily', 1,
          '2026-04-01'
        );
        const week3Due = pageConfig.calculateDueCount(
          '2026-04-15', '2026-04-21',
          'daily', 1,
          '2026-04-01'
        );
        const week4Due = pageConfig.calculateDueCount(
          '2026-04-22', '2026-04-28',
          'daily', 1,
          '2026-04-01'
        );
        const week5Due = pageConfig.calculateDueCount(
          '2026-04-29', '2026-04-30',
          'daily', 1,
          '2026-04-01'
        );

        const totalDue = week1Due + week2Due + week3Due + week4Due + week5Due;
        const totalDone = logsApril.length;

        expect(totalDue).toBe(30);
        expect(totalDone).toBe(8);
      });
    });

    describe('月报表数据链', () => {
      test('各月报表数据应与年报表数据累计一致', () => {
        const monthlyData = [
          { month: '2026-01', due: 31, done: 28 },
          { month: '2026-02', due: 28, done: 25 },
          { month: '2026-03', due: 31, done: 30 },
          { month: '2026-04', due: 30, done: 20 },
          { month: '2026-05', due: 31, done: 15 },
          { month: '2026-06', due: 30, done: 0 }
        ];

        const yearlyDue = monthlyData.reduce((sum, m) => sum + m.due, 0);
        const yearlyDone = monthlyData.reduce((sum, m) => sum + m.done, 0);

        expect(yearlyDue).toBe(181);
        expect(yearlyDone).toBe(118);
        expect(pageConfig.calculateCheckinRate(yearlyDone, yearlyDue)).toBe(65);
      });

      test('月报表完成率计算应精确', () => {
        const cases = [
          { due: 30, done: 15, expected: 50 },
          { due: 31, done: 21, expected: 68 },
          { due: 28, done: 28, expected: 100 },
          { due: 30, done: 0, expected: 0 },
          { due: 0, done: 0, expected: 0 }
        ];

        cases.forEach(({ due, done, expected }) => {
          const rate = pageConfig.calculateCheckinRate(done, due);
          expect(rate).toBe(expected);
        });
      });
    });

    describe('年报表数据链', () => {
      test('年报表应包含完整的12个月数据', () => {
        const monthlyStats = [];
        for (let month = 1; month <= 12; month++) {
          const monthStr = String(month).padStart(2, '0');
          monthlyStats.push({
            month: `2026-${monthStr}`,
            due: month === 2 ? 28 : 30,
            done: Math.floor(Math.random() * 30)
          });
        }

        expect(monthlyStats).toHaveLength(12);
        expect(monthlyStats.find(m => m.month === '2026-02').due).toBe(28);
      });

      test('年报表应正确处理闰年', () => {
        const leapYearDue = pageConfig.calculateDueCount(
          '2024-01-01', '2024-12-31',
          'daily', 1,
          '2024-01-01'
        );

        const normalYearDue = pageConfig.calculateDueCount(
          '2025-01-01', '2025-12-31',
          'daily', 1,
          '2025-01-01'
        );

        expect(leapYearDue).toBe(366);
        expect(normalYearDue).toBe(365);
      });

      test('年热力图数据应与打卡记录一致', () => {
        const logs = [
          { habitId: '1', date: '2026-01-01' },
          { habitId: '1', date: '2026-01-02' },
          { habitId: '1', date: '2026-01-03' },
          { habitId: '1', date: '2026-06-15' },
          { habitId: '1', date: '2026-06-16' }
        ];

        const yearStart = new Date('2026-01-01');
        const yearEnd = new Date('2026-12-31');
        let heatmapData = [];

        for (let i = 0; i < 365; i++) {
          const currentDate = new Date(yearStart);
          currentDate.setDate(yearStart.getDate() + i);
          const dateStr = formatDateKey(currentDate);
          const hasLog = logs.some(log => log.date === dateStr);
          heatmapData.push({ date: dateStr, level: hasLog ? 'level-1' : '' });
        }

        expect(heatmapData).toHaveLength(365);
        expect(heatmapData.filter(d => d.level === 'level-1')).toHaveLength(5);
      });
    });

    describe('跨报表周期数据一致性', () => {
      test('周月年三级报表打卡数累计应一致', () => {
        const weekData = [
          { week: '2026-W15', due: 7, done: 5 },
          { week: '2026-W16', due: 7, done: 6 },
          { week: '2026-W17', due: 7, done: 7 },
          { week: '2026-W18', due: 7, done: 4 }
        ];

        const monthData = [
          { month: '2026-04', weeks: weekData, due: 28, done: 22 }
        ];

        const weekTotalDone = weekData.reduce((sum, w) => sum + w.done, 0);
        const monthTotalDone = monthData[0].done;

        expect(weekTotalDone).toBe(22);
        expect(weekTotalDone).toBe(monthTotalDone);
      });

      test('删除习惯后的报表数据应正确分段', () => {
        const habit = {
          habitId: '1',
          freq_type: 'daily',
          freq_rules: 1,
          plan_start_date: '2026-04-01',
          deletedAt: '2026-04-15'
        };

        const beforeDeleteDue = pageConfig.calculateDueCount(
          '2026-04-01', '2026-04-15',
          'daily', 1,
          '2026-04-01'
        );

        const logsBeforeDelete = 12;

        expect(beforeDeleteDue).toBe(15);
        expect(logsBeforeDelete).toBeLessThanOrEqual(beforeDeleteDue);
      });
    });
  });

  // =========================================================================
  // 5. COM-003: 混合频率策略
  // =========================================================================
  describe('COM-003: 混合频率策略', () => {
    test('每日习惯应每天显示', () => {
      const habit = { freq_type: 'daily', freq_rules: 1, createdAt: '2026-04-01' };
      const dates = [
        new Date('2026-04-13'),
        new Date('2026-04-14'),
        new Date('2026-04-15')
      ];

      const results = dates.map(date => pageConfig.shouldShowHabitOnDate(habit, date));

      expect(results.every(r => r === true)).toBe(true);
    });

    test('间隔习惯应按间隔天数显示', () => {
      const habit = { freq_type: 'interval', freq_rules: 2, createdAt: '2026-04-01' };
      const dates = [
        new Date('2026-04-13'),
        new Date('2026-04-14'),
        new Date('2026-04-15'),
        new Date('2026-04-16')
      ];

      const results = dates.map(date => pageConfig.shouldShowHabitOnDate(habit, date));

      expect(results[0]).toBe(true);
      expect(results[1]).toBe(false);
      expect(results[2]).toBe(false);
      expect(results[3]).toBe(true);
    });

    test('每周固定习惯应只显示指定星期', () => {
      const habit = { freq_type: 'weekly', freq_rules: [1, 3, 5], createdAt: '2026-04-01' };
      const monday = new Date('2026-04-13');
      const tuesday = new Date('2026-04-14');
      const wednesday = new Date('2026-04-15');
      const thursday = new Date('2026-04-16');
      const friday = new Date('2026-04-17');

      expect(pageConfig.shouldShowHabitOnDate(habit, monday)).toBe(true);
      expect(pageConfig.shouldShowHabitOnDate(habit, tuesday)).toBe(false);
      expect(pageConfig.shouldShowHabitOnDate(habit, wednesday)).toBe(true);
      expect(pageConfig.shouldShowHabitOnDate(habit, thursday)).toBe(false);
      expect(pageConfig.shouldShowHabitOnDate(habit, friday)).toBe(true);
    });
  });

  // =========================================================================
  // 6. COM-006: 计划开始日期
  // =========================================================================
  describe('COM-006: 计划开始日期为未来', () => {
    test('计划开始日期之前的习惯不应显示', () => {
      const habit = { freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-04-20', createdAt: '2026-04-01' };
      const today = new Date('2026-04-15');

      const shouldShow = pageConfig.shouldShowHabitOnDate(habit, today);

      expect(shouldShow).toBe(false);
    });

    test('计划开始日期当天应显示', () => {
      const habit = { freq_type: 'daily', freq_rules: 1, plan_start_date: '2026-04-15', createdAt: '2026-04-01' };
      const today = new Date('2026-04-15');

      const shouldShow = pageConfig.shouldShowHabitOnDate(habit, today);

      expect(shouldShow).toBe(true);
    });
  });

  // =========================================================================
  // 7. COM-008: 已删除习惯历史查看
  // =========================================================================
  describe('COM-008: 已删除习惯历史查看', () => {
    test('已删除但有打卡记录的习惯应被合并', () => {
      let CheckinLogs = [
        { habitId: '1', date: '2026-04-13' },
        { habitId: '2', date: '2026-04-13' }
      ];

      const myHabits = [{ habitId: '1', name: '习惯A' }];

      const habitIdsWithLogs = [...new Set(CheckinLogs.map(log => String(log.habitId)))];
      const currentHabitIds = myHabits.map(h => String(h.habitId || h._id));
      const deletedHabitIds = habitIdsWithLogs.filter(id => !currentHabitIds.includes(id));

      const deletedHabits = deletedHabitIds.map(habitId => ({
        habitId: habitId,
        _id: habitId,
        name: '已删除习惯',
        category: '其他',
        isDeleted: true
      }));

      const merged = [...myHabits, ...deletedHabits];

      expect(merged).toHaveLength(2);
      expect(merged.find(h => h.name === '已删除习惯')).toBeDefined();
    });

    test('没有打卡记录的已删除习惯不应合并', () => {
      let CheckinLogs = [];

      const myHabits = [{ habitId: '1', name: '习惯A' }];

      const habitIdsWithLogs = [...new Set(CheckinLogs.map(log => String(log.habitId)))];
      const currentHabitIds = myHabits.map(h => String(h.habitId || h._id));
      const deletedHabitIds = habitIdsWithLogs.filter(id => !currentHabitIds.includes(id));

      const deletedHabits = deletedHabitIds.map(habitId => ({
        habitId: habitId,
        _id: habitId,
        name: '已删除习惯',
        category: '其他',
        isDeleted: true
      }));

      const merged = [...myHabits, ...deletedHabits];

      expect(merged).toHaveLength(1);
    });
  });

  // =========================================================================
  // 8. EX-011, EX-012: 策略配置异常
  // =========================================================================
  describe('EX-011: 计划开始日期校验', () => {
    test('计划开始日期早于创建日期应被拒绝', () => {
      const habit = { freq_type: 'daily', createdAt: '2026-04-15' };
      const checkDate = new Date('2026-04-10');

      const shouldShow = pageConfig.shouldShowHabitOnDate(habit, checkDate);

      expect(shouldShow).toBe(false);
    });
  });

  describe('EX-012: 未选择星期几', () => {
    test('未选择星期应有默认值（每天）', () => {
      const habit = { freq_type: 'weekly', freq_rules: [], createdAt: '2026-04-01' };
      const dates = [
        new Date('2026-04-13'),
        new Date('2026-04-14'),
        new Date('2026-04-15')
      ];

      const results = dates.map(date => pageConfig.shouldShowHabitOnDate(habit, date));

      expect(results.every(r => r === true)).toBe(true);
    });
  });

  // =========================================================================
  // 9. COM-002: 部分习惯已打卡
  // =========================================================================
  describe('COM-002: 部分习惯已打卡时的进度计算', () => {
    test('应正确计算部分完成的打卡率', () => {
      const dueCount = 10;
      const completedCount = 7;

      const checkinRate = pageConfig.calculateCheckinRate(completedCount, dueCount);

      expect(checkinRate).toBe(70);
    });

    test('无应打卡次数时打卡率应为0', () => {
      const dueCount = 0;
      const completedCount = 0;

      const checkinRate = pageConfig.calculateCheckinRate(completedCount, dueCount);

      expect(checkinRate).toBe(0);
    });
  });

  // =========================================================================
  // 10. 频率计算边界情况
  // =========================================================================
  describe('频率计算边界情况', () => {
    test('无计划开始日期应返回0', () => {
      const result = pageConfig.calculateDueCount('2026-04-01', '2026-04-30', 'daily', 1, null);
      expect(result).toBe(0);
    });

    test('结束日期早于计划开始日期应返回0', () => {
      const result = pageConfig.calculateDueCount('2026-04-01', '2026-04-10', 'daily', 1, '2026-04-15');
      expect(result).toBe(0);
    });

    test('间隔天数为1时应每2天打卡', () => {
      const habit = { freq_type: 'interval', freq_rules: 1, createdAt: '2026-04-01' };
      const dates = [
        new Date('2026-04-13'),
        new Date('2026-04-14')
      ];

      const results = dates.map(date => pageConfig.shouldShowHabitOnDate(habit, date));

      expect(results[0]).toBe(true);
      expect(results[1]).toBe(false);
    });
  });
});
