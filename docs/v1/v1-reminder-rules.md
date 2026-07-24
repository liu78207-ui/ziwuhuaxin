# V1 修习提醒规则

本文档约束《子午花信》V1 轻量版修习提醒功能。提醒是非核心能力，不得阻断打卡、取消打卡、习惯管理、同步恢复或报表展示。

## 功能边界

- 用户可开启或关闭修习提醒。
- 用户可设置每日一个提醒时间，默认 `21:00`。
- V1 仅支持 `Asia/Shanghai`。
- V1 只做“当天应修尚未全部完成提醒”，不做单习惯提醒、多时间提醒、节气提醒、AI 个性化提醒或连续未打卡召回。
- 提醒文案保持温和，不制造连续打卡压力。

## 前端边界

- 页面只调用 `reminderService`，不得直接读写 storage 或直接调用云函数。
- `wx.requestSubscribeMessage` 只能在用户主动点击开启或重新授权时触发，不得在页面加载时自动弹出。
- 归藏页只显示提醒摘要，设置详情进入 `pages/reminder-settings/reminder-settings`。
- V1 暂不在首页展示提醒入口，用户从归藏页进入提醒设置。
- 设置保存后由 `reminderService` 触发 `reminder:updated`，页面收到事件后重新读取 ViewModel。

## 数据规则

提醒设置存储在 `user_settings.reminder`：

```js
{
  enabled,
  reminderTime,
  timezone,
  remindIfNoCheckin,
  subscribeStatus,
  subscribeGrantCount,
  lastSentDate,
  updatedAt
}
```

发送日志写入 `reminder_send_logs`：

```js
{
  _openid,
  date,
  scheduledTime,
  templateId,
  status,
  reason,
  scene,
  dueCount,
  checkedCount,
  createdAt
}
```

`_openid` 只能由云函数 `cloud.getWXContext()` 或云端已有文档提供，前端传入的 openid 不可信。

## 发送规则

`scanReminderUsers` 定时扫描命中提醒时间窗口的用户。发送前必须同时满足：

- `reminder.enabled === true`
- `reminder.remindIfNoCheckin === true`
- `subscribeGrantCount > 0`，除非已明确启用长期订阅模式
- `lastSentDate !== todayKey`
- 当天不存在同一 `_openid + date + templateId + status='success'` 的提醒日志
- 今日存在至少一个应修习惯
- 今日应修习惯尚未全部完成

扫描函数以 `userHabitId` 为生命周期边界，结合 `user_habits`、`habit_policy_versions` 和 `daily_checkin_states` 计算：

```text
dueCount = 今日应修习惯数
checkedCount = 今日应修且最终状态为 checked 的习惯数

dueCount = 0                  -> no_due_habits，不发送
checkedCount = 0              -> none，发送完全未打卡提醒
0 < checkedCount < dueCount  -> partial，发送部分完成提醒
checkedCount = dueCount       -> complete，不发送
```

固定文案：

- `none`：`今天还没有留下修习记录，记得给身体一点时间。`
- `partial`：`今天的修习已完成一部分，按自己的节奏继续就好。`

发送成功后：

- 写入 `reminder_send_logs.status = success`
- 更新 `lastSentDate`
- 一次性订阅模式下扣减 `subscribeGrantCount`

跳过或失败也应写日志，方便排查。

## 口径说明

- 是否完成某项当日修习只看该 `userHabitId + date` 的最终状态是否为 `checked`。
- 今日应修口径遵循用户习惯生命周期和生效中的策略版本，支持每日、每周固定星期和间隔天数。
- `canceled`、`unchecked` 不计为完成；非应修日、创建前和删除后的习惯不计入 `dueCount`。
- 不读取 `checkin_operations` 作为完成依据。
- 不改变 `checkinService`、`reportService`、`syncService` 的状态机。
- 不改变报表分母、分子、streak 或缓存失效规则。

## 上线前配置

- 将前端 `miniprogram/constants/reminder.js` 中的 `REMINDER_TEMPLATE_ID` 替换为微信后台审核通过的模板 ID。
- 将云函数环境变量 `CHECKIN_REMINDER_TEMPLATE_ID` 设置为同一模板 ID，或在手动触发扫描时传入 `templateId`。
- 确认模板字段与 `scanReminderUsers` 的 `thing1/time2/thing3` 映射一致；如模板字段不同，只改发送数据映射，不改业务规则。
