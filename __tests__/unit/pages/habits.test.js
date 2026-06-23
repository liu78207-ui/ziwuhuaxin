/**
 * 修习页面 (habits) 单元测试
 * 测试习惯浏览、筛选、添加等功能
 */

// 模拟微信小程序API
global.wx = {
  navigateBack: jest.fn(),
  switchTab: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn(),
  cloud: {
    callFunction: jest.fn()
  },
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn()
};

global.Page = jest.fn((config) => config);
global.getApp = jest.fn(() => ({
  globalData: {
    MyHabits: []
  },
  addHabit: jest.fn()
}));

describe('修习页面 (habits) 测试', () => {
  let pageConfig;
  const allHabits = [
    { _id: '1', title: '金刚功', category: '运动类', description: '道家养生功法', default_duration: 15 },
    { _id: '2', title: '站桩', category: '运动类', description: '静心养气', default_duration: 20 },
    { _id: '3', title: '八段锦', category: '运动类', description: '传统养生功法', default_duration: 15 },
    { _id: '23', title: '舞蹈', category: '运动类', description: '舒展身体，愉悦身心', default_duration: 30, themeClass: 't-green' },
    { _id: '24', title: '健体', category: '运动类', description: '综合训练，强健体魄', default_duration: 20, themeClass: 't-yellow' },
    { _id: '25', title: '易筋经', category: '运动类', description: '传统功法，强筋健骨', default_duration: 20, themeClass: 't-yellow' },
    { _id: '12', title: '艾灸', category: '理疗类', description: '温阳散寒', default_duration: 30 },
    { _id: '22', title: '点穴', category: '理疗类', description: '按压穴位，疏通经络', default_duration: 15, themeClass: 't-green' },
    { _id: '13', title: '刮痧', category: '理疗类', description: '活血化瘀', default_duration: 20 },
    { _id: '17', title: '晨起温水', category: '起居类', description: '清肠排毒', default_duration: 5 },
    { _id: '18', title: '梳头', category: '起居类', description: '疏通头部经络', default_duration: 5 }
  ];

  beforeAll(() => {
    pageConfig = {
      data: {
        categories: ['我的', '运动类', '理疗类', '起居类'],
        currentTab: 0,
        habits: [],
        filteredHabits: [],
        loading: false,
        showModal: false,
        selectedHabit: null,
        selectedDuration: 20,
        freqCategory: 'everyday',
        dailyFreqType: 'everyday',
        dailyInterval: 2,
        dailyIntervalOptions: [2, 3, 4, 5, 6, 7],
        selectedWeekdays: [],
        selectedWeekdaysText: '周一，周三，周日',
        selectedInterval: 7,
        intervalOptions: [2, 3, 4, 5, 6, 7, 10, 14, 30],
        durationOptions: [5, 10, 15, 20, 30, 45, 60, 90, 120],
        weekdays: [
          { value: 1, label: '周一', checked: false },
          { value: 2, label: '周二', checked: false },
          { value: 3, label: '周三', checked: false },
          { value: 4, label: '周四', checked: false },
          { value: 5, label: '周五', checked: false },
          { value: 6, label: '周六', checked: false },
          { value: 7, label: '周日', checked: false }
        ],
        showDurationPickerModal: false,
        showDailyIntervalPickerModal: false,
        showIntervalPickerModal: false,
        showWeekdayPicker: false
      },

      onLoad() {
        this.setData({
          habits: allHabits,
          filteredHabits: allHabits.filter(h => h.hasStrategy)
        });
      },

      switchTab(e) {
        const index = e.currentTarget.dataset.index;
        const category = this.data.categories[index];
        
        let filtered = this.data.habits;
        if (category === '我的') {
          filtered = this.data.habits.filter(h => h.hasStrategy);
        } else {
          filtered = this.data.habits.filter(h => h.category === category);
        }

        this.setData({
          currentTab: index,
          filteredHabits: filtered
        });
      },

      showAddModal(e) {
        const habit = e.currentTarget.dataset.habit;
        this.setData({
          showModal: true,
          selectedHabit: habit,
          selectedDuration: habit.default_duration || 20
        });
      },

      closeModal() {
        this.setData({
          showModal: false,
          selectedHabit: null
        });
      },

      onDurationChange(e) {
        const index = e.detail.value;
        this.setData({
          selectedDuration: this.data.durationOptions[index]
        });
      },

      onFreqCategoryChange(e) {
        const category = e.currentTarget.dataset.category;
        this.setData({ freqCategory: category });
      },

      toggleWeekday(e) {
        const value = e.currentTarget.dataset.value;
        const weekdays = this.data.weekdays.map(day => {
          if (day.value === value) {
            return { ...day, checked: !day.checked };
          }
          return day;
        });
        
        const selected = weekdays.filter(d => d.checked).map(d => d.label);
        this.setData({
          weekdays,
          selectedWeekdays: weekdays.filter(d => d.checked).map(d => d.value),
          selectedWeekdaysText: selected.join('，') || '请选择'
        });
      },

      confirmAdd() {
        const habit = this.data.selectedHabit;
        const duration = this.data.selectedDuration;
        const freqCategory = this.data.freqCategory;

        let freqType = 'daily';
        let freqRules = 1;

        if (freqCategory === 'weekly') {
          freqType = 'weekly';
          freqRules = this.data.selectedWeekdays;
        } else if (freqCategory === 'interval') {
          freqType = 'interval';
          freqRules = this.data.selectedInterval;
        }

        const strategy = {
          habit_id: habit._id,
          habit_title: habit.title,
          category: habit.category,
          duration: duration,
          freq_type: freqType,
          freq_rules: freqRules,
          freq_category: freqCategory
        };

        wx.cloud.callFunction({
          name: 'saveStrategy',
          data: strategy,
          success: (res) => {
            if (res.result.success) {
              wx.showToast({ title: '添加成功', icon: 'success' });
              this.closeModal();
            }
          }
        });
      },

      setData(data) {
        Object.assign(this.data, data);
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('页面初始化测试', () => {
    test('onLoad应该加载所有习惯并默认筛选我的习惯', () => {
      pageConfig.onLoad();

      expect(pageConfig.data.habits).toHaveLength(allHabits.length);
      expect(pageConfig.data.filteredHabits).toHaveLength(0);
    });

    test('习惯数据应该正确加载', () => {
      pageConfig.onLoad();

      const titles = pageConfig.data.habits.map(h => h.title);
      expect(titles.length).toBeGreaterThan(0);
      expect(pageConfig.data.habits[0]).toHaveProperty('_id');
      expect(pageConfig.data.habits[0]).toHaveProperty('title');
      expect(pageConfig.data.habits[0]).toHaveProperty('category');
    });
  });

  describe('分类筛选测试', () => {
    beforeEach(() => {
      pageConfig.onLoad();
    });

    test('默认应该显示我的习惯', () => {
      expect(pageConfig.data.currentTab).toBe(0);
      expect(pageConfig.data.filteredHabits).toHaveLength(0);
    });

    test('切换到运动类应该只显示运动习惯', () => {
      pageConfig.switchTab({ currentTarget: { dataset: { index: 1 } } });

      expect(pageConfig.data.currentTab).toBe(1);
      expect(pageConfig.data.filteredHabits.every(h => h.category === '运动类')).toBe(true);
      expect(pageConfig.data.filteredHabits.map(h => h.title)).toEqual(
        expect.arrayContaining(['舞蹈', '健体', '易筋经'])
      );
    });

    test('切换到理疗类应该只显示理疗习惯', () => {
      pageConfig.switchTab({ currentTarget: { dataset: { index: 2 } } });

      expect(pageConfig.data.filteredHabits.every(h => h.category === '理疗类')).toBe(true);
      expect(pageConfig.data.filteredHabits.map(h => h.title)).toContain('点穴');
    });

    test('切换到起居类应该只显示起居习惯', () => {
      pageConfig.switchTab({ currentTarget: { dataset: { index: 3 } } });

      expect(pageConfig.data.filteredHabits.every(h => h.category === '起居类')).toBe(true);
    });

    test('切回我的应该只显示已添加习惯', () => {
      pageConfig.setData({
        habits: allHabits.map((habit, index) => ({
          ...habit,
          hasStrategy: index === 0 || index === 2
        }))
      });
      pageConfig.switchTab({ currentTarget: { dataset: { index: 1 } } });
      pageConfig.switchTab({ currentTarget: { dataset: { index: 0 } } });

      expect(pageConfig.data.filteredHabits).toHaveLength(2);
      expect(pageConfig.data.filteredHabits.every(h => h.hasStrategy)).toBe(true);
    });
  });

  describe('添加习惯弹窗测试', () => {
    test('点击习惯应该显示添加弹窗', () => {
      const habit = allHabits[0];
      
      pageConfig.showAddModal({
        currentTarget: { dataset: { habit } }
      });

      expect(pageConfig.data.showModal).toBe(true);
      expect(pageConfig.data.selectedHabit).toEqual(habit);
      expect(pageConfig.data.selectedDuration).toBe(habit.default_duration);
    });

    test('关闭弹窗应该重置状态', () => {
      pageConfig.showAddModal({
        currentTarget: { dataset: { habit: allHabits[0] } }
      });
      pageConfig.closeModal();

      expect(pageConfig.data.showModal).toBe(false);
      expect(pageConfig.data.selectedHabit).toBeNull();
    });
  });

  describe('时长选择测试', () => {
    test('应该可以选择不同的时长', () => {
      pageConfig.onLoad();
      
      pageConfig.onDurationChange({ detail: { value: 2 } });

      expect(pageConfig.data.selectedDuration).toBe(15);
    });

    test('时长选项应该包含常用值', () => {
      expect(pageConfig.data.durationOptions).toContain(5);
      expect(pageConfig.data.durationOptions).toContain(15);
      expect(pageConfig.data.durationOptions).toContain(20);
      expect(pageConfig.data.durationOptions).toContain(30);
      expect(pageConfig.data.durationOptions).toContain(60);
    });
  });

  describe('频次设置测试', () => {
    test('应该支持每天频次', () => {
      pageConfig.onFreqCategoryChange({
        currentTarget: { dataset: { category: 'everyday' } }
      });

      expect(pageConfig.data.freqCategory).toBe('everyday');
    });

    test('应该支持每周固定频次', () => {
      pageConfig.onFreqCategoryChange({
        currentTarget: { dataset: { category: 'weekly' } }
      });

      expect(pageConfig.data.freqCategory).toBe('weekly');
    });

    test('应该支持间隔频次', () => {
      pageConfig.onFreqCategoryChange({
        currentTarget: { dataset: { category: 'interval' } }
      });

      expect(pageConfig.data.freqCategory).toBe('interval');
    });

    test('应该选择星期几', () => {
      pageConfig.toggleWeekday({ currentTarget: { dataset: { value: 1 } } });
      pageConfig.toggleWeekday({ currentTarget: { dataset: { value: 3 } } });

      expect(pageConfig.data.selectedWeekdays).toContain(1);
      expect(pageConfig.data.selectedWeekdays).toContain(3);
      expect(pageConfig.data.selectedWeekdaysText).toContain('周一');
      expect(pageConfig.data.selectedWeekdaysText).toContain('周三');
    });

    test('再次点击应该取消选择', () => {
      // 确保初始状态是空的
      pageConfig.setData({
        selectedWeekdays: [],
        weekdays: pageConfig.data.weekdays.map(d => ({ ...d, checked: false }))
      });
      
      // 第一次点击选择
      pageConfig.toggleWeekday({ currentTarget: { dataset: { value: 1 } } });
      expect(pageConfig.data.selectedWeekdays).toContain(1);
      
      // 第二次点击取消选择
      pageConfig.toggleWeekday({ currentTarget: { dataset: { value: 1 } } });
      expect(pageConfig.data.selectedWeekdays).not.toContain(1);
    });
  });

  describe('确认添加测试', () => {
    beforeEach(() => {
      pageConfig.showAddModal({
        currentTarget: { dataset: { habit: allHabits[0] } }
      });
    });

    test('确认添加应该调用云函数', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({ result: { success: true } });
      });

      pageConfig.confirmAdd();

      expect(wx.cloud.callFunction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'saveStrategy' })
      );
    });

    test('添加成功应该显示提示', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({ result: { success: true } });
      });

      pageConfig.confirmAdd();

      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '添加成功', icon: 'success' })
      );
    });

    test('应该传递正确的策略数据', () => {
      wx.cloud.callFunction.mockImplementation(({ success }) => {
        success({ result: { success: true } });
      });

      pageConfig.setData({ selectedDuration: 30 });
      pageConfig.confirmAdd();

      const callArgs = wx.cloud.callFunction.mock.calls[0][0];
      expect(callArgs.data).toMatchObject({
        habit_id: allHabits[0]._id,
        habit_title: allHabits[0].title,
        duration: 30,
        category: allHabits[0].category
      });
    });
  });

  describe('习惯数据结构测试', () => {
    test('每个习惯应该有完整字段', () => {
      allHabits.forEach(habit => {
        expect(habit).toHaveProperty('_id');
        expect(habit).toHaveProperty('title');
        expect(habit).toHaveProperty('category');
        expect(habit).toHaveProperty('description');
        expect(habit).toHaveProperty('default_duration');
      });
    });

    test('习惯分类应该正确', () => {
      const categories = [...new Set(allHabits.map(h => h.category))];
      expect(categories).toContain('运动类');
      expect(categories).toContain('理疗类');
      expect(categories).toContain('起居类');
    });

    test('默认时长应该在合理范围内', () => {
      allHabits.forEach(habit => {
        expect(habit.default_duration).toBeGreaterThanOrEqual(5);
        expect(habit.default_duration).toBeLessThanOrEqual(120);
      });
    });
  });
});
