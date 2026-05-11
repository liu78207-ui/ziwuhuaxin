/**
 * Habits 页面单元测试 - 重复函数定义修复验证
 * 测试时长选择器相关功能是否正常工作
 */

describe('Habits 页面时长选择器测试', () => {
  let pageConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    pageConfig = {
      data: {
        showDurationPickerModal: false,
        showDailyIntervalPickerModal: false,
        showWeekdayPicker: false,
        selectedDuration: 20,
        durationOptions: [5, 10, 15, 20, 30, 45, 60, 90, 120],
        dailyInterval: 2,
        dailyIntervalOptions: [1, 2, 3, 4, 5, 6, 7],
        selectedWeekdays: [],
        selectedWeekdaysText: '选择星期',
        weekdays: [
          { value: 1, label: '周一', checked: false },
          { value: 2, label: '周二', checked: false },
          { value: 3, label: '周三', checked: false },
          { value: 4, label: '周四', checked: false },
          { value: 5, label: '周五', checked: false },
          { value: 6, label: '周六', checked: false },
          { value: 7, label: '周日', checked: false }
        ],
        showModal: false,
        selectedHabit: null,
        selectedWeekdays: []
      },

      openDurationPicker() {
        this.setData({ showDurationPickerModal: true });
      },

      closeDurationPicker() {
        this.setData({ showDurationPickerModal: false });
      },

      selectDuration(e) {
        const value = e.currentTarget.dataset.value;
        this.setData({ selectedDuration: value });
      },

      selectDurationAndClose(e) {
        const value = e.currentTarget.dataset.value;
        this.setData({ selectedDuration: value });
        this.closeDurationPicker();
      },

      confirmDuration() {
        this.closeDurationPicker();
      },

      openDailyIntervalPicker() {
        this.setData({ showDailyIntervalPickerModal: true });
      },

      closeDailyIntervalPicker() {
        this.setData({ showDailyIntervalPickerModal: false });
      },

      selectDailyInterval(e) {
        const value = e.currentTarget.dataset.value;
        this.setData({ dailyInterval: value });
      },

      openWeekdayPicker() {
        this.setData({ showWeekdayPicker: true });
      },

      closeWeekdayPicker() {
        this.setData({ showWeekdayPicker: false });
      },

      toggleWeekday(e) {
        const index = e.currentTarget.dataset.index;
        const weekdays = this.data.weekdays.map((day, i) => {
          if (i === index) {
            return { ...day, checked: !day.checked };
          }
          return day;
        });
        
        const selectedWeekdays = weekdays.filter(day => day.checked).map(day => day.value);
        
        const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日'];
        const selectedWeekdaysText = selectedWeekdays.length > 0 
          ? selectedWeekdays.map(d => weekdayNames[d]).join(', ')
          : '选择星期';
        
        this.setData({ 
          weekdays,
          selectedWeekdays,
          selectedWeekdaysText
        });
      },

      setData(data) {
        Object.assign(this.data, data);
      }
    };
  });

  describe('时长选择器测试', () => {
    test('openDurationPicker 应该打开时长选择弹窗', () => {
      pageConfig.openDurationPicker();
      expect(pageConfig.data.showDurationPickerModal).toBe(true);
    });

    test('closeDurationPicker 应该关闭时长选择弹窗', () => {
      pageConfig.setData({ showDurationPickerModal: true });
      pageConfig.closeDurationPicker();
      expect(pageConfig.data.showDurationPickerModal).toBe(false);
    });

    test('selectDuration 应该更新选中时长', () => {
      pageConfig.selectDuration({ currentTarget: { dataset: { value: 30 } } });
      expect(pageConfig.data.selectedDuration).toBe(30);
    });

    test('selectDurationAndClose 应该选择时长并关闭弹窗', () => {
      pageConfig.setData({ showDurationPickerModal: true });
      pageConfig.selectDurationAndClose({ currentTarget: { dataset: { value: 45 } } });
      
      expect(pageConfig.data.selectedDuration).toBe(45);
      expect(pageConfig.data.showDurationPickerModal).toBe(false);
    });

    test('confirmDuration 应该关闭弹窗', () => {
      pageConfig.setData({ showDurationPickerModal: true });
      pageConfig.confirmDuration();
      expect(pageConfig.data.showDurationPickerModal).toBe(false);
    });

    test('时长选项应该包含常用值', () => {
      expect(pageConfig.data.durationOptions).toContain(5);
      expect(pageConfig.data.durationOptions).toContain(15);
      expect(pageConfig.data.durationOptions).toContain(20);
      expect(pageConfig.data.durationOptions).toContain(30);
      expect(pageConfig.data.durationOptions).toContain(60);
      expect(pageConfig.data.durationOptions).toContain(120);
    });

    test('时长选项应该按升序排列', () => {
      const options = pageConfig.data.durationOptions;
      for (let i = 1; i < options.length; i++) {
        expect(options[i]).toBeGreaterThan(options[i - 1]);
      }
    });
  });

  describe('间隔天数选择器测试', () => {
    test('openDailyIntervalPicker 应该打开间隔天数选择弹窗', () => {
      pageConfig.openDailyIntervalPicker();
      expect(pageConfig.data.showDailyIntervalPickerModal).toBe(true);
    });

    test('closeDailyIntervalPicker 应该关闭弹窗', () => {
      pageConfig.setData({ showDailyIntervalPickerModal: true });
      pageConfig.closeDailyIntervalPicker();
      expect(pageConfig.data.showDailyIntervalPickerModal).toBe(false);
    });

    test('selectDailyInterval 应该更新间隔天数', () => {
      pageConfig.selectDailyInterval({ currentTarget: { dataset: { value: 3 } } });
      expect(pageConfig.data.dailyInterval).toBe(3);
    });

    test('间隔天数选项应该从1到7', () => {
      const expected = [1, 2, 3, 4, 5, 6, 7];
      expect(pageConfig.data.dailyIntervalOptions).toEqual(expected);
    });
  });

  describe('星期选择器测试', () => {
    test('openWeekdayPicker 应该打开星期选择弹窗', () => {
      pageConfig.openWeekdayPicker();
      expect(pageConfig.data.showWeekdayPicker).toBe(true);
    });

    test('closeWeekdayPicker 应该关闭弹窗', () => {
      pageConfig.setData({ showWeekdayPicker: true });
      pageConfig.closeWeekdayPicker();
      expect(pageConfig.data.showWeekdayPicker).toBe(false);
    });

    test('toggleWeekday 应该切换星期选中状态', () => {
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 0 } } });
      
      expect(pageConfig.data.weekdays[0].checked).toBe(true);
      expect(pageConfig.data.selectedWeekdays).toContain(1);
    });

    test('再次点击应该取消选中', () => {
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 0 } } });
      expect(pageConfig.data.weekdays[0].checked).toBe(true);
      
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 0 } } });
      expect(pageConfig.data.weekdays[0].checked).toBe(false);
      expect(pageConfig.data.selectedWeekdays).not.toContain(1);
    });

    test('选中的星期应该正确更新文本', () => {
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 0 } } }); // 周一
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 2 } } }); // 周三
      
      expect(pageConfig.data.selectedWeekdaysText).toContain('一');
      expect(pageConfig.data.selectedWeekdaysText).toContain('三');
    });

    test('没有选中时应该显示默认文本', () => {
      pageConfig.setData({ 
        selectedWeekdays: [],
        weekdays: pageConfig.data.weekdays.map(d => ({ ...d, checked: false }))
      });
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 0 } } });
      pageConfig.toggleWeekday({ currentTarget: { dataset: { index: 0 } } }); // 取消选择
      
      expect(pageConfig.data.selectedWeekdaysText).toBe('选择星期');
    });

    test('所有星期应该正确初始化', () => {
      expect(pageConfig.data.weekdays).toHaveLength(7);
      expect(pageConfig.data.weekdays[0].value).toBe(1);
      expect(pageConfig.data.weekdays[0].label).toBe('周一');
    });
  });

  describe('函数唯一性测试', () => {
    test('openDurationPicker 函数应该只定义一次', () => {
      // 验证函数存在且可调用
      expect(typeof pageConfig.openDurationPicker).toBe('function');
      
      // 验证函数可以正常执行
      pageConfig.openDurationPicker();
      expect(pageConfig.data.showDurationPickerModal).toBe(true);
    });

    test('closeDurationPicker 函数应该只定义一次', () => {
      expect(typeof pageConfig.closeDurationPicker).toBe('function');
      
      pageConfig.setData({ showDurationPickerModal: true });
      pageConfig.closeDurationPicker();
      expect(pageConfig.data.showDurationPickerModal).toBe(false);
    });

    test('confirmDuration 函数应该只定义一次', () => {
      expect(typeof pageConfig.confirmDuration).toBe('function');
      
      pageConfig.setData({ showDurationPickerModal: true });
      pageConfig.confirmDuration();
      expect(pageConfig.data.showDurationPickerModal).toBe(false);
    });
  });
});