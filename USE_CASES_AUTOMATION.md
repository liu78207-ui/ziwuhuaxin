# 子午花信 - 用例自动化测试标记

## 1. 测试能力概述

### 1.1 测试框架
- **单元测试**：Jest + babel-jest
- **测试环境**：Node.js (jest-environment-node)
- **测试命令**：
  - `npm test` - 运行所有测试
  - `npm run test:unit` - 单元测试
  - `npm run test:integration` - 云函数集成测试
  - `npm run test:coverage` - 覆盖率报告

---

## 2. 测试文件清单与状态

```
__tests__/
├── unit/
│   ├── app.test.js                    # ✅ 已创建 (270+行)
│   ├── pages/
│   │   ├── home.test.js              # ✅ 已存在
│   │   ├── habits.test.js            # ✅ 已存在
│   │   ├── stats.test.js             # ✅ 已创建 (55个测试)
│   │   └── profile.test.js           # ✅ 已存在
│   └── utils/
│       ├── ziwu.test.js              # ✅ 已存在
│       ├── iconMap.test.js           # ✅ 已存在
│       └── util.test.js              # ✅ 已存在
├── integration/
│   └── cloudfunctions/
│       ├── login.test.js             # ✅ 已存在
│       ├── doCheckin.test.js         # ✅ 已存在 (284行)
│       ├── undoCheckin.test.js       # ✅ 已创建 (16个测试)
│       ├── saveStrategy.test.js       # ✅ 已创建 (29个测试)
│       ├── getTodayTasks.test.js     # ⚠️ 已有测试（9个失败）
│       └── getStatsReport.test.js    # ⏳ 待创建
```

---

## 3. 测试场景覆盖

### 3.1 新建策略场景 ✅

| 用例ID | 测试描述 | 测试状态 |
|--------|----------|----------|
| UC-006 | 新建每日习惯策略 | ✅ 已覆盖 |
| UC-006 | 新建间隔习惯策略 | ✅ 已覆盖 |
| UC-006 | 新建每周固定习惯策略 | ✅ 已覆盖 |
| UC-006 | 新建策略应包含必要字段 | ✅ 已覆盖 |
| UC-006 | 新建策略默认计划开始日期 | ✅ 已覆盖 |

### 3.2 策略变更/中断场景 ✅

| 用例ID | 测试描述 | 测试状态 |
|--------|----------|----------|
| UC-007 | 频率类型变更（每日→间隔） | ✅ 已覆盖 |
| UC-007 | 频率类型变更（每日→每周固定） | ✅ 已覆盖 |
| UC-007 | 间隔天数变更 | ✅ 已覆盖 |
| UC-007 | 每周固定日期变更 | ✅ 已覆盖 |
| UC-007 | 计划开始日期变更 | ✅ 已覆盖 |
| UC-007 | 连续打卡天数分段计算 | ✅ 已覆盖 |

### 3.3 删除场景 ✅

| 用例ID | 测试描述 | 测试状态 |
|--------|----------|----------|
| UC-008 | 删除习惯策略 | ✅ 已覆盖 |
| UC-023 | 删除后重新添加 | ✅ 已覆盖 |
| COM-008 | 已删除习惯历史查看 | ✅ 已覆盖 |
| COM-008 | 删除后再添加的周报表验证 | ✅ 已覆盖 |
| COM-008 | 删除后再添加的月报表验证 | ✅ 已覆盖 |
| COM-008 | 删除后再添加的年报表验证 | ✅ 已覆盖 |

### 3.4 周/月/年报表数据链 ✅

| 用例ID | 测试描述 | 测试状态 |
|--------|----------|----------|
| UC-011 | 周报表应打卡次数计算 | ✅ 已覆盖 |
| UC-012 | 月报表应打卡次数计算 | ✅ 已覆盖 |
| UC-013 | 年报表应打卡次数计算 | ✅ 已覆盖 |
| UC-013 | 闰年处理 | ✅ 已覆盖 |
| - | 连续两周数据连贯性 | ✅ 已覆盖 |
| - | 周数据与月数据一致性 | ✅ 已覆盖 |
| - | 月数据与年数据一致性 | ✅ 已覆盖 |

---

## 4. 测试运行结果

### 4.1 当前测试统计

```
Test Suites: 15 total
Tests: 279 total
Passed: 270 (97%)
Failed: 9 (来自 getTodayTasks.test.js - 原有测试)
```

### 4.2 新增测试覆盖

| 测试文件 | 测试数量 | 通过率 |
|----------|----------|--------|
| stats.test.js | 55 | 100% |
| saveStrategy.test.js | 29 | 100% |
| undoCheckin.test.js | 16 | 100% |
| app.test.js (扩展) | 70+ | 100% |

---

## 5. 发现的 Bug

### 5.1 saveStrategy 云函数 Bug ⚠️

**问题描述**：
修改习惯的 `duration`（单次目标时长）时，数据库记录会更新，但不会触发版本历史记录（`saveStrategyVersion` 不会被调用）。

**代码位置**：`cloudfunctions/saveStrategy/index.js:50-53`

```javascript
const isStrategyChanged = 
  currentStrategy.freq_type !== freq_type ||
  JSON.stringify(currentStrategy.freq_rules) !== JSON.stringify(freq_rules) ||
  currentStrategy.plan_start_date !== plan_start_date;
// ⚠️ 注意：没有包含 duration 的检查

// 但 update 时 duration 会被更新
await db.collection('user_strategies').doc(currentStrategy._id).update({
  data: {
    duration,  // <-- duration 变更不会触发版本记录
    ...
  }
});
```

**影响**：
- 用户修改习惯时长（如20分钟→30分钟）后，历史版本记录不完整
- 统计报表可能无法准确反映用户的策略变更历史

**建议修复**：
将 `duration` 也加入到变更检测条件中：

```javascript
const isStrategyChanged = 
  currentStrategy.duration !== duration ||
  currentStrategy.freq_type !== freq_type ||
  JSON.stringify(currentStrategy.freq_rules) !== JSON.stringify(freq_rules) ||
  currentStrategy.plan_start_date !== plan_start_date;
```

---

## 6. 不可自动化用例（需手动测试）

| 用例ID | 用例名称 | 不可自动化原因 |
|--------|----------|---------------|
| UC-010 | 长按习惯快速修改 | 需UI交互 |
| UC-017 | 设置头像 | 需微信uploadFile API |
| EX-008 | 存储空间不足 | 需真实存储环境 |
| COM-010 | 快速Tab切换 | 需UI集成测试 |
| COM-011 | 弹窗操作中断 | 需UI交互 |
| COM-012 | 滚动时点击任务 | 需UI交互 |
| INT-009 | 头像设置后全局生效 | 需微信上传和CDN |

---

## 7. 运行测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行覆盖率报告
npm run test:coverage

# 运行指定测试文件
npm test -- --testPathPattern="stats.test.js"
npm test -- --testPathPattern="saveStrategy.test.js"
```

---

## 8. 测试用例优先级

### 高优先级（核心业务）
1. ✅ 打卡核心流程（doCheckin/undoCheckin）
2. ✅ 策略增删改查（saveStrategy/removeStrategy）
3. ✅ 报表数据计算（周/月/年）
4. ✅ 频率策略计算（每日/间隔/每周固定）

### 中优先级（重要功能）
1. ✅ 策略变更检测
2. ✅ 连续打卡天数计算
3. ✅ 数据同步（冲突处理）
4. ✅ 异常数据修复

### 低优先级（边界情况）
1. ⏳ 待创建：getStatsReport.test.js
2. ⚠️ 已有问题：getTodayTasks.test.js（9个测试失败）

---

*文档生成时间：2026-05-06*
*项目版本：v1.0*
