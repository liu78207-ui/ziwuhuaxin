# 日志与调试体系方案

## 1. 设计目标

子午花信需要支持长期排查数据问题，尤其是用户反馈：

- 昨天明明打卡了，为什么报表没显示。
- 删除后为什么历史还在。
- 策略改了为什么今天还显示。
- 清缓存后为什么数据没恢复。
- 离线打卡为什么同步失败。

日志体系必须服务于这些问题，而不是只打印临时 console。

## 2. 日志类型

V1 至少支持：

- `syncLogs`
- `conflictLogs`
- `migrationLogs`
- `reportDebugLogs`
- `operationLogs`
- `timeLogs`

## 3. debugMode

必须支持 `debugMode`。

推荐来源：

- 本地缓存 `debugMode`。
- 开发环境配置。
- 调试入口开关。

debugMode 开启时：

- 输出关键 service 输入输出。
- 输出报表分母解释。
- 输出策略版本命中结果。
- 输出 daily state 来源。
- 输出同步队列状态。

debugMode 关闭时：

- 不输出大量业务明细。
- 保留必要错误日志。

## 4. syncLogs

用途：

- 记录同步过程。
- 排查 pending、failed、retrying。

推荐字段：

```js
{
  logId,
  openid,
  type,
  entityType,
  entityId,
  status,
  retryCount,
  errorCode,
  errorMessage,
  createdAt,
  updatedAt
}
```

典型场景：

- 打卡同步成功。
- 取消同步成功。
- 云函数调用失败。
- 重试开始。
- 重试失败。
- recoverData 成功。

## 5. conflictLogs

用途：

- 记录 V1 简化冲突。
- 为 V2 多端冲突裁决保留依据。

推荐字段：

```js
{
  conflictId,
  openid,
  userHabitId,
  habitId,
  date,
  localOperationId,
  serverStateId,
  reason,
  resolution,
  createdAt
}
```

V1 冲突策略：

- 以服务端确认状态为准。
- 本地记录冲突日志。
- 页面展示非阻断提示。

## 6. migrationLogs

用途：

- 记录旧数据迁移过程。
- 排查清缓存恢复和旧结构转换。

推荐字段：

```js
{
  migrationId,
  openid,
  fromVersion,
  toVersion,
  step,
  status,
  counts,
  errorCode,
  errorMessage,
  createdAt
}
```

必须记录：

- 迁移开始。
- 迁移了多少 `MyHabits`。
- 迁移了多少 `CheckinLogs`。
- 生成了多少 `user_habits`。
- 生成了多少 `daily_checkin_states`。
- 是否幂等跳过重复数据。
- 迁移失败原因。

## 7. reportDebugLogs

用途：

- 排查报表分母、分子、状态格问题。

推荐字段：

```js
{
  logId,
  openid,
  reportType,
  startDate,
  endDate,
  userHabitId,
  habitId,
  date,
  policyVersionId,
  dueReason,
  stateStatus,
  countedInDenominator,
  countedAsDone,
  lockReason,
  createdAt
}
```

debugMode 下，reportService 应支持按单日解释：

```text
2026-05-22
八段锦 userHabitId=uh_xxx
命中策略 pv_xxx
今日应修：是
最终状态：checked
计入分母：是
计入分子：是
```

## 8. operationLogs

用途：

- 记录用户本地操作。
- 排查“我点了但没生效”。

典型操作：

- 添加习惯。
- 编辑策略。
- 删除习惯。
- 打卡。
- 取消打卡。
- 清缓存恢复。

推荐字段：

```js
{
  operationLogId,
  action,
  userHabitId,
  habitId,
  date,
  payloadSummary,
  result,
  createdAt
}
```

## 9. timeLogs

用途：

- 排查跨天、低可信日期、serverTime 问题。

推荐记录：

- app 启动业务日期。
- serverTime 获取结果。
- dateConfidence。
- 前后台切换后的业务日期。
- 跨天刷新触发时间。

## 10. 日志存储策略

本地：

- 保留最近 100-300 条关键日志。
- 避免无限增长。
- debugMode 可扩大到 1000 条。

云端：

- `sync_logs` 保留同步关键日志。
- `conflict_logs` 保留冲突日志。
- `ai_logs` 仅 DeepSeek 接入后启用。

隐私：

- 日志不得记录昵称、头像、完整用户隐私资料。
- 分享日志不得记录 openid。
- DeepSeek 日志不得记录完整敏感输入。

## 11. 调试工具函数

建议后续提供：

- `debugService.getHabitTimeline(userHabitId)`
- `debugService.explainReportDate(userHabitId, date)`
- `debugService.getPendingOperations()`
- `debugService.getSyncSummary()`
- `debugService.getCacheMeta()`

这些函数只用于开发和 debugMode，不进入普通用户主流程。

## 12. 验收标准

- 同步失败可查到 syncLogs。
- 冲突可查到 conflictLogs。
- 迁移过程可查到 migrationLogs。
- 报表分母可通过 reportDebugLogs 解释。
- debugMode 开关可控。
- 普通模式不产生大量冗余日志。
- 日志不泄露隐私。

