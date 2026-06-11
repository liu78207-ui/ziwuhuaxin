# Acceptance Report

审计日期：2026-06-10
复验日期：2026-06-10

## 总评分

B（基本可用）

理由：本轮已修复上一轮阻断项：页面层 direct storage / direct cloud / 业务 `new Date()` 静态红线清零；`app.js` 的本地缓存读写改由 storageService 承接；旧 `undoCheckin` 不再物理删除唯一打卡流水，并补写 operation/state；sync retry 状态机已补齐 `retrying`。全量测试和云函数清单均通过。

剩余问题集中在旧兼容云函数仍保留旧集合口径，以及 app.js 仍保留兼容 API 外壳。它们需要继续治理，但不再阻断进入下一阶段。

## 已执行验证

- `npm test -- --runInBand`
  - 结果：PASS
  - 53 个 test suites 通过。
  - 591 个 tests 通过。
- `npm run verify:cloudfunctions`
  - 结果：PASS
  - 必需函数：`login`、`getUserProfile`、`saveUserProfile`、`migrateV1Data`、`recoverData`、`syncCheckin`、`syncHabit`。
  - 兼容函数：`syncLocalData`、`doCheckin`、`undoCheckin`、`saveStrategy`、`removeStrategy`、`saveStrategyVersion`、`getHabits`、`getTodayTasks`、`getStatsReport`、`getCheckinLogsByRange`、`getUserStrategies`。
- `node --check`
  - 结果：PASS
  - `app.js`、四主页面、`timeService.js`、`syncService.js`、`undoCheckin/index.js` 均无语法错误。
- 静态红线搜索
  - 结果：PASS
  - `miniprogram/pages` 和 `miniprogram/app.js` 未发现直接 `wx.getStorageSync` / `wx.setStorageSync` / `wx.removeStorageSync`。
  - `miniprogram/pages` 未发现直接 `wx.cloud.callFunction`。
  - `miniprogram/pages` 和 `miniprogram/app.js` 未发现 `new Date()`。

## 已通过

- 首页主链路：`home.js -> homeService/checkinService/timeService`，今日任务、打卡、空状态测试通过。
- 修习添加/编辑/删除主链路：`habits.js -> habitService`，删除后重加、编辑策略、策略修改当天测试通过。
- 打卡/取消主链路：checkinOperation、dailyCheckinState、syncCheckin 幂等同步测试通过。
- 旧取消兼容路径：`undoCheckin` 不再物理删除 `checkin_logs`，改为取消标记并补写 `checkin_operations` / `daily_checkin_states`。
- 报表 service 口径：周/月/年、删除当天、策略修改当天、同 habitId 多 userHabitId 场景测试通过。
- 页面架构红线：页面层 direct storage、direct cloud、direct business date、legacy 报表计算均已清理。
- 同步状态机：pending/syncing/synced/retrying/failed 口径已落到 `syncService`，并有 retrying 测试。
- 清缓存恢复：recoverData 和 syncService fallback 测试通过。
- 用户登录安全边界：login 云函数不返回 openid，profile 登录测试通过。

## 风险问题

### P0

未发现 P0 级崩溃或数据必丢问题。

### P1

未发现剩余 P1 阻断项。

### P2

1. `cloudfunctions/getStatsReport/index.js`，`exports.main`
   - 文件：`cloudfunctions/getStatsReport/index.js`
   - 风险原因：兼容函数仍从 `user_strategies/user_strategy_versions/checkin_logs` 聚合报表，和新 reportService 口径并存。
   - 影响范围：如果后台或旧版本仍调用该函数，可能和新报表口径产生解释差异。
   - 修复建议：标记 deprecated；下一阶段改为读取新集合，或禁止新调用方使用。

2. `cloudfunctions/doCheckin/index.js`，`exports.main`
   - 文件：`cloudfunctions/doCheckin/index.js`
   - 风险原因：兼容函数仍从旧策略集合判断应修日并写 `checkin_logs`。
   - 影响范围：旧打卡入口可能绕过 operation/daily state 新模型。
   - 修复建议：下一阶段改为代理到 `syncCheckin` 模型，或只允许旧版本兼容调用。

3. `miniprogram/app.js`，legacy API 外壳
   - 文件：`miniprogram/app.js`
   - 函数：`saveMyHabits`、`saveCheckinLogs`、`addCheckinLog`、`removeCheckinLog`、`syncToCloud` 等。
   - 风险原因：直接 storage 和 `new Date()` 已清理，但旧 API 仍存在以兼容测试和历史调用方。
   - 影响范围：长期维护成本、误用旧 API 的可能性。
   - 修复建议：下一阶段增加 deprecated 静态检查，逐步迁出到 service/migration 层。

### P3

1. `reports/junit.xml`
   - 风险原因：测试报告文件在工作区 diff 中变化较大。
   - 影响范围：可能造成无意义提交噪音。
   - 修复建议：确认是否纳入版本控制；若不应纳入，调整忽略策略。

## 建议修复项

1. 为 `doCheckin/getStatsReport` 补 deprecated 文档和调用方静态检查。
2. 下一阶段将旧兼容云函数代理到新集合模型，或明确只保留旧版本兼容窗口。
3. 继续拆薄 `app.js` legacy API 外壳，把旧调用方迁到 service。
4. 补真机/微信开发者工具手工验收：离线打卡、网络恢复、清缓存恢复、多端恢复。
5. 清理测试报告类噪音文件。

## 是否涉及 migration

是。`migrateV1Data` 和 `recoverData` 路径测试通过；app.js 兼容 API 已改为通过 storageService 读写。

## 是否涉及 cache invalidation

是。添加、编辑、删除、打卡、取消均影响本地缓存与报表。当前未发现新增缓存污染问题。

## 是否涉及状态机变化

是。`syncService` 新增并测试了 `retrying` 状态；`undoCheckin` 兼容路径补写 canceled daily state。

## 是否涉及数据模型变化

是。旧取消兼容函数现在会补写 `checkin_operations` 和 `daily_checkin_states`，避免只更新旧 `checkin_logs`。

## 是否涉及报表口径变化

否。新报表口径仍由 reportService/reportAggregator 提供；本轮只清理页面日期入口和兼容取消路径。

## 是否允许进入下一阶段

✅ 允许进入下一阶段

理由：上一轮 P1 阻断项已修复，静态红线和全量测试均通过。剩余风险为旧兼容函数和 legacy API 外壳的 P2/P3 治理项，可作为下一阶段明确任务继续推进。
