# AGENTS.md

本文件是《子午花信》项目的长期工程治理宪法。它约束所有人类工程师与 AI Coding Agent 在本仓库中的架构、数据、状态、同步、缓存、测试和文档协作方式。

本文件不用于记录短期 TODO、临时实施计划、一次性迁移步骤或某个版本的功能清单。新阶段、新能力和新版本应通过 `docs/` 下的治理文档扩展，而不是频繁重写本文件。

## 1. 项目定位

子午花信是一个微信小程序 + 腾讯云开发 CloudBase + 可选 DeepSeek API 的东方养生习惯打卡产品。

长期工程目标：

- 保持个人习惯打卡闭环长期稳定。
- 保持数据模型、状态机、时间系统、同步系统、报表系统可演进。
- 保留现有 UI 骨架，优先治理数据层、服务层、云同步层、时间系统和报表聚合。
- 避免引入与产品核心无关的重型架构和复杂功能。

非核心能力不得破坏主链路。AI、分享、复盘文案、个性化建议等能力必须可降级，不得阻断打卡、取消打卡、习惯管理、清缓存恢复和报表展示。

## 2. 长期架构原则

项目采用分层架构：

```text
pages
  -> components
  -> services
  -> models / constants / utils
  -> cloudService
  -> cloudfunctions
  -> CloudBase database
```

调用原则：

- 页面层只负责展示、事件响应、调用 service、渲染结果。
- 组件层只负责可复用 UI，不直接读写业务数据。
- 服务层承载业务逻辑和状态变更。
- 模型层定义稳定数据结构。
- 常量层定义枚举、缓存 key、集合名、错误码。
- 工具层只放无副作用的纯工具。
- 云函数层负责身份、幂等、安全校验、数据同步和云端写入。

禁止绕过 service 层直接操作核心数据。

## 3. 页面层禁止事项

`miniprogram/pages` 禁止：

- 直接 `wx.getStorageSync`
- 直接 `wx.setStorageSync`
- 直接 `wx.removeStorageSync`
- 直接 `wx.cloud.callFunction` 调用业务云函数
- 直接 `new Date()` 计算业务日期
- 直接拼接报表
- 直接计算完成率
- 直接计算报表分母
- 直接计算 streak
- 直接操作 `globalData`
- 直接操作 pending 队列
- 直接拼接策略版本
- 直接操作 `dailyCheckinState`
- 直接修改其他页面 `data`
- 直接监听 storage
- 直接写复杂业务逻辑

`pages` 只允许：

- 展示 UI
- 响应用户事件
- 调用 service
- 订阅 EventBus
- 渲染 service 返回的视图模型

页面 `onShow` 只做轻量校验和必要刷新，不承担复杂业务重算。

## 4. 服务层边界

### 4.1 timeService

唯一业务时间入口，负责：

- Asia/Shanghai 业务日期
- serverTime
- dateConfidence
- 跨天刷新
- 周/月/年边界
- 未来日期判断

其他模块不得自行散落业务日期计算。

### 4.2 storageService

唯一缓存入口，负责：

- 所有本地缓存读写
- `cacheMeta`
- `cacheVersion`
- `dataVersion`
- `reportVersion`
- 缓存失效
- 缓存恢复后的写回

页面和组件不得直接读写业务缓存。

### 4.3 cloudService

唯一前端云函数调用入口，负责：

- 封装 `wx.cloud.callFunction`
- 标准化错误码
- 标准化返回结构
- 超时、重试和降级入口
- serverTime 读取

页面不得直接调用业务云函数。

### 4.4 habitService

负责：

- 内置习惯读取
- 用户习惯实例
- 添加习惯
- 编辑策略
- 删除习惯
- 今日习惯生成
- 习惯生命周期规则

任何涉及 `userHabitId` 生命周期的逻辑必须进入 `habitService` 或云函数，不得散落页面。

### 4.5 checkinService

负责：

- 打卡
- 取消打卡
- operation 生成
- daily state 更新
- pending 操作
- 打卡防抖
- 本地乐观更新

打卡与取消必须通过 `checkinOperation -> dailyCheckinState` 表达。禁止物理删除唯一历史记录来表达取消。

### 4.6 reportService / reportAggregator

唯一报表聚合入口，负责：

- 周报
- 月报
- 年报
- 完成率
- 分母
- 分子
- streak
- 日历状态
- 年热力状态
- 策略版本命中
- 同一 `habitId` 下多个 `userHabitId` 聚合展示
- 删除当天和策略修改当天特殊口径

页面不得自行计算报表。

### 4.7 syncService

负责：

- pending 队列
- retry
- recoverData
- syncLogs
- conflictLogs
- 服务端确认状态回写本地

页面不得直接操作同步队列。

### 4.8 migrationService

负责：

- 旧缓存迁移
- 旧云端集合迁移
- cacheVersion 升级
- migrationLogs
- 兼容旧字段

页面不得自行补字段或迁移旧数据。

### 4.9 aiService

负责：

- 组织 AI 调用上下文
- 调用 `deepseekProxy`
- AI 结果缓存
- AI 失败兜底

AI 能力不得阻断核心打卡闭环。

## 5. 核心数据模型原则

必须严格区分：

| ID | 含义 |
|---|---|
| `habitId` | 内置习惯 ID |
| `userHabitId` | 用户某一次生命周期中的习惯实例 ID |
| `policyVersionId` | 某个 userHabit 的策略版本 ID |
| `operationId` | 打卡操作流水 ID |
| `stateId` | 每日最终状态 ID |

强约束：

- `habitId` 不得代表用户习惯实例。
- `habitId` 不得直接做报表生命周期。
- `habitId` 不得直接关联策略版本。
- 同一内置习惯删除后再次添加，必须生成新的 `userHabitId`。
- 旧生命周期和新生命周期可以共享同一个 `habitId`，但数据计算必须以 `userHabitId` 为边界。
- 报表可按 `habitId` 聚合展示，但必须先按 `userHabitId` 分别计算。

## 6. 状态机原则

状态必须集中定义在 constants 或 models 中，并由 service 或云函数修改。页面层禁止直接改状态。

### 6.1 userHabit 状态机

```text
active
deleted
```

规则：

- 删除习惯是软删除。
- 默认不支持复用已删除 `userHabitId`。
- 重新添加同一内置习惯生成新的 `userHabitId`。

### 6.2 checkinOperation 状态机

```text
pending
synced
failed
```

规则：

- 打卡和取消都必须生成 operation。
- operation 必须包含 `operationId` 和 `idempotencyKey`。
- 重试必须保留原始 `idempotencyKey`。

### 6.3 dailyCheckinState 状态机

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

### 6.4 syncStatus 状态机

```text
pending
syncing
synced
failed
retrying
```

规则：

- 页面层不得直接把状态改为 `synced`。
- 同步结果必须由 `syncService` 或云函数确认。
- 冲突必须进入 conflict logs。

## 7. 时间系统原则

所有业务日期必须统一走 `timeService`。

统一口径：

- Asia/Shanghai
- 业务日期
- 今日 key
- 周/月/年边界
- 跨天刷新
- serverTime
- dateConfidence

禁止在页面层、报表逻辑、打卡逻辑、策略逻辑中直接使用 `new Date()` 计算业务日期。

允许使用底层时间 API 的位置：

- `timeService`
- `dateUtils`
- 云函数底层 `createdAt/serverTime` 生成

但即使在云函数中，业务日期仍必须通过统一时间规则转换。

## 8. 报表系统原则

所有报表必须由 `reportService` 或 `reportAggregator` 生成。

报表必须支持：

- 每天频次
- 每周固定星期
- 间隔天数
- 策略版本切换
- 同一 `habitId` 多个 `userHabitId`
- 删除当天特殊口径
- 策略修改当天特殊口径
- 未来日期不计入分母
- 非应修日不计入分母
- 已删除习惯历史展示

农历只用于展示，不参与完成率、分母、分子、累计修习、streak 计算。

修改报表规则时，必须同步更新：

- 报表治理文档
- `reportService` 测试
- 删除当天和策略修改当天测试
- 迁移或缓存影响说明

## 9. 缓存与同步原则

必须维护：

- `cacheMeta`
- `cacheVersion`
- `dataVersion`
- `reportVersion`
- `migrationVersion`

缓存必须明确：

- 所属 openid
- 结构版本
- 数据版本
- 报表版本
- 最近同步时间
- 最近恢复时间
- 最近业务日期

缓存失效必须由 service 管理。以下操作必须触发相关缓存失效：

- 打卡
- 取消打卡
- 添加习惯
- 编辑策略
- 删除习惯
- 跨天刷新
- 清缓存恢复
- app 升级 migration

同步原则：

- 所有云同步必须幂等。
- `syncCheckin` 必须使用 `idempotencyKey`。
- 重复请求不得放大计数。
- 离线操作进入 pending。
- 网络恢复后可 retry。
- 服务端确认状态必须回写本地。
- 多端冲突的长期原则是以服务端最终归并状态为准，并保留冲突日志。

## 10. EventBus 状态同步原则

前端采用 `Service + EventBus` 模式。

禁止：

- 页面之间互相直接改 `data`
- 页面直接监听 storage
- 页面直接修改其他页面状态

业务更新流程：

```text
Service
  -> EventBus
  -> 页面响应刷新
```

至少包含事件：

- `checkin:updated`
- `habit:updated`
- `report:updated`
- `sync:updated`
- `cache:invalidated`
- `time:dateChanged`
- `migration:completed`
- `migration:failed`

事件载荷应轻量，只传影响范围和版本号。页面收到事件后应调用 service 获取最新视图模型。

## 11. CloudBase 原则

CloudBase 数据安全规则：

- 所有用户数据必须按 `_openid` 隔离。
- openid 只能由云函数 `cloud.getWXContext()` 获取。
- 前端传入的 openid 不可信。
- 用户只能读写自己的数据。
- 云函数必须做参数校验。
- 云函数必须做幂等校验。
- 云函数必须返回标准错误码。
- 云函数应返回 serverTime。
- 分享、复制、AI 请求不得泄露 openid、昵称、头像、打卡明细等隐私数据。

核心云端集合长期原则：

- `users`
- `user_habits`
- `habit_policy_versions`
- `checkin_operations`
- `daily_checkin_states`
- `sync_logs`
- `conflict_logs`
- `user_settings`
- `ai_logs`

## 12. DeepSeek API 安全原则

DeepSeek 是可选能力，不是核心链路依赖。

必须：

- 只通过 `deepseekProxy` 云函数调用。
- API Key 只放云函数环境变量。
- 前端不得出现 API Key。
- `aiService` 只能调用 `cloudService`。
- AI 失败必须可降级。
- AI 文案必须标记为辅助建议，不替代医疗建议。
- AI 不得阻断打卡、取消打卡、习惯管理、同步、恢复和报表。
- AI 调用必须限流、记录必要日志，并避免记录敏感隐私。

## 13. 日志与调试原则

必须支持：

- `syncLogs`
- `conflictLogs`
- `migrationLogs`
- `reportDebugLogs`
- `operationLogs`
- `timeLogs`

必须支持 `debugMode`。

debugMode 用于排查：

- 昨天明明打卡了，为什么报表没显示。
- 删除后为什么历史还在。
- 策略改了为什么今天还显示。
- 清缓存后为什么数据没恢复。
- 离线打卡为什么同步失败。

日志原则：

- 普通模式避免大量冗余日志。
- debugMode 可输出 service 输入输出、策略命中、报表分母解释、同步队列状态。
- 日志不得泄露隐私。
- 日志不得记录 DeepSeek API Key。

## 14. UI 技术原则

当前 UI 不整体重做。

允许：

- token 化
- 危险色修复
- 导航边界统一
- 基础组件抽离

必须：

- `custom-tab-bar` 是唯一一级导航视觉来源。
- 五主题色统一 token。
- 删除操作统一 `--color-danger`。
- 不允许继续使用 `#e64340` 作为危险色。

禁止：

- 借重构整体重做视觉。
- 扩散旧色。
- 引入与规范不一致的新视觉体系。

## 15. 测试原则

测试优先级：

1. `reportService`
2. `timeService`
3. `migrationService`
4. `checkinService`
5. `syncService`
6. `habitService`
7. 云函数测试
8. 页面轻量测试
9. UI 自动化测试

修改规则：

- 修改状态机必须同步更新状态机文档和测试。
- 修改缓存规则必须同步评估 migration 和缓存失效。
- 修改 report 规则必须同步更新报表测试。
- 修改数据模型必须同步更新数据架构和迁移方案。
- 修改云同步必须同步更新幂等和恢复测试。

## 16. 架构演进原则

AGENTS.md 不应频繁重写。它只记录长期稳定的工程规则。

V2/V3 功能应通过以下方式扩展：

- `docs/v2/`
- `docs/v3/`
- 新增专题治理文档
- 更新相关服务边界文档
- 更新测试和验收文档

新能力优先新增治理文档，而不是破坏既有架构。

任何新功能必须评估是否影响：

- 数据模型
- 状态机
- sync
- report
- cache
- migration
- TimeService
- CloudBase 权限
- 日志与调试
- AI 安全边界

若新功能影响上述任一项，必须先更新对应治理文档，再实施代码。

## 17. AI Coding Agent 协作规则

AI Coding Agent 修改代码前必须：

- 读取本文件。
- 读取与任务相关的治理文档。
- 明确本次目标。
- 明确修改文件。
- 明确影响范围。
- 明确风险点。

AI Coding Agent 禁止：

- 跳过 service 层。
- 直接全局重构。
- 未经说明修改数据结构。
- 在页面层新增禁止事项。
- 用 `habitId` 替代 `userHabitId`。
- 绕过 TimeService 计算业务日期。
- 绕过 reportService 计算报表。
- 绕过 cloudService 调云函数。
- 绕过 storageService 操作缓存。
- 绕过 syncService 操作 pending 队列。
- 未经说明修改状态机。
- 未经说明修改缓存规则。
- 未经说明修改迁移规则。

AI Coding Agent 修改代码后必须说明：

- 修改了哪些文件。
- 修改了哪些函数。
- 是否影响旧功能。
- 如何测试。
- 是否涉及 migration。
- 是否涉及 cache invalidation。
- 是否涉及状态机变化。
- 是否涉及数据模型变化。
- 是否涉及报表口径变化。

## 18. 文档索引

长期治理文档：

- `AGENTS.md`
- `README.md`
- `docs/architecture/technical-architecture.md`
- `docs/architecture/state-machine.md`
- `docs/architecture/migration-plan.md`
- `docs/governance/code-boundary-rules.md`
- `docs/governance/testing-strategy.md`
- `docs/governance/logging-debugging.md`
- `docs/v1/v1-product-boundary.md`
- `docs/v1/v1-report-rules.md`
- `docs/v1/v1-sync-strategy.md`
- `docs/GOAL_DRIVEN.md`

产品与 UI 文档：

- `docs/product/prd-v1.md`
- `docs/ui/ui-visual-guidelines.md`
- `docs/ui/ui-interaction-guidelines.md`

迁移与落地参考：

- `docs/architecture/migration-plan.md`
- `docs/architecture/technical-architecture.md`

版本扩展建议：

- `docs/v2/`
- `docs/v3/`

## 19. 执行优先级

当文档之间出现冲突时，优先级为：

1. 用户当前明确指令。
2. `AGENTS.md` 长期治理规则。
3. PRD。
4. 技术架构与数据架构文档。
5. 状态机、缓存、同步、测试、日志等专题治理文档。
6. UI 视觉与交互规范。
7. 旧实现代码。

旧实现代码不能作为推翻新架构规则的依据。若旧代码与本文件冲突，应按治理规则分阶段重构。

## 开发原则

重构任务特殊规则

涉及以下内容时：
- 数据模型
- 状态管理
- 打卡逻辑
- 报表聚合
- 云同步
- 缓存恢复
- 时间系统

必须优先阅读：
`docs/architecture/technical-architecture.md`

重点章节：
- 当前项目技术现状盘点
- 数据架构设计
- 腾讯云开发架构方案
- 核心业务流程技术设计
- 报表聚合服务技术方案
- 分阶段实施路线图
- 最终技术策略结论

禁止：
- 跳过阶段实施路线
- 一次性重构整个项目
- 修改 UI 骨架
- 修改四主页面信息架构
- 引入未经验证的复杂抽象
- 直接删除旧逻辑而不做迁移
