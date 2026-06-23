# 旧数据迁移方案

## 1. 迁移目标

将当前旧数据结构迁移到新版 PRD 要求的数据结构。

旧结构包括：

- 本地 `MyHabits`
- 本地 `CheckinLogs`
- 云端 `user_strategies`
- 云端 `user_strategy_versions`
- 云端 `checkin_logs`

目标结构包括：

- `user_habits`
- `habit_policy_versions`
- `checkin_operations`
- `daily_checkin_states`

迁移不是一次性删除旧表，而是采用“兼容读取、生成新表、双写验证、切换读取”的方式，降低用户数据丢失和报表断链风险。

## 2. 迁移原则

- `habitId` 只表示内置习惯 ID。
- `userHabitId` 表示用户习惯实例 ID。
- 同一个 `habitId` 被用户删除后重新添加，必须生成新的 `userHabitId`。
- 已删除习惯必须保留历史策略、历史打卡和历史报表能力。
- 旧打卡记录迁移后，首页和报表优先读取 `daily_checkin_states`。
- `checkin_operations` 用于审计、同步和后续冲突处理，V1 可由旧日志补生成简化流水。
- 重复旧打卡日志不得放大报表计数。
- 迁移过程必须幂等，可重复执行。
- 第一阶段不删除旧表和旧缓存，只把旧结构作为兼容读来源。

## 3. 数据来源

### 3.1 本地缓存

当前本地主要缓存：

- `MyHabits`：用户已添加习惯和策略混合结构。
- `CheckinLogs`：本地打卡日志。
- `AllHabitsInfo`：删除习惯后的历史展示兜底信息。
- `user_openid`：本地 openid 缓存。
- `userInfo`：头像昵称缓存。
- 旧键：`userStrategies`、`checkin_records`。

### 3.2 云端集合

当前云端主要集合：

- `user_strategies`：用户习惯和当前策略混合结构。
- `user_strategy_versions`：旧策略版本。
- `checkin_logs`：旧打卡日志。
- `habits`：习惯基础信息或测试数据。
- `users`：用户资料。

## 4. 字段映射

### 4.1 `MyHabits` / `user_strategies` -> `user_habits`

旧字段示例：

```js
{
  habitId,
  habit_id,
  name,
  habit_title,
  category,
  targetMinutes,
  duration,
  createdAt,
  plan_start_date,
  isDeleted,
  deletedAt,
  deleted_at
}
```

目标字段：

```js
{
  userHabitId,
  openid,
  habitId,
  status,
  isDeleted,
  createdAt,
  updatedAt,
  deletedAt,
  latestPolicyVersionId,
  syncStatus
}
```

迁移规则：

- `habitId`：优先取旧 `strategy.habit_id` / `habit_id` / `habitId`，但不得原样保留旧测试或 legacy ID；必须归一化为内置习惯 ID 字符串 `'1'` 到 `'25'`。已知旧 ID 如 `h001` / `h_001` -> `'1'`，`h002` / `h_002` -> `'3'`，`h003` / `h_003` -> `'2'`，也可按旧习惯名称兜底映射。
- `userHabitId`：生成稳定迁移 ID，建议格式为 `uh_${openid}_${habitId}_${createdAtHash}`。
- `createdAt`：优先 `createdAt`，其次 `plan_start_date`，最后使用迁移时间。
- `deletedAt`：优先 `deletedAt`，其次 `deleted_at`。
- `status`：未删除为 `active`，已删除为 `deleted`。
- `isDeleted`：根据 `isDeleted`、`deletedAt`、`deleted_at` 归一化。
- `latestPolicyVersionId`：策略版本迁移完成后回填。
- `syncStatus`：云端迁移数据为 `synced`，本地未确认数据为 `pending`。

### 4.2 `user_strategies` / `MyHabits` -> `habit_policy_versions`

目标字段：

```js
{
  policyVersionId,
  openid,
  userHabitId,
  habitId,
  duration,
  frequencyType,
  frequencyConfig,
  startDate,
  effectiveStartDate,
  effectiveEndDate,
  createdAt,
  updatedAt,
  syncStatus
}
```

迁移规则：

- `duration`：取旧 `duration`，其次 `targetMinutes`，默认使用内置习惯默认时长。
- `frequencyType`：由旧 `freq_type` 映射。
- `frequencyConfig`：由旧 `freq_rules` 和 `freq_category` 归一化。
- `effectiveStartDate`：优先 `plan_start_date`，其次 `createdAt`。
- `effectiveEndDate`：若存在旧版本 `end_date`，沿用；若习惯已删除，最后一个有效版本结束于删除日期。
- 若存在 `user_strategy_versions`，优先按版本表生成多个策略版本；版本表中的旧 `habit_id` 必须使用与 `user_habits` 相同的归一化规则匹配和写入。
- 若不存在版本表，只生成一个当前策略版本。
- 同一 `userHabitId` 下任意日期最多命中一个策略版本。
- 旧 `checkin_logs` 迁移为 `checkin_operations` / `daily_checkin_states` 时，也必须使用相同的 `habitId` 归一化规则，避免恢复后首页图标、观心名称和报表生命周期错乱。
- 若目标集合已存在由旧迁移或测试数据写入的非法 `habitId`，迁移函数允许在当前 `_openid` 范围内受控修复 `user_habits`、`habit_policy_versions`、`checkin_operations`、`daily_checkin_states` 的 `habitId` 字段；该修复不得删除记录、不得清空集合、不得跨用户修改。

频次映射建议：

```js
// 每天
{ frequencyType: 'daily', frequencyConfig: { interval: 1 } }

// 每周固定星期
{ frequencyType: 'weekly', frequencyConfig: { weekdays: [1, 3, 5] } }

// 间隔天数
{ frequencyType: 'interval', frequencyConfig: { intervalDays: 2 } }
```

### 4.3 `CheckinLogs` / `checkin_logs` -> `checkin_operations`

旧字段示例：

```js
{
  logId,
  habitId,
  habit_id,
  date,
  checkin_date,
  timestamp,
  sync_status,
  created_at
}
```

目标字段：

```js
{
  operationId,
  idempotencyKey,
  openid,
  userHabitId,
  habitId,
  policyVersionId,
  date,
  action,
  clientTime,
  serverTime,
  timezone,
  source,
  syncStatus,
  createdAt
}
```

迁移规则：

- 每条有效旧打卡日志生成一条 `action: checkin` 操作。
- 旧 `sync_status === 2` 可迁移为 `action: cancel`。
- `date`：取 `date` 或 `checkin_date` 的自然日部分。
- `userHabitId`：通过 `habitId + date` 命中迁移后的用户习惯生命周期。
- `policyVersionId`：通过 `userHabitId + date` 命中当日有效策略版本。
- `idempotencyKey`：建议格式为 `legacy:${openid}:${userHabitId}:${date}:${action}`。
- 重复旧日志只保留一条有效操作，其余记录到 `sync_logs` 或 `conflict_logs`。

### 4.4 `CheckinLogs` / `checkin_logs` -> `daily_checkin_states`

目标字段：

```js
{
  stateId,
  openid,
  userHabitId,
  habitId,
  policyVersionId,
  date,
  status,
  checkedAt,
  canceledAt,
  lastOperationId,
  isLocked,
  lockReason,
  syncStatus,
  updatedAt
}
```

迁移规则：

- 每个 `openid + userHabitId + date` 只能生成一条最终状态。
- 有有效打卡日志时，`status = checked`。
- 有取消标记且无后续有效打卡时，`status = canceled`。
- 无日志不强制生成状态，报表按策略版本运行时推导应修。
- 删除当天已打卡：`isLocked = true`，`lockReason = deleted_after_checkin`。
- 删除当天未打卡：可生成 `status = not_required`，`lockReason = deleted_without_checkin`，也可由 `reportService` 稳定推导。
- 策略修改当天已打卡：`lockReason = strategy_changed_after_checkin`。
- 策略修改当天未打卡且新策略不应修：`lockReason = strategy_changed_without_checkin`。

## 5. 迁移流程

1. 获取 openid。
2. 读取旧本地缓存和旧云端集合。
3. 归一化 habitId、日期、删除状态、频次配置。
4. 生成 `user_habits`。
5. 根据旧策略和旧版本生成 `habit_policy_versions`。
6. 回填 `user_habits.latestPolicyVersionId`。
7. 根据旧打卡日志生成 `checkin_operations`。
8. 聚合生成 `daily_checkin_states`。
9. 写入 `cacheMeta.migrationVersion` 和 `cacheMeta.lastMigratedAt`。
10. 使用 `reportService` 对比旧报表与新报表核心指标。
11. 验证通过后，页面读取切换到新服务层。
12. 旧表保留一个版本周期，只读不再扩写。

## 6. 幂等设计

建议唯一键：

- `user_habits`：`openid + userHabitId`
- `habit_policy_versions`：`openid + policyVersionId`
- `checkin_operations`：`idempotencyKey`
- `daily_checkin_states`：`openid + userHabitId + date`

重复迁移时：

- 已存在 `userHabitId` 不再重复创建。
- 已存在 `policyVersionId` 不再重复创建。
- 已存在 `idempotencyKey` 不再重复创建操作。
- 已存在 `dailyState` 时按最新迁移结果覆盖同一状态，不新增重复状态。

## 7. 回滚策略

- 迁移第一阶段不删除旧缓存和旧集合。
- 每次迁移生成 `migrationId`。
- 迁移失败时继续使用旧读路径。
- 报表对账失败时不切换到新报表读取。
- 可通过 `cacheMeta.readMode = legacy` 临时回退。
- 新集合只追加或幂等 upsert，不执行破坏性清理。

## 8. 数据对账

迁移后必须对账：

- 用户习惯实例数量。
- 活跃习惯数量。
- 已删除习惯数量。
- 每个习惯的策略版本数量。
- 最近 90 天打卡日期数量。
- 周报完成率。
- 月报完成率。
- 年报累计完成天数。
- 删除当天特殊口径。
- 策略修改当天特殊口径。

允许差异：

- 旧重复日志导致的重复计数应被新版去重。
- 旧取消日志不完整时，以最终状态和服务端确认状态为准。
- 低可信日期记录不默认计入新版报表。

## 9. V1 迁移范围

V1 必须迁移：

- 用户习惯实例。
- 当前策略。
- 历史策略版本。
- 最近 90 天打卡最终状态。
- 删除当天和策略修改当天特殊锁定状态。

V1 可后置：

- 全量历史 `checkin_operations` 精确重建。
- 多端离线乱序操作完整裁决。
- 全年每日应修快照物理补齐。
- 超长期历史报表快照持久化。
