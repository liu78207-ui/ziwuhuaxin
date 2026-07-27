# V1 缓存、同步、恢复与迁移策略

本文档用于统一《子午花信》V1 的缓存、同步、恢复、离线和迁移策略，是 `storageService`、`cloudService`、`syncService`、`migrationService`、`recoverData`、`syncCheckin` 的实现依据。

页面层禁止直接同步、直接操作缓存、直接调用业务云函数、直接操作 pending 队列。

## 1. 同步系统目标

V1 同步系统只解决个人习惯打卡闭环中的数据可靠性问题：

- 用户可在本地立即完成打卡、取消打卡、添加习惯、编辑策略和删除习惯。
- 网络可用时，本地变更可同步到 CloudBase。
- 网络不可用时，本地变更进入 pending 队列，不阻断用户继续使用。
- 同步失败后可以 retry。
- 清缓存或换设备后，可以通过 `recoverData` 恢复用户习惯、策略版本和近期每日最终状态。
- 重复请求不会放大计数。
- V1 遇到复杂多端冲突时，以服务端确认状态为准，并保留冲突日志。

V1 同步系统不负责完整多端离线冲突裁决，不要求冷启动恢复全部历史明细，不要求全量历史快照。

## 2. 数据同步原则

V1 必须遵守以下原则：

- 幂等：同一业务操作重复提交，不得产生重复数据或重复计数。
- 支持 pending：本地操作失败或离线时必须进入 pending 队列。
- 支持 retry：网络恢复、用户重新进入、应用回到前台时可重试 pending。
- 支持 `recoverData`：清缓存或缓存损坏后可从云端恢复核心数据。
- 支持离线：离线打卡和取消打卡先写本地，再等待同步。
- 服务端确认：最终 `synced` 状态只能由云端确认后写回。
- 日志可追踪：同步失败、冲突、迁移和恢复必须可诊断。
- 用户不被阻断：同步失败不得阻断打卡、取消、习惯管理和报表展示。
- 环境隔离：pending 同步、retry、recoverData 必须在当前 runtimeEnv 对应的数据集合内执行。当前采用同一 CloudBase 环境内集合前缀隔离：develop/trial 只读写 `test_` 前缀集合，release 只读写无前缀正式集合。
- 本地环境隔离：develop/trial 的业务缓存、pending、客户端序列号和恢复事务使用 `test:` 前缀；release 继续使用旧版无前缀 key，不执行缓存迁移。

推荐调用关系：

```text
页面事件
  -> service
  -> storageService 本地写入
  -> syncService 标记 pending
  -> cloudService 按 runtimeEnv 调云函数
  -> 云函数幂等写 CloudBase
  -> syncService 回写确认状态
  -> EventBus 通知页面刷新
```

## 3. 本地缓存规则

### 3.1 本地缓存

以下数据可以本地缓存：

- `cacheMeta`
- `userProfile`
- `userHabits`
- `habitPolicyVersions`
- `dailyCheckinStates`
- `checkinOperations`
- `pendingOperations`
- `reportCache`
- `syncLogs`
- `conflictLogs`
- `migrationLogs`
- `debugLogs`

本地缓存用途：

- 支持启动快速展示。
- 支持离线操作。
- 支持云端恢复后的本地重建。
- 支持报表短缓存。

本地缓存不是唯一事实源。可重算缓存可随时删除，失效后由 service 重新生成。

### 3.2 云端存储

以下数据必须云端持久化：

- `users`
- `user_habits`
- `habit_policy_versions`
- `checkin_operations`
- `daily_checkin_states`
- `sync_logs`
- `conflict_logs`
- `user_settings`，如 V1 启用设置

云端数据必须按 `_openid` 隔离。前端传入的 openid 不可信，云函数必须通过 `cloud.getWXContext()` 获取身份。

### 3.3 运行时生成

以下数据运行时生成或按需短缓存：

- 今日习惯视图模型。
- 今日进度。
- 周报、月报、年报 `reportData`。
- 报表趋势和热力状态。
- 分享文案。
- UI 展示状态。

运行时生成结果不得反向作为事实源覆盖核心数据。

## 4. cacheMeta 规则

本地必须维护 `cacheMeta`，由 `storageService` 读写，由 `syncService`、`migrationService` 和 `reportService` 更新版本号。

推荐结构：

```js
{
  cacheVersion: 1,
  dataVersion: 0,
  reportVersion: 0,
  migrationVersion: 0,
  openid: '',
  lastBusinessDate: '',
  lastSyncedAt: null,
  lastRecoveredAt: null,
  lastMigratedAt: null,
  readMode: 'current',
  dateConfidence: 'high'
}
```

字段规则：

| 字段 | 规则 |
|---|---|
| `cacheVersion` | 本地缓存结构版本。缓存结构变化时递增。 |
| `dataVersion` | 习惯、策略、打卡最终状态变化时递增。 |
| `reportVersion` | 报表口径或报表依赖数据变化时递增。 |
| `migrationVersion` | 迁移规则升级或迁移完成后更新。 |
| `openid` | 当前缓存所属用户。切换用户时不得复用旧缓存。 |
| `lastBusinessDate` | 最近业务日期，用于跨天刷新。 |
| `lastSyncedAt` | 最近一次成功同步时间。 |
| `lastRecoveredAt` | 最近一次云端恢复时间。 |
| `lastMigratedAt` | 最近一次迁移时间。 |
| `readMode` | `current` 或 `legacy`，用于迁移回退。 |
| `dateConfidence` | `high` 或 `low`，用于低可信日期提示。 |

版本递增规则：

- 打卡、取消：`dataVersion += 1`，`reportVersion += 1`。
- 添加习惯、编辑策略、删除习惯：`dataVersion += 1`，`reportVersion += 1`。
- 报表口径变更：`reportVersion += 1`。
- 缓存结构变更：`cacheVersion += 1`。
- 迁移规则变更：`migrationVersion += 1`。
- 跨天刷新：更新 `lastBusinessDate`，按需刷新今日视图，不一定增加 `dataVersion`。

## 5. recoverData 规则

用户清缓存、缓存损坏、切换设备或本地 openid 与缓存 openid 不一致时，应进入恢复流程。

恢复流程：

```text
app.onLaunch / app.onShow
  -> userService.login()
  -> cloudService.getOpenId()
  -> syncService.recoverData()
  -> cloudService.callFunction('recoverData')
  -> storageService 写入恢复数据
  -> migrationService 补齐字段
  -> cacheMeta 写入 lastRecoveredAt
  -> reportService 按需重算
  -> EventBus emit sync:recovered
```

恢复成功后必须写回：

- `userHabits`
- `habitPolicyVersions`
- `dailyCheckinStates`
- 必要的 `checkinOperations` 摘要或近期操作
- `userProfile`
- `cacheMeta`

其中 `userHabits` 必须保留 `addedAt` 和 `pinnedAt`，用于清缓存或换设备后的首页添加顺序与置顶恢复。

V1 恢复范围：

- 用户习惯实例。
- 当前策略版本。
- 历史策略版本。
- 全部云端 `dailyCheckinStates`，由稳定游标分页拉取。
- 删除当天和策略修改当天的锁定状态。
- 必要的同步日志和冲突摘要。

历史数据：

- 清缓存、换设备和本地核心缓存缺失时恢复全部云端历史。
- 分页恢复必须幂等，不得重复计数。
- 全部分页完成前只能写入 recovery staging，不得覆盖正式缓存。
- 每页必须保持相同快照令牌和总数；最终游标必须为空且实际数量必须匹配。

恢复失败：

- 不阻断进入小程序。
- 保留本地可用缓存。
- 无缓存时展示空状态和重试入口。
- 记录 `syncLogs`。
- 提示建议：“数据恢复失败，可稍后重试”。

云端无数据：

- 初始化新用户状态。
- 写入空的 `userHabits`、`policyVersions`、`dailyCheckinStates`。
- 设置 `cacheMeta.openid`。

清缓存前未同步数据：

- 用户主动清缓存前必须先同步 pending；仍有 pending、syncing、retrying 或 failed 时阻止清理。
- 恢复不得删除或重置 pending、checkinOperations 和客户端序列号。
- 微信系统层直接删除小程序数据后，本地 pending 无法找回，只能以云端已确认状态恢复。
- 清缓存恢复不得跨集合恢复：开发版和体验版只从 `test_` 前缀集合恢复，正式版只从无前缀正式集合恢复。

## 6. pending 队列规则

pending 队列由 `syncService` 管理，页面层禁止直接读写。

状态机：

```text
pending -> syncing -> synced
pending -> syncing -> failed
failed -> retrying -> syncing -> synced
failed -> retrying -> syncing -> failed
```

状态定义：

| 状态 | 含义 | 写入方 |
|---|---|---|
| `pending` | 已本地保存，等待同步 | service |
| `syncing` | 正在调用云函数 | syncService |
| `synced` | 云端确认成功 | syncService |
| `failed` | 同步失败，等待后续处理 | syncService |
| `retrying` | 正在重试失败项 | syncService |

pending 项推荐字段：

```js
{
  queueId,
  entityType,
  entityId,
  action,
  payload,
  idempotencyKey,
  status,
  retryCount,
  lastError,
  createdAt,
  updatedAt,
  nextRetryAt
}
```

`habit/addHabit` pending payload 必须携带本地业务创建日 `createdAt` 和精确添加时间 `addedAt`，并与策略 `startDate` / `effectiveStartDate` 分开同步。云端 `user_habits.createdAt` 表示习惯实例生命周期开始日，不能用未来/自定义计划开始日替代；`user_habits.addedAt` 仅用于首页未置顶习惯的添加顺序排序；`habit_policy_versions.startDate` / `effectiveStartDate` 才表示策略生效日。恢复数据时，观心页依赖 `user_habits.createdAt` 判断创建日前历史为 `not_required`。

自定义习惯名称变化若用户选择“仅修改名称”，同步为 `habit/updateHabitMeta`，不改变 `userHabitId`；若选择“作为新习惯”，必须先入队 `habit/deleteHabit` 软删除旧实例，再入队 `habit/addHabit` 创建新实例，重试不得复活旧 `userHabitId`。

`habit/updatePinned` pending payload 用于同步首页置顶偏好，必须携带 `userHabitId`、`habitId` 和 `pinnedAt`。`pinnedAt` 有值表示置顶并作为置顶内部排序依据；`pinnedAt = null` 表示取消置顶。该字段属于用户展示偏好，不影响打卡状态、报表口径、策略版本或生命周期判断。

重试规则：

- 网络恢复时重试。
- app 启动时重试。
- app 回到前台时可轻量重试。
- 用户主动点击重试时重试。
- 重试必须复用原始 `idempotencyKey`。
- 超过最大重试次数后保持 `failed`，不删除原始记录。

队列顺序：

- 同一 `userHabitId + date` 的打卡/取消操作应按本地操作序列处理。
- V1 遇到云端确认与本地队列不一致时，以云端 `dailyCheckinState` 为最终状态，并记录 `conflictLogs`。

## 7. syncCheckin 规则

`syncCheckin` 是 V1 打卡和取消打卡的云端幂等入口。

必须包含：

- `operationId`
- `idempotencyKey`
- `userHabitId`
- `habitId`
- `policyVersionId`
- `date`
- `action`
- `clientTime`
- `timezone`
- `dateConfidence`

`idempotencyKey` 规则：

- 同一次本地操作生成唯一 `idempotencyKey`。
- 重试必须使用同一个 `idempotencyKey`。
- 云端以 `idempotencyKey` 做幂等判断。
- 重复请求不得新增重复 operation。
- 重复请求不得放大完成次数。

幂等写入流程：

```text
syncCheckin
  -> cloud.getWXContext() 获取 _openid
  -> 参数校验
  -> 查询 idempotencyKey 是否已存在
  -> 已存在则返回既有 operation 和 dailyCheckinState
  -> 不存在则写入 checkin_operations
  -> 聚合或更新 daily_checkin_states
  -> 返回 serverTime、operation、dailyCheckinState
```

离线打卡：

- 本地先生成 `checkinOperation`。
- 本地乐观更新 `dailyCheckinState`。
- 操作进入 pending。
- 网络恢复后调用 `syncCheckin`。
- 云端确认后将本地状态改为 `synced`。

取消打卡：

- 必须生成 `action: cancel` 操作。
- 必须更新 `dailyCheckinState`。
- 禁止通过物理删除唯一历史记录表达取消。

## 8. 冲突规则

V1 不做完整分布式冲突裁决。V1 的目标是状态可恢复、结果可解释、日志可追踪。

本地与云端冲突：

- 以服务端确认的 `dailyCheckinState` 为最终状态。
- 本地状态必须回写为服务端确认状态。
- 冲突写入 `conflictLogs`。
- 页面展示非阻断提示或同步异常标记。

重复打卡：

- 同一 `idempotencyKey` 的重复请求视为同一次操作。
- 同一 `userHabitId + date` 最终只能有一个 `dailyCheckinState`。
- 重复打卡不得增加多次完成次数。

重复取消：

- 同一 `idempotencyKey` 重复取消视为同一次操作。
- 若云端最终已为 `canceled` 或 `unchecked`，重复取消可视为幂等成功。

乱序提交：

- V1 可按服务端接收顺序、客户端操作序列和 `clientTime` 做简化处理。
- 若无法可靠裁决，以服务端最终状态为准。
- 必须记录 `conflictLogs`，保留 V2 完整裁决空间。

多端冲突：

- V1 以服务端确认状态为准。
- 不要求实现完整多端离线合并。
- 不要求提供用户手动冲突解决中心。

低可信日期：

- `dateConfidence=low` 的记录不得静默污染报表。
- 同步时保留记录和异常状态。
- 报表默认不计入分母和分子。

## 9. migration 规则

迁移由 `migrationService` 管理，页面层禁止自行迁移字段。

旧结构：

- 本地 `MyHabits`
- 本地 `CheckinLogs`
- 本地 `AllHabitsInfo`
- 本地旧键 `userStrategies`
- 本地旧键 `checkin_records`
- 云端 `user_strategies`
- 云端 `user_strategy_versions`
- 云端 `checkin_logs`

目标结构：

- `user_habits`
- `habit_policy_versions`
- `checkin_operations`
- `daily_checkin_states`

迁移原则：

- 幂等，可重复执行。
- 旧数据只读兼容，不继续扩写。
- 迁移不物理删除旧缓存和旧集合。
- 迁移失败保留旧读路径。
- 迁移完成后写入 `cacheMeta.migrationVersion` 和 `lastMigratedAt`。
- 迁移日志写入 `migrationLogs`。

核心映射：

- `MyHabits` / `user_strategies` -> `user_habits`
- `user_strategies` / `user_strategy_versions` -> `habit_policy_versions`
- `CheckinLogs` / `checkin_logs` -> `checkin_operations`
- `CheckinLogs` / `checkin_logs` -> `daily_checkin_states`

V1 迁移范围：

- 用户习惯实例。
- 当前策略。
- 历史策略版本。
- 最近 90 天每日最终状态。
- 删除当天和策略修改当天特殊锁定状态。

`sync:recovered` 是恢复成功写回本地缓存后的页面刷新事件。案台、修习、观心收到事件后必须重新调用各自 service 获取视图模型；页面不得直接读取恢复缓存、不得直接拼接报表或任务列表。

V1 后置范围：

- 全量历史操作流水精确重建。
- 完整多端离线乱序裁决。
- 全年每日应修快照物理补齐。
- 长期报表快照持久化。

## 10. cache invalidation 规则

缓存失效必须由 service 管理，并通过 EventBus 通知页面刷新。

必须失效的场景：

| 场景 | 失效范围 | 版本变化 |
|---|---|---|
| 打卡 | 今日任务、当日状态、当前周/月/年报表 | `dataVersion + 1`, `reportVersion + 1` |
| 取消打卡 | 今日任务、当日状态、当前周/月/年报表 | `dataVersion + 1`, `reportVersion + 1` |
| 添加习惯 | 用户习惯、策略版本、今日任务、报表缓存 | `dataVersion + 1`, `reportVersion + 1` |
| 编辑策略 | 策略版本、今日任务、相关周期报表 | `dataVersion + 1`, `reportVersion + 1` |
| 删除习惯 | 用户习惯、策略版本、今日任务、报表缓存 | `dataVersion + 1`, `reportVersion + 1` |
| 跨天刷新 | 今日任务、今日进度 | 更新 `lastBusinessDate` |
| 清缓存恢复 | 全部业务缓存 | 重建 `cacheMeta` |
| app 升级 migration | 结构相关缓存、报表缓存 | `cacheVersion` / `migrationVersion` 更新 |
| openid 变化 | 当前账号业务缓存 | 重建当前用户缓存 |

`storageService.clearUserDataCache()` 是本地用户数据缓存清理入口，用于清理当前设备上的业务缓存和 Phase 3 迁移备份键。它应覆盖用户习惯、旧打卡日志、习惯兜底信息、用户资料、本地操作日志、策略版本、每日状态、打卡操作、migration meta、pending 队列、客户端序列号以及历史 `*_backup_phase3_*` 键。清理后不得假定本地仍有可用业务数据，必须通过 `recoverData` 恢复云端核心数据，或进入新用户空状态。

缓存清理和恢复只能作用于当前 runtimeEnv。develop/trial 不得读取、清理或覆盖无前缀正式缓存；release 不得读取 `test:` 缓存。正式环境本地已有业务数据而完整云端快照为全空时，应视为可疑恢复并保留本地缓存，不得自动提交空快照。

可重算缓存：

- `reportCache`
- 今日进度缓存
- 视图模型缓存

这些缓存失效后直接删除即可，由 service 重新生成。

## 11. app 升级规则

app 升级或缓存结构变化时必须触发 migration 检查。

启动检查流程：

```text
app.onLaunch
  -> storageService.getCacheMeta()
  -> userService.login()
  -> 校验 cacheMeta.openid
  -> migrationService.checkCacheVersion()
  -> migrationService.migrateIfNeeded()
  -> syncService.recoverOrSync()
  -> EventBus emit migration:completed / migration:failed
```

触发条件：

- `cacheMeta` 不存在。
- `cacheMeta.cacheVersion` 低于当前版本。
- `cacheMeta.migrationVersion` 低于当前迁移版本。
- 检测到旧 key 仍存在且新 key 缺失。
- `cacheMeta.openid` 与当前 openid 不一致。
- 本地缓存读取失败或结构不完整。

迁移失败：

- 不阻断用户进入。
- 保留 legacy 读取能力。
- 写入 `migrationLogs`。
- 设置 `cacheMeta.readMode = legacy` 或进入恢复流程。

## 12. 云端恢复规则

`recoverData` 必须由云函数实现，前端只能通过 `cloudService` 调用。

入参建议：

```js
{
  sinceDate,
  untilDate,
  cursor,
  limit,
  dataVersion,
  cacheVersion
}
```

出参建议：

```js
{
  serverTime,
  userProfile,
  userHabits,
  policyVersions,
  dailyCheckinStates,
  syncLogs,
  conflictLogs,
  cursor,
  hasMore
}
```

V1 必须恢复：

- `users` 中的基础用户资料。
- `user_habits` 中当前和已删除的用户习惯实例。
- `user_habits.addedAt` 首页未置顶习惯的添加顺序时间戳。
- `user_habits.pinnedAt` 首页置顶偏好。
- `habit_policy_versions` 中当前和历史策略版本。
- 最近 90 天 `daily_checkin_states`。
- 删除当天、策略修改当天锁定状态。

V1 按需恢复：

- 近期 `checkin_operations` 摘要。
- `sync_logs` 和 `conflict_logs` 摘要。

云端恢复要求：

- 按 `_openid` 隔离。
- 使用稳定不透明游标分页返回，兼容旧数字 offset 游标。
- 新客户端请求恢复协议 v2；云函数返回协议版本、scope、快照令牌和各集合总数。
- 客户端完成全部分页和快照校验后才提交正式缓存。
- 返回 `serverTime`。
- 不返回其他用户数据。
- 不返回 DeepSeek API Key 或敏感配置。
- 不携带分享、昵称、头像以外的隐私冗余数据。

## 13. syncService 禁止事项

页面层禁止：

- 直接调用业务云函数同步数据。
- 直接 `wx.getStorageSync` 读取业务缓存。
- 直接 `wx.setStorageSync` 写入业务缓存。
- 直接操作 pending 队列。
- 直接把状态改为 `synced`。
- 直接处理冲突。
- 直接写 `syncLogs`。
- 直接写 `conflictLogs`。
- 直接调用 `recoverData` 云函数。
- 直接判断缓存版本和迁移版本。

`syncService` 禁止：

- 不带 `idempotencyKey` 同步打卡。
- 重试时生成新的幂等 key。
- 同步失败时丢弃 pending。
- 未经云端确认把状态标记为 `synced`。
- 清缓存恢复时混用其他 openid 的缓存。
- 将低可信日期静默写入正常报表。
- 在 V1 中引入复杂重型状态管理框架。

## 14. sync 测试重点

必须覆盖以下测试场景：

启动与恢复：

- 首次进入无缓存时初始化空用户。
- 有缓存且 openid 一致时正常读取。
- openid 不一致时不展示旧账号缓存。
- 清缓存后通过 `recoverData` 恢复用户习惯、策略和近期每日状态。
- 云端无数据时进入新用户空状态。
- `recoverData` 分页中断后可继续恢复。

pending 与 retry：

- 离线打卡进入 pending。
- 离线取消进入 pending。
- 网络恢复后 pending 自动重试。
- 重试成功后状态变为 `synced`。
- 重试失败后状态保持 `failed` 或 `retrying`。
- 重试复用原始 `idempotencyKey`。

syncCheckin 幂等：

- 同一 `idempotencyKey` 重复打卡不重复计数。
- 同一 `idempotencyKey` 重复取消不重复计数。
- 同一 `userHabitId + date` 只有一个最终状态。
- 快速重复点击不会产生重复有效完成。
- 云端重复请求返回既有状态。

冲突与乱序：

- 本地状态与云端状态冲突时，以云端确认状态为准。
- 同设备先打卡后取消，乱序到达时不产生重复完成。
- 多端 V1 冲突保留 `conflictLogs`。
- 低可信日期不进入报表分母和分子。

迁移：

- `MyHabits` 可迁移为 `user_habits`。
- `user_strategies` 可迁移为 `user_habits` 和 `habit_policy_versions`。
- `CheckinLogs` / `checkin_logs` 可迁移为 `checkin_operations` 和 `daily_checkin_states`。
- 重复迁移不生成重复数据。
- 迁移失败保留 legacy 读取能力。

缓存失效：

- 打卡后今日任务和报表缓存失效。
- 取消后今日任务和报表缓存失效。
- 添加习惯后用户习惯、策略、今日任务和报表缓存失效。
- 编辑策略后相关报表缓存失效。
- 删除习惯后相关报表缓存失效。
- 跨天后今日任务刷新。
- app 升级后触发 migration 检查。

边界安全：

- 页面层没有新增直接 storage 调用。
- 页面层没有新增直接云函数同步调用。
- 页面层没有新增 pending 队列操作。
- 前端不可信 openid 不参与云端身份判断。
- 云端只返回当前 `_openid` 数据。
