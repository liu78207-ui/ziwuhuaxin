# 《小程序重构实施方案》（修订版）

> 生成时间：2026/05/22
> 修订时间：2026/05/22
> 项目：子午花信小程序 V1
> 状态：正式方案（v2）

---

## 0. 重要修订说明

本次修订基于 `technical-architecture.md` 分层架构，对原方案进行以下修正：

| 修订项 | 原方案 | 修订后 |
|--------|--------|--------|
| 服务层路径 | `utils/dateService` | `services/timeService` |
| 服务层路径 | `utils/storageService` | `services/storageService` |
| 服务层路径 | `utils/syncService` | `services/syncService` |
| HabitId 掩盖策略 | 用 habitId.js 统一解析 | **设计 userHabitId 迁移策略**，显式区分 builtInHabit.habitId 与 userHabit.userHabitId |
| 前端 syncService | 含 wx-server-sdk | **删除 wx-server-sdk，仅使用 wx.cloud.callFunction** |
| dailyCheckinState | 阶段7（最后） | **提前至阶段4，与打卡链路同期** |
| userHabitId 迁移 | 阶段4（DailyCheckinState 之后） | **提前至阶段3（DailyCheckinState 之前）** |
| 阶段架构对齐 | 未明确对齐分层 | **每阶段必须对齐 technical-architecture.md 的分层架构（pages→services→storage/cloud→models→constants→utils→cloudfunctions）** |
| 旧数据迁移 | 无专门章节 | **新增章节 H：旧数据迁移策略** |
| 阶段回滚策略 | 每阶段简要提及 | **新增章节 I：阶段回滚策略（详细）** |
| 数据库约束 | 禁止修改数据库 schema | **禁止破坏旧集合，允许新增兼容集合** |
| WXML/WXSS 约束 | 禁止修改 WXML/WXSS | **禁止改变 UI 风格，允许最小绑定调整** |

---

## A. 当前项目问题总览

### 1. 技术债

| 债类型 | 具体位置 | 风险等级 |
|--------|----------|----------|
| app.js 过重 | miniprogram/app.js (898行) | 极高 |
| habitId/userHabitId 混用 | home.js:351, 485；云端 user_strategies 同时承载实例和策略 | 极高 |
| reportCalculator 与 stats.js 重复逻辑 | reportCalculator.js vs stats.js | 中 |
| undoCheckin 风险 | 云端 undoCheckin 边界条件 | 高 |
| dailyCheckinState 缺失 | 无统一的当日状态管理 | 中 |
| 页面直接操作 storage | home.js:288-298, stats.js:285-294 | 高 |
| 页面直接调用云函数 | home.js:576, habits.js:797 | 高 |
| new Date() 业务污染 | home.js:76, 323-327, stats.js:68-69 | 中 |

### 2. 核心问题：habitId/userHabitId 混用

**现状**：
- `builtInHabit.habitId`：内置习惯的固定 ID（如 `1`, `2`, `12`），21 个硬编码在 `pages/habits/habits.js`
- `userHabit.userHabitId`：用户习惯实例 ID，**当前不存在**，MyHabits 中直接存储 builtInHabit.id
- 云端 `user_strategies` 表以 `habit_id` 为主键，**同一内置习惯无法创建多个用户实例**
- 删除后重加同一习惯，会复用一个 `habit_id`，导致历史数据与新实例混算

**问题本质**：当前设计**没有 userHabitId 概念**，把内置习惯 ID 当作用户实例 ID 使用，违反了 technical-architecture.md 中"同一 habitId 多次添加必须生成不同 userHabitId"的要求。

**迁移目标**：
- 新增 `userHabit.userHabitId`：UUID 或自增ID，唯一标识用户添加的每个实例
- 保持 `builtInHabit.habitId`：不变，21 个固定 ID
- 打卡记录关联 `userHabitId` 而非 `habitId`
- 报表聚合时按 `habitId` 展示，但生命周期按 `userHabitId` 分开计算

### 3. 状态流问题

```
页面 → wx.getStorageSync → app.globalData → 云函数 → storage
         ↑__________________________|
              (手动同步失败点)
```

**问题**：
- 页面直接读 storage，绕过 app 方法
- app.globalData 与 storage 可能不同步
- syncFromCloud/syncToCloud 缺乏幂等性保证

### 4. 数据流问题

```
home.js handleCheckin (524-536行)
  → app.addCheckinLog (478-503行)
  → app.saveCheckinLogs (467-475行)
  → syncToCloud (751-852行)
  → 云函数 doCheckin/undoCheckin
  → 云端数据覆盖本地（冲突时）
```

**问题**：
- 本地 addCheckinLog 未触发云同步
- 云同步失败后无重试机制
- sync_status 状态机不完整

### 5. 同步问题

| 问题 | 位置 | 影响 |
|------|------|------|
| 同步无幂等性 | syncToCloud 778-814 | 云端重复记录 |
| 删除同步失败 | syncToCloud 817-840 | 垃圾数据 |
| 冲突解决简单粗暴 | syncFromCloud 720-723 | 可能丢失本地数据 |
| 无同步锁 | isSyncing 单一布尔 | 并发同步冲突 |

### 6. 报表问题

- `reportCalculator.js` (445行) 实现了完整的策略感知报表逻辑
- `stats.js` (1585行) 有大量重复的日期计算和状态判断逻辑
- `stats.js` 存在 `legacyLoadWeekData`/`legacyLoadMonthData`/`legacyLoadYearData` 与 `loadWeekData`/`loadMonthData`/`loadYearData` 并存

### 7. 架构问题

| 问题 | 描述 |
|------|------|
| 单点故障 | app.js 是所有业务的唯一入口 |
| 无服务层 | 页面直接操作数据模型 |
| 无状态管理 | globalData 是唯一状态容器 |
| 无分层 | UI/Business/Data 全部混合 |

### 8. 高风险模块

| 模块 | 风险 |
|------|------|
| 云端 user_strategies | habit_id 作为主键，同一习惯无法多实例 |
| undoCheckin 云函数 | 可能删除不属于自己的记录 |
| syncFromCloud 合并逻辑 | 冲突时可能丢失待同步数据 |
| home.js handleCheckin | 防抖机制不完善 |
| app.js removeHabit | 软删除后云端未同步 |

---

## B. 重构总体策略

### 分层架构对齐

本次重构严格对齐 `technical-architecture.md` 的分层架构：

```
pages (页面层) → services (服务层) → storage/cloud/models/constants/utils → cloudfunctions (云函数层)
```

- **页面层**：`pages/home`, `pages/habits`, `pages/stats`, `pages/profile`
- **服务层**：`services/timeService`, `services/habitService`, `services/checkinService`, `services/reportService`, `services/storageService`, `services/cloudService`, `services/syncService`, `services/migrationService`, `services/userService`
- **数据模型层**：`models/builtInHabit`, `models/userHabit`, `models/policyVersion`, `models/checkinOperation`, `models/dailyCheckinState`, `models/reportData`
- **常量层**：`constants/storageKeys`, `constants/habitCategories`, `constants/frequencyTypes`
- **工具层**：`utils/dateUtils`, `utils/lunarUtils`, `utils/idUtils`
- **云函数层**：`cloudfunctions/` 下的各个云函数

### 为什么采用渐进式重构

1. **历史包袱不可忽略**：已有用户数据在 storage 和云端，破坏性重构会导致数据丢失
2. **UI 已可用**：用户已习惯现有界面，重做 UI 成本高且用户不买账
3. **云函数约束**：腾讯云开发环境限制每次部署需要兼容性
4. **验证周期**：微信小程序无法自动化 e2e 测试，必须手动验证

### 为什么保留 UI

1. 现有 UI 已经过用户验证
2. WXML/WXSS 无技术债
3. 重构目标是"内在质量"，不是"外观革新"

### 为什么不能直接推倒重来

1. 破坏已有用户数据
2. 云函数已有线上数据
3. 测试覆盖率不足

---

## C. 重构阶段路线图

### 阶段 0：冻结与现状盘点

**目标**：冻结当前 UI 和脏工作树，记录现状问题清单

**分层归属**：跨层（文档整理）

**修改文件**：无或仅更新文档

**风险**：低

**前置条件**：确认当前分支无未提交的重要改动

**验收标准**：
- 现状问题清单（技术债、数据流、同步、报表、架构、高风险模块）已记录
- 已对照 technical-architecture.md 完成差距分析

**回滚策略**：无需回滚，纯文档阶段

**UI 影响**：无

**旧数据影响**：无

---

### 阶段 1：服务层基础设施（TimeService、StorageService、Constants）

**目标**：建立服务层基础设施，统一时间入口和存储访问

**分层归属**：services + constants + utils

**修改文件**：
- 新增：`miniprogram/services/timeService.js` - 业务时间统一入口
- 新增：`miniprogram/services/storageService.js` - 存储访问统一入口
- 新增：`miniprogram/constants/storageKeys.js` - 存储 Key 常量
- 新增：`miniprogram/constants/frequencyTypes.js` - 频率类型常量
- 新增：`miniprogram/utils/dateUtils.js` - 日期基础工具
- 修改：`miniprogram/utils/ziwu.js` - 保持不动，添加注释

**风险**：低（纯新增，不修改现有代码）

**前置条件**：阶段0完成

**验收标准**：
- timeService.js 已在 app.js 中引用，原有日期逻辑行为不变
- storageService.js 可读写 MyHabits/CheckinLogs/AllHabitsInfo
- constants 常量被服务层使用
- npm test 通过

**回滚策略**：删除新增的 services/ 和 constants/ 目录即可

**UI 影响**：无

**旧数据影响**：无

---

### 阶段 2：数据模型层（Models + ID 体系设计）

**目标**：建立数据模型层，明确 builtInHabit.habitId 与 userHabit.userHabitId 的边界，设计 ID 体系

**分层归属**：models + constants

**修改文件**：
- 新增：`miniprogram/models/builtInHabit.js` - 内置习惯模型（常量）
- 新增：`miniprogram/models/userHabit.js` - 用户习惯实例模型
- 新增：`miniprogram/models/policyVersion.js` - 策略版本模型
- 新增：`miniprogram/constants/habitLibrary.js` - 21个内置习惯定义
- 新增：`miniprogram/constants/habitThemes.js` - 主题色常量

**核心设计**：

```javascript
// builtInHabit.js - 内置习惯（固定21个，本地常量）
{
  habitId: '1',      // 字符串 ID，固定值
  name: '金刚功',
  category: '运动类',
  defaultDuration: 15,
  defaultFrequency: 'daily'
}

// userHabit.js - 用户习惯实例（云端持久化）
{
  userHabitId: 'uh_uuid_xxx',  // 用户实例唯一ID，新增字段
  openid: '',                   // 用户 openid
  habitId: '1',                // 关联 builtInHabit.habitId
  status: 'active',            // active / deleted
  createdAt: '',
  latestPolicyVersionId: '',   // 当前策略版本ID
  syncStatus: 1                // 同步状态
}

// policyVersion.js - 策略版本
{
  policyVersionId: 'pv_uuid_xxx',
  userHabitId: 'uh_uuid_xxx',   // 关联 userHabit
  habitId: '1',                // 关联 builtInHabit
  duration: 20,
  frequencyType: 'daily',       // daily / interval / weekly
  frequencyConfig: { intervalDays: 1 }, // interval时
  startDate: '2026-04-13',     // 计划开始日期
  effectiveStartDate: '',       // 实际生效开始日期
  effectiveEndDate: '',         // 实际失效日期（null表示当前有效）
  syncStatus: 1
}
```

**关键约束**：
- `builtInHabit.habitId` 不可变，21 个固定值
- `userHabit.userHabitId` 每次添加内置习惯时**必须生成新值**
- 同一 `habitId` 可以有多个活跃的 `userHabit`（用户多次添加）
- 打卡记录关联 `userHabitId`，不直接关联 `habitId`

**风险**：中（涉及数据模型设计，需考虑旧数据迁移）

**前置条件**：阶段1完成

**验收标准**：
- builtInHabit 模型覆盖全部 21 个内置习惯
- userHabit 模型有 userHabitId 字段
- policyVersion 模型与 userHabit 关联
- 云端 user_strategies 表结构已评估（不改，只做映射）

**回滚策略**：删除 models/ 和 constants/habitLibrary.js

**UI 影响**：无

**旧数据影响**：无（本阶段仅设计模型，不涉及数据迁移）

---

### 阶段 3：userHabitId 迁移 + 数据模型层完善

**目标**：将 userHabitId 迁移提前，完成数据模型层设计，为后续打卡链路打好基础

**分层归属**：models + services + pages

**修改文件**：
- 新增：`miniprogram/models/builtInHabit.js` - 内置习惯模型（常量）
- 新增：`miniprogram/models/userHabit.js` - 用户习惯实例模型
- 新增：`miniprogram/models/policyVersion.js` - 策略版本模型
- 新增：`miniprogram/models/dailyCheckinState.js` - 每日最终状态模型
- 新增：`miniprogram/models/checkinOperation.js` - 操作流水模型
- 新增：`miniprogram/services/habitService.js` - 习惯管理服务（含 userHabitId 生成）
- 新增：`miniprogram/services/checkinService.js` - 打卡服务
- 修改：`miniprogram/pages/home/home.js` - 使用 habitService + checkinService
- 修改：`miniprogram/pages/habits/habits.js` - 使用 habitService
- 修改：`miniprogram/app.js` - 集成 habitService + checkinService

**核心设计**：userHabitId 生成与 MyHabits/CheckinLogs 迁移

```javascript
// builtInHabit.js - 内置习惯（固定21个，本地常量）
{
  habitId: '1',      // 字符串 ID，固定值
  name: '金刚功',
  category: '运动类',
  defaultDuration: 15,
  defaultFrequency: 'daily'
}

// userHabit.js - 用户习惯实例（云端持久化）
{
  userHabitId: 'uh_uuid_xxx',  // 用户实例唯一ID，新增字段
  openid: '',                   // 用户 openid
  habitId: '1',                // 关联 builtInHabit.habitId
  status: 'active',            // active / deleted
  createdAt: '',
  latestPolicyVersionId: '',   // 当前策略版本ID
  syncStatus: 1                // 同步状态
}

// policyVersion.js - 策略版本
{
  policyVersionId: 'pv_uuid_xxx',
  userHabitId: 'uh_uuid_xxx',   // 关联 userHabit
  habitId: '1',                // 关联 builtInHabit
  duration: 20,
  frequencyType: 'daily',       // daily / interval / weekly
  frequencyConfig: { intervalDays: 1 }, // interval时
  startDate: '2026-04-13',     // 计划开始日期
  effectiveStartDate: '',       // 实际生效开始日期
  effectiveEndDate: '',         // 实际失效日期（null表示当前有效）
  syncStatus: 1
}

// dailyCheckinState.js
{
  stateId: 'ds_uuid_xxx',
  openid: '',
  userHabitId: 'uh_uuid_xxx',   // 关联用户习惯实例
  habitId: '1',                 // 关联 builtInHabit（冗余，便于查询）
  policyVersionId: 'pv_uuid_xxx',
  date: '2026-05-22',          // 业务日期
  status: 'checked',            // unchecked / checked / canceled / locked
  checkedAt: '',               // 最新打卡时间
  canceledAt: '',               // 取消时间
  lastOperationId: '',         // 最近一次操作ID
  isLocked: false,             // 是否锁定（如删除当天）
  lockReason: '',              // 锁定原因
  syncStatus: 1,
  updatedAt: ''
}
```

**userHabitId 迁移（关键）**：

当前 MyHabits 中存储的习惯对象：
```javascript
// 当前（错误）
{ habitId: '1', name: '金刚功', freq_type: 'daily', ... }
```

目标（正确）：
```javascript
// 目标
{ userHabitId: 'uh_xxx', habitId: '1', name: '金刚功', freq_type: 'daily', ... }
```

**迁移步骤**：
1. 读取旧 MyHabits
2. 为每个习惯生成新的 `userHabitId`（UUID v4）
3. 补充 `status: 'active'`, `syncStatus: 1`
4. 保存新结构到 storage
5. 建立 `habitId -> userHabitId` 映射表（用于 CheckinLogs 迁移）
6. CheckinLogs 中的 `habitId` 关联需通过映射表找到正确的 userHabitId

**与打卡链路的关系**：
- 页面调用 `checkinService.toggle(userHabitId, date)` 进行打卡/取消
- checkinService 内部创建 `checkinOperation`（操作流水）并更新 `dailyCheckinState`
- checkinService 负责与云端同步（调用 cloudService）
- 页面不再直接读取 `CheckinLogs`，而是通过 `checkinService.getDailyState()` 获取状态

**风险**：高（涉及 userHabitId 生成和旧数据迁移）

**前置条件**：阶段1完成，服务层基础设施就绪

**验收标准**：
- habitService.js 支持 addHabit 生成新 userHabitId
- 同一内置习惯添加多次，生成不同的 userHabitId
- dailyCheckinState 模型已创建
- checkinService.js 已创建
- home.js handleCheckin 调用 checkinService
- MyHabits 完成 userHabitId 迁移
- CheckinLogs 完成 userHabitId 关联迁移
- npm test 通过

**回滚策略**：回退 habitService.js、checkinService.js 和 models/；MyHabits 回退到旧结构（无 userHabitId）；CheckinLogs 回退到旧结构（无 userHabitId）；home.js 回退到直接操作 CheckinLogs

**UI 影响**：home.js 打卡交互行为不变；habits.js 添加习惯交互行为不变

**旧数据影响**：必须迁移 MyHabits 和 CheckinLogs（见章节 H）

---

### 阶段 4：CloudService + SyncService（前端同步层）

**目标**：建立 cloudService（云函数统一封装）和 syncService（同步服务），解决同步链路问题

**分层归属**：services

**重要约束**：前端 syncService **禁止使用 wx-server-sdk**，只能使用 `wx.cloud.callFunction`

**修改文件**：
- 新增：`miniprogram/services/cloudService.js` - 云函数统一封装
- 新增：`miniprogram/services/syncService.js` - 同步服务（纯前端，使用 wx.cloud.callFunction）
- 新增：`miniprogram/services/migrationService.js` - 数据迁移服务
- 修改：`miniprogram/app.js` - 使用 cloudService 和 syncService

**核心设计**：

```javascript
// cloudService.js - 云函数统一封装（使用 wx.cloud.callFunction）
cloudService.callFunction(name, data)        // 统一错误处理、错误码封装
cloudService.getOpenId()                     // 获取 openid
cloudService.pullUserData()                  // 拉取用户数据
cloudService.pushUserData()                  // 推送用户数据

// syncService.js - 同步服务（纯前端，无 wx-server-sdk）
syncService.syncAll()                        // 全量同步
syncService.syncHabits()                     // 同步习惯实例
syncService.syncCheckins()                   // 同步打卡操作
syncService.syncPending()                    // 同步 pending 队列
syncService.markPending(entity)              // 标记待同步
syncService.resolveConflict(conflict)        // 解决冲突

// 同步锁实现（纯内存，无云端依赖）
let isSyncing = false
let syncQueue = []

async function withSyncLock(fn) {
  if (isSyncing) {
    return new Promise((resolve, reject) => {
      syncQueue.push({ fn, resolve, reject })
    })
  }
  isSyncing = true
  try {
    return await fn()
  } finally {
    isSyncing = false
    processQueue()
  }
}

function processQueue() {
  if (syncQueue.length === 0) return
  const { fn, resolve, reject } = syncQueue.shift()
  fn().then(resolve).catch(reject)
}
```

**与云函数层的关系**：
- 前端 syncService 调用 `cloudService.callFunction('syncHabit', data)` 等
- 云端 syncHabit/syncCheckin/recoverData 由云函数实现，前端不关心实现细节
- 前端只使用 `wx.cloud.callFunction`，不直接操作数据库

**风险**：高（涉及数据同步）

**前置条件**：阶段3完成

**验收标准**：
- 同步锁防止并发同步冲突
- 幂等性：重复同步同一记录不产生重复
- 断网恢复后 pending 数据正确同步到云端
- 冲突解决：本地待同步数据不被云端覆盖

**回滚策略**：回退 cloudService.js 和 syncService.js，app.js 回退到旧的同步逻辑

**UI 影响**：无

**旧数据影响**：无

---

### 阶段 5：ReportService + Stats 报表重构

**目标**：消除 reportCalculator 与 stats.js 的重复逻辑，建立统一的 reportService

**分层归属**：services + pages

**修改文件**：
- 新增：`miniprogram/services/reportService.js` - 报表聚合服务
- 修改：`miniprogram/pages/stats/stats.js` - 使用 reportService，删除 legacy 方法
- 修改：`miniprogram/utils/reportCalculator.js` - 保留核心算法（作为 reportService 的内部依赖）

**核心设计**（对齐 technical-architecture.md 第九章）：

```javascript
// reportService.js 核心接口
reportService.getWeeklyReport(weekStart)      // 周报
reportService.getMonthlyReport(month)         // 月报
reportService.getYearlyReport(year)           // 年报
reportService.calculateTodayProgress()        // 今日进度（供首页）
reportService.buildReportPeriod(type, anchorDate)  // 构建报表周期
reportService.resolvePolicyForDate(userHabitId, date) // 查询某日有效的策略版本
reportService.isDueOnDate(policy, date)        // 判断某日是否应修
reportService.buildDailyStatus(date, userHabits)  // 构建某日状态
reportService.aggregateByHabitId(records, policies) // 按习惯ID聚合
reportService.calculateCompletionRate(reportItems) // 完成率计算
reportService.buildCalendarStatus(date, userHabits) // 构建日历状态
```

**stats.js 重构**：
- 删除所有 `legacyLoad*` 方法
- 删除 `calculateDueCount`, `shouldShowHabitOnDate`, `calculateStatsWithStrategy`
- 统一使用 `reportService` 的方法获取报表数据

**迁移步骤**：
1. 创建 reportService.js（基于 reportCalculator.js 核心算法）
2. stats.js 逐步替换为调用 reportService
3. reportCalculator.js 保留，标注为废弃，逻辑逐步迁移到 reportService

**风险**：中（涉及统计计算逻辑）

**前置条件**：阶段4完成

**验收标准**：
- 周报/月报/年报数据与之前一致
- 统计数字可人工核实
- stats.js 无 legacyLoad* 方法
- npm test 通过

**回滚策略**：回退 reportService.js，stats.js 恢复 legacy 方法

**UI 影响**：无（报表数据不变）

**旧数据影响**：无

---

### 阶段 6：App.js 瘦身

**目标**：将 app.js 从 898 行减少到 400 行以内，业务逻辑迁移到服务层

**分层归属**：services + app.js

**修改文件**：
- 修改：`miniprogram/app.js` - 移除可直接迁移到 service 层的代码
- 修改：`miniprogram/services/timeService.js` - 扩展时间相关方法
- 修改：`miniprogram/services/habitService.js` - 扩展习惯相关方法

**具体迁移**：
1. MyHabits/CheckinLogs 操作移到 habitService/checkinService
2. 时间计算移到 timeService
3. 存储操作通过 storageService
4. 云同步通过 syncService
5. app.js 保留：globalData 初始化、onLaunch、基础 business decision（用户登录、网络监听）

**迁移后 app.js 职责**：
- `globalData`：userInfo, openid, isOnline, isSyncing, fontsLoaded
- `onLaunch`：初始化云开发、登录、加载缓存、触发同步
- `initNetworkListener`：网络状态监听
- `notifyPagesToRefresh`：页面刷新通知
- `logOperation`：操作日志（可选项）

**风险**：中

**前置条件**：阶段5完成

**验收标准**：
- app.js 行数 < 400
- 所有原有功能正常
- 无 console.error 或 warning

**回滚策略**：回退 app.js 及 service 层改动

**UI 影响**：无

**旧数据影响**：无

---

### 阶段 7：UserService + Profile 页面

**目标**：建立 userService，管理用户资料，完善 profile 页面

**分层归属**：services + pages

**修改文件**：
- 新增：`miniprogram/services/userService.js` - 用户服务
- 修改：`miniprogram/pages/profile/profile.js` - 使用 userService
- 修改：`miniprogram/app.js` - 使用 userService 进行登录

**核心设计**：

```javascript
// userService.js 核心接口
userService.login()                          // 登录获取 openid
userService.getUserInfo()                    // 获取用户资料
userService.saveUserInfo(info)               // 保存用户资料
userService.getServerTime()                  // 获取服务端时间（用于校准）
```

**风险**：低

**前置条件**：阶段6完成

**验收标准**：
- profile 页面正确显示用户资料
- 登录流程正常

**回滚策略**：回退 userService.js

**UI 影响**：profile 页面数据来源变化，功能不变

**旧数据影响**：无

---

## D. 每阶段详细实施方案（阶段1-3重点说明）

### 阶段1详细方案：服务层基础设施

**目标**：创建 timeService.js、storageService.js 及相关常量，作为服务层的地基

**创建文件**：`miniprogram/services/timeService.js`

```javascript
// services/timeService.js
// 唯一业务时间入口，统一 Asia/Shanghai

let _serverTimeOffset = 0  // 服务端时间偏移量
let _serverTimeConfidence = 'low'  // 'high' | 'low'

// 获取当前时刻（校准后）
function getNow() {
  return new Date(Date.now() + _serverTimeOffset)
}

// 获取业务日期 YYYY-MM-DD
function getBusinessDate() {
  return formatDate(getNow())
}

// 获取今日 key
function getTodayKey() {
  return getBusinessDate()
}

// 获取模拟日期（考虑 DEBUG_DAY_OFFSET）
function getSimulatedDate(app) {
  const DEBUG_DAY_OFFSET = app && app.getDebugOffset ? app.getDebugOffset() : 0
  const today = new Date()
  if (DEBUG_DAY_OFFSET !== 0) {
    today.setDate(today.getDate() + DEBUG_DAY_OFFSET)
  }
  return today
}

function getSimulatedDateStr(app) {
  return formatDate(getSimulatedDate(app))
}

// 解析日期
function parseDate(dateStr) {
  if (!dateStr) return null
  const normalized = String(dateStr).split('T')[0]
  const parts = normalized.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

// 格式化日期
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 日期偏移
function addDays(dateStr, days) {
  const date = parseDate(dateStr)
  if (!date) return null
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

// 计算日期差
function dateDiff(endDateStr, startDateStr) {
  const start = parseDate(startDateStr)
  const end = parseDate(endDateStr)
  if (!start || !end) return NaN
  return Math.floor((end - start) / (24 * 60 * 60 * 1000))
}

// 比较日期
function compareDate(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

// 获取较小日期
function minDate(a, b) {
  if (!a) return b || null
  if (!b) return a || null
  return compareDate(a, b) <= 0 ? a : b
}

// 构建日期范围内的所有日期数组
function buildDateRange(startDate, endDate) {
  const dates = []
  const current = parseDate(startDate)
  const end = parseDate(endDate)
  if (!current || !end || current > end) return dates
  while (current <= end) {
    dates.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// 获取自然周范围（周一到周日）
function getWeekRange(date) {
  const d = parseDate(date) || new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(d)
  start.setDate(diff)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  }
}

// 获取自然月范围
function getMonthRange(date) {
  const d = parseDate(date) || new Date()
  const year = d.getFullYear()
  const month = d.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  return {
    startDate: formatDate(firstDay),
    endDate: formatDate(lastDay)
  }
}

// 获取自然年范围
function getYearRange(date) {
  const d = parseDate(date) || new Date()
  const year = d.getFullYear()
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  }
}

// 判断是否为未来日期
function isFutureDate(dateStr) {
  return compareDate(dateStr, getBusinessDate()) > 0
}

// 判断是否同一业务日
function isSameBusinessDay(a, b) {
  return compareDate(a, b) === 0
}

// 判断是否需要跨天刷新
function shouldRefreshByDate(lastDate, currentDate) {
  return lastDate && currentDate && compareDate(lastDate, currentDate) < 0
}

// 从云端刷新服务端时间
async function refreshServerTime(app) {
  try {
    const { result } = await wx.cloud.callFunction({ name: 'login' })
    if (result && result.serverTime) {
      const localNow = Date.now()
      _serverTimeOffset = result.serverTime - localNow
      _serverTimeConfidence = 'high'
      return { serverTime: result.serverTime, confidence: 'high' }
    }
  } catch (e) {
    console.error('refreshServerTime failed:', e)
  }
  _serverTimeConfidence = 'low'
  return { serverTime: Date.now(), confidence: 'low' }
}

module.exports = {
  getNow,
  getBusinessDate,
  getTodayKey,
  getSimulatedDate,
  getSimulatedDateStr,
  parseDate,
  formatDate,
  addDays,
  dateDiff,
  compareDate,
  minDate,
  buildDateRange,
  getWeekRange,
  getMonthRange,
  getYearRange,
  isFutureDate,
  isSameBusinessDay,
  shouldRefreshByDate,
  refreshServerTime
}
```

**创建文件**：`miniprogram/services/storageService.js`

```javascript
// services/storageService.js
// 所有本地缓存读写统一入口

const STORAGE_KEYS = {
  habits: 'MyHabits',
  logs: 'CheckinLogs',
  allHabitsInfo: 'AllHabitsInfo',
  userOpenid: 'user_openid',
  userInfo: 'userInfo',
  operationLogs: 'operationLogs',
  // 旧键（兼容）
  userStrategies: 'userStrategies',
  checkinRecords: 'checkin_records'
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getItem(key) {
  try {
    return wx.getStorageSync(key)
  } catch (e) {
    console.error(`storageService.getItem ${key} failed:`, e)
    return null
  }
}

function setItem(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error(`storageService.setItem ${key} failed:`, e)
    return false
  }
}

function getMyHabits() {
  return asArray(getItem(STORAGE_KEYS.habits))
}

function setMyHabits(habits) {
  return setItem(STORAGE_KEYS.habits, asArray(habits))
}

function getCheckinLogs() {
  return asArray(getItem(STORAGE_KEYS.logs))
}

function setCheckinLogs(logs) {
  return setItem(STORAGE_KEYS.logs, asArray(logs))
}

function getAllHabitsInfo() {
  return asObject(getItem(STORAGE_KEYS.allHabitsInfo))
}

function setAllHabitsInfo(info) {
  return setItem(STORAGE_KEYS.allHabitsInfo, asObject(info))
}

function getUserOpenid() {
  return getItem(STORAGE_KEYS.userOpenid)
}

function setUserOpenid(openid) {
  return setItem(STORAGE_KEYS.userOpenid, openid)
}

function getUserInfo() {
  return getItem(STORAGE_KEYS.userInfo)
}

function setUserInfo(info) {
  return setItem(STORAGE_KEYS.userInfo, info)
}

function removeItem(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    console.error(`storageService.removeItem ${key} failed:`, e)
  }
}

function clear() {
  try {
    wx.clearStorageSync()
  } catch (e) {
    console.error('storageService.clear failed:', e)
  }
}

module.exports = {
  STORAGE_KEYS,
  getItem,
  setItem,
  getMyHabits,
  setMyHabits,
  getCheckinLogs,
  setCheckinLogs,
  getAllHabitsInfo,
  setAllHabitsInfo,
  getUserOpenid,
  setUserOpenid,
  getUserInfo,
  setUserInfo,
  removeItem,
  clear
}
```

**创建文件**：`miniprogram/constants/storageKeys.js`

```javascript
// constants/storageKeys.js
// 存储 Key 常量

const STORAGE_KEYS = {
  // 当前使用
  habits: 'MyHabits',
  logs: 'CheckinLogs',
  allHabitsInfo: 'AllHabitsInfo',
  userOpenid: 'user_openid',
  userInfo: 'userInfo',
  operationLogs: 'operationLogs',

  // 旧键（兼容迁移）
  userStrategies: 'userStrategies',
  checkinRecords: 'checkin_records',

  // 新增（V2）
  dailyStates: 'dailyCheckinStates',
  cacheMeta: 'cacheMeta'
}

module.exports = { STORAGE_KEYS }
```

---

## E. 高风险点清单

### 最危险文件

| 文件 | 风险原因 |
|------|----------|
| miniprogram/app.js | 所有数据流的中枢，修改影响全局 |
| cloudfunctions/undoCheckin/index.js | 删除操作，边界条件处理不当会删数据 |
| cloudfunctions/syncLocalData/index.js | 数据恢复，覆盖本地数据 |
| miniprogram/pages/home/home.js | handleCheckin 是高频操作 |
| 云端 user_strategies | habit_id 作为主键，同一习惯无法多实例（架构级风险） |

### 最危险逻辑

1. **userHabitId 迁移**：MyHabits 中旧习惯没有 userHabitId，迁移时可能丢失关联
2. **handleCheckin 防抖**：processingHabitId 仅针对同一 habitId 防抖，多个不同 habitId 快速点击仍会并发
3. **syncFromCloud 合并**：pendingLogs 与 cloudLogs 合并时，冲突以云端为准，本地待同步数据直接丢弃
4. **undoCheckin 边界**：云端检查不到记录时返回成功，前端标记为已删除但实际可能没删

### 最危险同步链路

```
本地 addCheckinLog → sync_status=0 → 网络恢复 → syncToCloud
                                              ↓
                                     doCheckin 失败 → 停留在 sync_status=0
                                                      ↓
                                              重启后再次同步 → 可能重复
```

### 最危险数据结构

```javascript
// CheckinLogs 中的 habitId 可能为多种类型
{ habitId: 'h_001' }      // 字符串（旧）
{ habitId: 1 }             // 数字（旧）
{ habit_id: 'h_001' }      // 下划线格式（云端）
{ userHabitId: 'uh_xxx' }  // 新结构
```

### 最容易造成历史数据污染的位置

1. **app.js migrateOldStrategy/migrateOldRecords**：旧数据结构迁移时可能丢失数据
2. **stats.js mergeWithDeletedHabits**：合并已删除习惯时可能错误推断 freq_type
3. **阶段4 userHabitId 迁移**：旧 MyHabits 中每个习惯的 habitId 是 builtInHabit ID，迁移时必须生成新的 userHabitId 并建立映射关系

---

## F. AI协作开发规则

### AI 每次修改范围限制

1. **单次修改不超过 3 个文件**
2. **单次修改不超过 200 行代码变动**
3. **每个阶段完成后必须验证才能继续**

### AI 必须如何验证

1. **单元测试**：`npm test` 必须通过
2. **手动测试**：核心流程（添加习惯、打卡、查看报表）必须手动验证
3. **回归测试**：修改前后行为必须一致

### AI 不允许的行为

1. **禁止修改四主页面结构**（home/habits/stats/profile）
2. **禁止改变 UI 风格**（允许最小绑定调整，如 data-* 属性变化）
3. **禁止删除云函数**（但可以修改云函数内部逻辑）
4. **禁止破坏旧集合**（允许新增兼容集合，如 user_habits、habit_policy_versions）
5. **禁止在未验证阶段完成前进入下一阶段**
6. **禁止在前端 syncService 中使用 wx-server-sdk**

### AI 如何保持阶段可运行

1. **每个阶段必须能独立运行**
2. **阶段之间通过 feature flag 切换**
3. **旧代码保留但注释标注为废弃**（如 `// TODO: legacy, migrate to reportService`）
4. **新代码使用统一前缀标识**（如 `NEW_reportService`）

### AI 如何避免上下文失控

1. **每个阶段开始前读取 REFACTORING_PLAN.md**
2. **每次修改前对照本方案检查范围**
3. **每完成一个阶段输出阶段性总结**
4. **每阶段必须对齐 technical-architecture.md 的分层架构**

---

## G. 阶段验收标准

### 阶段0验收

| 标准 | 验证方式 |
|------|----------|
| 现状问题清单已记录 | 文档审查 |
| 差距分析已完成 | 对照 technical-architecture.md |

### 阶段1验收

| 标准 | 验证方式 |
|------|----------|
| timeService.js 已创建 | 文件存在 |
| storageService.js 已创建 | 文件存在 |
| constants 已创建 | 文件存在 |
| npm test 通过 | 测试通过 |
| 原有日期逻辑行为不变 | 手动测试 |

### 阶段2验收

| 标准 | 验证方式 |
|------|----------|
| builtInHabit 模型覆盖21个内置习惯 | 代码审查 |
| userHabit 模型有 userHabitId 字段 | 代码审查 |
| policyVersion 模型与 userHabit 关联 | 代码审查 |
| ID 体系设计文档已完成 | 文档审查 |

### 阶段3验收

| 标准 | 验证方式 |
|------|----------|
| dailyCheckinState 模型已创建 | 代码审查 |
| checkinService.js 已创建 | 代码审查 |
| home.js handleCheckin 调用 checkinService | 代码审查 |
| 断网时本地操作不丢失 | 手动测试（飞行模式） |
| 打卡/取消打卡状态正确反映在 UI | 手动测试 |

### 阶段4验收

| 标准 | 验证方式 |
|------|----------|
| cloudService.js 已创建 | 代码审查 |
| syncService.js 已创建（无 wx-server-sdk） | 代码审查 |
| 同步锁机制存在 | 代码审查 |
| 幂等性验证通过 | 重复同步不重复 |
| 断网重连同步正常 | 手动测试 |

### 阶段5验收

| 标准 | 验证方式 |
|------|----------|
| reportService.js 已创建 | 代码审查 |
| stats.js 无 legacyLoad* 方法 | 代码审查 |
| 周报/月报/年报数据一致 | 手动对比测试 |

### 阶段6验收

| 标准 | 验证方式 |
|------|----------|
| app.js 行数 < 400 | wc -l |
| 所有原有功能正常 | 全面手动测试 |
| 无 console.error 或 warning | 检查 console |

### 阶段7验收

| 标准 | 验证方式 |
|------|----------|
| userService.js 已创建 | 代码审查 |
| profile 页面数据正常 | 手动测试 |
| 登录流程正常 | 手动测试 |

---

## H. 旧数据迁移策略

### H.1 迁移概览

| 旧数据结构 | 新数据结构 | 迁移阶段 | 风险 |
|-----------|-----------|----------|------|
| MyHabits (无 userHabitId) | MyHabits (有 userHabitId) | 阶段3 | 高 |
| CheckinLogs (关联 habitId) | CheckinLogs (关联 userHabitId) | 阶段3 | 高 |
| userStrategies (云端) | user_habits + habit_policy_versions (云端) | 云函数 | 高 |
| AllHabitsInfo | 保持不变（用于历史习惯显示） | 阶段3 | 低 |

### H.2 MyHabits 迁移

**旧结构**：
```javascript
{
  habitId: '1',          // builtInHabit ID
  name: '金刚功',
  freq_type: 'daily',
  freq_rules: 1,
  createdAt: '2026-04-13',
  plan_start_date: '2026-04-13'
}
```

**新结构**：
```javascript
{
  userHabitId: 'uh_4f3a2b1c',  // 新增：UUID
  habitId: '1',                 // 保留：builtInHabit ID
  name: '金刚功',
  freq_type: 'daily',
  freq_rules: 1,
  createdAt: '2026-04-13',
  plan_start_date: '2026-04-13',
  status: 'active',             // 新增：active/deleted
  latestPolicyVersionId: '',     // 新增
  syncStatus: 1                  // 新增
}
```

**迁移步骤**：
1. 读取旧 MyHabits
2. 为每条记录生成新的 `userHabitId`（UUID v4）
3. 补充 `status: 'active'`, `syncStatus: 1`
4. 保存新结构到 storage
5. 建立 `habitId -> userHabitId` 映射表（用于 CheckinLogs 迁移）

### H.3 CheckinLogs 迁移

**旧结构**：
```javascript
{
  logId: 'L_123',
  habitId: '1',        // builtInHabit ID（旧）
  date: '2026-05-22',
  sync_status: 1
}
```

**新结构**：
```javascript
{
  logId: 'L_123',
  userHabitId: 'uh_4f3a2b1c',  // 新增：用户习惯实例ID
  habitId: '1',                 // 保留：builtInHabit ID（冗余，便于查询）
  date: '2026-05-22',
  sync_status: 1
}
```

**迁移步骤**：
1. 读取旧 CheckinLogs
2. 对每条记录，通过 `habitId -> userHabitId` 映射表查找对应的 userHabitId
3. 如果找不到映射（理论上不应该找不到），保留旧结构，标记为需要修复
4. 补充 `userHabitId` 字段
5. 保存新结构到 storage

### H.4 云端数据（user_strategies）

**约束**：云端集合结构**不可修改**，只能在业务层做映射

**映射策略**：
- 前端维护 `habitId -> cloudStrategyId` 映射（用于更新云端记录）
- 同一 habitId 多次添加时，云端 user_strategies 有多个记录（通过 createdAt 区分）
- 删除时不真正删除，而是 softDelete（设置 deleted_at 字段）

### H.5 迁移失败处理

| 场景 | 处理方式 |
|------|----------|
| MyHabits 读取失败 | 使用空数组，重新初始化 |
| userHabitId 生成失败 | 使用 `habitId + '_' + timestamp` 作为 fallback |
| CheckinLogs 迁移找不到映射 | 保留旧结构，标记 log 需要修复 |
| 云端数据拉取失败 | 使用本地缓存，提示"部分数据可能不是最新" |

### H.6 迁移验证

1. 迁移后首页正常显示习惯列表
2. 迁移后打卡记录正确关联到 userHabitId
3. 迁移后报表数据与迁移前一致（或明确差异）
4. 迁移后云端同步正常工作

---

## I. 阶段回滚策略

### I.1 回滚原则

1. **每个阶段必须能独立回滚**：删除/回退该阶段新增的文件，恢复到阶段开始前的状态
2. **回滚不应破坏已有数据**：回滚操作必须是可逆的
3. **回滚后必须验证**：回滚完成后必须确认功能正常

### I.2 各阶段回滚详细策略

| 阶段 | 回滚操作 | 回滚后状态 |
|------|----------|-----------|
| 阶段0 | 无需回滚 | 不涉及代码变更 |
| 阶段1 | 删除 `services/timeService.js`, `services/storageService.js`, `constants/` 目录 | 原有日期逻辑和存储逻辑不变 |
| 阶段2 | 删除 `models/` 目录, `constants/habitLibrary.js` | 无数据模型变更，不影响 |
| 阶段3 | 删除 `services/habitService.js`, `services/checkinService.js`, `models/` 目录；MyHabits 回退到旧结构（无 userHabitId）；CheckinLogs 回退到旧结构（无 userHabitId）；home.js 回退到直接操作 CheckinLogs；habits.js 回退到直接操作 MyHabits | userHabitId 概念消失，回到用 habitId 作为实例 ID 的状态 |
| 阶段4 | 删除 `services/cloudService.js`, `services/syncService.js`, `services/migrationService.js`；app.js 回退到旧的同步逻辑 | 同步回到原始状态 |
| 阶段5 | 删除 `services/reportService.js`；stats.js 恢复 legacy 方法 | 报表回到原始状态 |
| 阶段7 | 回退 app.js 到阶段6状态；service 层文件保留（被阶段6引用） | app.js 回到过重状态 |

### I.3 回滚触发条件

以下情况应触发回滚：

1. **阶段验收标准未达成**（如 npm test 失败、手动测试发现功能异常）
2. **回滚验证发现新问题**（回滚后功能异常比阶段内更严重）
3. **阶段内引入严重 bug**（如数据丢失、功能完全失效）

### I.4 回滚执行流程

1. 确认回滚目标阶段（如回滚到阶段3开始时状态）
2. 备份当前代码（git commit 或复制目录）
3. 执行回滚操作（删除/回退文件）
4. 运行 `npm test` 验证测试通过
5. 手动验证核心功能（添加习惯、打卡、查看报表）
6. 如果验证失败，切换到备份继续修复

### I.5 多阶段连续回滚

如果需要回滚多个阶段（如从阶段6回滚到阶段3）：

1. 从阶段6开始，依次执行各阶段的回滚操作
2. 每个阶段回滚后验证
3. 如果验证失败，停止回滚，保留当前状态

---

## J. 分层架构检查清单

每个阶段完成后，必须确认以下分层边界：

| 层级 | 允许操作 | 禁止操作 |
|------|----------|----------|
| pages | 调用 services，渲染数据，触发用户事件 | 直接 wx.getStorageSync/wx.cloud.callFunction，直接拼报表，直接 new Date() |
| services | 调用其他 services，调用 storageService/cloudService，调用云函数 | 直接操作 DOM，不应直接被页面操作 storage（应通过 storageService） |
| storage | 读写 storage | 业务逻辑 |
| cloudService | 调用 wx.cloud.callFunction | 直接操作数据库 |
| models | 声明数据结构 | 业务逻辑 |
| constants | 声明常量 | 运行时逻辑 |
| utils | 无副作用工具函数 | 业务逻辑 |
| cloudfunctions | 业务逻辑，数据读写 | 直接被页面调用（应通过 cloudService） |

---

## K. 关键约束汇总

1. **禁止前端使用 wx-server-sdk**：所有云函数调用必须通过 `wx.cloud.callFunction`
2. **禁止破坏旧集合**：允许新增兼容集合（如 user_habits、habit_policy_versions），但不可破坏现有 user_strategies、checkin_logs 等旧集合的结构
3. **禁止删除云函数**：只能修改云函数内部实现，不能删除
4. **禁止修改四主页面结构**：home/habits/stats/profile 的页面结构不可改
5. **禁止改变 UI 风格**：允许最小绑定调整（如 data-* 属性变化），但不可修改视觉样式或布局
6. **禁止在未验证阶段完成前进入下一阶段**
7. **单次修改不超过 3 个文件、不超过 200 行**
8. **userHabitId 必须唯一**：每次添加同一内置习惯必须生成新的 userHabitId
9. **禁止用 habitId.js 掩盖 userHabitId 问题**：必须显式设计迁移策略
10. **userHabitId 迁移优先于 DailyCheckinState**：阶段3必须先完成 userHabitId 迁移，再建立打卡链路

---

*本方案为子午花信小程序 V1 重构的正式工程依据，所有重构工作须严格按阶段执行。本方案必须与 technical-architecture.md 对齐使用。*