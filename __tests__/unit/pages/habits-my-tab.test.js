const fs = require('fs');
const path = require('path');

/**
 * 修习页面 - “我的”Tab 筛选测试
 */

describe('修习页面我的Tab', () => {
  let page;

  function loadHabitsPage() {
    jest.resetModules();
    global.Page.mockClear();
    global.getApp.mockReturnValue({
      globalData: { MyHabits: [] },
      getAllHabits: jest.fn(() => []),
      getSimulatedDateStr: jest.fn(() => '2026-05-09')
    });

    require('../../../miniprogram/pages/habits/habits.js');
    return global.Page.mock.results[0].value;
  }

  beforeEach(() => {
    page = loadHabitsPage();
  });

  test('第一个Tab文案为我的', () => {
    expect(page.data.categories[0]).toBe('我的');
  });

  test('顶部Tab展示文案不带分类后缀', () => {
    expect(page.data.categories).toEqual(['我的', '运动', '理疗', '起居', '自定义']);
  });

  test('我的Tab只显示已添加且正在进行的习惯', () => {
    const habits = [
      { _id: '1', title: '八段锦', category: '运动类', hasStrategy: true },
      { _id: '2', title: '艾灸', category: '理疗类' },
      { _id: '3', title: '梳头', category: '起居类', hasStrategy: true }
    ];

    const filtered = page.filterHabits(habits, 0);

    expect(filtered.map(h => h.title)).toEqual(['八段锦', '梳头']);
  });

  test('我的Tab按名称首字母排序且忽略置顶和添加时间', () => {
    const habits = [
      { _id: 'custom_z', title: '站桩', source: 'custom', category: '自定义', hasStrategy: true, addedAt: '2026-05-01T08:00:00.000Z' },
      { _id: '1', title: '艾灸', category: '理疗类', hasStrategy: true, pinnedAt: '2026-06-02T08:00:00.000Z', addedAt: '2026-05-04T08:00:00.000Z' },
      { _id: '2', title: '八段锦', category: '运动类', hasStrategy: true, addedAt: '2026-05-03T08:00:00.000Z' },
      { _id: '3', title: '晨起温水', category: '起居类', hasStrategy: true, pinnedAt: '2026-06-01T08:00:00.000Z', addedAt: '2026-05-02T08:00:00.000Z' }
    ];

    const filtered = page.filterHabits(habits, 0);

    expect(filtered.map(h => h.title)).toEqual(['艾灸', '八段锦', '晨起温水', '站桩']);
  });

  test('分类Tab仍按分类展示全部可添加习惯并按首字母排序', () => {
    const habits = [
      { _id: '1', title: '站桩', category: '运动类', hasStrategy: true },
      { _id: '2', title: '太极拳', category: '运动类' },
      { _id: '3', title: '八段锦', category: '运动类' },
      { _id: '4', title: '经络拍打', category: '理疗类' },
      { _id: '5', title: '艾灸', category: '理疗类' },
      { _id: '6', title: '点穴', category: '理疗类' },
      { _id: '7', title: '睡前泡脚', category: '起居类' },
      { _id: '8', title: '晨起温水', category: '起居类' },
      { _id: '9', title: '梳头', category: '起居类' }
    ];

    expect(page.filterHabits(habits, 1).map(h => h.title)).toEqual(['八段锦', '太极拳', '站桩']);
    expect(page.filterHabits(habits, 2).map(h => h.title)).toEqual(['艾灸', '点穴', '经络拍打']);
    expect(page.filterHabits(habits, 3).map(h => h.title)).toEqual(['晨起温水', '睡前泡脚', '梳头']);
  });

  test('我的Tab空状态提供添加入口', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/habits/habits.wxml'),
      'utf8'
    );

    expect(wxml).toContain('currentTab === 0 ? \'还没有添加习惯\'');
    expect(wxml).toContain('wx:if="{{currentTab === 0}}" bindtap="goAddFromMyTab"');
    expect(wxml).toContain('立即添加习惯');
    expect(wxml).toContain('custom-add-card');
    expect(wxml).toContain('custom-add-plus');

    page.data.habits = [
      { _id: '1', title: '八段锦', category: '运动类' },
      { _id: '12', title: '艾灸', category: '理疗类' }
    ];
    page.goAddFromMyTab();

    expect(page.data.currentTab).toBe(1);
    expect(page.data.filteredHabits.map(h => h.title)).toEqual(['八段锦']);
  });

  test('自定义Tab无习惯时显示一张添加卡片', () => {
    const filtered = page.filterHabits([], 4);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      _id: 'custom-add-card',
      isCustomAddCard: true,
      source: 'custom'
    });
  });

  test('自定义Tab有习惯时末尾保留添加卡片并使用统一图标', () => {
    const filtered = page.filterHabits([
      {
        _id: 'custom_1',
        name: '早睡',
        source: 'custom',
        category: '自定义',
        hasStrategy: true
      },
      {
        _id: '1',
        title: '八段锦',
        category: '运动类',
        hasStrategy: true
      }
    ], 4);

    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual(expect.objectContaining({
      _id: 'custom_1',
      title: '早睡',
      name: '早睡',
      iconUrl: '/assets/icons/habit-zidingyi.png'
    }));
    expect(filtered[1]).toEqual(expect.objectContaining({
      isCustomAddCard: true
    }));
  });

  test('自定义Tab按名称首字母排序且添加卡片始终在最后', () => {
    const filtered = page.filterHabits([
      { _id: 'custom_z', name: '站桩', source: 'custom', category: '自定义', hasStrategy: false },
      { _id: 'custom_c', name: '晨练', source: 'custom', category: '自定义', hasStrategy: true },
      { _id: 'custom_a', name: '艾灸', source: 'custom', category: '自定义', hasStrategy: true },
      { _id: 'custom_b', name: '八段锦', source: 'custom', category: '自定义', hasStrategy: true }
    ], 4);

    expect(filtered.map(h => h.title || h.name || h._id)).toEqual(['艾灸', '八段锦', '晨练', '站桩', 'custom-add-card']);
    expect(filtered[4]).toEqual(expect.objectContaining({
      isCustomAddCard: true
    }));
  });

  test('自定义Tab不因停用或再次启用时间改变排序', () => {
    const habits = [
      {
        _id: 'custom_z',
        name: '站桩',
        source: 'custom',
        category: '自定义',
        hasStrategy: true,
        addedAt: '2026-07-01T08:00:00.000Z',
        createdAt: '2026-07-01'
      },
      {
        _id: 'custom_a',
        name: '艾灸',
        source: 'custom',
        category: '自定义',
        hasStrategy: false,
        addedAt: '2026-07-06T08:00:00.000Z',
        createdAt: '2026-07-06'
      },
      {
        _id: 'custom_b',
        name: '八段锦',
        source: 'custom',
        category: '自定义',
        hasStrategy: true,
        addedAt: '2026-06-01T08:00:00.000Z',
        createdAt: '2026-06-01'
      }
    ];

    const before = page.filterHabits(habits, 4).map(h => h._id);
    const after = page.filterHabits(habits.map(h => h._id === 'custom_a'
      ? { ...h, hasStrategy: true, addedAt: '2026-07-07T08:00:00.000Z' }
      : h
    ), 4).map(h => h._id);

    expect(before).toEqual(['custom_a', 'custom_b', 'custom_z', 'custom-add-card']);
    expect(after).toEqual(before);
  });

  test('自定义Tab显示已停用的自定义库条目且我的Tab不显示', () => {
    const habits = [
      {
        _id: 'custom_1',
        name: '早睡',
        source: 'custom',
        category: '自定义',
        hasStrategy: false,
        strategy: null
      },
      {
        _id: '1',
        title: '八段锦',
        category: '运动类',
        hasStrategy: true
      }
    ];

    const customFiltered = page.filterHabits(habits, 4);
    const myFiltered = page.filterHabits(habits, 0);

    expect(customFiltered[0]).toEqual(expect.objectContaining({
      _id: 'custom_1',
      title: '早睡',
      hasStrategy: false,
      iconUrl: '/assets/icons/habit-zidingyi.png'
    }));
    expect(customFiltered[1]).toEqual(expect.objectContaining({
      isCustomAddCard: true
    }));
    expect(myFiltered.map(h => h._id)).toEqual(['1']);
  });

  test('我的Tab和官方分类Tab不显示自定义添加卡片', () => {
    const habits = [
      {
        _id: 'custom_1',
        title: '早睡',
        source: 'custom',
        category: '自定义',
        hasStrategy: true
      },
      {
        _id: '1',
        title: '八段锦',
        category: '运动类',
        hasStrategy: true
      }
    ];

    expect(page.filterHabits(habits, 0).some(h => h.isCustomAddCard)).toBe(false);
    expect(page.filterHabits(habits, 1).some(h => h.isCustomAddCard)).toBe(false);
  });

  test('点击自定义添加卡片打开添加弹窗', () => {
    page.openAddCustomHabitModal = jest.fn();

    page.openStrategyModal({
      currentTarget: {
        dataset: {
          habit: page.buildCustomAddCard()
        }
      }
    });

    expect(page.openAddCustomHabitModal).toHaveBeenCalled();
  });

  test('点击已停用自定义习惯打开再次启用弹窗', () => {
    page.openReactivateCustomHabitModal = jest.fn();

    page.openStrategyModal({
      currentTarget: {
        dataset: {
          habit: {
            _id: 'custom_1',
            title: '早睡',
            source: 'custom',
            category: '自定义',
            hasStrategy: false
          }
        }
      }
    });

    expect(page.openReactivateCustomHabitModal).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'custom_1',
      hasStrategy: false
    }));
  });

  test('官方习惯操作菜单使用编辑策略和删除习惯文案', () => {
    const menus = [];
    page.showCustomActionMenu = jest.fn((menu) => {
      menus.push(menu);
    });

    page.openStrategyModal({
      currentTarget: {
        dataset: {
          habit: {
            _id: '1',
            title: '八段锦',
            category: '运动类',
            hasStrategy: true,
            strategy: { userHabitId: 'uh_1' }
          }
        }
      }
    });
    page.openStrategyModal({
      currentTarget: {
        dataset: {
          habit: {
            _id: '2',
            title: '站桩',
            category: '运动类',
            hasStrategy: true,
            pinnedAt: '2026-06-01T08:00:00.000Z',
            strategy: { userHabitId: 'uh_2' }
          }
        }
      }
    });

    expect(menus[0].items.map(item => item.text)).toEqual(['编辑策略', '置顶习惯', '删除习惯']);
    expect(menus[1].items.map(item => item.text)).toEqual(['编辑策略', '取消置顶', '删除习惯']);
  });

  test('自定义习惯操作菜单使用编辑习惯和停用习惯文案', () => {
    const menus = [];
    page.showCustomActionMenu = jest.fn((menu) => {
      menus.push(menu);
    });

    page.openStrategyModal({
      currentTarget: {
        dataset: {
          habit: {
            _id: 'custom_1',
            title: '早睡',
            source: 'custom',
            category: '自定义',
            hasStrategy: true,
            strategy: { userHabitId: 'uh_custom_1' }
          }
        }
      }
    });

    expect(menus[0].items.map(item => item.text)).toEqual(['编辑习惯', '置顶习惯', '停用习惯']);
  });

  test('修习列表不显示置顶心形图标', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/habits/habits.wxml'),
      'utf8'
    );

    expect(wxml).not.toContain('habit-pin-tag');
    expect(wxml).not.toContain('habit-pin-icon');
  });

  test('策略弹窗标题和保存按钮文案按新增编辑状态切换', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/habits/habits.wxml'),
      'utf8'
    );

    expect(wxml).toContain('{{selectedHabit.title}}策略');
    expect(wxml).toContain('class="custom-title-input"');
    expect(wxml).toContain('填写习惯名称');
    expect(wxml).toContain("isSavingStrategy ? '保存中' : (isEditingStrategy ? '保存修改' : (isCustomHabitModal ? '保存习惯' : '保存策略'))");
    expect(wxml).toContain('保存策略');
    expect(wxml).toContain('保存习惯');
    expect(wxml).toContain('保存修改');
  });
});
