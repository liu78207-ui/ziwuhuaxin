# Test Matrix

审计日期：2026-06-10
复验日期：2026-06-10

状态标记：

- PASS：已有自动化或静态检查通过。
- PARTIAL：部分覆盖，仍需手工或补测试。
- FAIL：发现明确违反治理或风险。
- N/A：当前阶段未要求或未接入。

## A. 页面验收

| 页面 | 检查项 | 验收方式 | 当前结果 | 备注 |
| --- | --- | --- | --- | --- |
| 案台 | 页面能正常打开 | `__tests__/unit/pages/home.test.js`, `home-real.test.js` | PASS | `home.js` 可加载 ViewModel，空任务可展示。 |
| 案台 | 数据正常显示 | `homeService.test.js`, `home.test.js` | PASS | 今日任务、进度、时辰信息均有测试。 |
| 案台 | 空状态 | `home.test.js` | PASS | 空任务列表测试通过。 |
| 案台 | 异常状态 | `home.test.js` | PARTIAL | loadViewModel 失败只 console.error，缺少用户可见异常态验证。 |
| 修习 | 页面能正常打开 | `habits.test.js`, `share-and-habits-entry.test.js` | PASS | onLoad/onShow 可加载。 |
| 修习 | 数据正常显示 | `habits.test.js`, `habits-my-tab.test.js` | PASS | 分类与我的习惯过滤有覆盖。 |
| 修习 | 空状态 | 静态 + 页面测试 | PARTIAL | 我的 tab 空状态未见完整 UI 断言。 |
| 修习 | 异常状态 | 静态 | PARTIAL | service 失败时只 toast/console，缺少系统化异常态测试。 |
| 观心 | 页面能正常打开 | `stats.test.js`, `stats-real.test.js`, `node --check` | PASS | 语法检查通过，分享与基础结构测试通过。 |
| 观心 | 数据正常显示 | `stats-real.test.js`, `reportService.test.js` | PASS | 周/月/年映射和 deleted 样式有覆盖。 |
| 观心 | 空状态 | 静态 + reportService | PARTIAL | reportService 可返回空报表，但 WXML 空态手工验证不足。 |
| 观心 | 异常状态 | 静态 | PARTIAL | reportService unavailable 时仅 warn/空数据；缺少用户可见异常态。 |
| 归藏 | 页面能正常打开 | `profile.test.js`, `profile-login.test.js` | PASS | profile view model 与登录流测试通过。 |
| 归藏 | 数据正常显示 | `userService.test.js`, `profile.test.js` | PASS | 默认头像/昵称与登录态有覆盖。 |
| 归藏 | 空状态 | `profile.test.js` | PASS | 未登录默认资料可展示。 |
| 归藏 | 异常状态 | `profile-login.test.js` | PARTIAL | 登录 timeout 日志覆盖；头像上传/保存失败有测试，但缺少云端真实失败手工验证。 |

## B. 用户链路验收

| 链路 | 验收方式 | 当前结果 | 风险 |
| --- | --- | --- | --- |
| 新用户首次进入 | `__tests__/e2e/user-flow.test.js`, `app.test.js`, `home.test.js` | PASS | e2e 是 mock 层，非微信开发者工具真实验收。 |
| 老用户进入 | `app.test.js`, `syncService.test.js` | PASS | app.js legacy 仍是启动事实源之一。 |
| 清缓存后进入 | `recoverData.test.js`, `syncService.test.js` | PASS | recoverData 覆盖 V1 新集合；旧兼容 fallback 也覆盖。 |
| 换设备恢复 | `recoverData.test.js` | PARTIAL | 缺少真实 CloudBase 环境和多端冲突手工验收。 |

## C. 习惯管理验收

| 功能 | 验收方式 | 当前结果 | 风险 |
| --- | --- | --- | --- |
| 添加习惯 | `habitService.e2e.test.js`, `habits-edit-strategy.test.js`, `habits.test.js` | PASS | 添加走 habitService，生成 userHabitId。 |
| 一键开始 | `habits-plan-start.test.js`, `habits.test.js` | PASS | 需补 UI 手工验收一键默认频次文案。 |
| 编辑策略 | `habits-edit-strategy.test.js`, `strategy-change-day.test.js` | PASS | 策略修改当天低压力口径有测试。 |
| 删除习惯 | `habits-real-actions.test.js`, `deletion-policy.test.js` | PASS | 前端走 softDeleteHabit；旧云函数 removeStrategy 为兼容路径。 |
| 重复添加同一习惯 | `habits-edit-strategy.test.js`, `habitService.e2e.test.js` | PASS | 删除后再添加走新 userHabitId。 |

## D. 打卡验收

| 功能 | 验收方式 | 当前结果 | 风险 |
| --- | --- | --- | --- |
| 打卡 | `checkinService` 相关测试、`home.test.js`, `syncCheckin` 集成 | PASS | 新链路走 checkinOperation/dailyCheckinState。 |
| 取消打卡 | `checkinService.strategy-change.test.js`, `syncCheckin` 集成, `undoCheckin-real.test.js` | PASS | 新链路通过；旧兼容 `undoCheckin` 已改为取消标记并补写 operation/state。 |
| 重复点击 | `home.js` 防抖静态 + `app.test.js` legacy 重复 | PARTIAL | 新 checkinService 快速重复点击缺少专门并发测试。 |
| 快速连续点击 | 静态 | PARTIAL | home.js 1s 防抖存在，但无异步 race 测试。 |
| 离线打卡 | `syncService.test.js`, `app.test.js` | PASS | pending 队列覆盖，真实网络切换需手工。 |
| 同步后状态 | `syncService.test.js`, `strategy-change-sync.test.js` | PASS | synced 回写队列状态覆盖。 |

## E. 报表验收

| 功能 | 验收方式 | 当前结果 | 风险 |
| --- | --- | --- | --- |
| 周报 | `reportService.test.js`, `stats-real.test.js` | PASS | legacy 页面报表计算已删除，周期日期已改走 timeService。 |
| 月报 | `reportService.test.js`, `stats-real.test.js` | PASS | 月历映射由页面完成，需手工 UI 验收。 |
| 年报 | `reportService.test.js`, `stats-real.test.js` | PASS | 年热力映射由页面完成，需手工 UI 验收。 |
| 完成率 | `reportAggregator.test.js`, `reportService.test.js` | PASS | 页面月报映射仍计算 rate，但基于 service done/due。 |
| 连续天数 | `reportAggregator.test.js` | PASS | streak 口径来自 reportAggregator。 |
| 删除当天规则 | `reportService.test.js`, `deletion-policy.test.js` | PASS | 新服务覆盖。 |
| 策略修改当天规则 | `strategy-change-day.test.js`, `strategy-change-sync.test.js` | PASS | 覆盖已打卡、未打卡、取消等场景。 |

## F. 同步验收

| 功能 | 验收方式 | 当前结果 | 风险 |
| --- | --- | --- | --- |
| pending | `syncService.test.js`, 静态 | PASS | 队列可入队、去重、消费。 |
| retry | `syncService.test.js`, 静态 | PASS | 指数退避存在；失败可重试项进入 `retrying`，超过上限进入 `failed`。 |
| recoverData | `recoverData.test.js`, `syncService.test.js` | PASS | 新函数和 legacy fallback 均覆盖。 |
| 云端同步 | `syncCheckin`, `syncHabit` 集成测试 | PASS | 真实 CloudBase 索引/权限未在本地验证。 |
| 本地缓存恢复 | `syncService.test.js` | PASS | 恢复写入 MyHabits/policyVersions/dailyStates。 |

## G. 数据模型验收

| 模型 | 检查项 | 当前结果 | 风险 |
| --- | --- | --- | --- |
| habitId | 只代表内置习惯 ID | PARTIAL | 新 services 基本符合；旧云函数仍按 habitId 聚合。 |
| userHabitId | 生命周期边界 | PASS | habitService/reportService/checkinService 均使用 userHabitId。 |
| policyVersionId | 归属 userHabitId | PASS | policyVersions 按 userHabitId 获取和同步。 |
| operationId | 打卡操作流水 | PASS | checkinService/syncCheckin 传递 operationId。 |
| dailyCheckinState | 每日最终状态 | PASS | 新链路读写 daily_checkin_states；旧函数未接入。 |

## H. 架构验收

| 红线 | 当前结果 | 证据 |
| --- | --- | --- |
| 页面直接读写 storage | PASS | `stats.js` legacy storage 已删除；页面层未发现业务 storage 直接读写。 |
| 页面直接调用云函数 | PASS | `miniprogram/pages` 未发现 `wx.cloud.callFunction`。 |
| 页面直接计算报表 | PASS | `stats.js` legacy 报表计算已删除，页面只做 reportService 映射。 |
| 页面直接操作同步状态 | PASS | 页面层未发现直接 pending 队列操作。 |
| 页面直接生成业务日期 | PASS | `miniprogram/pages` 未发现 `new Date()`；周期和计划开始日期已改走 timeService 或日期字符串解析。 |

## 建议手工验收清单

1. 微信开发者工具打开四主页面，分别验证空数据、已有习惯、云恢复后数据。
2. 真机/模拟器切断网络后打卡、取消，再恢复网络，确认 pending 消费和首页/观心一致。
3. 清空本地缓存，重启小程序，确认 recoverData 恢复 userHabits、policyVersions、dailyStates。
4. 删除当天已打卡/未打卡各一次，进入周报/月报确认分母和视觉状态。
5. 同一 habitId 删除后重新添加，确认首页只显示当前应修实例，观心历史不混算。
6. 策略修改当天已打卡、未打卡、打卡后取消三类场景，确认首页和观心一致。
7. 归藏页登录、改昵称、换头像，确认失败可回滚且不泄露 openid。
