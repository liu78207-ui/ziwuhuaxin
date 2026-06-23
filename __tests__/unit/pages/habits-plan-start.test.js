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
    wx.nextTick = jest.fn(callback => callback());
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
    expect(wxml).toContain('wx:if="{{planStartDatePickerReady}}"');
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

  test('开始日期提示文案覆盖今天和未来日期', () => {
    expect(page.generatePlanStartHint('2026-05-09')).toBe(
      '计划将从2026-05-09开始，首页打卡按钮将于2026-05-09首次显示'
    );
    expect(page.generatePlanStartHint('2026-05-10')).toBe(
      '计划将从2026-05-10开始，首页打卡按钮将于2026-05-10首次显示'
    );
    expect(page.generatePlanStartHint('2026-05-08')).toBe('');
  });

  test('修改已开始策略时开始时间默认今天', () => {
    const baseHabit = {
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15,
      strategy: { duration: 15, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-05-09' }
    };

    page.openEditStrategyModal(baseHabit);
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('today');
    expect(page.data.planStartDateCustom).toBe('');
    expect(page.data.isEditingStrategy).toBe(true);
    expect(page.data.planStartNeedsReselect).toBe(false);

    page.openEditStrategyModal({
      ...baseHabit,
      strategy: { ...baseHabit.strategy, startDate: '2026-05-01' }
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
      strategy: { duration: 15, frequencyType: 'daily', frequencyConfig: { intervalDays: 1 }, startDate: '2026-05-10' }
    };

    page.openEditStrategyModal(baseHabit);
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('tomorrow');
    expect(page.data.planStartDateCustom).toBe('');
    expect(page.data.planStartNeedsReselect).toBe(true);
    expect(page.data.planStartHint).toContain('2026-05-10');

    page.openEditStrategyModal({
      ...baseHabit,
      strategy: { ...baseHabit.strategy, startDate: '2026-05-18' }
    });
    expect(page.data.planStartType).toBe('custom');
    expect(page.data.planStartDate).toBe('custom');
    expect(page.data.planStartDateCustom).toBe('2026-05-18');
    expect(page.data.planStartNeedsReselect).toBe(true);
  });

  test('首次打开选择日期时直接定位到今天', () => {
    page.openAddStrategyModal({
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15
    });

    page.openPlanStartDatePicker();

    expect(page.data.planStartDatePickerTempValue).toBe('2026-05-09');
    expect(page.data.planStartDatePickerValue).toEqual([10, 4, 8]);
    expect(page.data.planStartDateYears[10]).toBe(2026);
    expect(page.data.planStartDateMonths[4]).toBe(5);
    expect(page.data.planStartDateDays[8]).toBe(9);
    expect(wx.nextTick).toHaveBeenCalled();
    expect(page.data.showPlanStartDatePickerModal).toBe(true);
    expect(page.data.planStartDatePickerReady).toBe(true);
  });

  test('已有自定义开始日期时再次打开选择器定位到该日期', () => {
    page.openAddStrategyModal({
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15
    });
    page.data.planStartDate = 'custom';
    page.data.planStartDateCustom = '2026-05-18';

    page.openPlanStartDatePicker();

    expect(page.data.planStartDatePickerTempValue).toBe('2026-05-18');
    expect(page.data.planStartDatePickerValue).toEqual([10, 4, 17]);
  });

  test('选择日期滚动时同步更新 picker 索引用于选中态样式', () => {
    page.openAddStrategyModal({
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15
    });
    page.openPlanStartDatePicker();

    page.onPlanStartDatePickerChange({
      detail: {
        value: [10, 6, 29]
      }
    });

    expect(page.data.planStartDatePickerValue).toEqual([10, 6, 29]);
    expect(page.data.planStartDatePickerTempValue).toBe('2026-07-30');
  });

  test('关闭开始日期选择器时销毁 picker-view，下次重新按当前日期创建', () => {
    page.openAddStrategyModal({
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15
    });

    page.openPlanStartDatePicker();
    page.closePlanStartDatePicker();

    expect(page.data.showPlanStartDatePickerModal).toBe(false);
    expect(page.data.planStartDatePickerReady).toBe(false);
  });

  test('选择日期确认今天后展示开始日期提示文案', () => {
    page.openAddStrategyModal({
      _id: 'habit-1',
      title: '八段锦',
      category: '运动类',
      default_duration: 15,
      createdAt: '2026-05-09'
    });
    page.openPlanStartDatePicker();
    page.confirmPlanStartDatePicker();

    expect(page.data.planStartDate).toBe('custom');
    expect(page.data.planStartDateCustom).toBe('2026-05-09');
    expect(page.data.planStartHint).toBe(
      '计划将从2026-05-09开始，首页打卡按钮将于2026-05-09首次显示'
    );
    expect(page.data.planStartNeedsReselect).toBe(false);
  });
});
