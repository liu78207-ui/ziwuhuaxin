# GOAL_DRIVEN.md

本文档用于约束《子午花信》微信小程序在长期重构过程中的 AI 协作方式。

它不是技术架构文档，不重复 PRD，不替代 `AGENTS.md`。  
它只定义：长期目标、阶段目标、执行原则、验证标准、停止条件和风险控制规则。

适用对象：

- Claude Code
- Codex
- Cursor
- Minimax
- 其他参与本仓库协作的 AI Coding Agent

---

## 1. Final Goal

《子午花信》V1 重构的最终工程目标是：

> 在保留现有 UI 骨架的前提下，将个人养生习惯打卡闭环治理为稳定、可恢复、可解释、可演进的工程系统。

最终状态必须满足：

- 用户可以稳定添加、编辑、删除习惯。
- 用户可以稳定打卡、取消打卡、离线打卡。
- 清缓存或换设备后可以恢复用户习惯、策略版本和近期每日状态。
- 周报、月报、年报由统一报表服务生成，口径可信。
- 业务日期统一由 TimeService 管理。
- 打卡最终状态统一由 `dailyCheckinState` 表达。
- 打卡与取消统一生成 `checkinOperation`。
- 同步失败不阻断用户继续使用。
- 旧数据可以兼容迁移，不因重构丢失历史。
- 页面层变薄，只负责展示、事件响应和调用 service。
- AI、分享、复盘文案等非核心能力失败时不影响主链路。

最终技术策略固定为：

> 保留 UI，分阶段重写数据层、服务层、时间系统、报表聚合和 CloudBase 同步层。

禁止把本次重构演变成：

- 整体 UI 重做。
- V2/V3 架构提前落地。
- 社交、课程、排行榜、feed、医疗 AI 等非 V1 能力扩张。
- 一次性推倒重写。
- 在页面层继续补业务逻辑。

---

## 2. Phase Goals

重构必须按阶段推进。AI 不得跳过阶段直接修改后层能力。

### Phase 0：冻结现状与确认范围

目标：

- 明确当前任务只影响哪些文件、哪些服务、哪些页面。
- 识别是否涉及数据模型、状态机、缓存、同步、报表或迁移。
- 不修改无关 UI、不做全局格式化、不清理无关旧代码。

完成标准：

- 已阅读 `AGENTS.md` 与相关治理文档。
- 已说明本次目标、修改文件、影响范围、风险点。
- 未扩大任务边界。

### Phase 1：TimeService 与常量层

目标：

- 建立统一业务时间入口。
- 建立状态、缓存 key、集合名、错误码、频次类型等常量边界。

完成标准：

- 业务日期、今日 key、周/月/年边界统一由 service 或工具提供。
- 页面层不新增 `new Date()` 业务日期计算。
- 状态枚举集中定义，不散落页面。

### Phase 2：StorageService 与 CloudService

目标：

- 收敛本地缓存读写。
- 收敛前端云函数调用。

完成标准：

- 新增业务代码不直接调用 `wx.getStorageSync` / `wx.setStorageSync` / `wx.removeStorageSync`。
- 新增业务代码不直接调用 `wx.cloud.callFunction`。
- 云函数返回结构、错误码、serverTime 由统一入口处理。
- 页面层只调用 service。

### Phase 3：MigrationService 与旧数据兼容

目标：

- 兼容旧缓存和旧云端集合。
- 建立迁移服务壳、旧 key 探测、只读兼容、迁移日志和回退规则。
- 为新版 `user_habits`、`habit_policy_versions`、`checkin_operations`、`daily_checkin_states` 做幂等迁移准备。

完成标准：

- 迁移流程设计为可重复执行。
- 迁移失败不阻断进入小程序。
- 旧数据只读兼容，不继续扩写。
- `cacheMeta.migrationVersion`、`lastMigratedAt`、`migrationLogs` 有明确规则。
- 不物理删除旧表和旧缓存作为普通迁移动作。
- 在 Phase 4 的 userHabit、policyVersion、checkinOperation、dailyCheckinState 模型字段稳定前，不执行破坏性切换或批量写入新集合。

### Phase 4：用户习惯与策略版本模型

目标：

- 严格区分 `habitId`、`userHabitId`、`policyVersionId`。
- 习惯删除后再次添加生成新生命周期。
- 固化迁移写入所依赖的 userHabit、policyVersion、checkinOperation、dailyCheckinState 字段边界。

完成标准：

- `habitId` 只表示内置习惯。
- `userHabitId` 表示用户某次添加形成的习惯实例。
- 策略版本归属于 `userHabitId`。
- 删除是软删除。
- 旧生命周期和新生命周期不混算。

### Phase 5：CheckinService 与状态流

目标：

- 统一打卡、取消打卡、操作流水、每日最终状态和 pending 同步。

完成标准：

- 打卡生成 `checkinOperation`。
- 取消打卡也生成 `checkinOperation`。
- 首页和报表读取 `dailyCheckinState`。
- 不通过物理删除唯一历史记录表达取消。
- 快速重复点击不会放大计数。
- 离线操作进入 pending。

### Phase 6：SyncService 与 CloudBase 同步

目标：

- 统一 pending、retry、recoverData、syncLogs、conflictLogs。
- 云端同步幂等，服务端确认后回写本地。

完成标准：

- `syncCheckin` 使用 `idempotencyKey`。
- 重试复用原始 `idempotencyKey`。
- 服务端确认后才能标记 `synced`。
- 多端冲突 V1 以服务端最终状态为准，并记录 `conflictLogs`。
- 清缓存后可通过 `recoverData` 恢复核心数据。

### Phase 7：ReportService / ReportAggregator

目标：

- 统一周报、月报、年报、完成率、分母、分子、streak、日历状态和年热力状态。

完成标准：

- 页面层不直接计算报表。
- 报表先按 `userHabitId` 独立计算，再按 `habitId` 聚合展示。
- 支持每天、每周固定星期、间隔天数。
- 支持策略版本切换。
- 支持删除当天、策略修改当天、低可信日期特殊口径。
- 未来日期、非应修日不计入分母。
- 农历只用于展示，不参与统计。

### Phase 8：页面层瘦身

目标：

- 首页、修习页、观心页、归藏页只负责 UI、事件和 service 调用。
- 使用 `Service + EventBus` 保持页面状态一致。

完成标准：

- 页面不直接读写业务缓存。
- 页面不直接调业务云函数。
- 页面不直接操作 `globalData`、pending 队列、其他页面 `data`。
- 页面 `onShow` 只做轻量校验和必要刷新。
- 页面收到 EventBus 后调用 service 获取视图模型。

### Phase 9：UI Token 局部对齐

目标：

- 只做必要的视觉技术治理，不重做 UI。

完成标准：

- `custom-tab-bar` 是唯一一级导航视觉来源。
- 五主题色进入 token。
- 删除和危险操作统一使用 `--color-danger` 或 `#F0655B`。
- 不继续使用 `#e64340`。
- 不借重构重画页面。

### Phase 10：测试、验收与回归

目标：

- 用测试和静态检查证明阶段结果稳定。

完成标准：

- 核心 service 有对应单元测试。
- 云函数同步有集成测试。
- 报表特殊口径有测试。
- 迁移幂等有测试。
- 页面层禁止事项可通过静态搜索辅助检查。
- 当前阶段完成后小程序仍可运行。

---

## 3. Criteria for Success

只有同时满足以下条件，才可以认为 V1 重构成功：

- 新用户可以进入空状态并添加习惯。
- 用户可以添加、编辑策略、软删除习惯。
- 同一内置习惯删除后重新添加，不复用旧 `userHabitId`。
- 首页今日应修习惯展示准确。
- 今日习惯超过 12 个时有调整提示。
- 打卡、取消打卡、再次打卡稳定。
- 快速重复点击不会产生重复有效完成。
- 断网时打卡和取消不阻断。
- 网络恢复后 pending 可重试。
- 清缓存后可恢复用户习惯、策略版本和最近 90 天每日状态。
- 周报、月报、年报稳定展示。
- 删除当天已打卡、删除当天未打卡口径稳定。
- 策略修改当天已打卡、策略修改当天未打卡口径稳定。
- 未来日期不计入分母。
- 非应修日不计入分母。
- 低可信日期不静默进入报表。
- 农历只做展示，不参与统计。
- 页面层不新增直接缓存、云函数、业务日期、报表计算逻辑。
- DeepSeek 或 AI 能力失败不影响核心功能。
- 分享、复制、日志不泄露 openid、昵称、头像、打卡明细等隐私数据。

### 3.1 主链路闭环检查

任一阶段改动都必须能放回以下闭环中解释。如果某一步无法说明责任模块、事实源、失败兜底和验证方式，则该阶段只能标记为“部分完成”，不得宣称闭环完成。

```text
用户进入
  -> userService.login 获取 openid 与 serverTime
  -> timeService 确定 Asia/Shanghai 业务日期与 dateConfidence
  -> storageService 读取当前 openid 的 cacheMeta 与业务缓存
  -> migrationService 兼容旧缓存和旧云端集合
  -> syncService.recoverData 按需恢复用户习惯、策略版本、近期 dailyCheckinState
  -> habitService 生成今日应修视图
  -> checkinService 处理打卡 / 取消、生成 checkinOperation、更新 dailyCheckinState
  -> syncService 管理 pending、retry、syncCheckin、conflictLogs
  -> reportService / reportAggregator 基于 userHabit、policyVersion、dailyCheckinState 生成报表
  -> EventBus 通知页面刷新
  -> 页面只渲染 service 返回的视图模型
```

闭环事实源：

| 环节 | 事实源 | 唯一入口 | 不可绕过规则 |
|---|---|---|---|
| 身份 | 云函数 `cloud.getWXContext()` 获取的 `_openid` | `userService` / `cloudService` | 前端传入 openid 不可信 |
| 业务日期 | `serverTime`、本地兜底时间、`dateConfidence` | `timeService` | 页面不得直接用 `new Date()` 算业务日期 |
| 用户习惯 | `user_habits` / 本地 `userHabits` 缓存 | `habitService` | `habitId` 不得代表用户实例 |
| 策略版本 | `habit_policy_versions` | `habitService` | 策略必须归属 `userHabitId` |
| 打卡操作 | `checkin_operations` / pending 队列 | `checkinService` / `syncService` | 打卡和取消都必须生成 operation |
| 每日最终状态 | `daily_checkin_states` | `checkinService` / `syncCheckin` | 首页和报表读取最终状态，不直接累计流水 |
| 同步恢复 | pending、`sync_logs`、`conflict_logs`、`recoverData` | `syncService` | `synced` 必须由云端确认后回写 |
| 报表 | `userHabit`、`policyVersion`、`dailyCheckinState` | `reportService` / `reportAggregator` | 页面不得计算分母、完成率、streak |
| 页面状态 | service 返回的视图模型 | EventBus + 页面刷新 | 页面不得监听 storage 或改其他页面 `data` |

闭环完成的最低证明：

- 新用户、老用户、有缓存、清缓存、离线、同步失败六类入口都有可解释路径。
- 打卡、取消、删除、编辑策略都会触发正确的状态、缓存失效、同步和报表刷新。
- 任一失败点都有非阻断兜底，且不会丢失已经确认的历史数据。
- 日志能解释时间、迁移、同步、冲突和报表分母。
- 测试或静态搜索能证明本次改动没有新增页面层禁止事项。

### 3.2 跨文档冲突判定

本文档用于驱动执行，不替代 `AGENTS.md`、PRD 和专题治理文档。发现冲突时按以下顺序判断：

1. 用户当前明确指令。
2. `AGENTS.md` 长期治理规则。
3. `docs/v1/v1-product-boundary.md` 与 `docs/product/prd-v1.md` 的 V1 产品边界。
4. `docs/architecture/technical-architecture.md`、`docs/architecture/state-machine.md`、`docs/architecture/migration-plan.md`。
5. `docs/v1/v1-report-rules.md`、`docs/v1/v1-sync-strategy.md`、`docs/governance/testing-strategy.md`、`docs/governance/logging-debugging.md`。
6. `docs/ui/ui-visual-guidelines.md`、`docs/ui/ui-interaction-guidelines.md`。
7. 旧实现代码。

冲突处理规则：

- 如果本文档与 `AGENTS.md` 冲突，以 `AGENTS.md` 为准，并更新本文档。
- 如果阶段目标与专题规则冲突，以专题规则的业务口径为准，并调整阶段执行顺序。
- 如果旧代码与治理文档冲突，以治理文档为准，采用兼容迁移和小步替换，不直接删除旧逻辑。
- 如果用户当前指令要求突破 V1 边界，必须先说明影响数据模型、状态机、同步、报表、缓存、迁移和测试的风险。
- 如果冲突会导致历史数据不可恢复、打卡闭环被阻断、报表口径不可解释，AI 必须暂停并请求用户决策。

---

## 4. AI 工作原则

AI 每次接手任务时必须遵守：

1. 先读文档，再读代码。
2. 先确认目标，再动文件。
3. 先判断影响范围，再选实现路径。
4. 先保住主链路，再做局部优化。
5. 先补服务层，再瘦页面层。
6. 先兼容旧数据，再切换新读路径。
7. 先写可验证的小改动，再扩大覆盖面。
8. 遇到旧实现与治理文档冲突时，以治理文档为准，分阶段修正。
9. 遇到用户当前明确指令与文档冲突时，以用户当前指令为准，但必须说明风险。
10. 不因发现更多问题而擅自扩大任务。

AI 修改代码前必须明确：

- 本次目标。
- 修改文件。
- 影响范围。
- 风险点。
- 是否涉及 migration。
- 是否涉及 cache invalidation。
- 是否涉及状态机变化。
- 是否涉及数据模型变化。
- 是否涉及报表口径变化。

AI 修改代码后必须说明：

- 修改了哪些文件。
- 修改了哪些函数或模块。
- 是否影响旧功能。
- 如何测试。
- 是否涉及 migration。
- 是否涉及 cache invalidation。
- 是否涉及状态机、数据模型、报表口径变化。

---

## 5. 不允许停止的条件

AI 不得因为以下情况直接停止在分析或建议阶段：

- 旧代码混乱。
- 页面层已有大量直接缓存读取。
- 报表逻辑散落在页面、utils、云函数。
- 缺少某个 service。
- 缺少某类测试。
- 存在旧云函数和新目标集合不一致。
- 发现 `habitId` 和 `userHabitId` 混用。
- 当前阶段只能完成一部分。
- 静态搜索发现大量历史债务。
- 需要兼容旧缓存。
- 需要保留旧读路径。
- 网络同步逻辑不完整。
- AI 认为“最好整体重写”。

这些情况都是重构背景，不是停止理由。  
AI 应选择当前阶段内最小可验证切口继续推进。

---

## 6. 允许停止的条件

只有以下情况允许 AI 停止并请求用户决策：

- 用户要求的修改会破坏核心打卡闭环。
- 用户要求的修改会导致历史数据不可恢复。
- 用户要求直接删除旧数据、旧集合或旧缓存。
- 需要生产环境密钥、CloudBase 权限或 DeepSeek API Key。
- 当前任务必须修改数据模型，但用户没有授权。
- 当前任务必须修改报表口径，但文档未更新。
- 当前任务必须引入 V2/V3 能力，超出 V1 边界。
- 工作区存在与当前任务直接冲突的未说明改动，继续会覆盖用户工作。
- 无法在本地验证，且继续修改会扩大风险。

停止时必须输出：

- 已完成的事实。
- 阻塞点。
- 继续前需要用户决定的问题。
- 不得给出含糊的“建议重构”作为结束。

---

## 7. 小步重构原则

每次改动必须尽量小，且能单独验证。

推荐顺序：

1. 新增常量、模型或 service 壳。
2. 给 service 写最小测试。
3. 将一个页面中的一个业务动作迁移到 service。
4. 保留旧读路径或兼容层。
5. 通过 EventBus 通知页面刷新。
6. 运行对应测试和静态检查。
7. 再迁移下一个动作。

禁止：

- 一次性重写四个页面。
- 一次性替换所有缓存 key。
- 一次性删除旧云函数。
- 一次性改完报表、同步、迁移、UI。
- 为了解决局部问题引入重型全局 store。
- 为了“优雅”提前抽象复杂框架。
- 只移动代码不补验证。
- 在页面层增加新的临时业务逻辑。

小步完成的定义：

- 当前功能仍可运行。
- 旧数据仍可读取或恢复。
- 新旧状态不会互相污染。
- 测试或静态检查能证明没有新增同类债务。

---

## 8. 风险控制原则

### 数据风险

高风险行为：

- 物理删除用户习惯。
- 物理删除唯一打卡历史。
- 用 `habitId` 作为生命周期边界。
- 策略版本只按 `habitId` 归属。
- 清缓存后混用其他 openid 缓存。
- 迁移不可重复执行。

控制规则：

- 删除习惯必须软删除。
- 打卡和取消都必须保留 operation。
- 每日最终状态由 `dailyCheckinState` 表达。
- 迁移必须幂等。
- 旧表和旧缓存第一阶段只读兼容，不破坏性清理。

### 同步风险

高风险行为：

- 重试时生成新的 `idempotencyKey`。
- 未经云端确认标记 `synced`。
- 同步失败丢弃 pending。
- 直接在页面操作 pending 队列。
- 云函数信任前端传入 openid。

控制规则：

- `syncService` 是 pending 和 retry 唯一入口。
- `cloudService` 是前端云函数唯一入口。
- 云函数用 `cloud.getWXContext()` 获取 openid。
- 冲突进入 `conflictLogs`。
- V1 冲突以服务端最终状态为准。

### 报表风险

高风险行为：

- 页面直接计算完成率、分母、streak。
- 直接累计 `checkin_logs` 或 `CheckinLogs`。
- 新旧生命周期混算。
- 低可信日期静默计入报表。
- 未来日期计入分母。

控制规则：

- 报表统一由 `reportService` / `reportAggregator` 生成。
- 报表先按 `userHabitId` 计算，再按 `habitId` 展示聚合。
- 特殊口径必须有测试。
- 修改报表规则必须同步更新治理文档和测试。

### UI 风险

高风险行为：

- 借重构重画页面。
- 新增一套视觉系统。
- 扩散旧色。
- 让旧导航组件参与一级导航。
- 删除操作继续使用 `#e64340`。

控制规则：

- 保留现有 UI 骨架。
- 只做 token 化、危险色修复、导航边界统一、基础组件抽离。
- `custom-tab-bar` 是唯一一级导航视觉来源。
- 危险操作统一使用 `--color-danger`。

---

## 9. 阶段验证原则

每个阶段都必须有可执行验证，不允许只声明“已完成”。

验证优先级：

1. 单元测试。
2. 集成测试。
3. 静态搜索。
4. 手工主链路验证。
5. 日志或 debugMode 解释。

常用回归命令：

```bash
npm test -- __tests__/unit/services
npm test -- __tests__/unit/utils
npm test -- __tests__/integration/cloudfunctions
```

当前阶段没有对应目录时，可运行：

```bash
npm test -- __tests__/unit
npm test -- __tests__/integration/cloudfunctions
```

治理类静态搜索：

```bash
rg -n "wx\\.getStorageSync|wx\\.setStorageSync|wx\\.removeStorageSync|wx\\.cloud\\.callFunction|new Date\\(" miniprogram/pages
rg -n "#e64340" miniprogram custom-tab-bar components styles
```

静态搜索结果不要求一次全部清零，但必须满足：

- 本次改动没有新增禁止事项。
- 本次改动没有扩大旧债务。
- 若命中历史债务，必须说明是否本阶段处理。

---

## 10. 架构一致性要求

长期调用方向固定为：

```text
pages
  -> components
  -> services
  -> models / constants / utils
  -> cloudService
  -> cloudfunctions
  -> CloudBase database
```

架构一致性要求：

- 页面只展示、响应事件、调用 service、订阅 EventBus。
- 组件只接收 props、触发 events，不读写业务数据。
- 服务层承载业务逻辑和状态变更。
- 模型层定义稳定数据结构。
- 常量层定义枚举、缓存 key、集合名、错误码。
- 工具层只放无副作用工具。
- 云函数负责身份、幂等、安全校验、同步和写入。
- 旧实现不能作为推翻新架构规则的依据。

任何新增业务能力必须先判断是否影响：

- 数据模型。
- 状态机。
- sync。
- report。
- cache。
- migration。
- TimeService。
- CloudBase 权限。
- 日志与调试。
- AI 安全边界。

若影响任一项，必须先更新对应治理文档，再实施代码。

---

## 11. 数据一致性要求

核心 ID 不得混用：

| ID | 含义 |
|---|---|
| `habitId` | 内置习惯 ID |
| `userHabitId` | 用户某次添加形成的习惯实例 ID |
| `policyVersionId` | 某个用户习惯实例的策略版本 ID |
| `operationId` | 打卡或取消操作流水 ID |
| `stateId` | 某日最终状态 ID |

数据一致性规则：

- `habitId` 不得代表用户实例。
- `habitId` 不得直接作为报表生命周期。
- `habitId` 不得直接关联策略版本。
- 重新添加同一内置习惯必须生成新的 `userHabitId`。
- 策略版本必须归属于 `userHabitId`。
- 同一 `userHabitId` 下策略版本时间段不得重叠。
- 首页和报表优先读取 `dailyCheckinState`。
- 操作流水用于审计、同步、冲突排查，不作为报表简单累计源。
- 缓存必须记录所属 openid，防止跨用户污染。

---

## 12. 状态流一致性要求

核心状态机只能由 service 或云函数修改。

### userHabit

允许状态：

```text
active
deleted
```

规则：

- 删除是软删除。
- V1 不复用已删除 `userHabitId`。
- 页面不得直接改 `status` 或 `isDeleted`。

### checkinOperation

允许状态：

```text
pending
synced
failed
```

规则：

- 打卡和取消都必须生成 operation。
- operation 必须包含 `operationId` 和 `idempotencyKey`。
- 重试必须保留原始 `idempotencyKey`。

### dailyCheckinState

允许状态：

```text
checked
canceled
unchecked
not_required
```

规则：

- 首页和报表读取每日最终状态。
- 取消打卡更新最终状态，不删除唯一历史依据。
- 删除当天、策略修改当天、低可信日期必须可解释。

### syncStatus

允许状态：

```text
pending
syncing
synced
failed
retrying
```

规则：

- 页面不得直接把状态改为 `synced`。
- 同步结果必须由 `syncService` 或云函数确认。
- 冲突必须进入 `conflictLogs`。

---

## 13. 测试与验证要求

测试优先级固定：

1. `reportService`
2. `timeService`
3. `migrationService`
4. `checkinService`
5. `syncService`
6. `habitService`
7. 云函数测试
8. 页面轻量测试
9. UI 自动化测试

必须覆盖的关键用例：

- 每天、每周固定星期、间隔天数策略。
- 策略版本切换。
- 删除当天已打卡。
- 删除当天未打卡。
- 策略修改当天已打卡。
- 策略修改当天未打卡。
- 同 `habitId` 多个 `userHabitId` 聚合展示。
- 新旧生命周期不混算。
- 未来日期不计入分母。
- 非应修日不计入分母。
- 低可信日期不计入报表。
- 重复打卡不重复计数。
- 取消打卡不物理删除唯一历史依据。
- pending retry 保留同一幂等键。
- recoverData 恢复核心数据。
- 迁移重复运行不生成重复记录。
- 页面层不新增禁止事项。

测试不足时不允许宣称阶段完成。  
如果因环境限制无法运行测试，必须明确说明未验证项和剩余风险。

---

## 14. AI 自检机制

AI 每次任务必须执行自检。

### 修改前自检

- 当前任务属于哪个 phase。
- 是否需要读取额外治理文档。
- 是否涉及数据模型变化。
- 是否涉及状态机变化。
- 是否涉及缓存失效。
- 是否涉及 migration。
- 是否涉及报表口径。
- 是否涉及 CloudBase 权限。
- 是否涉及 UI 边界。
- 是否会影响旧数据兼容。

### 修改中自检

- 是否绕过了 service。
- 是否在页面层新增禁止事项。
- 是否直接使用了 `new Date()` 计算业务日期。
- 是否直接读写 storage。
- 是否直接调用业务云函数。
- 是否混用了 `habitId` 和 `userHabitId`。
- 是否让报表直接累计旧日志。
- 是否破坏 pending / retry / idempotencyKey。
- 是否引入了 V1 不需要的复杂抽象。

### 修改后自检

- 本次改动是否仍符合当前 phase。
- 是否有测试或静态检查结果。
- 是否保持旧功能可运行。
- 是否保持旧数据可兼容。
- 是否增加或更新必要文档。
- 是否说明 migration、cache invalidation、状态机、数据模型、报表口径影响。
- 是否存在未验证风险。

---

## 15. 阶段完成判定条件

阶段完成不能只看代码合并，必须看工程目标是否达成。

一个阶段只有同时满足以下条件，才算完成：

- 当前阶段目标已实现。
- 当前阶段新增代码符合 service 边界。
- 没有新增页面层禁止事项。
- 没有破坏旧数据兼容。
- 没有引入 V1 边界外能力。
- 对应测试通过，或明确说明无法运行的原因。
- 静态搜索没有发现本次新增违规。
- 相关 cache、migration、状态机、报表影响已说明。
- 小程序核心主链路仍可运行。
- 下一阶段可以在此基础上继续推进，而不需要推倒重来。

如果阶段只完成部分，则必须标记为：

```text
阶段部分完成：可继续推进，但不得宣称阶段完成。
```

并说明：

- 已完成项。
- 未完成项。
- 未验证项。
- 下一步最小切口。

---

## 16. 多 Agent 协作规则

多个 AI Agent 协作时，必须遵守同一目标和同一阶段顺序。

协作规则：

- 不同 Agent 不得同时修改同一核心 service，除非已有明确拆分。
- Agent 交接时必须说明当前 phase、已改文件、未验证风险。
- 后续 Agent 不得覆盖前序 Agent 的未合并改动。
- 后续 Agent 发现问题时，应优先补验证和小步修正，不直接推翻。
- 每个 Agent 都必须重新读取当前任务相关文档。
- 多 Agent 输出的实现必须服从 `AGENTS.md` 和本文档，而不是各自偏好的架构。

交接信息至少包含：

- 当前阶段。
- 本次目标。
- 已修改文件。
- 已运行验证。
- 失败或未运行验证。
- 数据、状态、缓存、同步、报表影响。
- 下一步建议切口。

---

## 17. 禁止提前设计的内容

V1 重构期间，禁止提前实现以下内容：

- 社区。
- 排行榜。
- 好友关系。
- 打卡竞赛。
- 课程体系。
- 内容 feed。
- 邀请奖励。
- 商业会员体系。
- 复杂勋章体系。
- 用户自由创建全新习惯库。
- 医疗 AI。
- 医疗建议。
- 医疗诊断。
- 完整多端冲突裁决。
- 全量历史预加载。
- 重型状态管理框架。
- 大规模后台管理系统。

可以预留字段、日志或接口空间，但不得让这些能力成为 V1 主链路依赖。

---

## 18. 最终验收口径

当所有阶段完成后，必须用以下问题进行最终验收：

- 清缓存后，用户能否恢复习惯、策略和近期状态？
- 离线打卡后，用户是否能继续使用并等待同步？
- 重复打卡或重复同步是否会放大报表计数？
- 删除习惯后，历史报表是否仍可解释？
- 删除后重加同一习惯，新旧生命周期是否隔离？
- 策略修改当天，分母和分子是否稳定？
- 低可信日期是否不会静默污染报表？
- 页面是否仍然只是调用 service 和渲染结果？
- 报表是否只由 `reportService` / `reportAggregator` 生成？
- 业务日期是否只由 `timeService` 提供？
- 同步状态是否只由 `syncService` 或云函数确认？
- 危险操作是否使用统一危险色？
- DeepSeek 或 AI 失败是否不影响打卡闭环？
- 日志是否能解释同步、迁移、报表和时间问题？
- 当前实现是否为 V2/V3 留有空间，但没有提前背负 V2/V3 复杂度？

只有这些问题都能回答“是”，V1 重构才算真正完成。
