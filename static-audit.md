# Static Audit

审计日期：2026-06-10
复验日期：2026-06-10

执行命令摘要：

```bash
rg -n "wx\\.getStorageSync|wx\\.setStorageSync|wx\\.removeStorageSync" miniprogram/pages miniprogram/app.js
rg -n "wx\\.cloud\\.callFunction" miniprogram/pages
rg -n "new Date\\(" miniprogram/pages miniprogram/app.js
node --check miniprogram/app.js miniprogram/pages/home/home.js miniprogram/pages/habits/habits.js miniprogram/pages/stats/stats.js miniprogram/pages/profile/profile.js miniprogram/services/timeService.js miniprogram/services/syncService.js cloudfunctions/undoCheckin/index.js
```

语法结果：PASS。

## 1. 页面层 storage 禁止事项

结果：PASS

`miniprogram/pages` 未发现 `wx.getStorageSync` / `wx.setStorageSync` / `wx.removeStorageSync`。

`miniprogram/app.js` 也已移除直接 storage 调用，兼容读写改由 `storageService` 承接。

## 2. 页面层云函数调用

结果：PASS

`miniprogram/pages` 未发现 `wx.cloud.callFunction`。云函数调用保持在 `cloudService` 或 service 层。

## 3. 页面层业务日期 new Date

结果：PASS

`miniprogram/pages` 未发现 `new Date()`。

修复点：

- `miniprogram/pages/stats/stats.js`
  - 周/月/年边界、周期切换、日期展示改走 `timeService`。
  - 兼容旧测试的 timestamp 输入通过 `timeService.formatTimestamp()` 转换。
- `miniprogram/pages/habits/habits.js`
  - 计划开始日期选择器改为解析 `YYYY-MM-DD` 字符串，不再构造 Date。
- `miniprogram/app.js`
  - 调试日期和默认日期改走 `timeService`。

## 4. habitId/userHabitId 混用

结果：PARTIAL

通过点：

- `checkinService.checkin/undoCheckin/toggleCheckin` 以 userHabitId 为输入，并写 operation/daily state。
- `habitService.addHabit` 生成新的 userHabitId，删除后重加不复用。
- `reportService` 先按 userHabitId 构建实例报表，再按 habitId 聚合。
- `syncCheckin` 以 userHabitId + date 更新 daily_checkin_states。
- `syncHabit` 以 userHabitId 同步 user_habits 和 habit_policy_versions。
- `undoCheckin` 兼容路径已补写 `checkin_operations` 和 `daily_checkin_states`。

剩余风险：

- `cloudfunctions/getStatsReport/index.js` 仍是旧集合兼容报表。
- `cloudfunctions/doCheckin/index.js` 仍是旧集合兼容打卡。

修复建议：

- 下一阶段将旧兼容函数代理到新模型，或增加 deprecated 调用方检查。

## 5. 页面直接计算报表

结果：PASS

`miniprogram/pages/stats/stats.js` 已删除 legacy 报表计算方法，页面只保留 reportService 返回结果到 WXML 的轻量映射。

## 6. 页面直接操作同步状态

结果：PASS

`miniprogram/pages` 未发现直接 pending 队列操作。

## 7. App legacy 边界

结果：PARTIAL

已修复：

- `app.js` 不再直接调用 `wx.getStorageSync` / `wx.setStorageSync` / `wx.removeStorageSync`。
- `app.js` 不再直接 `new Date()` 生成业务日期。
- legacy 同步桥仍迁入 `syncService -> syncCheckin`，不直接调用旧 `doCheckin/undoCheckin`。

剩余风险：

- `saveMyHabits`、`saveCheckinLogs`、`addCheckinLog`、`removeCheckinLog`、`syncToCloud` 等兼容 API 仍存在。

修复建议：

- 下一阶段增加 deprecated 检查，逐步删除旧 API 或迁到 migrationService/storageService/syncService。

## 8. Cloud Functions 静态风险

结果：PARTIAL

通过点：

- `login` 不返回 openid。
- `recoverData` 按 `_openid` 恢复新集合。
- `syncCheckin` 使用 `idempotencyKey` 幂等写入 `checkin_operations` 并更新 `daily_checkin_states`。
- `syncHabit` 按 `userHabitId` 同步习惯和策略版本。
- `undoCheckin` 不再物理删除 `checkin_logs`，改为取消标记并补写 operation/state。
- `npm run verify:cloudfunctions` 通过。

剩余风险：

- `doCheckin`、`getStatsReport` 仍保留旧集合兼容口径。

修复建议：

- 保留兼容窗口时应明确 deprecated；新调用方不得使用旧函数。
