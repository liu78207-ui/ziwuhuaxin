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

  test('我的Tab只显示已添加且正在进行的习惯', () => {
    const habits = [
      { _id: '1', title: '八段锦', category: '运动类', hasStrategy: true },
      { _id: '2', title: '艾灸', category: '理疗类' },
      { _id: '3', title: '梳头', category: '起居类', hasStrategy: true }
    ];

    const filtered = page.filterHabits(habits, 0);

    expect(filtered.map(h => h.title)).toEqual(['八段锦', '梳头']);
  });

  test('分类Tab仍按分类展示全部可添加习惯', () => {
    const habits = [
      { _id: '1', title: '八段锦', category: '运动类', hasStrategy: true },
      { _id: '2', title: '太极拳', category: '运动类' },
      { _id: '3', title: '艾灸', category: '理疗类' }
    ];

    expect(page.filterHabits(habits, 1).map(h => h.title)).toEqual(['八段锦', '太极拳']);
    expect(page.filterHabits(habits, 2).map(h => h.title)).toEqual(['艾灸']);
  });

  test('我的Tab空状态提供添加入口', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../../miniprogram/pages/habits/habits.wxml'),
      'utf8'
    );

    expect(wxml).toContain('currentTab === 0 ? \'还没有添加习惯\' : \'暂无该分类习惯\'');
    expect(wxml).toContain('wx:if="{{currentTab === 0}}" bindtap="goAddFromMyTab"');
    expect(wxml).toContain('立即添加习惯');

    page.data.habits = [
      { _id: '1', title: '八段锦', category: '运动类' },
      { _id: '12', title: '艾灸', category: '理疗类' }
    ];
    page.goAddFromMyTab();

    expect(page.data.currentTab).toBe(1);
    expect(page.data.filteredHabits.map(h => h.title)).toEqual(['八段锦']);
  });
});
