/**
 * 测试数据构造脚本
 * 
 * 使用方式：
 * 1. 在小程序启动后，在控制台执行:
 *    const testData = require('./test-data.js'); testData.init();
 * 
 * 2. 或在任意页面 onLoad 中添加:
 *    const testData = require('../../test-data.js'); testData.init();
 * 
 * 功能：
 * 1. 清空本地存储和云数据库
 * 2. 构造多条大场景测试数据
 */

const TEST_HABITS = [
  { habitId: 'h001', name: '金刚功', category: '运动类', targetMinutes: 20, themeClass: 't-red' },
  { habitId: 'h002', name: '八段锦', category: '运动类', targetMinutes: 15, themeClass: 't-yellow' },
  { habitId: 'h003', name: '站桩', category: '运动类', targetMinutes: 30, themeClass: 't-green' },
  { habitId: 'h004', name: '快走', category: '运动类', targetMinutes: 30, themeClass: 't-blue' },
  { habitId: 'h005', name: '艾灸', category: '理疗类', targetMinutes: 40, themeClass: 't-red' },
  { habitId: 'h006', name: '刮痧', category: '理疗类', targetMinutes: 30, themeClass: 't-purple' },
  { habitId: 'h007', name: '推拿', category: '理疗类', targetMinutes: 30, themeClass: 't-orange' },
  { habitId: 'h008', name: '睡前泡脚', category: '起居类', targetMinutes: 20, themeClass: 't-blue' },
  { habitId: 'h009', name: '揉腹', category: '起居类', targetMinutes: 10, themeClass: 't-yellow' },
  { habitId: 'h010', name: '经络拍打', category: '起居类', targetMinutes: 15, themeClass: 't-green' }
];

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const generateUUID = () => {
  return 'xxxxxxxxxxxx'.replace(/x/g, () => 
    Math.floor(Math.random() * 16).toString(16)
  );
};

/**
 * 场景1：正常使用场景
 * - 3个习惯（每日、间隔、每周固定）
 * - 连续打卡记录
 */
const createScenario1 = () => {
  const today = new Date();
  const logs = [];
  
  // 金刚功 - 每日 - 连续打卡15天
  for (let i = 14; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    logs.push({
      logId: `log_s1_${i}`,
      habitId: 'h001',
      date: formatDate(date),
      timestamp: date.getTime(),
      sync_status: 1
    });
  }
  
  // 八段锦 - 间隔2天 - 连续打卡10天（每3天一次）
  let count = 0;
  for (let i = 20; i >= 0 && count < 10; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if ((20 - i) % 3 === 0) {
      logs.push({
        logId: `log_s1_h002_${count}`,
        habitId: 'h002',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
      count++;
    }
  }
  
  // 站桩 - 每周一三五 - 连续打卡8次
  let weekCount = 0;
  for (let i = 30; i >= 0 && weekCount < 8; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dayOfWeek = date.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if ([1, 3, 5].includes(targetDay)) {
      logs.push({
        logId: `log_s1_h003_${weekCount}`,
        habitId: 'h003',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
      weekCount++;
    }
  }
  
  const habits = [
    { ...TEST_HABITS[0], freq_type: 'daily', freq_rules: 1, freq_category: 'everyday', createdAt: formatDate(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)), plan_start_date: formatDate(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)) },
    { ...TEST_HABITS[1], freq_type: 'interval', freq_rules: 2, freq_category: 'daily-interval', createdAt: formatDate(new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000)), plan_start_date: formatDate(new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000)) },
    { ...TEST_HABITS[2], freq_type: 'weekly', freq_rules: [1, 3, 5], freq_category: 'weekly', createdAt: formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)), plan_start_date: formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) }
  ];
  
  return { habits, logs, name: '正常使用场景（连续打卡）' };
};

/**
 * 场景2：中断后恢复场景
 * - 习惯打卡中断后重新开始
 */
const createScenario2 = () => {
  const today = new Date();
  const logs = [];
  
  // 艾灸 - 间隔3天 - 前期连续7天，中断10天，再连续5天
  const startDate1 = new Date(today);
  startDate1.setDate(today.getDate() - 25);
  
  // 前7天连续打卡
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate1);
    date.setDate(startDate1.getDate() + i * 4);
    if (date <= today) {
      logs.push({
        logId: `log_s2_h005_a${i}`,
        habitId: 'h005',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
    }
  }
  
  // 10天后重新开始
  const restartDate = new Date(today);
  restartDate.setDate(today.getDate() - 5);
  
  for (let i = 0; i < 5; i++) {
    const date = new Date(restartDate);
    date.setDate(restartDate.getDate() + i * 4);
    if (date <= today) {
      logs.push({
        logId: `log_s2_h005_b${i}`,
        habitId: 'h005',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
    }
  }
  
  const habits = [
    { ...TEST_HABITS[4], freq_type: 'interval', freq_rules: 3, freq_category: 'daily-interval', createdAt: formatDate(startDate1), plan_start_date: formatDate(startDate1) }
  ];
  
  return { habits, logs, name: '中断后恢复场景' };
};

/**
 * 场景3：部分完成场景
 * - 多个习惯，部分完成率高，部分完成率低
 */
const createScenario3 = () => {
  const today = new Date();
  const logs = [];
  
  // 刮痧 - 每周固定 - 低完成率（约40%）
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 30);
  
  let checkCount = 0;
  for (let i = 0; i < 30 && checkCount < 4; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dayOfWeek = date.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if ([2, 4, 6].includes(targetDay)) {
      if (Math.random() > 0.5 && checkCount < 4) {
        logs.push({
          logId: `log_s3_h006_${checkCount}`,
          habitId: 'h006',
          date: formatDate(date),
          timestamp: date.getTime(),
          sync_status: 1
        });
        checkCount++;
      }
    }
  }
  
  // 推拿 - 每周固定 - 高完成率（约80%）
  checkCount = 0;
  for (let i = 0; i < 30 && checkCount < 8; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dayOfWeek = date.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if ([1, 3, 5].includes(targetDay)) {
      if (checkCount < 8) {
        logs.push({
          logId: `log_s3_h007_${checkCount}`,
          habitId: 'h007',
          date: formatDate(date),
          timestamp: date.getTime(),
          sync_status: 1
        });
        checkCount++;
      }
    }
  }
  
  const habits = [
    { ...TEST_HABITS[5], freq_type: 'weekly', freq_rules: [2, 4, 6], freq_category: 'weekly', createdAt: formatDate(startDate), plan_start_date: formatDate(startDate) },
    { ...TEST_HABITS[6], freq_type: 'weekly', freq_rules: [1, 3, 5], freq_category: 'weekly', createdAt: formatDate(startDate), plan_start_date: formatDate(startDate) }
  ];
  
  return { habits, logs, name: '部分完成场景' };
};

/**
 * 场景4：删除后重新添加场景
 * - 习惯删除后保留历史记录
 * - 重新添加后使用新策略
 */
const createScenario4 = () => {
  const today = new Date();
  const logs = [];
  
  // 睡前泡脚 - 每日 - 删除前打卡10天
  const startDate1 = new Date(today);
  startDate1.setDate(today.getDate() - 25);
  
  for (let i = 0; i < 10; i++) {
    const date = new Date(startDate1);
    date.setDate(startDate1.getDate() + i);
    if (date <= today) {
      logs.push({
        logId: `log_s4_h008_old_${i}`,
        habitId: 'h008',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1,
        deleted_at: formatDate(new Date(startDate1.getTime() + 15 * 24 * 60 * 60 * 1000))
      });
    }
  }
  
  // 揉腹 - 间隔2天 - 删除前打卡5次
  const startDate2 = new Date(today);
  startDate2.setDate(today.getDate() - 20);
  
  for (let i = 0; i < 5; i++) {
    const date = new Date(startDate2);
    date.setDate(startDate2.getDate() + i * 3);
    if (date <= today) {
      logs.push({
        logId: `log_s4_h009_old_${i}`,
        habitId: 'h009',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
    }
  }
  
  // 重新添加揉腹 - 改为每周固定
  const restartDate = new Date(today);
  restartDate.setDate(today.getDate() - 3);
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(restartDate);
    date.setDate(restartDate.getDate() + i * 2);
    if (date <= today) {
      logs.push({
        logId: `log_s4_h009_new_${i}`,
        habitId: 'h009',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
    }
  }
  
  const habits = [
    { ...TEST_HABITS[7], freq_type: 'daily', freq_rules: 1, freq_category: 'everyday', createdAt: formatDate(startDate1), plan_start_date: formatDate(startDate1), isDeleted: true, deletedAt: formatDate(new Date(startDate1.getTime() + 15 * 24 * 60 * 60 * 1000)) },
    { ...TEST_HABITS[8], freq_type: 'weekly', freq_rules: [2, 4, 6], freq_category: 'weekly', createdAt: formatDate(startDate2), plan_start_date: formatDate(startDate2) }
  ];
  
  return { habits, logs, name: '删除后重新添加场景' };
};

/**
 * 场景5：长期坚持场景
 * - 单个习惯长期坚持
 * - 跨月、跨年数据
 */
const createScenario5 = () => {
  const today = new Date();
  const logs = [];
  
  // 经络拍打 - 每日 - 坚持60天
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 60);
  
  for (let i = 0; i < 60; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    if (date <= today) {
      logs.push({
        logId: `log_s5_h010_${i}`,
        habitId: 'h010',
        date: formatDate(date),
        timestamp: date.getTime(),
        sync_status: 1
      });
    }
  }
  
  const habits = [
    { ...TEST_HABITS[9], freq_type: 'daily', freq_rules: 1, freq_category: 'everyday', createdAt: formatDate(startDate), plan_start_date: formatDate(startDate) }
  ];
  
  return { habits, logs, name: '长期坚持场景（60天）' };
};

/**
 * 清空所有数据
 */
const clearAllData = async () => {
  console.log('开始清空数据...');
  
  // 清空本地存储
  try {
    wx.removeStorageSync('MyHabits');
    wx.removeStorageSync('CheckinLogs');
    wx.removeStorageSync('AllHabitsInfo');
    console.log('✓ 本地存储已清空');
  } catch (e) {
    console.error('清空本地存储失败:', e);
  }
  
  // 清空云数据库（需要云函数支持）
  try {
    const db = wx.cloud.database();
    const _ = db.command;
    
    // 删除用户策略
    const strategiesRes = await db.collection('user_strategies').where({
      _openid: wx.getStorageSync('user_openid')
    }).remove();
    console.log('✓ 云端策略已清空:', strategiesRes);
    
    // 删除打卡记录
    const logsRes = await db.collection('checkin_logs').where({
      _openid: wx.getStorageSync('user_openid')
    }).remove();
    console.log('✓ 云端打卡记录已清空:', logsRes);
    
    // 删除策略版本
    const versionsRes = await db.collection('user_strategy_versions').where({
      _openid: wx.getStorageSync('user_openid')
    }).remove();
    console.log('✓ 云端策略版本已清空:', versionsRes);
    
  } catch (e) {
    console.error('清空云数据库失败:', e);
  }
  
  console.log('数据清空完成！');
};

/**
 * 初始化测试数据
 * @param {number} scenario - 场景编号 (1-5)，或 0 表示全部
 */
const init = async (scenario = 0) => {
  console.log('='.repeat(50));
  console.log('开始构造测试数据...');
  console.log('='.repeat(50));
  
  const scenarios = [];
  
  if (scenario === 0 || scenario === 1) scenarios.push(createScenario1());
  if (scenario === 0 || scenario === 2) scenarios.push(createScenario2());
  if (scenario === 0 || scenario === 3) scenarios.push(createScenario3());
  if (scenario === 0 || scenario === 4) scenarios.push(createScenario4());
  if (scenario === 0 || scenario === 5) scenarios.push(createScenario5());
  
  // 合并所有场景的数据
  const allHabits = [];
  const allLogs = [];
  
  scenarios.forEach((s, idx) => {
    console.log(`\n场景${idx + 1}: ${s.name}`);
    console.log(`  - 习惯数: ${s.habits.length}`);
    console.log(`  - 打卡记录: ${s.logs.length}`);
    
    s.habits.forEach(h => {
      const existing = allHabits.find(existing => existing.habitId === h.habitId);
      if (!existing) {
        allHabits.push(h);
      }
    });
    
    allLogs.push(...s.logs);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log('数据汇总:');
  console.log(`  - 总习惯数: ${allHabits.length}`);
  console.log(`  - 总打卡记录: ${allLogs.length}`);
  console.log('='.repeat(50));
  
  // 保存到本地存储
  try {
    wx.setStorageSync('MyHabits', allHabits);
    wx.setStorageSync('CheckinLogs', allLogs);
    console.log('✓ 数据已保存到本地存储');
  } catch (e) {
    console.error('保存本地存储失败:', e);
  }
  
  // 尝试同步到云端
  try {
    const openid = wx.getStorageSync('user_openid');
    if (!openid) {
      console.log('⚠ openid 未获取，跳过云端同步');
      console.log('\n测试数据构造完成！');
      console.log('请先登录获取 openid，然后重新运行 init() 进行云端同步');
      return { habits: allHabits, logs: allLogs };
    }
    
    const db = wx.cloud.database();
    
    // 同步策略到云端
    console.log('\n开始同步到云端...');
    
    for (const habit of allHabits) {
      if (habit.isDeleted) continue;
      
      await db.collection('user_strategies').add({
        data: {
          _openid: openid,
          habit_id: habit.habitId,
          habit_title: habit.name,
          category: habit.category,
          duration: habit.targetMinutes,
          freq_type: habit.freq_type,
          freq_rules: habit.freq_rules,
          plan_start_date: habit.plan_start_date,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
    }
    console.log(`✓ 已同步 ${allHabits.filter(h => !h.isDeleted).length} 个策略到云端`);
    
    // 同步打卡记录到云端
    for (const log of allLogs) {
      await db.collection('checkin_logs').add({
        data: {
          _openid: openid,
          habit_id: log.habitId,
          checkin_date: log.date,
          created_at: new Date(log.timestamp),
          created_at_str: log.date
        }
      });
    }
    console.log(`✓ 已同步 ${allLogs.length} 条打卡记录到云端`);
    
  } catch (e) {
    console.error('云端同步失败:', e);
    console.log('数据已保存到本地，云端同步失败');
  }
  
  console.log('\n测试数据构造完成！');
  console.log('\n数据场景说明:');
  console.log('  场景1: 正常使用（每日/间隔/每周固定，连续打卡）');
  console.log('  场景2: 中断后恢复（间隔习惯打卡中断后重新开始）');
  console.log('  场景3: 部分完成（完成率40%和80%的对比）');
  console.log('  场景4: 删除后重新添加（保留历史记录，新策略）');
  console.log('  场景5: 长期坚持（60天连续打卡）');
  console.log('\n查看数据:');
  console.log('  MyHabits:', allHabits.length, '条');
  console.log('  CheckinLogs:', allLogs.length, '条');
  
  return { habits: allHabits, logs: allLogs };
};

/**
 * 仅清空数据
 */
const clear = async () => {
  await clearAllData();
};

/**
 * 打印当前数据状态
 */
const status = () => {
  try {
    const habits = wx.getStorageSync('MyHabits') || [];
    const logs = wx.getStorageSync('CheckinLogs') || [];
    const openid = wx.getStorageSync('user_openid') || '';
    
    console.log('='.repeat(50));
    console.log('当前数据状态:');
    console.log('  OpenID:', openid ? openid.substring(0, 10) + '...' : '未获取');
    console.log('  MyHabits:', habits.length, '条');
    console.log('  CheckinLogs:', logs.length, '条');
    
    if (habits.length > 0) {
      console.log('\n习惯列表:');
      habits.forEach((h, i) => {
        const deleted = h.isDeleted ? ' [已删除]' : '';
        const logCount = logs.filter(l => l.habitId === h.habitId).length;
        console.log(`  ${i + 1}. ${h.name} (${h.freq_type}) - ${logCount}次打卡${deleted}`);
      });
    }
    
    console.log('='.repeat(50));
    
    return { habits, logs, openid };
  } catch (e) {
    console.error('获取数据状态失败:', e);
  }
};

// 导出模块
module.exports = {
  init,
  clear,
  status,
  TEST_HABITS,
  formatDate,
  generateUUID,
  createScenario1,
  createScenario2,
  createScenario3,
  createScenario4,
  createScenario5
};

// 使用说明
console.log('='.repeat(50));
console.log('测试数据构造脚本');
console.log('='.repeat(50));
console.log('使用方式:');
console.log('  const testData = require("./test-data.js");');
console.log('');
console.log('  testData.status();     // 查看当前数据状态');
console.log('  testData.clear();      // 清空所有数据');
console.log('  testData.init(0);      // 构造全部5个场景的测试数据');
console.log('  testData.init(1);     // 仅构造场景1');
console.log('  testData.init(2);     // 仅构造场景2');
console.log('  ...');
console.log('');
console.log('场景说明:');
console.log('  场景1: 正常使用（每日/间隔/每周固定）');
console.log('  场景2: 中断后恢复');
console.log('  场景3: 部分完成（不同完成率）');
console.log('  场景4: 删除后重新添加');
console.log('  场景5: 长期坚持（60天）');
console.log('='.repeat(50));
