# 《子午花信小程序技术架构方案》

## 一、当前项目技术现状盘点

当前项目是微信小程序 + 腾讯云开发工程，入口配置在 `miniprogram/app.json`，云函数目录为 `cloudfunctions/`。根目录现有 `miniprogram/`、`cloudfunctions/`、`docs/`、`reports/`、`__tests__/`、`typings/` 等目录。2026-06-11 当前核对基线为 HEAD `af6127a`，工作区存在未提交变更；`npm test -- --runInBand` 为 54 suites / 601 tests 全部通过，`npm run verify:cloudfunctions` 通过。

四个主页面已落到当前代码：
- 案台：首页：`miniprogram/pages/home/home.js`
- 修习：`miniprogram/pages/habits/habits.js`
- 观心：`miniprogram/pages/stats/stats.js`
- 归藏：`miniprogram/pages/profile/profile.js`

当前自定义 TabBar 实际使用 `miniprogram/custom-tab-bar/`，`app.json` 设置了 `"custom": true`；四个页面 `onShow` 内分别同步 `selected: 0/1/2/3`。但项目内还存在 `components/tab-bar/`、`components/nav-bar/`、`components/navigation-bar/`，目前没有作为一级导航验收对象，边界需要冻结。

当前全局样式主要集中在 `miniprogram/app.wxss`，已有五主题色与危险色 token。`#e64340` 当前已清零；`#F0655B`、`--c-red`、`--color-danger` 仍需通过 UI token 审计保持一致，不应继续扩散旧危险色。

当前 service 层已落地：
- `timeService`：业务日期、周/月/年边界和调试日期入口。
- `storageService`：本地缓存和旧缓存迁移入口。
- `cloudService`：前端云函数统一封装。
- `habitService`：用户习惯、策略版本、今日习惯生成、策略修改当天锁定。
- `checkinService`：打卡、取消、operation、daily state、本地乐观更新。
- `homeService`：首页视图模型。
- `reportService` / `reportAggregator`：周/月/年报表、策略命中、特殊日裁决、多生命周期聚合。
- `syncService`：pending、retry/retrying、recoverData、syncLocalData fallback。
- `userService`：登录和用户资料。

当前习惯与策略数据状态：
- 内置习惯仍主要由修习页和现有常量/工具承载，后续不应在页面继续扩散新的业务数据源。
- 用户习惯实例已引入 `userHabitId` 生命周期边界，旧 `MyHabits` 缓存仍作为兼容存储入口存在。
- 策略版本已按 `policyVersionId` / `userHabitId` 归属，策略修改当天通过锁定字段保持首页和观心一致。
- 云端新集合方向为 `user_habits`、`habit_policy_versions`，同时保留旧 `user_strategies` 等兼容入口。

当前打卡与状态数据状态：
- 打卡和取消已通过前端 service 生成 operation 并更新 `dailyCheckinState`。
- 云函数 `syncCheckin`、`doCheckin`、`undoCheckin` 等仍并存；其中兼容函数不得作为新业务绕过 service/cloudService 的理由。
- `undoCheckin` 不应再通过物理删除唯一历史记录表达取消，取消必须落到 operation/state 口径。
- 本地旧 `CheckinLogs` 和 `app.globalData.CheckinLogs` 仍是兼容债务，需要登记退出条件，不能直接删除。

当前报表数据状态：
- `pages/stats/stats.js` 当前通过 `reportService` 获取报表视图数据，legacy 报表方法未发现。
- `reportService` / `reportAggregator` 是唯一报表聚合入口，支持删除当天、策略修改当天、同一 `habitId` 多个 `userHabitId` 聚合展示。
- 报表口径仍需以 `docs/v1/v1-report-rules.md` 为准；页面不得恢复分母、分子、streak 或策略命中计算。

当前本地缓存与全局状态：
- 页面层当前静态搜索未发现直接 `wx.getStorageSync` / `wx.setStorageSync` / `wx.removeStorageSync` / `wx.cloud.callFunction` / `new Date()` 业务日期计算。
- `app.js` 仍保留 `globalData.MyHabits`、`globalData.CheckinLogs` 和多组 legacy helper；这些是兼容层，不是新代码可依赖的主入口。
- 旧键 `MyHabits`、`CheckinLogs`、`AllHabitsInfo`、`userStrategies`、`checkin_records` 等必须通过 `storageService` / migration 口径访问。

当前腾讯云开发使用：
- 已有核心云函数：`login`、`getUserProfile`、`saveUserProfile`、`migrateV1Data`、`recoverData`、`syncCheckin`、`syncHabit`。
- 已有兼容云函数：`syncLocalData`、`doCheckin`、`undoCheckin`、`saveStrategy`、`removeStrategy`、`saveStrategyVersion`、`getHabits`、`getTodayTasks`、`getStatsReport`、`getCheckinLogsByRange`、`getUserStrategies`。
- 云函数长期原则仍是通过 `cloud.getWXContext()` 获取 openid，前端不得保存或传递 openid 作为可信身份。

当前 AI / DeepSeek 状态：
- DeepSeek 仍是可选能力，不属于 V1 核心链路。
- 如后续启用，必须通过 `deepseekProxy` 云函数和 `aiService`，不得把 API Key 放在前端。

可保留部分：
- 四个主页面的现有 UI 骨架。
- `custom-tab-bar` 作为唯一一级导航。
- `utils/iconMap.js` 的习惯图标映射。
- `shareService` 当前为四主页面分享入口；`utils/share.js` 仅作为内部底层工具。
- `syncLocalData` 的分页恢复兼容思路。
- 现有 Jest 测试资产，尤其报表、云函数、恢复、策略修改当天相关测试。

仍需治理部分：
- `app.js` 中过重的兼容状态、旧 helpers 和 `globalData.MyHabits/CheckinLogs`。
- 旧集合、旧云函数和新集合/新云函数的边界登记与退出条件。
- 分享入口后续继续收敛到 `shareService`，复制分享信息能力尚未落地。
- UI token 中危险色别名与硬编码色的持续预防。

风险最高部分：
- `app.js` 兼容层被误当成新主链路继续扩写。
- 旧 `habitId` / 新 `userHabitId` 在兼容恢复和云端同步中混用。
- 策略修改当天、取消打卡、非应修日展示在首页和观心之间不一致。
- 清缓存恢复时旧集合和新集合合并造成重复、丢失或状态回退。
- 以治理名义批量删除旧云函数或旧缓存，导致线上用户恢复失败。

## 二、目标技术架构总览

推荐采用“保留 UI，重写数据层、服务层和云同步层”的分层架构。

调用关系：
`pages -> services -> storage/cloud/models/constants/utils -> cloudfunctions -> cloud database`
组件只接收 props 和触发 events，不直接读写缓存、云端或全局业务状态。

页面层 `pages`：
- 职责：页面展示、用户事件、调用 service、渲染结果。
- 禁止：直接 `wx.getStorageSync`、直接 `wx.cloud.callFunction`、直接拼报表、直接 `new Date()` 算业务日期。
- 四页分别对应案台、修习、观心、归藏，名称可保持现有 `home/habits/stats/profile`，文档层映射为案台/修习/观心/归藏。

组件层 `components`：
- 职责：复用 UI，如基础按钮、卡片、标签、习惯卡、报表卡、选择器、确认弹窗、空状态。
- 禁止：直接操作业务数据、缓存、云函数。
- 事件：统一通过 `bind:*` 向页面抛出。

服务层 `services`：
- `timeService`：唯一业务时间入口。
- `habitService`：内置习惯、用户习惯实例、策略版本、今日习惯生成。
- `checkinService`：打卡/取消、本地状态、操作流水、待同步。
- `reportService` / `reportAggregator`：周/月/年报表、完成率、streak、日历状态、年热力状态和今日进度统计口径。
- `storageService`：所有本地缓存读写。
- `cloudService`：云函数统一封装。
- `syncService`：本地 pending 与云端状态同步。
- `migrationService`：旧数据补字段和结构升级。
- `userService`：openid、资料、设置。
- `shareService`：分享与复制兜底。
- `aiService`：DeepSeek 能力预留，不阻塞 V1 核心链路。

数据模型层 `models`：
统一声明 `builtInHabit`、`userHabit`、`habitPolicyVersion`、`checkinOperation`、`dailyCheckinState`、`reportData`、`userProfile`、`syncLog`、`conflictLog`、`cacheMeta`。

常量层 `constants`：
统一声明 `storageKeys`、`cloudCollections`、`habitCategories`、`habitThemes`、`frequencyTypes`、`checkinStatus`、`reportTypes`、`errorCodes`。

工具层 `utils`：
只放无业务副作用工具：日期基础格式化、农历展示、ID 生成、防抖、校验、格式化、主题映射、报表周期边界。

云函数层 `cloudfunctions`：
承载登录、初始化、同步、恢复、幂等打卡、策略同步、DeepSeek 代理。云函数必须校验 openid、参数、幂等键和频率限制。

## 三、推荐目录结构

建议目标结构：

```text
miniprogram/
  app.js
  app.json
  app.wxss
  pages/
    home/        # 案台，现状保留
    habits/      # 修习，现状保留
    stats/       # 观心，现状保留
    profile/     # 归藏，现状保留
  custom-tab-bar/
  components/
    base-button/
    base-card/
    base-tag/
    habit-card/
    checkin-grid/
    report-card/
    report-calendar/
    report-heatmap/
    picker-sheet/
    confirm-dialog/
    empty-state/
    loading-state/
  services/
    timeService.js
    habitService.js
    checkinService.js
    reportService.js
    storageService.js
    cloudService.js
    syncService.js
    migrationService.js
    userService.js
    shareService.js
    aiService.js
  models/
    builtInHabit.js
    userHabit.js
    policyVersion.js
    checkinOperation.js
    dailyCheckinState.js
    reportData.js
    userProfile.js
  constants/
    storageKeys.js
    cloudCollections.js
    habitLibrary.js
    themeTokens.js
    frequencyTypes.js
    checkinStatus.js
    reportTypes.js
    errorCodes.js
  utils/
    dateUtils.js
    lunarUtils.js
    idUtils.js
    debounceUtils.js
    validationUtils.js
    themeUtils.js
    reportDateUtils.js
  styles/
    design-tokens.wxss
    theme.wxss
    common.wxss
    components.wxss
```

云函数目标结构：

```text
cloudfunctions/
  login/
  syncHabit/
  syncCheckin/
  getReportData/
  recoverData/
  deepseekProxy/
```

当前可保留：
- `pages/home`、`pages/habits`、`pages/stats`、`pages/profile`
- `custom-tab-bar`
- `assets/icons`
- `utils/reportCalculator.js` 先作为迁移来源
- `utils/iconMap.js` 先作为迁移来源
- `utils/share.js` 先升级为 `shareService`

建议新增：
- `services/`、`models/`、`constants/`
- `styles/design-tokens.wxss`
- `cloudfunctions/syncHabit`、`syncCheckin`、`recoverData`、`deepseekProxy`

建议废弃或冻结：
- `components/tab-bar`、`components/nav-bar`、`components/navigation-bar` 不参与当前验收。
- `pages/index`、`pages/logs` 不在 PRD 四主页面内，建议冻结或后续清理。

需要迁移到 services：
- `app.js` 的缓存、同步、打卡、迁移、日志。
- `home.js` 的今日习惯生成和打卡逻辑。
- `habits.js` 的习惯添加、编辑、删除。
- `stats.js` 的报表聚合。
- `profile.js` 的用户资料云端读写。

需要迁移到 `styles/design-tokens.wxss`：
- 全局颜色、五主题色、危险色、时辰装饰色、字号、间距、圆角、阴影、层级。
- `#e64340` 不得保留。
- `#C4786A`、`#8B9A7C`、`#D4A574` 只作为时辰装饰 token 保留。

## 四、数据架构设计

持久化数据：
- `builtInHabit`：本地常量优先，若运营需要可云端管理。
- `userHabit`：用户习惯实例，必须云端持久化。
- `habitPolicyVersion`：策略版本，必须云端持久化。
- `checkinOperation`：打卡操作流水，V1 建表并写入关键字段。
- `dailyCheckinState`：每日最终状态，首页和报表优先读取。
- `userProfile`、`syncLog`、`conflictLog`、`cacheMeta`。

运行时计算：
- `reportData` 不建议长期持久化完整快照。
- 今日习惯列表、完成率、周/月/年报表由服务层实时计算或按需短缓存。

只做缓存：
- 最近习惯实例、当前策略版本、近期每日状态、最近报表结果、cacheMeta。

核心模型：

`builtInHabit`
```js
{
  habitId, name, category, defaultIcon, defaultTheme,
  defaultDuration, defaultFrequency, sortOrder, enabled
}
```
说明：固定 21 个内置习惯，不允许用户自由创建新 habitId。

`userHabit`
```js
{
  userHabitId, _openid, habitId, status,
  createdAt, updatedAt, deletedAt
}
```
重点：同一 `habitId` 多次添加必须生成不同 `userHabitId`。`createdAt` 是用户习惯实例的生命周期开始日；它必须由本地业务日期随 `addHabit` 同步到云端，不得用策略 `startDate` / `effectiveStartDate` 替代。

`habitPolicyVersion`
```js
{
  policyVersionId, userHabitId, habitId,
  duration, frequencyType, frequencyConfig,
  startDate, effectiveStartDate, effectiveEndDate,
  createdAt, updatedAt
}
```
重点：策略版本按 `userHabitId` 归属；同一实例下时间段不得重叠。

`checkinOperation`
```js
{
  operationId, idempotencyKey, _openid,
  userHabitId, habitId, policyVersionId,
  date, action, clientTime, serverTime,
  source, clientSequence
}
```
V1 保留接口和字段，不强制实现复杂分布式裁决。

`dailyCheckinState`
```js
{
  stateId, _openid, userHabitId, habitId, policyVersionId,
  date, status, checkedAt, canceledAt,
  lastOperationId, lastOperationClientTime, lastOperationClientSequence,
  lockReason, hasPolicyChangedToday, hasDeletionToday, updatedAt
}
```
首页和报表优先读它，不直接累计操作流水。策略修改当天统一使用 `lockReason` 表达低压力锁定口径。

`reportData`
```js
{
  reportType, startDate, endDate,
  habitGroups, totals, generatedAt, sourceVersion
}
```
V1 默认运行时生成，不长期持久化。

### 字段命名规范

V1 新数据链路统一使用 `lowerCamelCase` 字段名。适用范围包括 V1 新集合、云函数入参/出参、前端缓存、service ViewModel 和页面 ViewModel。

允许例外：
- CloudBase 系统字段：`_openid`、`_id`。
- 数据库集合名：`user_habits`、`habit_policy_versions`、`checkin_operations`、`daily_checkin_states`。
- 维护迁移函数和 legacy 兼容函数内部读取旧字段，但不得写入 V1 新集合。

线上主链路禁止新写入或返回以下字段：`Habit_Id`、`habit_Id`、`habit_id`、`user_habit_id`、`policy_version_id`、`checkin_date`、`freq_type`、`freq_rules`、`plan_start_date`、`sync_status`、`lockedReason`、`syncStatus`、`isDeleted`。

V1 云端字段保持精简：
- `user_habits` 以 `status` 和 `deletedAt` 表达生命周期，不再写 `isDeleted`、`syncStatus` 或空字符串 `latestPolicyVersionId`。
- `habit_policy_versions` 必须显式保留 `effectiveEndDate: null` 作为当前有效策略标记。
- `checkin_operations` 只在有值时写 `policyVersionId`、`clientSequence`。
- `daily_checkin_states` 统一使用 `lockReason`，不再写兼容字段 `lockedReason`；只在有值时写打卡/取消时间和最后操作字段。

发布前必须运行 `npm run verify:field-naming`，防止 V1 主链路重新引入 legacy 字段。

## 五、腾讯云开发架构方案

云数据库集合设计：

| 集合 | 用途 | 关键字段 | 推荐索引 | 权限 | V1 |
|---|---|---|---|---|---|
| `users` | 用户初始化和资料 | `_openid`, `profile`, `createdAt` | `_openid` 唯一 | 仅本人/云函数 | 是 |
| `built_in_habits` | 内置习惯云端管理，可选 | `habitId`, `enabled`, `sortOrder` | `habitId`, `enabled` | 只读或云函数读 | 可选 |
| `user_habits` | 用户习惯实例 | `_openid`, `userHabitId`, `habitId`, `status`, `deletedAt` | `_openid+userHabitId`, `_openid+habitId` | 按 openid 隔离 | 是 |
| `habit_policy_versions` | 策略版本 | `_openid`, `policyVersionId`, `userHabitId`, `effectiveStartDate` | `_openid+userHabitId+effectiveStartDate` | 按 openid 隔离 | 是 |
| `checkin_operations` | 操作流水 | `_openid`, `operationId`, `idempotencyKey`, `userHabitId`, `date` | `idempotencyKey` 唯一，`_openid+date` | 云函数写 | 是 |
| `daily_checkin_states` | 每日最终状态 | `_openid`, `stateId`, `userHabitId`, `date`, `status` | `_openid+userHabitId+date` 唯一 | 云函数写 | 是 |
| `sync_logs` | 同步记录 | `_openid`, `type`, `status`, `createdAt` | `_openid+createdAt` | 云函数写 | 是 |
| `conflict_logs` | 冲突记录 | `_openid`, `userHabitId`, `date`, `reason` | `_openid+date` | 云函数写 | 是 |
| `user_settings` | 用户设置 | `_openid`, `settings` | `_openid` | 仅本人/云函数 | 可选 |
| `ai_logs` | DeepSeek 调用日志 | `_openid`, `scene`, `tokens`, `status` | `_openid+createdAt` | 云函数写 | V2/可选 |

云函数设计：

`login`
- 入参：无。
- 出参：`openid`, `serverTime`, `isNewUser`。
- 逻辑：获取 openid，初始化 `users`。
- V1 必须。

`syncHabit`
- 入参：`userHabits`, `policyVersions`, `clientSeq`, `lastSyncAt`。
- 出参：服务端确认后的实例、策略、冲突列表。
- 逻辑：按 `userHabitId` 幂等 upsert；策略版本校验不重叠。
- V1 必须，替代当前 `saveStrategy/removeStrategy`。

`syncCheckin`
- 入参：`operationId`, `idempotencyKey`, `userHabitId`, `habitId`, `policyVersionId`, `date`, `action`, `clientTime`, `timezone`。
- 出参：`dailyCheckinState`, `operation`, `serverTime`, `conflicts`。
- 逻辑：幂等写 `checkin_operations`，更新 `daily_checkin_states`。
- V1 必须，替代当前 `doCheckin/undoCheckin` 的直接日志增删。

`recoverData`
- 入参：`sinceDate`, `untilDate`, `cursor`, `limit`。
- 出参：用户习惯、策略版本、近期每日状态、分页游标、serverTime。
- 逻辑：分页拉取，前端写回缓存并迁移。
- V1 必须，替代/升级 `syncLocalData`。

`getReportData`
- 入参：`reportType`, `startDate`, `endDate`, `cursor`。
- 出参：报表数据。
- V1 可选；前端压力大或历史分页时启用。

`deepseekProxy`
- 入参：`scene`, `payload`, `reportDataHash`。
- 出参：AI 文案、缓存标记、错误码。
- V1 非必须；若启用必须云函数代理。

权限与安全：
- openid 只能由云函数 `cloud.getWXContext()` 获取。
- 前端不得传 openid 作为可信身份。
- 用户只能读写 `_openid` 匹配的数据。
- DeepSeek API Key 只放云函数环境变量。
- 云函数统一参数校验、幂等校验、频率限制。
- 分享与复制不得携带 openid、昵称、头像、打卡明细。

清缓存恢复流程：
用户打开小程序 -> `login` -> `recoverData` 拉取用户习惯、策略、近期 `daily_checkin_states` -> `storageService` 写缓存 -> `migrationService` 补字段 -> `reportService` 重新计算 -> 页面恢复。
V1 建议恢复最近 90 天每日状态；历史按用户打开周/月/年报表时分页加载。云端无数据则初始化空用户。若用户清缓存前有未同步数据，因本地已丢失只能以云端为准，并提示“已从云端恢复，部分未同步离线操作可能无法找回”。恢复失败不阻断进入，展示空状态和重试入口。

## 六、DeepSeek API 技术方案

当前 V1 核心打卡闭环不必须调用 DeepSeek。建议 V1 只预留 `aiService` 与 `deepseekProxy`，不让 AI 阻塞打卡、习惯管理、报表。

建议用途：
- 生成个性化修习建议。
- 生成周/月复盘文案。
- 生成养生提醒文案。
- 解释报表趋势。

约束：
- 必须走腾讯云函数 `deepseekProxy`。
- 前端不得出现 API Key。
- 需要限流、错误兜底、结果短缓存。
- AI 文案必须标记为辅助建议，不替代医疗建议。
- 调用失败只隐藏 AI 文案或展示兜底文案，不影响核心功能。

职责边界：
- `aiService`：组织业务上下文、调用 `cloudService.callFunction('deepseekProxy')`、缓存 AI 结果、返回兜底文案。
- `deepseekProxy`：读取环境变量、调用 DeepSeek、做安全过滤、限流、日志、错误码封装。

## 七、核心业务流程技术设计

应用启动：
`app.onLaunch` 只做基础初始化：云开发初始化、`timeService.refreshServerTime()`、`userService.login()`、`storageService.loadCache()`、`migrationService.migrate()`、`syncService.recoverOrSync()`、生成今日状态。页面通过 service 读取结果。

首页今日习惯：
输入 `userHabit`、`policyVersion`、`dailyCheckinState`、业务日期。输出 `todayHabitList`、`completedCount`、`totalCount`、`progressPercent`。
由 `habitService.getTodayHabits(date)`、`checkinService.getStatesByRange()`、`reportService.calculateTodayProgress()` 或 `habitService` 返回的今日进度视图模型协作。删除当天已打卡临时保留；未打卡删除则移除；超过 12 个今日习惯提示调整频次。

添加习惯：
从 `builtInHabit` 选择 -> 生成 `userHabitId` -> 创建首个 `policyVersion` -> 本地保存 pending -> `syncHabit` -> 刷新首页和修习页。

编辑策略：
生成新 `policyVersion` -> 关闭旧版本 -> 标记当天 `hasPolicyChangedToday` -> 根据 `dailyCheckinState` 最终状态写入锁定口径 -> 刷新首页 -> 报表按版本计算。当天最终为 `checked` 时锁定 `strategy_changed_after_checkin`，分母 1、分子 1；当天最终为 `canceled`、`unchecked` 或 `not_required` 时锁定 `strategy_changed_without_checkin`，并按最后一次保存成功的新策略判断当天是否仍应修：仍应修则分母 1、分子 0，不应修则分母 0、分子 0。同一天多次编辑以后续最后一次保存成功的策略作为未来策略。

删除习惯：
二次确认 -> 软删除 `userHabit` -> 关闭当前策略版本 -> 保留历史状态和流水 -> 今日已打卡则首页保留取消入口 -> 未打卡则移除今日任务 -> 报表保留历史。

打卡/取消：
前端防抖 -> 本地乐观更新 `dailyCheckinState` -> 生成 `checkinOperation` -> pending 入缓存 -> `syncCheckin` 幂等写云端 -> 成功移除 pending，失败保留 pending 并提示稍后同步。

同一天多次打卡和取消都保留操作流水，`dailyCheckinState.status` 以最后一次有效操作归并结果为准。若当天发生过策略修改，取消后的最终状态不得再按完成计入报表；当天是否计入分母由最后一次保存成功的新策略是否命中当天决定。

周/月/年报表：
`reportService` 读取 `userHabit`、策略版本、`dailyCheckinState`，按自然周/月/年计算。农历只展示，不参与计算。同 `habitId` 多个 `userHabitId` 默认聚合展示，但生命周期不混算。未来日期不计分母。输出周报 7 天状态、月历、年热力图。

分享和复制：
四个主页面统一使用 `shareService`。默认封面 `/images/share-cover.png`。分享路径只带页面参数，不带隐私。朋友圈不可用则降级好友转发或复制文案，失败非阻断提示。

## 八、时间系统技术方案

`TimeService` 是唯一业务时间入口，统一 Asia/Shanghai，支持服务端时间、低可信本地时间、跨天刷新。

函数：
- `getNow()`：返回校准后的当前时间。
- `getBusinessDate()`：返回 `YYYY-MM-DD`。
- `getServerTime()`：从云函数返回或缓存服务端时间。
- `getTodayKey()`：今日 key。
- `getWeekRange(date)`：自然周一到周日。
- `getMonthRange(date)`：自然月。
- `getYearRange(date)`：自然年。
- `isFutureDate(date)`：判断未来日期。
- `isSameBusinessDay(a,b)`：业务日一致性。
- `shouldRefreshByDate(lastDate,currentDate)`：跨天刷新判断。

禁止直接 `new Date()` 的地方：
- 页面业务逻辑。
- 打卡日期归属。
- 今日习惯生成。
- 报表周期和分母计算。
- 策略生效/失效日期。
- 删除当天和策略修改当天口径。
- 云函数业务日期默认值。

允许直接 `new Date()` 的地方：
- `timeService/dateUtils` 内部。
- 云函数写 `serverTime/createdAt` 的底层时间戳，但业务日期仍通过统一函数转换为 Asia/Shanghai。

## 九、报表聚合服务技术方案

`reportService/reportAggregator` 必须集中处理报表，不允许页面自行拼接。

核心函数：
- `getWeeklyReport(weekStart)`
- `getMonthlyReport(month)`
- `getYearlyReport(year)`
- `buildReportPeriod(type, anchorDate)`
- `resolvePolicyForDate(userHabitId, date)`
- `isDueOnDate(policy, date)`
- `buildDailyStatus(date, userHabitInstances)`
- `aggregateByHabitId(records, policies)`
- `calculateCompletionRate(reportItems)`
- `buildCalendarStatus(date, userHabitInstances)`

输入：
```js
{
  userHabits,
  policyVersions,
  dailyStates,
  period: { startDate, endDate, type },
  todayKey
}
```

输出：
```js
{
  reportType,
  startDate,
  endDate,
  stats: { completionRate, doneCount, dueCount, checkinDays, maxStreak },
  habitGroups: [
    { habitId, name, theme, instances, days, summary }
  ]
}
```

必须支持：
每天、每周固定星期、间隔天数、策略版本切换、删除当天、策略修改当天、同一天多次策略修改、同一天多次打卡或取消、同 habitId 多实例聚合、未来日期、非应修日、部分完成、全部完成、应修未完成。

缓存策略：
- V1 可缓存最近一次周/月/年报表到内存或 `reportCache`。
- 缓存 key 包含 `reportType + period + cacheMeta.dataVersion`。
- 打卡、取消、策略修改、删除后立即失效。

性能风险：
- 年报不应启动时全量算多年。
- 历史明细按周期分页拉取。
- `daily_checkin_states` 应按 `_openid + date`、`_openid + userHabitId + date` 建索引。

## 十、UI 技术对齐方案

不整体重做 UI，只做局部代码对齐。

实施顺序：
1. 危险操作：删除确认 `confirmColor` 从 `#e64340` 改为 `#F0655B`；操作菜单 `type: danger` 已有，补齐 WXML/CSS 渲染危险色。
2. Token 化：新增 `styles/design-tokens.wxss`，迁移 `--color-danger`、五主题色、基础色、时辰装饰色。
3. 旧色收敛：旧九宫格浅底色不继续扩散；`#C4786A/#8B9A7C/#D4A574` 进入限定 token。
4. 导航边界：`custom-tab-bar` 是唯一一级导航视觉来源；旧 `nav-bar/tab-bar/navigation-bar` 冻结不验收。
5. 组件化：优先抽 `BaseButton`、`BaseCard`、`BaseTag`、`ConfirmDialog`、`PickerSheet`、`EmptyState`、`LoadingState`。
6. 报表状态色：完成态用 `--theme-color`，未完成应修用主题描边，删除后浅灰或透明度。

## 十一、异常处理与降级方案

| 场景 | 风险 | 兜底 | 模块 | 提示 | 阻断 |
|---|---|---|---|---|---|
| 首次进入 | 无数据 | 初始化空用户 | userService | 可开始添加修习 | 否 |
| 清空缓存 | 本地丢失 | recoverData | syncService | 正在恢复数据 | 否 |
| openid 失败 | 无法云同步 | 本地临时模式 | userService | 登录失败，稍后同步 | 否 |
| 云同步失败 | 状态不一致 | pending 队列 | syncService | 已保存本地 | 否 |
| 缓存读取失败 | 页面空 | 云端恢复 | storageService | 缓存异常，尝试恢复 | 否 |
| DeepSeek 失败 | AI 文案缺失 | 兜底文案 | aiService | 暂无智能建议 | 否 |
| 断网打卡 | 云端未确认 | 本地乐观 + pending | checkinService | 网络恢复后同步 | 否 |
| 快速点击 | 重复操作 | 防抖 + 幂等键 | checkinService | 操作处理中 | 否 |
| 删除后报表 | 历史断链 | 保留实例和状态 | reportService | 无需提示 | 否 |
| 多实例聚合 | 混算 | 按 userHabitId 算，按 habitId 展示聚合 | reportService | 无需提示 | 否 |
| 策略修改当天 | 分母摇摆 | `dailyCheckinState` 最终状态 + 低压力锁定 | reportService | 无需提示 | 否 |
| 删除当天 | 漏打误算 | 锁定状态 | reportService | 无需提示 | 否 |
| 跨天刷新 | 首页旧任务 | TimeService 触发刷新 | timeService | 已刷新今日修习 | 否 |
| 低可信时间 | 污染报表 | 标记待处理 | timeService/syncService | 日期待确认 | 否 |
| 无报表数据 | 空页面 | EmptyState | reportService | 暂无修习记录 | 否 |
| 分享不可用 | 操作失败 | 降级复制 | shareService | 已复制分享信息/复制失败 | 否 |
| 复制失败 | 分享中断 | Toast | shareService | 复制失败，请重试 | 否 |

## 十二、接口与函数设计

`timeService`
- `getBusinessDate(): string`，同步，所有页面，失败返回低可信日期。
- `getTodayKey(): string`，同步，所有服务，失败返回本地 key。
- `getWeekRange(date): {startDate,endDate}`，同步，观心。
- `getMonthRange(date): {startDate,endDate}`，同步，观心。
- `getYearRange(date): {startDate,endDate}`，同步，观心。
- `refreshServerTime(): Promise<TimeMeta>`，异步，启动/前后台切换，失败标记 low confidence。V1 必须。

`habitService`
- `getBuiltInHabits(): BuiltInHabit[]`，同步，修习。V1 必须。
- `getUserHabits(): Promise<UserHabit[]>`，异步，四页。V1 必须。
- `getActiveUserHabits(): Promise<UserHabit[]>`，异步，首页/修习。V1 必须。
- `addHabit(habitId, policyInput): Promise<UserHabit>`，异步，修习，失败保留 pending。V1 必须。
- `updateHabitPolicy(userHabitId, policyInput): Promise<PolicyVersion>`，异步，修习。V1 必须。
- `softDeleteHabit(userHabitId): Promise<void>`，异步，修习。V1 必须。
- `getTodayHabits(date): Promise<TodayHabitResult>`，异步，首页。V1 必须。

`checkinService`
- `toggleCheckin(userHabitId,date): Promise<DailyState>`，首页，异步。V1 必须。
- `checkin(userHabitId,date): Promise<DailyState>`，首页，异步。V1 必须。
- `cancelCheckin(userHabitId,date): Promise<DailyState>`，首页，异步。V1 必须。
- `getDailyState(userHabitId,date): Promise<DailyState|null>`，首页/报表。V1 必须。
- `getStatesByRange(startDate,endDate): Promise<DailyState[]>`，报表。V1 必须。
- `syncPendingOperations(): Promise<SyncResult>`，启动/网络恢复。V1 必须。

`reportService`
- `getWeeklyReport(weekStart): Promise<ReportData>`，观心。V1 必须。
- `getMonthlyReport(month): Promise<ReportData>`，观心。V1 必须。
- `getYearlyReport(year): Promise<ReportData>`，观心。V1 必须。
- `aggregateByHabitId(records, policies): HabitGroup[]`，服务内部。V1 必须。
- `buildCalendarStatus(date, userHabitInstances): DayStatus`，服务内部。V1 必须。
- `calculateCompletionRate(reportItems): number`，服务内部。V1 必须。

`storageService`
- `get(key)`, `set(key,value)`, `remove(key)`, `clear()`，同步封装 wx storage，失败返回标准错误。V1 必须。
- `getCacheMeta()`, `setCacheMeta(meta)`，同步。V1 必须。

`cloudService`
- `callFunction(name,data): Promise<Result>`，统一错误码。V1 必须。
- `getOpenId(): Promise<LoginResult>`，启动。V1 必须。
- `pullUserData()`, `pushUserData()`, `recoverData()`，异步。V1 必须。

`syncService`
- `syncAll()`, `syncHabits()`, `syncPolicies()`, `syncCheckins()`，异步。V1 必须。
- `markPending(entity)`, `resolveConflict(conflict)`，V1 简化，V2 扩展。

`aiService`
- `generateWeeklyInsight(reportData)`，异步，V2/可选。
- `generateMonthlyInsight(reportData)`，异步，V2/可选。
- `generatePracticeSuggestion(userContext)`，异步，V2/可选。
- `callDeepSeekProxy(payload)`，异步，必须云函数代理，可选。

## 十三、分阶段实施路线图

阶段 0：冻结与备份
目标：冻结当前 UI 和脏工作树，避免混乱。修改文件：无或仅记录文档。前置：确认当前分支。验收：现状盘点完成。风险：已有未提交改动。建议先做：是。

阶段 1：文档落地
目标：输出 `technical-architecture.md`、`data-architecture.md`、`cloudbase-architecture.md`、`service-api-design.md`、`refactor-roadmap.md`。前置：本方案确认。验收：文档可指导实现。建议先做：是。

阶段 2：TimeService 和常量层
修改文件：新增 `services/timeService.js`、`constants/*`、`utils/dateUtils.js`。验收：业务日期不再由页面直接 `new Date()` 生成。风险：测试需更新。建议先做：是。

阶段 3：数据模型层
修改文件：新增 `models/*`。验收：`habitId/userHabitId/policyVersionId` 边界明确。风险：兼容旧缓存。建议先做：是。

阶段 4：服务层抽离
修改文件：新增 `storageService/cloudService/habitService/checkinService/reportService`，页面逐步调用。验收：页面不直接读写缓存和云函数。风险：改动面大。建议先做：是。

阶段 5：腾讯云开发接入与恢复机制
修改文件：新增 `syncHabit/syncCheckin/recoverData`，升级现有云函数或兼容旧函数。验收：清缓存可恢复近期数据。风险：集合迁移。建议先做：是。

阶段 6：首页打卡链路稳定
修改文件：`home.js` 接入服务层。验收：打卡、取消、断网、重复点击稳定。风险：乐观更新与云端确认冲突。建议先做：是。

阶段 7：观心报表聚合
修改文件：`reportService`、`stats.js`。验收：周/月/年报表特殊口径稳定。风险：历史数据兼容。建议先做：是。

阶段 8：UI 局部对齐
修改文件：`styles/design-tokens.wxss`、`app.wxss`、`habits.wxss/wxml`、`custom-tab-bar`。验收：危险色、token、导航边界通过。风险：视觉回归。建议先做：中后。

阶段 9：DeepSeek API 预留或接入
修改文件：`aiService.js`、`deepseekProxy`。验收：失败不影响核心功能。风险：合规和成本。建议：V1 只预留。

阶段 10：测试验收
覆盖：打卡、取消、删除、策略修改、清缓存恢复、周/月/年报表、分享、异常状态。验收：核心链路 Jest 通过，手工验证四主页面。建议先做：最终阶段。

## 十四、最终输出文件内容映射

本轮不写文件。建议后续将本方案拆为：

1. `docs/architecture/technical-architecture.md`：包含章节一、二、三、七、八、九、十、十一。
2. `docs/data-architecture.md`：包含章节四和报表/缓存持久化说明。
3. `docs/cloudbase-architecture.md`：包含章节五。
4. `docs/service-api-design.md`：包含章节十二。
5. `docs/refactor-roadmap.md`：包含章节十三。
6. `docs/technical-risk-list.md`：包含现状风险、异常矩阵、高风险改造点。
7. `docs/deepseek-integration-plan.md`：包含章节六。

## 最终技术策略结论

选择 **B. 保留 UI，重写数据层、服务层和云同步层**。

理由：
- 当前 UI 骨架和四主页面已符合新版 PRD 的信息架构，不需要完全清空重写。
- 当前最大问题不是视觉，而是数据模型、业务日期、缓存边界、云同步和报表聚合。
- 仅局部修复无法解决 `habitId/userHabitId` 混用、删除后重加、策略版本归属、`dailyCheckinState` 缺失、页面层重复计算报表等结构性风险。
- 完全清空重写成本过高，也会浪费现有 UI、图标、测试、报表算法和云函数经验。
- 因此推荐保留现有 UI 和页面结构，分阶段重写数据层、服务层、时间系统、报表聚合和 CloudBase 同步层。
