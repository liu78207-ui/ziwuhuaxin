# 测试数据构造指南

## 概述

本项目提供了完整的测试数据构造脚本，用于在人工校验前准备测试数据。

## 文件说明

| 文件 | 说明 |
|------|------|
| `miniprogram/test-data.js` | 小程序端测试数据脚本 |
| `cloudfunctions/clearTestData/` | 云端清空数据云函数 |

## 数据存储结构

### 本地存储
- `MyHabits` - 用户习惯配置表
- `CheckinLogs` - 打卡流水表
- `AllHabitsInfo` - 已删除习惯信息（保留历史）

### 云数据库
- `user_strategies` - 用户策略表
- `checkin_logs` - 打卡记录表
- `user_strategy_versions` - 策略版本历史表
- `users` - 用户信息表

## 使用方式

### 第一步：清空现有数据

**方式1：在小程序控制台执行**
```javascript
// 在小程序任意页面的 onLoad 或 onShow 中执行一次
const testData = require('../../test-data.js');
testData.clear().then(() => {
  console.log('数据已清空');
});
```

**方式2：手动清除**
1. 关闭小程序
2. 在微信中删除小程序
3. 重新进入小程序

**方式3：使用云函数清空**
```javascript
wx.cloud.callFunction({
  name: 'clearTestData',
  data: { confirm: true },
  success: res => console.log(res)
});
```

### 第二步：构造测试数据

```javascript
const testData = require('../../test-data.js');

// 构造全部5个场景的数据
testData.init(0).then(result => {
  console.log('数据构造完成', result);
});

// 或构造指定场景
testData.init(1);  // 仅场景1
testData.init(2);  // 仅场景2
// ...
```

### 第三步：查看数据状态

```javascript
testData.status();
```

## 测试场景说明

### 场景1：正常使用场景（连续打卡）
- **习惯**：金刚功（每日）、八段锦（间隔2天）、站桩（每周一三五）
- **数据**：
  - 金刚功：连续打卡15天
  - 八段锦：每3天一次，连续10次
  - 站桩：每周一三五，连续8次
- **验证点**：
  - [ ] 首页正确显示3个任务
  - [ ] 打卡进度正确计算
  - [ ] 周报表数据一致
  - [ ] 月报表数据一致

### 场景2：中断后恢复场景
- **习惯**：艾灸（间隔3天）
- **数据**：
  - 前7天连续打卡（每4天一次）
  - 中断10天
  - 重新开始后连续5天
- **验证点**：
  - [ ] 中断前的连续天数正确
  - [ ] 中断后重新计算连续天数
  - [ ] 统计报表分段显示

### 场景3：部分完成场景
- **习惯**：刮痧（每周二四六，完成率约40%）、推拿（每周一三五，完成率约80%）
- **数据**：
  - 刮痧：30天内仅打卡4次（低完成率）
  - 推拿：30天内打卡8次（高完成率）
- **验证点**：
  - [ ] 不同完成率正确显示
  - [ ] 周报表完成率计算正确
  - [ ] 月报表完成率计算正确

### 场景4：删除后重新添加场景
- **习惯**：睡前泡脚（已删除，保留历史）、揉腹（删除后重新添加，新策略）
- **数据**：
  - 睡前泡脚：删除前打卡10天，删除后不再显示但保留历史
  - 揉腹：删除前5次，删除后重新添加改为每周固定，再打3次
- **验证点**：
  - [ ] 已删除习惯不在首页显示
  - [ ] 已删除习惯的历史记录可在观心页查看
  - [ ] 重新添加后使用新策略
  - [ ] 周/月/年报表正确合并历史数据

### 场景5：长期坚持场景
- **习惯**：经络拍打（每日）
- **数据**：连续打卡60天
- **验证点**：
  - [ ] 跨月数据正确
  - [ ] 年报表热力图正确
  - [ ] 连续打卡天数正确累计

## 人工校验清单

### 首页（案台）
- [ ] 正确显示当前时辰和养生建议
- [ ] 任务列表正确显示今日应打卡习惯
- [ ] 不同频率习惯正确筛选（每日/间隔/每周）
- [ ] 打卡按钮状态正确（已打/未打）
- [ ] 进度显示正确（X/Y 完成）
- [ ] 点击打卡后状态立即更新
- [ ] 取消打卡后状态正确回退

### 修习页
- [ ] 习惯库正确分类显示
- [ ] 已添加习惯显示策略信息
- [ ] 添加习惯弹窗正确
- [ ] 修改习惯策略正确
- [ ] 删除习惯正确（软删除）
- [ ] 长按快速修改正确

### 观心页
- [ ] 周报表正确显示7天数据
- [ ] 月报表正确显示整月数据
- [ ] 年报表正确显示热力图
- [ ] 周期切换（上/下一期）正确
- [ ] 已删除习惯历史数据保留
- [ ] 打卡率计算正确
- [ ] 连续天数计算正确

### 归藏页
- [ ] 用户信息正确显示
- [ ] 头像设置功能正常
- [ ] 昵称设置功能正常

## 快捷命令

```javascript
// 查看当前数据
testData.status();

// 清空所有数据
testData.clear();

// 构造全部场景
testData.init(0);

// 仅构造场景1
testData.init(1);

// 仅构造场景2
testData.init(2);

// 仅构造场景3
testData.init(3);

// 仅构造场景4
testData.init(4);

// 仅构造场景5
testData.init(5);
```

## 注意事项

1. **云端同步**：首次运行需要先登录获取 openid，才能同步到云端
2. **本地优先**：小程序优先读取本地存储，离线可用
3. **网络恢复**：网络恢复后自动同步本地待上传数据
4. **数据安全**：测试数据仅用于测试，不会影响真实数据

## 问题排查

### 数据未更新
```javascript
// 强制刷新
wx.clearStorageSync(); // 慎用，会清除所有本地数据
testData.init(0);
```

### 云端数据不同步
```javascript
// 检查 openid
console.log(wx.getStorageSync('user_openid'));

// 重新登录
wx.cloud.callFunction({
  name: 'login',
  success: res => console.log(res)
});
```

---

## 云函数部署（推荐方式）

### 方式一：通过微信开发者工具部署

**步骤1：部署清空数据云函数**
1. 打开微信开发者工具
2. 在左侧找到 `cloudfunctions/clearTestData` 目录
3. 右键点击 `clearTestData`，选择 "上传并部署"

**步骤2：部署初始化数据云函数**
1. 同样方式部署 `cloudfunctions/initTestData`

**步骤3：调用云函数**

在小程序任意位置执行：

```javascript
// 清空现有数据（谨慎使用！）
wx.cloud.callFunction({
  name: 'clearTestData',
  data: { confirm: true },
  success: res => console.log(res)
});

// 构造全部5个场景测试数据
wx.cloud.callFunction({
  name: 'initTestData',
  data: { scenario: 0 },
  success: res => {
    console.log('数据构造完成:', res.result);
    // 输出示例：
    // {
    //   success: true,
    //   message: '测试数据构造完成',
    //   summary: {
    //     scenarios: '场景1: 正常使用场景, 场景2: 中断后恢复场景, ...',
    //     totalStrategies: 11,
    //     totalLogs: 120,
    //     habitDetails: '金刚功: 15次, 八段锦: 10次, ...'
    //   }
    // }
  }
});

// 仅构造指定场景
wx.cloud.callFunction({
  name: 'initTestData',
  data: { scenario: 1 },  // 1-5 或 0（全部）
  success: res => console.log(res)
});
```

### 方式二：通过前端脚本构造

详见上方 "使用方式" 部分。

---

*文档更新时间：2026-05-06*
