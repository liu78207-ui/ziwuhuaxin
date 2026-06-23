# 工程禁止事项与代码边界规范

## 1. 总体原则

子午花信 V1 保留当前 UI 骨架，重构重点是数据层、服务层、云同步层、时间系统和报表聚合。

工程治理目标：

- 页面变薄。
- 业务逻辑进入 service。
- 数据模型边界清晰。
- 缓存、云同步、报表、时间统一入口。
- 禁止继续扩大旧架构债务。

字段命名边界：

- V1 主链路统一使用 `lowerCamelCase` 字段。
- CloudBase 系统字段 `_openid`、`_id` 和集合名可保留下划线。
- 维护迁移函数、legacy 兼容云函数和历史测试夹具可以读取旧字段，但不得作为新写入模型。
- 新 V1 代码不得写入或返回 `habit_id`、`Habit_Id`、`user_habit_id`、`policy_version_id`、`checkin_date`、`freq_type`、`freq_rules`、`plan_start_date`、`sync_status`、`lockedReason`、`syncStatus`、`isDeleted`。
- 发布前必须运行 `npm run verify:field-naming`。

## 2. 页面层禁止事项

`pages` 禁止：

- 直接 `wx.getStorageSync`。
- 直接 `wx.setStorageSync`。
- 直接 `wx.removeStorageSync`。
- 直接 `wx.cloud.callFunction` 调用业务云函数。
- 直接 `new Date()` 计算业务日期。
- 直接拼接报表。
- 直接计算完成率。
- 直接计算报表分母。
- 直接计算 streak。
- 直接操作 `globalData`。
- 直接操作 pending 队列。
- 直接拼接策略版本。
- 直接操作 `dailyCheckinState`。
- 直接写复杂业务逻辑。
- 直接修改其他页面状态。
- 直接监听 storage。

页面层只允许：

- 展示 UI。
- 响应点击。
- 调用 service。
- 渲染 service 返回结果。
- 订阅 EventBus 事件并触发轻量刷新。

## 3. Service 边界

### 3.1 timeService

负责：

- 业务日期。
- Asia/Shanghai。
- serverTime。
- dateConfidence。
- 跨天刷新。
- 周/月/年边界。

禁止其他 service 自行计算业务日期。

### 3.2 storageService

负责：

- 所有缓存读取。
- 所有缓存写入。
- cacheMeta。
- cacheVersion。
- dataVersion。
- reportVersion。
- 缓存失效。

禁止页面层直接操作业务缓存。

### 3.3 cloudService

负责：

- 统一 `wx.cloud.callFunction`。
- 统一错误码。
- 统一超时和重试入口。
- 统一 serverTime 读取。

禁止页面层直接调用业务云函数。

### 3.4 habitService

负责：

- 内置习惯读取。
- 用户习惯实例。
- 添加习惯。
- 编辑策略。
- 删除习惯。
- 今日习惯生成。

禁止页面层用 `habitId` 代表用户实例生命周期。

### 3.5 checkinService

负责：

- 打卡。
- 取消打卡。
- operation 生成。
- daily state 更新。
- pending 操作。
- 打卡防抖。

禁止直接用旧 `checkin_logs` 推导首页和报表。

### 3.6 reportService

负责：

- 周报。
- 月报。
- 年报。
- 分母计算。
- 完成率。
- streak。
- 日历状态。
- 年热力状态。
- 策略版本命中。
- 删除当天和策略修改当天特殊口径。

禁止页面层自行拼报表。

### 3.7 syncService

负责：

- pending 同步。
- retry。
- recoverData。
- syncLogs。
- conflictLogs。

禁止页面层直接操作同步队列。

### 3.8 migrationService

负责：

- 旧缓存迁移。
- 旧云端集合迁移。
- cacheVersion 升级。
- migrationLogs。

禁止页面层补字段或迁移旧数据。

## 4. 数据模型强约束

必须严格区分：

| ID | 含义 |
|---|---|
| `habitId` | 内置习惯 ID |
| `userHabitId` | 用户某一次生命周期中的习惯实例 ID |
| `policyVersionId` | 某个 userHabit 的策略版本 ID |
| `operationId` | 打卡操作流水 ID |
| `stateId` | 每日最终状态 ID |

禁止：

- 用 `habitId` 直接代表用户实例。
- 用 `habitId` 直接做报表生命周期。
- 用 `habitId` 直接关联策略版本。
- 删除后重加复用旧 `userHabitId`。

## 5. 云函数边界

云函数必须：

- 使用 `cloud.getWXContext()` 获取 openid。
- 所有用户数据按 `_openid` 隔离。
- 做参数校验。
- 做幂等校验。
- 返回标准错误码。
- 返回 serverTime。

前端禁止：

- 把 openid 当可信参数传给业务函数。
- 暴露 DeepSeek API Key。
- 直接调用 DeepSeek API。

DeepSeek 只允许：

- 通过 `deepseekProxy` 云函数调用。
- AI 失败不影响主链路。

## 6. UI 边界

当前 UI 不整体重做。

允许：

- token 化。
- 危险色修复。
- 导航边界统一。
- 基础组件抽离。

禁止：

- 借重构整体重做视觉。
- 新增社区、课程、排行榜、feed。
- 扩散旧色。
- 使用 `#e64340`。
- 让旧 `nav-bar`、`tab-bar`、`navigation-bar` 参与一级导航验收。

必须：

- `custom-tab-bar` 是唯一一级导航。
- 删除操作统一 `--color-danger`。
- 五主题色统一 token。

## 7. 前端状态同步机制

前端状态同步属于工程边界治理，采用 `Service + EventBus` 模式，保证页面之间不互相直接修改状态，业务更新统一从 service 发出，由 EventBus 通知页面轻量刷新。

目标：

- 降低页面耦合。
- 避免页面直接操作其他页面 `data`。
- 避免页面监听 storage。
- 避免页面在 `onShow` 中做复杂业务重算。
- 保证首页、修习页、观心页、归藏页状态最终一致。

### 7.1 基本架构

```text
用户操作
  -> page event handler
  -> service
  -> storageService / cloudService / syncService
  -> EventBus emit
  -> 当前页或其他页按需刷新
```

页面只允许：

- 响应点击。
- 调用 service。
- 订阅必要事件。
- 渲染 service 返回结果。

页面禁止：

- 直接改其他页面 `data`。
- 直接读写业务缓存。
- 直接监听 storage 变化。
- 直接操作 `globalData`。
- 直接调用业务云函数。

### 7.2 EventBus 事件清单

V1 至少包含：

| 事件名 | 触发场景 | 主要订阅页面 |
|---|---|---|
| `checkin:updated` | 打卡或取消后 | 案台、观心 |
| `habit:updated` | 添加、编辑、删除习惯后 | 案台、修习、观心 |
| `report:updated` | 报表缓存失效或重新生成后 | 观心 |
| `sync:updated` | 同步状态变化后 | 案台、修习、观心、归藏 |
| `sync:recovered` | `recoverData` 或兼容恢复成功写回本地缓存后 | 案台、修习、观心 |
| `cache:invalidated` | 缓存失效后 | 案台、修习、观心 |
| `user:updated` | 用户资料变化后 | 归藏 |
| `time:dateChanged` | 跨天或业务日期变化 | 案台、观心 |
| `migration:completed` | 旧数据迁移完成 | 案台、修习、观心 |
| `migration:failed` | 迁移失败 | 案台、修习、观心 |

### 7.3 事件载荷规范

事件载荷必须轻量，不传完整大对象，避免页面间共享可变引用。

推荐结构：

```js
{
  type: 'checkin:updated',
  source: 'checkinService',
  version: 12,
  affected: {
    userHabitId: 'uh_xxx',
    habitId: '12',
    date: '2026-05-22'
  },
  meta: {
    pending: true,
    cacheKeys: ['dailyStates', 'todayHabits', 'weeklyReport']
  }
}
```

页面收到事件后，应调用 service 获取最新视图模型，而不是直接消费复杂业务对象。

### 7.4 页面订阅规则

案台页订阅：

- `checkin:updated`
- `habit:updated`
- `sync:updated`
- `cache:invalidated`
- `time:dateChanged`
- `migration:completed`

案台页响应：

- 调用 `habitService.getTodayHabits(date)`。
- 调用 `reportService.calculateTodayProgress()` 或由 `habitService.getTodayHabits(date)` 返回今日进度视图模型。
- 不直接读取 `CheckinLogs`。
- 不直接计算今日应修。

修习页订阅：

- `habit:updated`
- `sync:updated`
- `cache:invalidated`
- `migration:completed`

修习页响应：

- 调用 `habitService.getBuiltInHabits()`。
- 调用 `habitService.getUserHabits()`。
- 重新合并“内置习惯 + 用户实例状态”视图。

观心页订阅：

- `checkin:updated`
- `habit:updated`
- `report:updated`
- `cache:invalidated`
- `time:dateChanged`
- `migration:completed`

观心页响应：

- 调用 `reportService.getWeeklyReport()`。
- 调用 `reportService.getMonthlyReport()`。
- 调用 `reportService.getYearlyReport()`。
- 不在页面层重新拼报表。

归藏页订阅：

- `user:updated`
- `sync:updated`

归藏页响应：

- 调用 `userService.getProfile()`。
- 展示同步状态或恢复状态。

### 7.5 onShow 规则

页面 `onShow` 只做轻量校验：

- 确认 EventBus 订阅已建立。
- 校验业务日期是否变化。
- 校验当前页面必要视图是否过期。
- 必要时调用 service 拉取视图模型。

页面 `onShow` 禁止：

- 直接读写 storage。
- 直接云同步。
- 全量报表重算。
- 直接合并策略版本。
- 直接补迁移数据。

### 7.6 Service 触发规则

`checkinService` 触发：

- `checkin:updated`
- `sync:updated`
- `cache:invalidated`
- 必要时触发 `report:updated`

`habitService` 触发：

- `habit:updated`
- `cache:invalidated`
- `report:updated`

`syncService` 触发：

- `sync:updated`
- `checkin:updated`
- `habit:updated`
- `cache:invalidated`

`migrationService` 触发：

- `migration:completed`
- `migration:failed`
- `cache:invalidated`

`timeService` 触发：

- `time:dateChanged`
- `cache:invalidated`

### 7.7 防重复刷新

EventBus 必须支持：

- 去重订阅。
- 页面卸载时取消订阅。
- 事件节流或批量刷新。
- 基于 `dataVersion` 判断是否需要刷新。

推荐：

- 高频打卡事件只刷新今日视图和当前报表缓存。
- 同步批量完成后合并发一次 `sync:updated`。
- 云端恢复成功后发出 `sync:recovered`，页面只重新调用各自 service 获取视图模型，不直接读写恢复缓存。
- `cache:invalidated` 只携带失效 key，不强制所有页面全量刷新。

### 7.8 验收标准

- 页面之间没有互相直接调用或改 `data`。
- 页面不直接监听 storage。
- 业务更新都由 service 触发 EventBus。
- 页面收到事件后调用 service 获取视图模型。
- `onShow` 不承担复杂业务重算。
- 打卡后首页立即更新，观心页下次进入或当前显示时刷新报表。
- 修习页删除后首页和观心页最终一致。

## 8. 每次改代码前必须说明

每次修改代码前必须输出：

1. 本次目标。
2. 修改文件。
3. 影响范围。
4. 风险点。

## 9. 每次改代码后必须说明

每次修改代码后必须输出：

1. 修改了哪些文件。
2. 修改了哪些函数。
3. 是否影响旧功能。
4. 如何测试。
5. 是否涉及 migration。
6. 是否涉及 cache invalidation。

## 10. 禁止跳阶段

实施顺序：

1. TimeService
2. constants
3. storageService
4. cloudService
5. userHabit 模型
6. policyVersion
7. migrationService
8. checkinService
9. reportService
10. syncService / recoverData
11. 首页
12. 修习页
13. 观心页
14. 清缓存恢复
15. UI token 对齐

说明：

- `migrationService` 可以在模型落地前先建立壳、旧 key 探测、只读兼容和日志规则。
- 真正写入 `user_habits`、`habit_policy_versions`、`checkin_operations`、`daily_checkin_states` 的迁移动作，必须等 userHabit、policyVersion、checkinOperation、dailyCheckinState 模型字段稳定后再执行。

禁止：

- 直接全局重构。
- 先改页面大逻辑。
- 跳过 TimeService。
- 跳过数据模型直接修报表。
- 跳过 service 继续在页面补逻辑。

## 11. 静态检查建议

后续可用搜索辅助检查：

```text
pages/ 下出现 wx.getStorageSync
pages/ 下出现 wx.setStorageSync
pages/ 下出现 wx.cloud.callFunction
pages/ 下出现 new Date()
pages/ 下出现 CheckinLogs
pages/ 下出现 MyHabits
pages/ 下出现 globalData
pages/ 下出现 reportCalculator.calculate
```

这些不一定一次全部清零，但新增代码不得继续扩大。

## 12. 验收标准

- 新增业务代码遵守 service 边界。
- 页面层不新增禁止事项。
- ID 模型不混用。
- 状态机集中管理。
- 缓存统一走 storageService。
- 云函数统一走 cloudService。
- 报表统一走 reportService。
- 打卡统一走 checkinService。
- 同步统一走 syncService。
