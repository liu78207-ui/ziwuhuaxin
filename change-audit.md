# Change Audit

审计日期：2026-06-10
复验日期：2026-06-10

审计范围：README、AGENTS、GOAL_DRIVEN、PRD、REFACTORING_PLAN、phase 方案、核心 service、Cloud Functions、四主页面、当前工作区 diff、自动化测试结果。

## 当前阶段判断

当前仓库处于 V1 收尾到 Phase 7 用户服务治理之间的混合状态。

- 已落地：TimeService、StorageService、CloudService、habitService、checkinService、syncService、reportService/reportAggregator、userService 的主要骨架。
- 正在收尾：清缓存恢复走 recoverData；用户登录和资料走 userService；观心页报表已切到 reportService。
- 仍未完全收敛：app.js 保留 legacy MyHabits/CheckinLogs/globalData 兼容 API 外壳；doCheckin/getStatsReport 兼容云函数仍读写旧集合。
- 文档状态：Phase 2/3/4/5/7 方案均存在；V2 方案已有但不应视为当前代码完成度。

## 新增模块

- `miniprogram/services/reportAggregator.js`
  - 统一报表纯计算层，按 userHabitId 生命周期计算，再按 habitId 聚合展示。
- `miniprogram/services/reportService.js`
  - 统一周/月/年报表入口，供 stats 页面使用。
- `miniprogram/services/homeService.js`
  - 首页视图模型入口，聚合今日时辰、今日任务、进度。
- `miniprogram/services/userService.js`
  - 登录态、用户资料、本地用户缓存和头像上传入口。
- `cloudfunctions/migrateV1Data/`
  - V1 旧集合到新集合的迁移函数。
- `cloudfunctions/getUserProfile/`
  - 用户资料读取函数。
- `cloudfunctions/saveUserProfile/`
  - 用户资料保存函数。
- `cloudfunctions/saveStrategyVersion/`
  - 策略版本保存兼容函数。
- `cloudfunctions/v1-deploy-manifest.json`
  - V1 云函数部署清单。
- 新增测试：
  - `__tests__/unit/services/cloudService.test.js`
  - `__tests__/unit/services/homeService.test.js`
  - `__tests__/unit/services/syncService.test.js`
  - `__tests__/unit/services/userService.test.js`
  - `__tests__/unit/services/checkinService.strategy-change.test.js`
  - `__tests__/unit/pages/habits-edit-strategy.test.js`
  - `__tests__/unit/pages/profile-login.test.js`
  - `__tests__/integration/cloudfunctions/migrateV1Data.test.js`
  - `__tests__/integration/cloudfunctions/recoverData.test.js`
  - `__tests__/integration/cloudfunctions/strategy-change-sync.test.js`
  - `__tests__/integration/services/habitService.e2e.test.js`
  - `__tests__/integration/services/habitService.today.test.js`
  - `__tests__/integration/services/strategy-change-day.test.js`

## 修改模块

### 前端 App 与页面

- `miniprogram/app.js`
  - 登录改接 userService，恢复/同步改接 syncService。
  - 仍保留 legacy MyHabits、CheckinLogs、AllHabitsInfo、operationLogs 的兼容 API，但直接 storage 和业务 `new Date()` 已移出 app.js。
- `miniprogram/pages/home/home.js`
  - 首页基本收敛到 homeService、checkinService、timeService。
- `miniprogram/pages/habits/habits.js`
  - 添加、修改、删除习惯接入 habitService。
  - 仍在页面内硬编码内置习惯库和部分日期 UI 计算。
- `miniprogram/pages/stats/stats.js`
  - 运行入口已切到 reportService。
  - 已删除 legacy 报表计算、storage 读取、globalData 访问；周期日期展示已改走 timeService。
- `miniprogram/pages/profile/profile.js`
  - 归藏页改接 userService。

### Services

- `miniprogram/services/checkinService.js`
  - 打卡/取消生成 operation，写 daily state，入 pending 队列。
  - 增加策略修改当天锁定状态处理。
- `miniprogram/services/cloudService.js`
  - 统一 callFunction 错误结构、超时/网络分类、用户资料上传辅助。
- `miniprogram/services/habitService.js`
  - userHabitId 生命周期、策略版本、软删除、今日习惯生成、策略修改当天状态锁定。
- `miniprogram/services/homeService.js`
  - 首页 ViewModel 及今日任务去重展示。
- `miniprogram/services/syncService.js`
  - pending 队列、retry、recoverData、legacy recover fallback。
- `miniprogram/services/userService.js`
  - 登录、profile view model、用户资料保存、头像上传。

### Cloud Functions

- `cloudfunctions/login/index.js`
  - 登录返回 userId，不返回 openid。
- `cloudfunctions/recoverData/index.js`
  - 恢复 V1 新集合数据。
- `cloudfunctions/syncCheckin/index.js`
  - 幂等写入 checkin_operations，更新 daily_checkin_states。
- `cloudfunctions/syncHabit/index.js`
  - 同步 user_habits、habit_policy_versions，支持策略修改当天 daily state。
- `cloudfunctions/doCheckin/index.js`
  - 兼容旧 checkin_logs 打卡函数，仍读写旧集合。
- `cloudfunctions/undoCheckin/index.js`
  - 兼容旧取消函数，不再物理删除旧 checkin_logs；改为取消标记并补写 operation/state。
- `cloudfunctions/getStatsReport/index.js`
  - 兼容旧报表函数，仍使用 user_strategies/user_strategy_versions/checkin_logs。

## 文件变化最大

按 `git diff --numstat`：

- `reports/junit.xml`：688 insertions / 504 deletions。
- `__tests__/unit/app.test.js`：619 insertions / 593 deletions。
- `cloudfunctions/getStatsReport/index.js`：394 insertions / 394 deletions。
- `miniprogram/pages/habits/habits.wxml`：261 insertions / 262 deletions。
- `cloudfunctions/doCheckin/index.js`：213 insertions / 213 deletions。
- `miniprogram/app.js`：105 insertions / 167 deletions。
- `miniprogram/pages/stats/stats.js`：6 insertions / 983 deletions。
- `miniprogram/services/habitService.js`：141 insertions / 19 deletions。
- `miniprogram/services/syncService.js`：140 insertions / 47 deletions。
- `cloudfunctions/recoverData/index.js`：106 insertions / 21 deletions。
- `cloudfunctions/removeStrategy/index.js`：97 insertions / 97 deletions。

## 风险模块

### P0/P1 候选风险

- `miniprogram/app.js`
  - 风险：仍保留 globalData、CheckinLogs、MyHabits 的兼容 API 外壳。
  - 影响：长期维护成本、旧调用方误用风险。
- `cloudfunctions/getStatsReport/index.js`
  - 风险：仍从旧集合聚合报表，并按 habitId 维度处理。
  - 影响：若前端或后台仍调用该函数，可能与 reportService 口径不一致。

### P2/P3 候选风险

- `miniprogram/pages/habits/habits.js`
  - 风险：内置习惯库硬编码在页面，未完全从 constants/service 获取。
  - 影响：习惯库与治理常量不一致。
- `miniprogram/pages/stats/stats.js`
  - 风险：页面仍保留报表 ViewModel 映射。
  - 影响：长期可进一步由 reportService 直接返回页面 ViewModel。
- `miniprogram/services/syncService.js`
  - 风险：最终失败仍保留在 pending 队列中。
  - 影响：UI 展示和手工恢复入口需继续完善。
- `miniprogram/services/habitService.js`
  - 风险：添加习惯和策略版本生成使用业务日期作为 createdAt，部分时间戳仍用 `new Date().toISOString()`。
  - 影响：审计时间与业务日期混用，需要明确字段语义。

## 核心主链路

1. 新用户首次进入
   - `app.onLaunch -> userService.login -> syncService.recoverFromCloud -> homeService.getHomeViewModel`
2. 老用户进入
   - `storageService` 读取本地数据，`syncService.recoverOrSync` 处理 pending/recover。
3. 清缓存或换设备恢复
   - `syncService.recoverFromCloud -> recoverData -> user_habits/habit_policy_versions/daily_checkin_states`
4. 添加/编辑/删除习惯
   - `habits.js -> habitService.addHabit/updateHabitPolicy/softDeleteHabit -> storageService -> syncService.pushWithDedup -> syncHabit`
5. 打卡/取消打卡
   - `home.js -> checkinService.toggleCheckin -> checkinOperation + dailyCheckinState -> syncService -> syncCheckin`
6. 报表展示
   - `stats.js -> reportService.getWeeklyReport/getMonthlyReport/getYearlyReport -> reportAggregator`
7. 用户资料
   - `profile.js -> userService.login/saveUserInfo/uploadAvatar -> login/getUserProfile/saveUserProfile`
