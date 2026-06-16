/**
 * 修习策略弹窗 - 计划开始时间行为测试
 */

const fs = require('fs');
const path = require('path');

describe('修习策略弹窗计划开始时间', () => {
  let page;

  function loadHabitsPage() {
    jest.resetModules();
    global.Page.mockClear();
    global.getApp.mockReturnValue({
      globalData: { MyHabits: [] },
      getSimulatedDateStr: jest.fn(() => '2026-05-09'),
      getDebugOffset: jest.fn(() => -22),
      addUserStrategy: jest.fn()
    });

    require('../../../miniprogram/pages/habits/habits.js');
    return global.Page.mock.results[0].value;
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-30T16:00:00.000Z'));
    page = loadHabitsPage();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('模板只保留开始时间选项组', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/habits/habits.wxml'),
      'utf8'
    );

    expect(wxml).not.toContain('从今天开始');
    expect(wxml).not.toContain('bindtap="selectPlanStartToday"');
    expect(wxml).toContain('开始时间');
    expect(wxml).not.toContain('自定义开始时间');
    expect(wxml).toContain('wx:for="{{planStartDateOptions}}"');
    expect(wxml).toContain("{{planStartNeedsReselect ? 'disabled' : ''}}");
  });

  test('新增策略默认使用开始时间并选中今天', () => {
    page.openAddStrategyModal({
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15
    });

    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('today');
    expect(page.data.planStartDateCustom).toBe('');
    expect(page.data.isEditingStrategy).toBe(false);
    expect(page.data.planStartNeedsReselect).toBe(false);
    expect(page.getFinalPlanStartDate()).toBe('2026-05-09');
  });

  test('修改已开始策略时开始时间默认今天', () => {
    const baseHabit = {
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15,
      strategy: { duration: 15, freq_category: 'everyday', plan_start_date: '2026-05-09' }
    };

    page.openEditStrategyModal(baseHabit);
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('today');
    expect(page.data.planStartDateCustom).toBe('');
    expect(page.data.isEditingStrategy).toBe(true);
    expect(page.data.planStartNeedsReselect).toBe(false);

    page.openEditStrategyModal({
      ...baseHabit,
      strategy: { ...baseHabit.strategy, plan_start_date: '2026-05-01' }
    });
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('today');
    expect(page.data.planStartDateCustom).toBe('');
    expect(page.data.planStartNeedsReselect).toBe(false);
  });

  test('修改未开始策略时保留未来开始时间但要求重新选择', () => {
    const baseHabit = {
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15,
      strategy: { duration: 15, freq_category: 'everyday', plan_start_date: '2026-05-10' }
    };

    page.openEditStrategyModal(baseHabit);
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('tomorrow');
    expect(page.data.planStartDateCustom).toBe('');
    expect(page.data.planStartNeedsReselect).toBe(true);
    expect(page.data.planStartHint).toContain('2026-05-10');

    page.openEditStrategyModal({
      ...baseHabit,
      strategy: { ...baseHabit.strategy, plan_start_date: '2026-05-18' }
    });
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('custom');
    expect(page.data.planStartDateCustom).toBe('2026-05-18');
    expect(page.data.planStartNeedsReselect).toBe(true);
  });
});
