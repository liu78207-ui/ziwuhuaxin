# Static Audit

审计日期：2026-06-11
审计基线：`93d62a9 chore: complete V1 governance validation`

## 执行命令

```bash
rg -n "wx\\.getStorageSync|wx\\.setStorageSync|wx\\.removeStorageSync|wx\\.cloud\\.callFunction|new Date\\(" miniprogram/pages miniprogram/app.js
rg -n "legacyLoadWeekData|legacyLoadMonthData|legacyLoadYearData|calculateStatsWithStrategy|calculateDueCount|mergeWithDeletedHabits" miniprogram/pages/stats/stats.js
rg -n "pendingOperations|setPendingOperations|updatePendingItem|dailyCheckinState|dailyCheckinStates" miniprogram/pages
rg -n "#e64340" miniprogram
node --check miniprogram/app.js miniprogram/pages/home/home.js miniprogram/pages/habits/habits.js miniprogram/pages/stats/stats.js miniprogram/pages/profile/profile.js miniprogram/services/timeService.js miniprogram/services/checkinService.js miniprogram/services/habitService.js miniprogram/services/reportService.js miniprogram/services/syncService.js miniprogram/services/userService.js miniprogram/services/shareService.js cloudfunctions/login/index.js cloudfunctions/recoverData/index.js cloudfunctions/syncCheckin/index.js cloudfunctions/syncHabit/index.js cloudfunctions/migrateV1Data/index.js
```

## 结果摘要

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 页面层 storage 禁止事项 | PASS | `miniprogram/pages` 与 `app.js` 无 `wx.getStorageSync/setStorageSync/removeStorageSync` 命中。 |
| 页面层云函数直调 | PASS | `miniprogram/pages` 无 `wx.cloud.callFunction` 命中。 |
| 页面层业务日期 | PASS | `miniprogram/pages` 与 `app.js` 无 `new Date()` 命中。 |
| stats legacy 报表函数 | PASS | legacy 报表函数名无命中。 |
| 页面直接操作同步状态 | PASS | 页面层无 pending 队列、dailyCheckinState 直连命中。 |
| 分享入口 | PASS | 四主页面不再直接引用 `utils/share.js`，由 `shareService` 承接。 |
| 危险色 | PASS | `#e64340` 无命中；删除确认使用 `#F0655B`，全局有 `--color-danger` alias。 |
| 语法检查 | PASS | app、四主页面、核心 services、核心云函数 `node --check` 通过。 |

## 仍需关注

1. `cloudfunctions/doCheckin/index.js`
   - 函数：`exports.main`
   - 风险原因：仍是兼容旧集合入口，和新 `syncCheckin` 模型并存。
   - 影响范围：旧调用方继续使用时，可能绕过前端新链路的 operation/daily state 治理。
   - 修复建议：保留兼容窗口时标记 deprecated；新调用方禁止接入；后续代理到 `syncCheckin` 或下线。

2. `cloudfunctions/getStatsReport/index.js`
   - 函数：`exports.main`
   - 风险原因：仍是兼容旧集合报表入口，和前端 `reportService/reportAggregator` 并存。
   - 影响范围：旧后台/旧版本调用可能出现报表解释差异。
   - 修复建议：标记 deprecated；若必须保留，补充与 V2 数据模型一致的适配测试。

3. `miniprogram/app.js`
   - 函数：`saveMyHabits`、`saveCheckinLogs`、`addCheckinLog`、`removeCheckinLog`、`syncToCloud`
   - 风险原因：legacy API 外壳仍保留。
   - 影响范围：后续开发误用旧 API 会增加维护成本。
   - 修复建议：继续保留 legacy register；新增静态检查或注释，逐步迁出到 service 层。
