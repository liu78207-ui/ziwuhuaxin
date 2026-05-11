/**
 * 批量构造测试数据云函数
 * 
 * 直接在云数据库中创建测试数据
 * 
 * 使用方式：
 * wx.cloud.callFunction({
 *   name: 'initTestData',
 *   data: { scenario: 0 },
 *   success: res => console.log(res)
 * })
 * 
 * scenario: 0=全部场景, 1-5=单个场景
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 测试习惯定义
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

function saveHabitInfo(openid) {
  const promises = TEST_HABITS.map(h => {
    return db.collection('habits').where({
      _openid: openid,
      habit_id: h.habitId
    }).get().then(res => {
      if (res.data && res.data.length > 0) {
        return db.collection('habits').doc(res.data[0]._id).update({
          data: {
            name: h.name,
            category: h.category,
            target_minutes: h.targetMinutes,
            theme_class: h.themeClass
          }
        });
      } else {
        return db.collection('habits').add({
          data: {
            _openid: openid,
            habit_id: h.habitId,
            name: h.name,
            category: h.category,
            target_minutes: h.targetMinutes,
            theme_class: h.themeClass
          }
        });
      }
    });
  });
  return Promise.all(promises);
}

// 生成UUID
function generateUUID() {
  return 'xxxxxxxxxxxx'.replace(/x/g, () => 
    Math.floor(Math.random() * 16).toString(16)
  );
}

// 场景1：正常使用场景（连续打卡）
function createScenario1(openid) {
  const today = new Date();
  const strategies = [];
  const logs = [];

  // 金刚功 - 每日 - 连续打卡15天
  const h001Start = new Date(today);
  h001Start.setDate(today.getDate() - 14);
  
  strategies.push({
    _openid: openid,
    habit_id: 'h001',
    habit_title: '金刚功',
    category: '运动类',
    duration: 20,
    freq_type: 'daily',
    freq_rules: 1,
    freq_category: 'everyday',
    plan_start_date: formatDate(h001Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  for (let i = 0; i < 15; i++) {
    const date = new Date(h001Start);
    date.setDate(h001Start.getDate() + i);
    logs.push({
      _openid: openid,
      habit_id: 'h001',
      checkin_date: formatDate(date),
      created_at: new Date(date),
      created_at_str: formatDate(date)
    });
  }

  // 八段锦 - 间隔2天 - 连续打卡10次（每3天一次）
  const h002Start = new Date(today);
  h002Start.setDate(today.getDate() - 20);

  strategies.push({
    _openid: openid,
    habit_id: 'h002',
    habit_title: '八段锦',
    category: '运动类',
    duration: 15,
    freq_type: 'interval',
    freq_rules: 2,
    freq_category: 'daily-interval',
    plan_start_date: formatDate(h002Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  let count = 0;
  for (let i = 0; i <= 20 && count < 10; i++) {
    const date = new Date(h002Start);
    date.setDate(h002Start.getDate() + i);
    if (i % 3 === 0) {
      logs.push({
        _openid: openid,
        habit_id: 'h002',
        checkin_date: formatDate(date),
        created_at: new Date(date),
        created_at_str: formatDate(date)
      });
      count++;
    }
  }

  // 站桩 - 每周一三五 - 连续打卡8次
  const h003Start = new Date(today);
  h003Start.setDate(today.getDate() - 30);

  strategies.push({
    _openid: openid,
    habit_id: 'h003',
    habit_title: '站桩',
    category: '运动类',
    duration: 30,
    freq_type: 'weekly',
    freq_rules: [1, 3, 5],
    freq_category: 'weekly',
    plan_start_date: formatDate(h003Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  count = 0;
  for (let i = 0; i <= 30 && count < 8; i++) {
    const date = new Date(h003Start);
    date.setDate(h003Start.getDate() + i);
    const dayOfWeek = date.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if ([1, 3, 5].includes(targetDay)) {
      logs.push({
        _openid: openid,
        habit_id: 'h003',
        checkin_date: formatDate(date),
        created_at: new Date(date),
        created_at_str: formatDate(date)
      });
      count++;
    }
  }

  return { strategies, logs, name: '场景1: 正常使用场景' };
}

// 场景2：中断后恢复场景
function createScenario2(openid) {
  const today = new Date();
  const strategies = [];
  const logs = [];

  // 艾灸 - 间隔3天 - 前期连续7次，中断后重新开始5次
  const h005Start = new Date(today);
  h005Start.setDate(today.getDate() - 25);

  strategies.push({
    _openid: openid,
    habit_id: 'h005',
    habit_title: '艾灸',
    category: '理疗类',
    duration: 40,
    freq_type: 'interval',
    freq_rules: 3,
    freq_category: 'daily-interval',
    plan_start_date: formatDate(h005Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  // 前7次（每4天一次）
  for (let i = 0; i < 7; i++) {
    const date = new Date(h005Start);
    date.setDate(h005Start.getDate() + i * 4);
    logs.push({
      _openid: openid,
      habit_id: 'h005',
      checkin_date: formatDate(date),
      created_at: new Date(date),
      created_at_str: formatDate(date)
    });
  }

  // 中断10天后重新开始
  const restartDate = new Date(today);
  restartDate.setDate(today.getDate() - 5);

  for (let i = 0; i < 5; i++) {
    const date = new Date(restartDate);
    date.setDate(restartDate.getDate() + i * 4);
    logs.push({
      _openid: openid,
      habit_id: 'h005',
      checkin_date: formatDate(date),
      created_at: new Date(date),
      created_at_str: formatDate(date)
    });
  }

  return { strategies, logs, name: '场景2: 中断后恢复场景' };
}

// 场景3：部分完成场景
function createScenario3(openid) {
  const today = new Date();
  const strategies = [];
  const logs = [];

  // 刮痧 - 每周二四六 - 低完成率（约40%）
  const h006Start = new Date(today);
  h006Start.setDate(today.getDate() - 30);

  strategies.push({
    _openid: openid,
    habit_id: 'h006',
    habit_title: '刮痧',
    category: '理疗类',
    duration: 30,
    freq_type: 'weekly',
    freq_rules: [2, 4, 6],
    freq_category: 'weekly',
    plan_start_date: formatDate(h006Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  count = 0;
  const possibleDays006 = [];
  for (let i = 0; i <= 30; i++) {
    const date = new Date(h006Start);
    date.setDate(h006Start.getDate() + i);
    const dayOfWeek = date.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if ([2, 4, 6].includes(targetDay)) {
      possibleDays006.push(date);
    }
  }
  
  // 随机选40%的日子打卡
  for (let i = 0; i < Math.floor(possibleDays006.length * 0.4); i++) {
    logs.push({
      _openid: openid,
      habit_id: 'h006',
      checkin_date: formatDate(possibleDays006[i]),
      created_at: new Date(possibleDays006[i]),
      created_at_str: formatDate(possibleDays006[i])
    });
  }

  // 推拿 - 每周一三五 - 高完成率（约80%）
  const h007Start = new Date(today);
  h007Start.setDate(today.getDate() - 30);

  strategies.push({
    _openid: openid,
    habit_id: 'h007',
    habit_title: '推拿',
    category: '理疗类',
    duration: 30,
    freq_type: 'weekly',
    freq_rules: [1, 3, 5],
    freq_category: 'weekly',
    plan_start_date: formatDate(h007Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  const possibleDays007 = [];
  for (let i = 0; i <= 30; i++) {
    const date = new Date(h007Start);
    date.setDate(h007Start.getDate() + i);
    const dayOfWeek = date.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if ([1, 3, 5].includes(targetDay)) {
      possibleDays007.push(date);
    }
  }
  
  // 随机选80%的日子打卡
  for (let i = 0; i < Math.floor(possibleDays007.length * 0.8); i++) {
    logs.push({
      _openid: openid,
      habit_id: 'h007',
      checkin_date: formatDate(possibleDays007[i]),
      created_at: new Date(possibleDays007[i]),
      created_at_str: formatDate(possibleDays007[i])
    });
  }

  return { strategies, logs, name: '场景3: 部分完成场景' };
}

// 场景4：删除后重新添加场景
function createScenario4(openid) {
  const today = new Date();
  const strategies = [];
  const logs = [];

  // 睡前泡脚 - 已删除（保留历史）
  const h008Start = new Date(today);
  h008Start.setDate(today.getDate() - 25);
  const h008DeleteDate = new Date(today);
  h008DeleteDate.setDate(today.getDate() - 10);

  // 不添加当前策略（已删除），只保留历史记录

  // 删除前的打卡记录（10天）
  for (let i = 0; i < 10; i++) {
    const date = new Date(h008Start);
    date.setDate(h008Start.getDate() + i);
    logs.push({
      _openid: openid,
      habit_id: 'h008',
      checkin_date: formatDate(date),
      created_at: new Date(date),
      created_at_str: formatDate(date)
    });
  }

  // 揉腹 - 重新添加（从间隔改为每周固定）
  const h009OldStart = new Date(today);
  h009OldStart.setDate(today.getDate() - 20);
  
  // 旧策略打卡（5次）
  for (let i = 0; i < 5; i++) {
    const date = new Date(h009OldStart);
    date.setDate(h009OldStart.getDate() + i * 3);
    logs.push({
      _openid: openid,
      habit_id: 'h009',
      checkin_date: formatDate(date),
      created_at: new Date(date),
      created_at_str: formatDate(date)
    });
  }

  // 新策略（每周二四六）
  const h009NewStart = new Date(today);
  h009NewStart.setDate(today.getDate() - 3);

  strategies.push({
    _openid: openid,
    habit_id: 'h009',
    habit_title: '揉腹',
    category: '起居类',
    duration: 10,
    freq_type: 'weekly',
    freq_rules: [2, 4, 6],
    freq_category: 'weekly',
    plan_start_date: formatDate(h009NewStart),
    created_at: new Date(),
    updated_at: new Date()
  });

  // 新策略打卡（3次）
  for (let i = 0; i < 3; i++) {
    const date = new Date(h009NewStart);
    date.setDate(h009NewStart.getDate() + i * 2);
    if (date <= today) {
      logs.push({
        _openid: openid,
        habit_id: 'h009',
        checkin_date: formatDate(date),
        created_at: new Date(date),
        created_at_str: formatDate(date)
      });
    }
  }

  return { strategies, logs, name: '场景4: 删除后重新添加场景' };
}

// 场景5：长期坚持场景
function createScenario5(openid) {
  const today = new Date();
  const strategies = [];
  const logs = [];

  // 经络拍打 - 每日 - 坚持60天
  const h010Start = new Date(today);
  h010Start.setDate(today.getDate() - 60);

  strategies.push({
    _openid: openid,
    habit_id: 'h010',
    habit_title: '经络拍打',
    category: '起居类',
    duration: 15,
    freq_type: 'daily',
    freq_rules: 1,
    freq_category: 'everyday',
    plan_start_date: formatDate(h010Start),
    created_at: new Date(),
    updated_at: new Date()
  });

  for (let i = 0; i < 60; i++) {
    const date = new Date(h010Start);
    date.setDate(h010Start.getDate() + i);
    if (date <= today) {
      logs.push({
        _openid: openid,
        habit_id: 'h010',
        checkin_date: formatDate(date),
        created_at: new Date(date),
        created_at_str: formatDate(date)
      });
    }
  }

  return { strategies, logs, name: '场景5: 长期坚持场景' };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '无法获取用户信息' };
  }

  const scenario = event.scenario || 0;

  try {
    // 先检查是否已有数据
    console.log('检查现有数据...');
    
    const existingStrategies = await db.collection('user_strategies').where({
      _openid: openid
    }).get();
    
    if (existingStrategies.data && existingStrategies.data.length > 0) {
      console.log('发现已有数据:', existingStrategies.data.length, '条策略');
      return {
        success: false,
        message: '已有测试数据，请先清空或直接使用现有数据',
        existingCount: existingStrategies.data.length,
        hint: '调用 clearTestData 云函数可清空数据（谨慎操作）'
      };
    }
    
    console.log('未发现现有数据，开始构造...');

    const scenarios = [];
    if (scenario === 0 || scenario === 1) scenarios.push(createScenario1(openid));
    if (scenario === 0 || scenario === 2) scenarios.push(createScenario2(openid));
    if (scenario === 0 || scenario === 3) scenarios.push(createScenario3(openid));
    if (scenario === 0 || scenario === 4) scenarios.push(createScenario4(openid));
    if (scenario === 0 || scenario === 5) scenarios.push(createScenario5(openid));

    const allStrategies = [];
    const allLogs = [];

    // 收集所有数据
    for (const s of scenarios) {
      console.log(`处理 ${s.name}...`);
      allStrategies.push(...s.strategies);
      allLogs.push(...s.logs);
    }

    // 插入策略
    console.log('开始插入策略...');
    for (const strategy of allStrategies) {
      await db.collection('user_strategies').add({
        data: strategy
      });
    }
    console.log(`已插入 ${allStrategies.length} 个策略`);

    // 插入打卡记录
    console.log('开始插入打卡记录...');
    for (const log of allLogs) {
      await db.collection('checkin_logs').add({
        data: log
      });
    }
    console.log(`已插入 ${allLogs.length} 条打卡记录`);

    // 保存习惯信息到 habits 集合（用于恢复已删除习惯的名称）
    console.log('开始保存习惯信息...');
    await saveHabitInfo(openid);
    console.log('习惯信息已保存');

    // 统计每个习惯的打卡次数
    const habitCountMap = {};
    for (const log of allLogs) {
      habitCountMap[log.habit_id] = (habitCountMap[log.habit_id] || 0) + 1;
    }

    const habitSummary = Object.entries(habitCountMap).map(([habitId, count]) => {
      const habit = TEST_HABITS.find(h => h.habitId === habitId);
      return `${habit ? habit.name : habitId}: ${count}次`;
    }).join(', ');

    return {
      success: true,
      message: '测试数据构造完成',
      summary: {
        scenarios: scenarios.map(s => s.name).join(', '),
        totalStrategies: allStrategies.length,
        totalLogs: allLogs.length,
        habitDetails: habitSummary
      }
    };

  } catch (err) {
    console.error('initTestData error:', err);
    return { success: false, message: err.message };
  }
};