/**
 * 图标映射工具函数单元测试
 * 测试习惯图标获取、主题分类等功能
 */

const iconMap = require('../../../miniprogram/utils/iconMap.js');

describe('iconMap 工具函数测试', () => {
  
  describe('getIconConfig 函数测试', () => {
    test('应该为已知习惯返回图标配置', () => {
      const result = iconMap.getIconConfig('金刚功');
      expect(result).toHaveProperty('iconUrl');
      expect(result).toHaveProperty('themeClass');
    });

    test('应该为火属性习惯返回t-red主题', () => {
      const result = iconMap.getIconConfig('金刚功');
      expect(result.themeClass).toBe('t-red');
      expect(iconMap.getIconConfig('跑步').themeClass).toBe('t-red');
      expect(iconMap.getIconConfig('跳绳').themeClass).toBe('t-red');
    });

    test('应该为木属性习惯返回t-green主题', () => {
      const result = iconMap.getIconConfig('站桩');
      expect(result.themeClass).toBe('t-green');
      expect(iconMap.getIconConfig('经络拍打').themeClass).toBe('t-green');
      expect(iconMap.getIconConfig('点穴').themeClass).toBe('t-green');
      expect(iconMap.getIconConfig('舞蹈').themeClass).toBe('t-green');
    });

    test('应该为土属性习惯返回t-yellow主题', () => {
      const result = iconMap.getIconConfig('八段锦');
      expect(result.themeClass).toBe('t-yellow');
      expect(iconMap.getIconConfig('健体').themeClass).toBe('t-yellow');
      expect(iconMap.getIconConfig('易筋经').themeClass).toBe('t-yellow');
    });

    test('应该为水属性习惯返回t-blue主题', () => {
      const result = iconMap.getIconConfig('太极拳');
      expect(result.themeClass).toBe('t-blue');
    });

    test('应该为特殊类习惯返回t-purple主题', () => {
      const result = iconMap.getIconConfig('瑜伽');
      expect(result.themeClass).toBe('t-purple');
    });

    test('未知习惯应该返回null', () => {
      const result = iconMap.getIconConfig('未知习惯');
      expect(result).toBeNull();
    });

    test('应该支持所有预定义的习惯', () => {
      const habits = [
        '金刚功', '快走', '艾灸', '睡前泡脚',
        '点穴', '舞蹈', '站桩', '跳绳', '刮痧', '揉腹',
        '八段锦', '健体', '易筋经', '五禽戏', '跑步', '推拿', '梳头',
        '太极拳', '游泳', '拔罐', '晨起温水',
        '瑜伽', '普拉提', '经络拍打', '叩齿'
      ];
      
      habits.forEach(habit => {
        const result = iconMap.getIconConfig(habit);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('iconUrl');
        expect(result).toHaveProperty('themeClass');
      });
    });
  });

  describe('getIconPath 函数测试', () => {
    test('应该返回正确的图标路径', () => {
      const result = iconMap.getIconPath('金刚功');
      expect(result).toBe('/assets/icons/habit-jinganggong.png');
    });

    test('未知习惯应该返回null', () => {
      const result = iconMap.getIconPath('未知习惯');
      expect(result).toBeNull();
    });
  });

  describe('getThemeClass 函数测试', () => {
    test('应该返回正确的主题类名', () => {
      expect(iconMap.getThemeClass('金刚功')).toBe('t-red');
      expect(iconMap.getThemeClass('站桩')).toBe('t-green');
      expect(iconMap.getThemeClass('八段锦')).toBe('t-yellow');
      expect(iconMap.getThemeClass('跑步')).toBe('t-red');
      expect(iconMap.getThemeClass('跳绳')).toBe('t-red');
      expect(iconMap.getThemeClass('经络拍打')).toBe('t-green');
      expect(iconMap.getThemeClass('点穴')).toBe('t-green');
      expect(iconMap.getThemeClass('舞蹈')).toBe('t-green');
      expect(iconMap.getThemeClass('健体')).toBe('t-yellow');
      expect(iconMap.getThemeClass('易筋经')).toBe('t-yellow');
    });

    test('未知习惯应该返回默认主题t-blue', () => {
      expect(iconMap.getThemeClass('未知习惯')).toBe('t-blue');
    });
  });

  describe('getThemeByCategory 函数测试', () => {
    test('运动类应该返回t-green', () => {
      expect(iconMap.getThemeByCategory('运动类')).toBe('t-green');
    });

    test('理疗类应该返回t-red', () => {
      expect(iconMap.getThemeByCategory('理疗类')).toBe('t-red');
    });

    test('起居类应该返回t-yellow', () => {
      expect(iconMap.getThemeByCategory('起居类')).toBe('t-yellow');
    });

    test('未知分类应该返回默认主题t-blue', () => {
      expect(iconMap.getThemeByCategory('未知分类')).toBe('t-blue');
    });
  });

  describe('HABIT_ICONS 数据结构测试', () => {
    test('应该包含所有习惯定义', () => {
      expect(Object.keys(iconMap.HABIT_ICONS).length).toBeGreaterThan(0);
    });

    test('每个习惯应该有file和theme属性', () => {
      Object.values(iconMap.HABIT_ICONS).forEach(config => {
        expect(config).toHaveProperty('file');
        expect(config).toHaveProperty('theme');
      });
    });

    test('图标文件名应该以habit-开头', () => {
      Object.values(iconMap.HABIT_ICONS).forEach(config => {
        expect(config.file).toMatch(/^habit-.*\.png$/);
      });
    });

    test('主题类名应该是有效的', () => {
      const validThemes = ['t-red', 't-green', 't-yellow', 't-blue', 't-purple'];
      Object.values(iconMap.HABIT_ICONS).forEach(config => {
        expect(validThemes).toContain(config.theme);
      });
    });
  });
});
