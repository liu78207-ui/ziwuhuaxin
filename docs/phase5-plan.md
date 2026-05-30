# Phase 5 实施方案：reportService + 报表聚合口径治理

> 生成时间：2026/05/28
> 修订时间：2026/05/28
> 阶段：Phase 5
> 依赖：Phase 3（userHabitId 生命周期）、Phase 4（syncService + cloudService）完成
> 状态：正式方案（v2，修复 Phase 评审问题后版本）

---

## 1. 阶段目标

Phase 5 的核心目标是：**建立统一的 reportService / reportAggregator，让所有报表口径统一来源于 userHabitId 生命周期、policyVersion 日期命中和 DailyCheckinState 状态**，同时保留旧报表可回滚路径。

具体目标：

1. **建立 reportAggregator 纯计算层**：只做统计计算，不做数据获取
2. **建立 reportService 服务层**：统一数据获取、状态裁决、报表输出
3. **支持 policyVersion 按日期命中**：同一 userHabitId 在不同日期使用不同策略版本
4. **支持 DailyCheckinState 作为每日最终状态来源**：CheckinOperation 仅作流水审计
5. **支持同一 habitId 多个 userHabitId 的历史聚合展示**：先按 userHabitId 独立计算，再按 habitId 聚合
6. **支持删除后重加的分段统计**：新生命周期不继承旧生命周期的完成记录
7. **支持周报 / 月报 / 年报统一聚合口径**
8. **为 stats.js 最小接入 reportService 做准备**：不改 UI，只改 JS 调用路径
9. **保留旧报表可回滚路径**：stats.js 逐步切换，非一次性删除旧逻辑

---

## 2. 本阶段边界

### 2.1 允许修改范围

- 新建 `services/reportAggregator.js`（纯计算层）
- 新建 `services/reportService.js`（服务层）
- 新建 `models/reportData.js`（报表输出数据结构）
- 修改 `constants/frequencyTypes.js`（如需补充频率类型常量）
- 修改 `pages/stats/stats.js`（最小 JS 接入，不改 WXML/WXSS/UI）
- 修改 `services/timeService.js`（如需补充报表周期方法）
- 增加单元测试 `__tests__/unit/services/reportService.test.js`
- 增加集成测试 `__tests__/integration/reportService.test.js`

### 2.2 禁止修改范围

- 禁止修改 WXML / WXSS
- 禁止修改 UI 风格
- 禁止修改 home.js / habits.js / profile.js
- 禁止修改 syncService / cloudService
- 禁止修改云函数同步逻辑
- 禁止引入 EventBus / IOC / Repository / 状态管理框架
- 禁止引入复杂缓存系统
- 禁止一次性删除旧报表逻辑（必须保留可回滚路径）
- 禁止提前进入 AI、分享、复盘、推荐等后续阶段

---

## 3. 当前基础与依赖

Phase 2 / 3 / 4 已完成成果如何被 Phase 5 使用：

| Phase | 已完成成果 | Phase 5 如何使用 |
|---|---|---|
| Phase 2 | `timeService`（统一业务时间） | 报表周期计算、今日判断、未来日期判断 |
| Phase 2 | `constants/storageKeys.js` | 报表不直接读写存储，通过 reportService 获取 |
| Phase 3 | `models/userHabit.js`（userHabitId 生命周期） | 按 userHabitId 独立计算生命周期边界 |
| Phase 3 | `models/policyVersion.js`（策略版本） | 按日期命中有效 policyVersion |
| Phase 3 | `models/dailyCheckinState.js`（每日最终状态） | 报表读取 DailyCheckinState，不直接累计 operation |
| Phase 3 | `models/checkinOperation.js`（操作流水） | 仅作流水审计，不直接作为报表统计源 |
| Phase 3 | `habitService`（习惯实例 + 策略管理） | 获取 active userHabits 和 policyVersions |
| Phase 3 | `checkinService`（打卡/取消） | DailyCheckinState 由 checkinService 写入，reportService 只读 |
| Phase 4 | `syncService`（pending + 同步） | 报表数据最终来自云端同步后的状态 |
| Phase 4 | `cloudService`（云函数封装） | reportService 通过 storageService 读取本地缓存，不直连云函数 |

---

## 4. 核心数据来源

说明各数据模型在报表中的角色：

### userHabits

- **角色**：定义用户习惯实例的生命周期
- **报表使用方式**：
  - `status = 'active'` 的实例参与当前报表周期
  - `status = 'deleted'` 的实例保留历史记录，删除日之后不参与分母
  - `createdAt` 和 `deletedAt` 界定有效打卡日期区间：`createdAt <= date < deletedAt`
- **禁止**：直接用 `habitId` 作为生命周期边界

### policyVersions

- **角色**：定义某 userHabitId 在某段时间内的应修规则
- **报表使用方式**：
  - 按 `date` 查找该日期有效的 `policyVersion`（`effectiveStartDate <= date <= effectiveEndDate`，其中 `effectiveEndDate = null` 表示当前有效版本，开放结束）
  - 策略版本控制应修频次（daily / weekly / interval）
  - 策略修改当天生成新版本，旧版本 `effectiveEndDate = 修改日`，旧版本当天仍有效（打卡按旧版算）
  - 新版本从次日开始参与应修判定
- **禁止**：直接把多个 policyVersion 的应修日期合并计算

### dailyCheckinStates

- **角色**：每日最终打卡状态，是报表完成状态的事实来源
- **报表使用方式**：
  - `status = 'checked'`：计入分母和分子
  - `status = 'unchecked'`：计入分母，不计分子
  - `status = 'canceled'`：计入分母（在普通应修日），不计分子
  - `status = 'not_required'`：不计入分母和分子
- **禁止**：直接累计 CheckinLogs 或 checkin_operations 作为最终完成状态

### checkinOperations

- **角色**：打卡操作流水，用于同步审计和冲突排查
- **报表使用方式**：
  - 不直接参与报表统计计算
  - 用于 `dailyCheckinState` 的来源更新
  - 用于排查"昨天明明打卡了，为什么报表没显示"
- **禁止**：直接作为分母或分子的统计源

### habitLibrary

- **角色**：补充习惯名称、分类、图标、主题
- **报表使用方式**：
  - 报表按 `habitId` 聚合展示时，优先使用 `builtInHabit` 的名称/图标/主题
  - 历史习惯（已删除）可使用快照兜底文案

### habitThemes

- **角色**：报表卡片的主题色映射
- **报表使用方式**：
  - 周点阵、月历状态格子的颜色主题

---

## 5. 报表计算原则

必须明确以下原则：

### 5.1 userHabitId 是生命周期计算边界

- 同一 `habitId` 多次添加会生成多个 `userHabitId`，生命周期独立
- 报表必须先按 `userHabitId` 独立计算，再按 `habitId` 聚合展示
- 禁止把旧生命周期的打卡状态合并到新生命周期

### 5.2 habitId 只用于聚合展示

- `habitId` 在报表中仅用于将多个 `userHabitId` 聚合为同一习惯卡片
- `habitId` 不得作为应修判定、状态归属或完成率计算的边界

### 5.3 policyVersion 控制应修日

- 应修日由 `policyVersion.frequencyType` 和 `frequencyConfig` 控制
- `daily`：从 `effectiveStartDate` 起每日应修（删除日/结束日后不应修）
- `weekly`：`frequencyConfig.weekdays` 数组定义应修星期（周一=1，周日=7）
- `interval`：`date` 与锚定日期的间隔天数必须整除 `frequencyConfig.intervalDays`

### 5.4 DailyCheckinState 控制完成状态

- 报表完成状态以 `dailyCheckinState.status` 为准
- `checked` 才计入分子
- `canceled` 在普通应修日计入分母但不计分子

### 5.5 CheckinOperation 不直接作为最终完成状态

- `checkin_operations` 只用于流水审计和同步
- 报表统计只读取 `dailyCheckinState`，不直接累计 operation

### 5.6 deleted userHabit 保留历史

- `status = 'deleted'` 的实例，其 `createdAt ~ deletedAt` 区间内的打卡记录保留
- 删除日之后不再计入分母，但历史周期内的记录仍可解释

### 5.7 canceled 不计入完成

- `status = 'canceled'` 视为用户主动取消，当日已完成次数不计入分子
- 但在普通应修日仍计入分母（用户确实应该修，只是取消了）

---

## 6. 文件修改清单

### 6.1 必须新增

| 文件 | 性质 | 说明 |
|---|---|---|
| `miniprogram/services/reportAggregator.js` | 新增 | 报表纯计算层：无副作用，接受纯数据输入，输出统计结果 |
| `miniprogram/services/reportService.js` | 新增 | 报表服务层：统一数据获取、策略命中、状态裁决、报表输出 |
| `miniprogram/models/reportData.js` | 新增 | 报表输出数据结构：周报、月报、年报、日历状态、热力状态 |

### 6.2 允许修改

| 文件 | 性质 | 说明 |
|---|---|---|
| `miniprogram/pages/stats/stats.js` | 修改 | 最小 JS 接入 reportService，逐步废弃 legacy 方法 |
| `miniprogram/constants/frequencyTypes.js` | 修改 | 如需补充周频次类型常量 |
| `miniprogram/services/timeService.js` | 修改 | 如需补充 `getYearRange`、`isDueDate` 等方法 |

### 6.3 禁止修改

| 文件 | 说明 |
|---|---|
| `miniprogram/pages/home/home.js` | 禁止修改 |
| `miniprogram/pages/habits/habits.js` | 禁止修改 |
| `miniprogram/pages/profile/profile.js` | 禁止修改 |
| `miniprogram/services/syncService.js` | 禁止修改 |
| `miniprogram/services/cloudService.js` | 禁止修改 |
| `miniprogram/services/checkinService.js` | 禁止修改 |
| `miniprogram/services/habitService.js` | 禁止修改 |
| `miniprogram/models/dailyCheckinState.js` | 禁止修改数据结构 |
| `miniprogram/models/checkinOperation.js` | 禁止修改数据结构 |
| `miniprogram/models/userHabit.js` | 禁止修改数据结构 |
| `miniprogram/models/policyVersion.js` | 禁止修改数据结构 |
| `miniprogram/constants/habitLibrary.js` | 禁止修改 |
| `miniprogram/constants/habitThemes.js` | 禁止修改 |

---

## 7. 实施步骤

### Phase 5A：reportAggregator 纯计算层

**目标**：建立无副作用的纯计算层，接受纯数据输入，输出统计结果

**修改文件**：
- 新增 `miniprogram/services/reportAggregator.js`

**核心函数**：

```javascript
// reportAggregator.js 核心接口

// 纯计算，不涉及数据获取

// 每日应修裁决函数（核心新函数，替代 isDueOnDate）
// 输入完整上下文，返回结构化裁决结果
function resolveReportDayStatus(context)
// context = {
//   userHabit,          // UserHabit 实例（含 createdAt/deletedAt）
//   policyVersion,      // 该日期命中的 policyVersion（可能为 null）
//   dailyState,         // DailyCheckinState（可能为 null）
//   date,               // YYYY-MM-DD
//   todayKey,           // 当前业务日期
//   dateConfidence,     // 'high' | 'low'
//   lockSnapshot        // 锁定快照对象（删除当天/策略修改当天可能有）
// }
// 返回：
// {
//   status,             // 'checked' | 'unchecked' | 'canceled' | 'not_required' | 'future' | 'low_confidence'
//   isDue,              // boolean：是否计入应修（分母候选）
//   contributesDenominator,  // boolean：是否计入分母
//   contributesNumerator,    // boolean：是否计入分子
//   reason,             // string：裁决依据（如 'deleted_after_checkin', 'strategy_changed_before_checkin'）
//   effectivePolicyVersionId // string|null：命中的策略版本 ID
// }

// 批量裁决：为周期内每一天生成 resolveReportDayStatus 结果
function buildDayVerdicts(userHabit, policyVersions, dailyStates, startDate, endDate, todayKey, dateConfidence, lockSnapshots)

// 统计聚合（基于每日裁决结果）
function calculateDueCount(dayVerdicts)           // 从 dayVerdicts 统计 isDue=true 的天数
function calculateDoneCount(dayVerdicts)           // 从 dayVerdicts 统计 status='checked' 的天数
function calculateCompletionRate(doneCount, dueCount)
function calculateStreak(dayVerdicts)              // 基于 dayVerdicts 计算连日
function calculateCumulativePractice(dayVerdicts) // 基于 dayVerdicts 统计累计

// 策略相关（辅助函数，供 resolveReportDayStatus 调用）
function resolveEffectivePolicyVersion(policyVersions, date)
function isDueOnDateByFrequency(policyVersion, date)

// 按 habitId 聚合多个 userHabitId 的独立报表
function aggregateByHabitId(instanceReports)
function buildWeekReport(instanceReports, weekStart)
function buildMonthReport(instanceReports, month)
function buildYearReport(instanceReports, year)
function buildCalendarStatus(calendarDays, instanceReports)
function buildHeatmapStatus(yearDays, instanceReports)
```

**重要**：所有需要判断某日是否应修的逻辑，必须调用 `resolveReportDayStatus`，传入完整上下文，不得仅靠 `policyVersion` 和 `date` 二参数判断。

**输入**（均为纯数据）：
```javascript
{
  userHabits: UserHabit[],           // 用户习惯实例数组
  policyVersions: PolicyVersion[],  // 策略版本数组（按 userHabitId 分组）
  dailyStates: DailyCheckinState[],   // 每日状态数组
  builtInHabits: BuiltInHabit[],     // 内置习惯定义（补充名称/图标/主题）
  period: { startDate, endDate, type },
  todayKey: string,                  // 当前业务日期 YYYY-MM-DD
  dateConfidence: 'high' | 'low',    // 日期可信度
  lockSnapshots: object[]            // 锁定快照数组 [{date, reason, userHabitId}]
}
```

> **关于 lockSnapshots**：删除当天、策略修改当天可能存在锁定快照，记录该日不需要正常应修判定。"删除当天已打卡"和"策略修改当天已打卡"由 `lockSnapshot` 或 `dailyState` 的最终状态共同决定是否计入分母/分子。

**输出**（均为纯数据）：
```javascript
{
  reportType,        // 'weekly' | 'monthly' | 'yearly'
  startDate,
  endDate,
  stats: {
    completionRate,  // 完成率
    doneCount,       // 分子
    dueCount,        // 分母
    checkinDays,     // 坚持时日
    maxStreak,      // 最长连日
    cumulative       // 累计修习
  },
  habitGroups: [
    {
      habitId,
      name,
      theme,
      instances: [
        {
          userHabitId,
          createdAt,
          deletedAt,
          days: [
            {
              date,
              status,        // 'checked' | 'unchecked' | 'canceled' | 'not_required' | 'future'
              isDue,
              isStreakDay
            }
          ],
          stats: { doneCount, dueCount, completionRate, maxStreak }
        }
      ],
      summary: { doneCount, dueCount, completionRate }
    }
  ],
  calendarStatus,    // 月历时历状态
  heatmapStatus     // 年热力状态
}
```

**验收标准**：
1. `resolveReportDayStatus` 对普通应修日返回正确 `isDue=true`
2. `resolveReportDayStatus` 对删除当天、策略修改当天的裁决与 v1-report-rules.md 一致（已打卡 checked 计分母/分子，未打卡不计，取消后按取消状态）
3. `resolveReportDayStatus` 对未来日期返回 `status='future', isDue=false`
4. `resolveReportDayStatus` 对低可信日期返回 `status='low_confidence', isDue=false`
5. `calculateStreak` 在非应修日不打断 streak，但也不增加 streak
6. `resolveEffectivePolicyVersion` 按日期正确命中策略版本（含 `effectiveEndDate=null` 表示开放结束）
7. `aggregateByHabitId` 将多个 userHabitId 聚合为同一 habitId 卡片
8. 周报 7 天数据完整，月报覆盖自然月，年报覆盖 1-12 月
9. `npm test -- __tests__/unit/services/reportAggregator.test.js` 通过

**回滚方式**：删除 `reportAggregator.js`，stats.js 继续使用旧方法

---

### Phase 5B：reportService 服务层封装

**目标**：封装数据获取、状态裁决和报表输出，提供统一入口

**修改文件**：
- 新增 `miniprogram/services/reportService.js`
- 新增 `miniprogram/models/reportData.js`

**核心接口**：

```javascript
// reportService.js 核心接口

// 服务层：统一数据获取 + 计算 + 输出
async function getWeeklyReport(weekStart)      // 周报
async function getMonthlyReport(month)         // 月报
async function getYearlyReport(year)           // 年报
async function getTodayProgress()              // 今日进度（供首页）—— **本阶段只定义方法，home.js 不接入**
async function getHabitReport(habitId)         // 单习惯历史报表

// 内部方法
function buildPeriod(type, anchorDate)          // 构建报表周期
function resolvePolicyForDate(userHabitId, date) // 查找某日有效的策略版本
function fetchUserHabits(status)               // 获取用户习惯实例
function fetchDailyStates(startDate, endDate)   // 获取每日状态
function resolveLockSnapshot(date)             // 解析锁定快照（删除当天、策略修改当天）
```

> **注意**：Phase 5 **不实现主动缓存失效机制**。
> - reportService 默认每次运行时实时计算，不依赖外部触发的缓存失效
> - 如需保留短缓存（内存级别，不持久化），只允许 reportService 内部临时缓存，不修改 checkinService / habitService / syncService 的任何逻辑
> - 正式的 cache invalidation（跨 service 的缓存失效联动）留到后续"缓存治理阶段"处理
> - Phase 5 目标单一：建立正确的报表口径，不承担缓存架构职责

**数据获取路径**：
```
reportService
  -> storageService.getMyHabitsWithMigration()  获取 userHabits
  -> storageService.getPolicyVersions()          获取 policyVersions
  -> storageService.getDailyCheckinStates()     获取 dailyStates
  -> habitService.getBuiltInHabits()            获取 builtInHabits（补充名称/图标/主题）
  -> timeService.getWeekRange / getMonthRange / getYearRange  生成周期
  -> reportAggregator.calculate*                执行统计计算
  -> 返回 reportData 结构
```

**特殊口径处理**（通过 `resolveReportDayStatus` 统一裁决）：

裁决函数输入完整上下文（userHabit、policyVersion、dailyState、date、todayKey、dateConfidence），返回 `{ status, isDue, contributesDenominator, contributesNumerator, reason }`。

1. **删除当天**：
   - 删除当天 = `userHabit.deletedAt === date`
   - **已打卡且最终 checked**：`contributesDenominator=true, contributesNumerator=true`（分母+1，分子+1）
   - **已打卡后取消（最终 canceled）**：`contributesDenominator=false, contributesNumerator=false`（不计入）
   - **未打卡（unchecked）**：`contributesDenominator=false, contributesNumerator=false`（不计入）
   - 删除日之后：`isDue=false`（不再计入应修）

2. **策略修改当天**：
   - 策略修改当天 = `policyVersion.effectiveEndDate === date` 的旧版本存在
   - 打卡时命中旧版本，该日使用旧版本应修规则
   - **已打卡且最终 checked**：`contributesDenominator=true, contributesNumerator=true`
   - **已打卡后取消（最终 canceled）**：`contributesDenominator=false, contributesNumerator=false`
   - **未打卡（unchecked）**：`contributesDenominator=false, contributesNumerator=false`
   - 新策略从次日开始参与应修

3. **未来日期**：
   - `timeService.isFutureDate(date)` 判断
   - 返回 `status='future', isDue=false, contributesDenominator=false, contributesNumerator=false`

4. **非应修日**：
   - 策略无命中或 `isDueOnDateByFrequency` 返回 false
   - 返回 `status='not_required', isDue=false, contributesDenominator=false, contributesNumerator=false`

5. **低可信日期**：
   - `dateConfidence === 'low'`
   - 返回 `status='low_confidence', isDue=false, contributesDenominator=false, contributesNumerator=false`

6. **普通应修日 canceled**：
   - `dailyState.status === 'canceled'` 且不属于特殊日
   - `contributesDenominator=true, contributesNumerator=false`（分母+1，分子+0）

**验收标准**：
1. 周报/月报/年报数据与 v1-report-rules.md 一致
2. 删除当天口径正确（已打卡/未打卡/先打卡后取消）
3. 策略修改当天口径正确（已打卡/未打卡）
4. 同一 habitId 多 userHabitId 正确聚合，分母/分子相加
5. `npm test -- __tests__/unit/services/reportService.test.js` 通过
6. 手动测试：周报/月报/年报数据可人工核实

**回滚方式**：删除 `reportService.js`，stats.js 切换回旧方法（legacy）

---

### Phase 5C：stats.js 最小 JS 接入

**目标**：让 stats.js 调用 reportService，不改 UI，只改 JS 调用路径

**修改文件**：
- 修改 `miniprogram/pages/stats/stats.js`

**接入原则**：
1. stats.js 只调用 `reportService.getWeeklyReport()` / `getMonthlyReport()` / `getYearlyReport()`
2. 不直接在 stats.js 中计算分母、完成率、streak
3. 逐步废弃 `legacyLoadWeekData` / `legacyLoadMonthData` / `legacyLoadYearData` 方法
4. 保留旧方法作为回滚路径，新方法逐步切换

**最小接入步骤**：

1. **第一步**：在 stats.js 中引入 reportService
   ```javascript
   const reportService = require('../../services/reportService')
   ```

2. **第二步**：替换 `loadWeekData` 调用路径
   ```javascript
   // 旧
   const weekData = this.calculateWeekData(weekStart)
   // 新
   const weekData = await reportService.getWeeklyReport(weekStart)
   ```

3. **第三步**：替换 `loadMonthData` / `loadYearData` 调用路径

4. **第四步**：废弃 legacy 方法（保留代码，标注废弃）
   ```javascript
   // 废弃：迁移到 reportService 后删除
   // legacyLoadWeekData() { ... }
   ```

**UI 约束**：
- 不修改 WXML 结构
- 不修改 WXSS 样式
- 不修改 data 属性名称（保持与 WXML 绑定一致）
- 视图模型字段名与旧方法输出兼容

**验收标准**：
1. stats.js 切换后周报/月报/年报数据与切换前一致
2. stats.js 无新增直接计算报表逻辑
3. `rg -n "calculateDueCount|calculateStatsWithStrategy" miniprogram/pages/stats/stats.js` 仅返回废弃方法调用
4. 切换过程中小程序仍可运行
5. 手动测试：三个报表页面数据正确

**回滚方式**：stats.js 恢复调用 legacy 方法，恢复 `loadWeekData` → `legacyLoadWeekData`

---

### Phase 5D：测试与回归验证

**目标**：确保 reportService 报表口径正确，旧报表兼容

**修改文件**：
- 新增 `__tests__/unit/services/reportAggregator.test.js`
- 新增 `__tests__/unit/services/reportService.test.js`
- 新增 `__tests__/integration/reportService.test.js`

**测试用例覆盖**：

| 用例 | 验证点 |
|---|---|
| 每日习惯 | daily 频次从开始日起每日应修，分母正确 |
| 每周固定星期 | 只在命中星期应修，非应修日不计入分母 |
| 间隔天数 | 从锚定日起按间隔天数应修，策略修改后重新锚定 |
| 策略修改当天 | **已打卡（最终 checked）**：分母+1，分子+1；**已打卡后取消（最终 canceled）**：分母+0，分子+0；**未打卡**：分母+0，分子+0 |
| 删除当天 | **已打卡（最终 checked）**：分母+1，分子+1；**已打卡后取消（最终 canceled）**：分母+0，分子+0；**未打卡（unchecked）**：分母+0，分子+0 |
| 同 habitId 多 userHabitId | 分母/分子各自独立计算后相加，聚合完成率正确 |
| canceled 状态 | **普通应修日**：分母+1，分子+0；**特殊日**：按特殊口径处理 |
| unchecked 状态 | 计入分母（在应修日），不计分子 |
| not_required 状态 | 不计入分母和分子 |
| 非应修日 | 不计入分母和分子 |
| 未来日期 | 不计入分母和分子 |
| 低可信日期 | 不计入分母和分子 |
| 周报周期一致性 | 周一至周日，7天 |
| 月报周期一致性 | 自然月第一天到最后一天 |
| 年报周期一致性 | 1月1日至12月31日 |
| 周/月/年完成率除零安全 | dueCount=0 时不报错 |
| 周 streak 计算 | 非应修日不打断 streak |
| 累计修习 | 只统计 checked 状态 |
| 坚持时日 | 按自然日去重 |
| 最长连日 | 不跨出当前报表周期 |

**验收标准**：
1. `npm test -- __tests__/unit/services/reportAggregator.test.js` 通过
2. `npm test -- __tests__/unit/services/reportService.test.js` 通过
3. `npm test -- __tests__/integration/reportService.test.js` 通过
4. 报表数据与人工核实一致
5. stats.js 切换后 UI 展示不变

**回滚方式**：
- 如果单元测试失败，回退 reportService.js 和 reportAggregator.js
- 如果集成测试失败，回退 stats.js 的调用切换
- 保留旧方法作为完整回滚路径

---

## 8. 测试计划

### 单元测试（reportAggregator）

测试纯计算函数，无 I/O：

```javascript
// calculateDueCount 测试
calculateDueCount(userHabitId, dailyPolicy, '2026-05-01', '2026-05-07')
  // 应返回 7（每日应修）

calculateDueCount(userHabitId, weeklyPolicy({ weekdays: [1, 3, 5] }), '2026-05-01', '2026-05-07')
  // 应返回 3（周一、周三、周五）

calculateDueCount(userHabitId, intervalPolicy({ intervalDays: 2 }), '2026-05-01', '2026-05-07')
  // 应返回 3（5/1锚定，5/3, 5/5 应修）
```

### 单元测试（reportService）

测试服务层 mock 数据获取：

```javascript
// getWeeklyReport 测试
// mock storageService.getMyHabitsWithMigration() 返回测试数据
// mock storageService.getPolicyVersions() 返回测试数据
// mock storageService.getDailyCheckinStates() 返回测试数据
// 验证输出结构符合 reportData.js 定义
```

### 集成测试

测试真实数据流：

```javascript
// 真实 storageService 数据
// 验证 reportService 输出与 v1-report-rules.md 一致
// 验证 stats.js 切换后 UI 不变
```

---

## 9. 风险与回滚

### 数据口径风险

**风险**：新旧报表口径不一致，导致用户看到的完成率变化

**控制**：
- Phase 5C 切换前，stats.js 同时保留新旧方法，对比输出
- 如果口径不一致，修复 reportService 直到一致
- 切换后保留 legacy 方法作为回滚

### UI 回归风险

**风险**：stats.js 切换后 UI 展示异常

**控制**：
- 只改 JS，不改 WXML/WXSS
- 视图模型字段名与旧方法输出兼容
- 切换后手动测试三个报表页面

### 旧报表兼容风险

**风险**：stats.js 的 legacyLoadWeekData 等方法与 reportService 输出结构不完全一致

**控制**：
- 切换后如果发现字段不一致，在 reportService 中调整输出字段名（而非修改 legacy 方法）
- 保留 legacy 方法到 Phase 6 以后

### userHabitId 混算风险

**风险**：同一 habitId 多个 userHabitId 时，报表把旧生命周期的打卡算到新生命周期

**控制**：
- 每个 userHabitId 独立计算生命周期区间：`createdAt <= date < deletedAt`
- 删除日后不计入分母，即使有打卡记录

### policyVersion 命中错误风险

**风险**：策略修改当天，新旧版本命中逻辑错误

**控制**：
- 策略修改当天，旧版本在该日仍有效
- 新版本从次日开始参与应修判定
- 打卡记录按打卡时的版本算

---

## 10. Phase 5 验收标准

| 验收项 | 标准 | 验证方式 |
|---|---|---|
| reportAggregator 纯计算层建立 | calculateDueCount / calculateDoneCount / calculateStreak 等核心函数可单元测试 | 单元测试 |
| reportService 服务层建立 | getWeeklyReport / getMonthlyReport / getYearlyReport 输出正确结构 | 单元测试 |
| policyVersion 按日期命中 | 同一 userHabitId 不同日期使用不同策略版本 | 单元测试 |
| DailyCheckinState 作为最终状态 | 分母/分子以 dailyCheckinState.status 为准 | 单元测试 |
| CheckinOperation 仅作审计 | 报表不直接累计 operation | 代码审查 |
| 同一 habitId 多 userHabitId 聚合 | 分母/分子相加，聚合完成率正确 | 单元测试 |
| deleted userHabit 保留历史 | 删除日之前计入分母/分子，之后不计 | 单元测试 |
| canceled 不计入分子 | canceled 状态计入分母但不计分子 | 单元测试 |
| 未来日期不计入分母 | isFutureDate(date) = true 不计入 | 单元测试 |
| 非应修日不计入分母 | isDueOnDate 返回 false 不计入 | 单元测试 |
| 周报 7 天数据完整 | 周一至周日，7天点阵状态正确 | 单元测试 |
| 月报覆盖自然月 | 自然月第一天到最后一天 | 单元测试 |
| 年报覆盖 1-12 月 | 1月1日至12月31日 | 单元测试 |
| 完成率除零安全 | dueCount=0 时不报错 | 单元测试 |
| stats.js 最小接入 | 只改 JS 调用路径，不改 UI | 手动测试 |
| legacy 方法保留 | legacyLoadWeekData 等方法仍可回滚 | 代码审查 |
| npm test 通过 | 所有单元测试通过 | CI |
| UI 展示不变 | 周报/月报/年报页面数据正确 | 手动测试 |

---

## 11. 不进入本阶段的内容

以下内容属于 Phase 6 或后续阶段：

- **Phase 6**：页面层瘦身（home.js / habits.js / profile.js 接入 service）
- **Phase 7（GOAL_DRIVEN.md 定义）**：AI 能力预留（aiService / deepseekProxy）
- **Phase 8（GOAL_DRIVEN.md 定义）**：UI Token 局部对齐
- **Phase 9（GOAL_DRIVEN.md 定义）**：测试、验收与回归

以下能力不在 Phase 5 范围内：

- 重构 home.js / habits.js / profile.js
- 修改 syncService / cloudService 云同步逻辑
- 引入 EventBus / IOC / Repository / 状态管理框架
- 引入复杂缓存系统（如 Redis）
- 实现 AI 复盘文案生成
- 实现分享能力
- 实现推荐能力
- 实现多端冲突完整裁决（CRDT/OT）
- 一次性删除所有 legacyLoad* 方法

---

## 12. 实施顺序建议

```
Phase 5A（reportAggregator 纯计算层）
  ↓ 验收通过后
Phase 5B（reportService 服务层封装）
  ↓ 验收通过后
Phase 5C（stats.js 最小 JS 接入）
  ↓ 验收通过后
Phase 5D（测试与回归验证）
  ↓ 全部通过
进入 Phase 6
```

每个小阶段完成后：
1. 运行 `npm test -- __tests__/unit/services`
2. 手动测试对应功能
3. 确认无新增页面层禁止事项
4. 再进入下一个阶段

---

## 13. 与 GOAL_DRIVEN.md Phase 7 的定义差异说明

**差异**：GOAL_DRIVEN.md 中 Phase 7 为 `ReportService / ReportAggregator`，而本方案将 ReportService 放在 Phase 5。

**原因**：
1. REFACTORING_PLAN.md 明确将 ReportService 列为 Phase 5
2. Phase 3 和 Phase 4 已完成 userHabitId 生命周期、checkinService、syncService、cloudService
3. Phase 5 时机成熟，可以直接建立 reportService 而不需要等待 Phase 6 或 Phase 7
4. GOAL_DRIVEN.md 的 Phase 7 是早期规划，REFACTORING_PLAN.md 已更新

**以 REFACTORING_PLAN.md 为准**，本方案按 Phase 5 执行。

---

*本方案为 Phase 5 正式实施方案（v2），所有实施工作须严格按阶段执行。*

---

## 14. v2 修订说明（评审反馈修复）

本版本针对 Phase 评审指出的 3 个必须修改问题和 3 个建议优化问题进行修订：

### 3 个必须修改问题（已修复）

1. **特殊日裁决修复**：删除 `isDueOnDate(policyVersion, date)` 独自裁决特殊日的方案，改为 `resolveReportDayStatus(context)` 结构化裁决函数，输入完整上下文，返回 `{ status, isDue, contributesDenominator, contributesNumerator, reason }`。删除当天已打卡 checked 计分母/分子，未打卡不计，取消后按取消状态。

2. **缓存设计降级**：移除 `cacheReport()` / `invalidateReportCache()` 接口。Phase 5 默认实时计算，不实现主动缓存失效。如需短缓存只允许 reportService 内部临时缓存，不修改 checkinService / habitService / syncService。

3. **reportAggregator 上下文补全**：核心函数 `resolveReportDayStatus` 要求传入 `userHabit`（含 `createdAt/deletedAt` 生命周期）、`policyVersion`、`dailyState`、`date`、`todayKey`、`dateConfidence`、`lockSnapshot` 等完整上下文，确保删除当天、策略修改当天、低可信日期等特殊口径在 aggregator 内部正确处理。

### 3 个建议优化问题（已采纳）

1. `getTodayProgress()` 标注"供首页"但明确本阶段 `home.js` 不接入。
2. `policyVersion` 命中明确 `effectiveEndDate = null` 表示开放结束，并说明策略修改当天旧版本关闭逻辑。
3. 测试计划增加"特殊日 checked / canceled / unchecked 三态分别覆盖"，确保删除当天、策略修改当天的每种最终状态都有测试覆盖。