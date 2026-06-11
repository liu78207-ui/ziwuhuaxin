# Legacy Compatibility Register

本文档登记《子午花信》V1 收口阶段仍需保留的 legacy 入口、兼容原因、风险和退出条件。

本登记表不是鼓励继续扩写旧路径。任何新功能、新修复、新测试默认必须走 service 层、V1 数据模型和治理文档定义的主路径。只有为了兼容旧用户数据、旧云端集合、旧测试资产或已发布小程序入口，才允许保留本表中的 legacy 项。

## 1. 治理原则

- legacy 入口只能兼容读取、迁移、兜底或回退，不得承载新的业务主链路。
- 页面层不得直接读写 legacy 缓存、不得直接调用 legacy 云函数、不得直接计算报表。
- 删除 legacy 入口前必须证明：线上数据可恢复、测试覆盖已迁移、云端集合兼容完成、回滚方案明确。
- 如果 legacy 入口仍被保留，必须有 owner service 或治理文档说明它的边界。
- 任何删除旧集合、旧缓存或旧云函数的动作都必须单独立项，不得作为顺手清理。

## 2. 当前登记项

| Legacy 项 | 当前状态 | 保留原因 | 主要风险 | Owner | 退出条件 | 当前决策 |
|---|---|---|---|---|---|---|
| `app.globalData.MyHabits` | `app.js` 仍保留并由旧 helper 读写 | 兼容旧 app API、旧测试和部分迁移路径 | 被新代码误用为事实源，绕过 storageService/habitService | `app.js` / `storageService` / `habitService` | 所有调用方改为 service；测试不再依赖 app helper；清缓存恢复通过新模型稳定 | 保留，禁止新增依赖 |
| `app.globalData.CheckinLogs` | `app.js` 仍保留并由旧 helper 读写 | 兼容旧打卡日志、旧同步迁移和测试 | 取消打卡被误表达为物理删除；与 dailyCheckinState 混算 | `app.js` / `checkinService` / `syncService` | 打卡/取消测试全部走 checkinService；旧日志只作为 migration 输入 | 保留，禁止新增依赖 |
| 本地缓存 `MyHabits` / `CheckinLogs` | 仍由 `storageService` 读写和迁移 | 线上用户旧缓存恢复 | 缓存污染、生命周期映射错误 | `storageService` / `migrationService` | 新缓存 key 和 cacheMeta 覆盖核心恢复；旧 key 只读迁移完成 | 保留，通过 storageService 访问 |
| 本地缓存 `AllHabitsInfo` | 仍用于历史展示兜底 | 删除习惯历史展示兼容 | 与 userHabitId 生命周期断链 | `storageService` / `reportService` | 删除习惯历史完全由 userHabit + policyVersion + dailyState 覆盖 | 保留为兜底 |
| 旧键 `userStrategies` / `checkin_records` | 迁移兼容键 | 老版本缓存兼容 | 迁移重复、字段缺失 | `storageService` / `migrationService` | 迁移日志证明可重复执行且不再需要旧键 | 只允许迁移读取 |
| 云函数 `syncLocalData` | compatibility function | `recoverData` 不可用或旧环境回退 | 恢复口径和新集合不一致 | `syncService` / `cloudService` | `recoverData` 在所有部署环境可用并覆盖分页恢复 | 保留为 fallback |
| 云函数 `doCheckin` / `undoCheckin` | compatibility function | 老入口和云端测试兼容 | 绕过 `syncCheckin` 幂等和 operation/state 口径 | `syncCheckin` / `checkinService` | 前端无直接调用；云端兼容测试稳定；线上入口切换完成 | 保留，禁止页面直调 |
| 云函数 `saveStrategy` / `removeStrategy` / `saveStrategyVersion` | compatibility function | 老策略保存入口兼容 | 按 `habit_id` 处理导致生命周期混用 | `syncHabit` / `habitService` | 策略保存全部走 syncHabit；旧函数只读或废弃验证完成 | 保留，禁止新增主路径 |
| 云函数 `getStatsReport` / `getTodayTasks` / `getCheckinLogsByRange` | compatibility function | 老云端报表/任务入口兼容 | 与前端 reportService/habitService 口径分叉 | `reportService` / `habitService` | 前端不依赖；云端口径测试覆盖或明确废弃 | 保留，禁止页面直调 |
| `utils/share.js` | shareService 内部底层工具 | 复用已验证的微信分享菜单封装 | 若页面重新直接引用会造成入口分散 | `shareService` | 页面保持只调用 `shareService`；后续复制分享也进入 service | 保留为内部工具，禁止页面直调 |
| `utils/reportCalculator.js` | 仍存在并有测试覆盖 | 历史算法资产和报表测试兼容 | 被页面或新功能误当成报表入口 | `reportService` / `reportAggregator` | reportService 完全覆盖相关能力且测试迁移完成 | 保留为内部/测试资产 |

## 3. 禁止新增依赖

以下写法不得在新代码中出现：

```js
getApp().globalData.MyHabits
getApp().globalData.CheckinLogs
wx.getStorageSync('MyHabits')
wx.getStorageSync('CheckinLogs')
wx.cloud.callFunction({ name: 'doCheckin' })
wx.cloud.callFunction({ name: 'undoCheckin' })
wx.cloud.callFunction({ name: 'getStatsReport' })
```

如果测试需要构造旧数据，必须在测试名称或注释中明确说明是 legacy migration / compatibility 场景。

## 4. app.js legacy helper 审计结果

2026-06-11 静态审计结论：

- 四主页面未直接读取 `app.globalData.MyHabits` / `app.globalData.CheckinLogs`。
- `miniprogram/pages/stats/stats.js` 仅读取 `app.globalData.DEBUG_DAY_OFFSET` 调试配置，不属于核心业务缓存依赖。
- `app.globalData.MyHabits` / `app.globalData.CheckinLogs` 当前主要被 `miniprogram/app.js` 内部 legacy helper 和 legacy 测试使用。
- 因测试和迁移兼容仍依赖旧 helper，当前不能直接删除 globalData 双表。
- 2026-06-11 已移除 `miniprogram/pages/home/home.js` 对 `getApp().printAllLogs()` 的页面层调试调用；后续页面不得调用 app legacy 日志 helper。

### 4.1 helper 分组

| 分组 | helper | 当前用途 | 退出建议 |
|---|---|---|---|
| 加载/迁移 | `loadGlobalDataFromStorage`、`migrateOldStrategy`、`migrateOldRecords` | 启动时加载旧缓存并兼容 `userStrategies` / `checkin_records` | 迁移到 `storageService` / `migrationService` 测试后再瘦身 |
| MyHabits 写入 | `saveMyHabits`、`addHabit`、`removeHabit`、`restoreHabit`、`saveUserStrategies`、`addUserStrategy`、`removeUserStrategy` | 旧 app API 和旧测试兼容 | 新代码禁止调用；测试迁移到 `habitService` 后逐步删除 |
| MyHabits 查询 | `getAllHabits`、`getDeletedHabits`、`getHabitById` | 旧页面/测试查询接口 | 确认页面均走 `homeService` / `habitService` 后仅保留测试兼容 |
| 删除历史兜底 | `saveDeletedHabitInfo` | 写 `AllHabitsInfo` 兜底历史展示 | 待报表历史完全由 `userHabit + policyVersion + dailyState` 覆盖后退出 |
| CheckinLogs 写入 | `saveCheckinLogs`、`addCheckinLog`、`removeCheckinLog`、`removeLogsByDate`、`removeHabitLogs` | 旧打卡流水兼容 | 新代码禁止调用；迁移到 `checkinService` / `dailyCheckinState` 测试后退出 |
| CheckinLogs 查询 | `getLogsByHabitId`、`getLogsByDate`、`isCheckedOnDate`、`getLogsByDateRange`、`calculateStreak`、`calculateTotalDays` | 旧报表/测试查询接口 | 报表测试全部走 `reportService` 后退出 |
| 调试日志 | `printAllLogs` | 旧调试输出 | 禁止页面调用；如需调试应进入 debugMode/service 日志 |
| 旧同步桥 | `syncFromCloud`、`syncToCloud`、`buildLegacyCheckinSyncPayload`、`enqueueLegacyCheckinLogs`、`reconcileLegacyCheckinLogsAfterSync` | 将旧 `CheckinLogs` pending 项迁入 `syncService` / `syncCheckin` | 待旧 pending 迁移测试和 recoverData 覆盖后退出 |

### 4.2 退出优先级

1. **先迁移测试依赖**：把直接设置 `app.globalData.MyHabits/CheckinLogs` 的普通业务测试改为 service 级 fixture；保留明确命名的 legacy compatibility 测试。
2. **先退 CheckinLogs 写路径**：打卡/取消风险最高，优先让旧 `addCheckinLog/removeCheckinLog` 不再被普通测试依赖。
3. **再退 MyHabits 写路径**：添加、编辑、删除习惯全部验证走 `habitService`。
4. **最后处理加载/迁移入口**：`loadGlobalDataFromStorage` 和旧键迁移只能在 recoverData/migration 测试足够后瘦身。

## 5. 退出流程

1. 静态搜索确认没有页面层或新 service 直接依赖 legacy 项。
2. 补齐对应 service 测试、迁移测试、恢复测试和云函数兼容测试。
3. 确认 `recoverData` 可恢复用户习惯、策略版本和近期每日状态。
4. 确认旧缓存迁移幂等，重复执行不会放大打卡计数。
5. 在 `docs/v2/v2-plan.md` 中记录退出结论和回滚方案。
6. 分阶段移除代码，不一次性删除多个 legacy 入口。

## 6. 当前结论

V1 收口阶段不允许粗暴删除 legacy 项。当前优先级是冻结旧入口、禁止新增依赖、保证恢复和报表一致，再逐项证明可退出。

V2C 已选择新建 `shareService`：四主页面不得再直接引用 `utils/share.js`，后续分享文案、复制分享信息、朋友圈降级逻辑都应进入 `shareService`。
