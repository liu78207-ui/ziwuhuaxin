# 测试策略与架构验收

本文档合并自动化测试方案与技术架构验收内容，作为《子午花信》V1 重构后的测试、验收、回归与边界用例治理文档。

测试目标不是追求 UI 自动化覆盖率，而是优先保证核心业务规则稳定：

- 时间系统稳定。
- 习惯实例生命周期稳定。
- 策略版本稳定。
- 打卡和取消幂等。
- 清缓存恢复可靠。
- 周/月/年报表准确。
- 删除当天和策略修改当天特殊口径稳定。

## 1. 自动化测试

### 1.1 测试优先级

优先级从高到低：

1. `reportService`
2. `timeService`
3. `migrationService`
4. `checkinService`
5. `syncService`
6. `habitService`
7. 云函数测试
8. 页面轻量测试
9. UI 自动化测试

### 1.2 reportService 测试

必须覆盖：

- 每天策略。
- 每周固定星期策略。
- 间隔天数策略。
- 策略版本切换。
- 删除当天已打卡。
- 删除当天未打卡。
- 策略修改当天最终状态为 `checked`。
- 策略修改当天最终状态为 `canceled`、`unchecked` 或 `not_required`。
- 策略修改当天已打卡后取消。
- 策略修改当天先修改后打卡。
- 同一天多次修改策略，以最后一次保存成功策略生成未来任务。
- 同 `habitId` 多个 `userHabitId` 聚合展示。
- 新旧生命周期不混算。
- 未来日期不计入分母。
- 非应修日不计入分母。
- 低可信日期不计入报表。
- 重复打卡不重复计数。
- 周报 7 天状态。
- 月报月历状态。
- 年报热力状态。

推荐测试文件：

- `__tests__/unit/services/reportService.test.js`
- `__tests__/unit/services/reportAggregator.test.js`

### 1.3 timeService 测试

必须覆盖：

- `getBusinessDate()`。
- `getTodayKey()`。
- Asia/Shanghai 日期。
- 23:59 到 00:00 跨天。
- 周一作为自然周开始。
- 月初月末边界。
- 年初年末边界。
- 闰年。
- 服务端时间可用。
- 服务端时间不可用时本地兜底。
- 本地时间低可信。

推荐测试文件：

- `__tests__/unit/services/timeService.test.js`

### 1.4 migrationService 测试

必须覆盖：

- `MyHabits` 迁移到 `user_habits`。
- `CheckinLogs` 迁移到 `checkin_operations`。
- `CheckinLogs` 聚合到 `daily_checkin_states`。
- `user_strategies` 迁移到 `user_habits`。
- `user_strategy_versions` 迁移到 `habit_policy_versions`。
- 已删除习惯历史保留。
- 删除后重加生成不同 `userHabitId`。
- 重复运行迁移不产生重复记录。
- 迁移失败保留旧读路径。
- `cacheMeta.migrationVersion` 正确写入。

推荐测试文件：

- `__tests__/unit/services/migrationService.test.js`

### 1.5 checkinService 测试

必须覆盖：

- 打卡本地乐观更新。
- 打卡生成 operation。
- 打卡更新 daily state。
- 取消生成 cancel operation。
- 取消更新 daily state。
- 快速重复点击防抖。
- 同日重复打卡幂等。
- 离线打卡进入 pending。
- 同步成功后状态变 synced。
- 同步失败后状态变 failed 或 pending。
- 删除当天已打卡取消后首页移除。

推荐测试文件：

- `__tests__/unit/services/checkinService.test.js`

### 1.6 syncService 测试

必须覆盖：

- pending 队列读取。
- retry 逻辑。
- idempotencyKey 保持不变。
- 网络恢复后自动同步。
- 云端成功回写本地状态。
- 云端冲突进入 conflict logs。
- recoverData 成功写入缓存。
- recoverData 失败保留可用本地状态。

推荐测试文件：

- `__tests__/unit/services/syncService.test.js`

### 1.7 habitService 测试

必须覆盖：

- 获取 25 个内置习惯。
- 添加习惯生成 `userHabitId`。
- 添加习惯创建首个策略版本。
- 编辑策略生成新版本。
- 删除习惯为软删除。
- 删除后重加不复用旧 `userHabitId`。
- 今日习惯生成不在页面层完成。
- 超过 12 个今日习惯返回提示。

推荐测试文件：

- `__tests__/unit/services/habitService.test.js`

### 1.8 云函数测试

必须覆盖：

- `login` 返回 openid 和 serverTime。
- `syncHabit` 幂等写入用户习惯。
- `syncHabit` 幂等写入策略版本。
- `syncHabit addHabit` 验证 `user_habits.createdAt` 与策略 `startDate/effectiveStartDate` 分离，防止恢复后把计划开始日误当实例创建日。
- `syncCheckin` 幂等写入打卡 operation。
- `syncCheckin` 更新 daily state。
- `syncCheckin` 重复请求不重复计数。
- `recoverData` 分页恢复。
- `recoverData` 云端无数据返回空初始化结果。

推荐测试文件：

- `__tests__/integration/cloudfunctions/syncHabit.test.js`
- `__tests__/integration/cloudfunctions/syncCheckin.test.js`
- `__tests__/integration/cloudfunctions/recoverData.test.js`

### 1.9 页面测试

页面测试只做轻量验证：

- 页面调用 service。
- 页面响应 EventBus 刷新。
- 页面不直接读写 storage。
- 页面不直接调用业务云函数。
- 页面不直接计算报表。

不优先做复杂 UI 自动化。

## 2. 验收清单

### 2.1 TimeService

- [ ] 首页今日日期来自 `timeService.getBusinessDate()`。
- [ ] 打卡日期来自 `timeService.getTodayKey()`。
- [ ] 取消打卡日期来自 `timeService.getTodayKey()` 或明确传入的业务日期。
- [ ] 周报周期来自 `timeService.getWeekRange(date)` 或 `reportDateUtils`。
- [ ] 月报周期来自 `timeService.getMonthRange(date)` 或 `reportDateUtils`。
- [ ] 年报周期来自 `timeService.getYearRange(date)` 或 `reportDateUtils`。
- [ ] 页面业务逻辑不直接使用 `new Date()` 计算业务日期。
- [ ] 云函数返回 `serverTime`。
- [ ] 本地时间异常时记录 `dateConfidence = low`。
- [ ] `dateConfidence = low` 的记录不会静默进入报表。
- [ ] 小程序从后台回到前台时会校验日期是否变化。
- [ ] 跨天后首页自动刷新今日任务。

### 2.2 习惯实例

- [ ] 内置习惯使用 `habitId`。
- [ ] 用户添加习惯生成独立 `userHabitId`。
- [ ] 同一个 `habitId` 删除后重新添加生成新的 `userHabitId`。
- [ ] `userHabit` 支持软删除。
- [ ] 已删除 `userHabit` 保留历史打卡和报表数据。
- [ ] 页面展示不再把 `habitId` 当作用户实例唯一 ID。
- [ ] 习惯实例状态至少支持 `active`、`deleted`。
- [ ] `userHabit.latestPolicyVersionId` 指向当前策略版本。
- [ ] 云端 `user_habits` 按 openid 隔离。
- [ ] 本地缓存恢复后 `userHabitId` 不重复生成。

### 2.3 策略版本

- [ ] 策略版本归属 `userHabitId`。
- [ ] 每次编辑策略生成新的 `policyVersionId`。
- [ ] 旧策略版本正确关闭 `effectiveEndDate`。
- [ ] 同一 `userHabitId` 下策略版本时间段不重叠。
- [ ] 任意业务日期最多命中一个有效策略版本。
- [ ] 报表按日期命中当日有效策略版本。
- [ ] 间隔天数策略变更后从新版本生效日重新锚定。
- [ ] 删除习惯时关闭当前策略版本。
- [ ] 重新添加同一内置习惯时不复用旧策略版本。
- [ ] 旧 `user_strategy_versions` 可迁移为新版 `habit_policy_versions`。

### 2.4 打卡与取消

- [ ] 点击打卡后本地立即更新。
- [ ] 打卡生成 `checkinOperation`。
- [ ] 打卡操作包含 `operationId`。
- [ ] 打卡操作包含 `idempotencyKey`。
- [ ] 打卡操作包含 `userHabitId`。
- [ ] 打卡操作包含 `habitId`。
- [ ] 打卡操作包含 `policyVersionId`。
- [ ] 打卡更新 `dailyCheckinState.status = checked`。
- [ ] 云端 `syncCheckin` 使用 `idempotencyKey` 幂等处理。
- [ ] 快速重复点击不会生成重复完成。
- [ ] 同日重复提交不会放大报表计数。
- [ ] 离线打卡进入 pending。
- [ ] 网络恢复后 pending 自动同步。
- [ ] 已打卡状态支持取消。
- [ ] 取消打卡生成 `checkinOperation`。
- [ ] 取消操作 `action = cancel`。
- [ ] 取消操作包含同一业务日期。
- [ ] 普通应修日取消更新 `dailyCheckinState.status = canceled`；从未打卡的应修日可由报表推导为 `unchecked`。
- [ ] 云端不直接物理删除唯一历史依据。
- [ ] 取消成功后首页完成数减少。
- [ ] 取消成功后报表分子减少。
- [ ] 删除当天已打卡习惯取消后，从首页移除。
- [ ] 重复取消请求幂等。
- [ ] 取消同步失败进入 pending。

### 2.5 清缓存恢复

- [ ] 清缓存后 `login` 能拿到 openid。
- [ ] `recoverData` 能恢复用户习惯实例。
- [ ] `recoverData` 能恢复当前策略版本。
- [ ] `recoverData` 能恢复历史策略版本。
- [ ] `recoverData` 能恢复近期每日最终状态。
- [ ] V1 默认恢复最近 90 天状态。
- [ ] 历史数据按报表周期分页加载。
- [ ] 恢复失败时有可见提示。
- [ ] 恢复失败时有重试入口。
- [ ] 云端无数据时进入新用户空状态。
- [ ] 恢复不会产生重复本地记录。
- [ ] 恢复完成后四个主页面数据一致。

### 2.6 报表聚合

- [ ] 周报由 `reportService` 生成。
- [ ] 月报由 `reportService` 生成。
- [ ] 年报由 `reportService` 生成。
- [ ] 页面层不自行计算完成率。
- [ ] 页面层不自行计算分母。
- [ ] 页面层不自行计算年热力状态。
- [ ] 支持每天策略。
- [ ] 支持每周固定星期策略。
- [ ] 支持间隔天数策略。
- [ ] 支持策略版本切换。
- [ ] 支持同 `habitId` 多个 `userHabitId` 聚合展示。
- [ ] 新旧生命周期不混算。
- [ ] 未来日期不计入分母。
- [ ] 非应修日不计入分母。
- [ ] 删除后历史记录仍展示。
- [ ] 农历只用于展示，不参与统计。
- [ ] 重复打卡日志不重复计数。

### 2.7 云同步失败

- [ ] 断网时打卡不阻断。
- [ ] 断网时取消打卡不阻断。
- [ ] 同步失败后状态标记为 `pending` 或 `failed`。
- [ ] 网络恢复后自动重试。
- [ ] 重试使用同一幂等键。
- [ ] 服务端确认状态回写本地。
- [ ] 多端冲突 V1 以服务端最终状态为准。
- [ ] 冲突记录进入 `conflict_logs`。
- [ ] 同步失败对用户有非阻断提示。
- [ ] 同步失败不会丢失本地操作反馈。
- [ ] 清缓存后未同步本地操作若已丢失，恢复以云端为准并提示风险。

### 2.8 UI Token 对齐

- [ ] 五主题色统一为 `t-green`、`t-red`、`t-yellow`、`t-blue`、`t-purple`。
- [ ] 五主题色对应 CSS 变量进入 `styles/design-tokens.wxss`。
- [ ] `#e64340` 不再出现在业务 UI 代码中。
- [ ] 删除确认 `confirmColor` 使用 `#F0655B`。
- [ ] 危险操作使用 `--color-danger`。
- [ ] 操作菜单按 `item.type === 'danger'` 渲染危险色。
- [ ] 删除菜单项不使用品牌主色。
- [ ] `custom-tab-bar` 是唯一一级导航视觉来源。
- [ ] 页面进入时同步 tab `selected`。
- [ ] 未使用的 `nav-bar`、`tab-bar`、`navigation-bar` 不参与当前验收。
- [ ] 旧时辰装饰色若保留，必须 token 化并限定场景。
- [ ] 不为了 V1 验收整体重做 UI。

### 2.9 验收标准

- 核心 service 有单元测试。
- 报表特殊口径有明确测试。
- 迁移幂等有测试。
- 打卡和取消幂等有测试。
- 云函数同步有集成测试。
- 页面层禁止事项可通过静态搜索辅助检查。

## 3. 回归测试

每次阶段性重构后至少运行：

```bash
npm test -- __tests__/unit/services
npm test -- __tests__/unit/utils
npm test -- __tests__/integration/cloudfunctions
```

如果当前阶段尚未创建 service 测试目录，可运行现有：

```bash
npm test -- __tests__/unit
npm test -- __tests__/integration/cloudfunctions
```

建议在涉及治理规则的变更后补充静态搜索：

```bash
rg -n "wx\\.getStorageSync|wx\\.setStorageSync|wx\\.removeStorageSync|wx\\.cloud\\.callFunction|new Date\\(" miniprogram/pages
rg -n "#e64340" miniprogram custom-tab-bar components styles
```

回归结果至少确认：

- 核心服务测试通过。
- 云函数同步相关测试通过。
- 页面层没有新增直接读写业务缓存、直接调用业务云函数、直接计算业务日期或报表的代码。
- 文档索引没有指向已删除文档。

## 4. 边界测试

### 4.1 删除当天

- [ ] 删除习惯为软删除。
- [ ] 删除不会删除历史打卡数据。
- [ ] 删除不会删除历史策略版本。
- [ ] 删除当天未打卡时，今日任务立即移除。
- [ ] 删除当天未打卡时，当日不计入报表分母。
- [ ] 删除当天已打卡时，首页保留已打卡状态。
- [ ] 删除当天已打卡时，首页保留取消入口。
- [ ] 删除当天已打卡时，当日计入分母。
- [ ] 删除当天已打卡时，当日计入分子。
- [ ] 删除当天已打卡后取消，当日不再计入分子。
- [ ] 删除后历史周期仍能显示该习惯。
- [ ] 删除后重新添加同一内置习惯生成新生命周期。

### 4.2 策略修改当天

状态标记：

- V1 新数据链路已落地，测试应优先覆盖新字段链路。
- 旧数据不做强制 migration，测试只要求兼容推导稳定，不要求历史记录被批量补写 `hasPolicyChangedToday` 或 `lockedReason`。
- 当前缓存层没有统一 `reportCache/invalidate` 接口，缓存失效项作为后续引入报表缓存时的验收要求。

- [ ] 修改策略生成新版本，不覆盖旧版本。
- [ ] 当天已打卡后修改策略，当日计入分母。
- [ ] 当天已打卡后修改策略，当日计入分子。
- [ ] 当天未打卡时修改为今日不应修，当日不计入分母。
- [ ] 当天未打卡时修改为今日仍应修，按新策略判断是否展示。
- [ ] 今日特殊口径写入锁定状态或由 `reportService` 稳定推导。
- [ ] 历史日期按旧策略解释。
- [ ] 后续日期按新策略解释。
- [ ] 策略修改后首页刷新今日任务。
- [ ] 策略修改后观心报表重新计算。
- [ ] 当天发生策略修改且最终状态为 `checked`，写入或稳定推导 `strategy_changed_after_checkin`，分母 1、分子 1。
- [ ] 当天发生策略修改且最终状态为 `canceled`，写入或稳定推导 `strategy_changed_without_checkin`；若最新策略命中当天，分母 1、分子 0，否则分母 0、分子 0。
- [ ] 当天发生策略修改且最终状态为 `unchecked`，若最新策略命中当天，分母 1、分子 0，否则分母 0、分子 0。
- [ ] 当天发生策略修改且最终状态为 `not_required`，分母 0、分子 0。
- [ ] 先修改策略后打卡，当天最终状态为 `checked`，分母 1、分子 1。
- [ ] 先打卡、再修改策略、最后取消，当天最终状态为 `canceled`；若最新策略命中当天，分母 1、分子 0，否则分母 0、分子 0。
- [ ] 同一天多次修改策略时，首页和未来报表使用最后一次保存成功的策略。
- [ ] 同一天多次打卡和取消时，操作流水全部保留，首页和报表只读取每日最终状态。

### 4.3 时间边界

- [ ] 23:59 到 00:00 跨天后今日任务刷新。
- [ ] 周一作为自然周起点。
- [ ] 月初月末报表范围正确。
- [ ] 年初年末报表范围正确。
- [ ] 闰年日期合法且报表不越界。
- [ ] 未来日期不计入分母。
- [ ] 非应修日不计入分母。
- [ ] 本地时间低可信时不会静默进入报表。
- [ ] 服务端时间不可用时有本地兜底和可信度标记。

### 4.4 幂等与冲突

- [ ] 快速重复打卡不会生成重复完成。
- [ ] 同日重复打卡不会放大报表计数。
- [ ] 重复取消请求幂等。
- [ ] 重试保留原始 `idempotencyKey`。
- [ ] 云端重复 `syncCheckin` 请求不重复计数。
- [ ] 多端冲突以服务端最终归并状态为准。
- [ ] 冲突进入 `conflict_logs`。

### 4.5 清缓存与恢复

- [ ] 清缓存后仍能通过 `login` 获取 openid。
- [ ] 云端无数据时进入新用户空状态。
- [ ] `recoverData` 能分页恢复用户习惯、策略版本和全部历史每日最终状态。
- [ ] 超过 500 条状态时客户端持续读取到 `nextCursor=null`。
- [ ] 重复页、游标不前进和分页中断不会覆盖原缓存。
- [ ] 存在 pending、retrying 或 failed 操作时阻止清缓存。
- [ ] staging 提交失败时回滚核心缓存。
- [ ] 恢复失败保留可用本地状态。
- [ ] 恢复不会产生重复本地记录。
- [ ] 恢复完成后四个主页面数据一致。

### 4.6 离线与同步失败

- [ ] 断网时打卡不阻断。
- [ ] 断网时取消打卡不阻断。
- [ ] 离线操作进入 pending。
- [ ] 网络恢复后自动 retry。
- [ ] 同步失败不会丢失本地操作反馈。
- [ ] 服务端确认状态回写本地。

### 4.7 云同步发布专项

- [ ] 打卡/取消跨设备交错时，服务端后提交操作生效并递增 revision。
- [ ] 同毫秒相反操作仍按事务提交顺序归并。
- [ ] 同一幂等 key 晚到不重复递增 revision。
- [ ] 旧操作晚到不覆盖更新状态。
- [ ] 策略并发修改只保留一个最新版本引用。
- [ ] 删除与旧 add/update 竞争时，已删除实例不被重新激活。
- [ ] single-flight 的所有调用方等待同一 Promise。
- [ ] 自动失败三次后不再调度，手动重试仍复用原身份。
- [ ] 云端连续返回 `TransactionBusy` 时在云函数内退避重试，成功后只写入一个幂等 operation 和一个 revision。
- [ ] 清缓存确认会显式重试 `failed`；重试成功后继续恢复，重试失败时保留缓存和原始 operation identity。
- [ ] 冷启动、前台恢复、网络恢复和异常退出恢复均可续传。
- [ ] 队列账号或环境不匹配时隔离失败且未调用业务云函数。
- [ ] 恢复数据不覆盖未确认 pending，身份变化不复用旧缓存。
- [ ] 旧数据没有 revision 时按 `0` 兼容。
- [ ] 提醒入口、提醒 API、提醒云函数和提醒集合均不存在。

全量门禁必须零失败。业务覆盖率排除 vendored `pinyin-pro.js` 后仍维持 70% 门槛，不允许通过排除业务源码降低门槛。
