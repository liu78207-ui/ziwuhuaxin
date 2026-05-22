# 状态机设计文档

## 1. 设计目标

子午花信 V1 必须用状态机约束核心数据变化，避免页面层任意改状态，避免打卡、取消、删除、同步失败后出现不可解释的数据。

状态变更只能由 service 或云函数完成。页面层只能触发事件、调用 service、渲染结果。

## 2. 状态机清单

V1 至少包含四类状态机：

- `userHabit` 状态机
- `checkinOperation` 状态机
- `dailyCheckinState` 状态机
- `syncStatus` 状态机

后续可扩展：

- `migrationStatus`
- `reportCacheStatus`
- `aiRequestStatus`

## 3. userHabit 状态机

### 3.1 状态定义

```text
active
deleted
```

### 3.2 状态含义

| 状态 | 含义 |
|---|---|
| `active` | 用户当前启用的习惯实例，可生成今日任务，可被编辑策略，可打卡 |
| `deleted` | 用户已软删除的习惯实例，不再生成新的今日任务，但历史报表保留 |

### 3.3 合法流转

```text
active -> deleted
```

V1 不建议直接支持：

```text
deleted -> active
```

原因：PRD 要求同一个内置习惯删除后重新添加时生成新的 `userHabitId`，不得复用旧生命周期。

### 3.4 触发模块

- `habitService.addHabit`
- `habitService.softDeleteHabit`
- `syncService.syncHabits`
- 云函数 `syncHabit`

### 3.5 禁止事项

- 页面层禁止直接修改 `userHabit.status`。
- 页面层禁止直接设置 `isDeleted`。
- 禁止用旧 `habitId` 判断用户实例生命周期。
- 禁止删除 `userHabit` 物理记录作为普通删除逻辑。

## 4. checkinOperation 状态机

### 4.1 状态定义

```text
pending
synced
failed
```

### 4.2 状态含义

| 状态 | 含义 |
|---|---|
| `pending` | 本地已生成操作，等待同步云端 |
| `synced` | 云端已幂等确认 |
| `failed` | 云端拒绝或多次同步失败，需要重试或进入冲突处理 |

### 4.3 合法流转

```text
pending -> synced
pending -> failed
failed -> pending
failed -> synced
```

`failed -> pending` 只允许由 `syncService.retryPendingOperations` 触发。

### 4.4 操作类型

```text
checkin
cancel
```

打卡和取消都必须生成 operation。取消打卡禁止通过物理删除唯一历史记录表达。

### 4.5 幂等要求

每个 operation 必须包含：

- `operationId`
- `idempotencyKey`
- `openid`
- `userHabitId`
- `habitId`
- `policyVersionId`
- `date`
- `action`
- `clientTime`
- `serverTime`
- `timezone`
- `syncStatus`

`syncCheckin` 必须使用 `idempotencyKey`，重复提交不得放大计数。

## 5. dailyCheckinState 状态机

### 5.1 状态定义

```text
checked
canceled
unchecked
not_required
```

### 5.2 状态含义

| 状态 | 含义 |
|---|---|
| `checked` | 当日最终状态为已完成 |
| `canceled` | 当日曾完成但最终取消 |
| `unchecked` | 当日应修但未完成 |
| `not_required` | 当日不应修，不进入分母 |

### 5.3 合法流转

```text
unchecked -> checked
checked -> canceled
canceled -> checked
not_required -> checked
checked -> not_required
unchecked -> not_required
```

说明：

- `not_required -> checked` 只允许在低可信日期修正、历史兼容迁移或特殊补录场景中发生，V1 页面不提供普通入口。
- `checked -> not_required` 只允许删除当天已打卡后取消、策略修改当天特殊口径等受控逻辑。

### 5.4 锁定状态

`dailyCheckinState` 支持：

```js
{
  isLocked: true,
  lockReason: 'deleted_after_checkin'
}
```

V1 锁定原因：

| lockReason | 含义 |
|---|---|
| `deleted_after_checkin` | 删除当天已打卡，当日计入分母和分子 |
| `deleted_without_checkin` | 删除当天未打卡，当日不计入分母 |
| `strategy_changed_after_checkin` | 策略修改当天已打卡，当日计入分母和分子 |
| `strategy_changed_without_checkin` | 策略修改当天未打卡，当日不计入分母 |
| `date_confidence_low` | 日期低可信，用户确认前不计入报表 |

### 5.5 触发模块

- `checkinService.checkin`
- `checkinService.cancelCheckin`
- `habitService.softDeleteHabit`
- `habitService.updateHabitPolicy`
- `migrationService`
- 云函数 `syncCheckin`

## 6. syncStatus 状态机

### 6.1 状态定义

```text
pending
syncing
synced
failed
retrying
```

### 6.2 状态含义

| 状态 | 含义 |
|---|---|
| `pending` | 等待同步 |
| `syncing` | 正在同步 |
| `synced` | 已同步 |
| `failed` | 同步失败 |
| `retrying` | 正在重试 |

### 6.3 合法流转

```text
pending -> syncing
syncing -> synced
syncing -> failed
failed -> retrying
retrying -> synced
retrying -> failed
failed -> pending
```

### 6.4 禁止事项

- 页面层禁止直接把状态改为 `synced`。
- 页面层禁止直接清空 pending 队列。
- 重试必须保留原始 `idempotencyKey`。

## 7. 低可信日期状态

当 `timeService` 判断本地时间不可信时：

- 打卡 operation 标记 `dateConfidence = low`。
- `dailyCheckinState` 可标记 `isLocked = true`。
- `lockReason = date_confidence_low`。
- V1 用户确认前不计入报表。
- V1 可只展示同步异常，不做复杂修正弹窗。

## 8. 状态机验收标准

- 所有状态枚举集中在 `constants`。
- 所有状态变更由 service 或云函数完成。
- 页面层不直接改状态。
- 非法状态流转会被 service 拒绝并记录日志。
- 打卡和取消都有 operation。
- 首页和报表读取 `dailyCheckinState` 最终状态。
- 删除当天和策略修改当天口径稳定。

