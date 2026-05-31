# V2 实施方案

> 基础：子午花信小程序 V1 已完成重构基线（commit 998cca5）
> 目标：V2 以工程治理收尾为主，渐进引入轻量产品增强

---

## 1. V2 总体结论

### V2 建议目标

1. **legacy 代码清理**：stats.js 中已无运行时入口的 deprecated 方法（`mergeWithDeletedHabits`、`calculateDueCount`、`calculateStatsWithStrategy`）正式移出 Page 层
2. **debug 工具规范化**：syncService syncLogs / conflictLogs 可视化调试入口
3. **UI token 治理收口**：`--color-danger` 危险色统一、V1 遗留硬编码色收敛
4. **homeService 接入**：home.js 今日习惯视图模型收敛到 service，避免页面内拼装
5. **shareService 规范化**：分享文案统一由 service 管理，四主页面统一入口
6. **测试覆盖增强**：syncService、reportService、userService 单元测试补齐

### V2 不建议目标

- AI 能力（deepseekProxy 接入）：V1 验收通过后再评估，V2 阶段仅预留 aiService 骨架
- 头像上传完整实现：Phase 7D 的 profile.js 头像上传已完成核心链路，V2 可继续完善但非优先
- 用户偏好设置：PRD 中 V2 长期目标，V2 阶段仅预留 user_settings 云集合
- 复杂多端冲突裁决：V1 已建立 conflictLogs，V2 暂不扩展完整裁决逻辑
- V3 能力（分享卡片、成就文案、个性化建议）：这些是 V3 目标，V2 阶段不做

### 为什么现在适合做这些

- V1 主链路已稳定，测试 511/511 通过，具备工程基础
- stats.js 运行时 legacy 边界已清理（commit 998cca5），为后续 legacy 方法正式移除奠定条件
- phase7-plan.md 已定义用户服务层重构路径，userService 已接入 profile.js
- V1 的技术债主要是：stats.js 残留 deprecated 方法、app.js globalData 残留旧缓存读写、shareService 尚未收敛

### 为什么不适合做其他内容

- AI 能力牵涉 deepseekProxy 云函数、API Key 安全、prompt 工程，需单独评估产品价值
- 多端冲突裁决需要完整 operation 流水归并设计，超出 V1 已稳定域
- 分享卡片、成就文案属于产品增强，依赖 AI 或运营内容，优先级低于工程治理

---

## 2. V2 阶段边界

### 2.1 允许做的内容

- 移除 stats.js 中无运行时入口的 deprecated legacy 方法
- 统一 debug 日志出口（syncService 的 syncLogs / conflictLogs 标准化）
- 收敛 app.js globalData 中已无页面引用的旧数据字段
- homeService 接入 home.js（今日习惯视图模型由 service 提供）
- shareService 规范化（四主页面分享入口统一）
- V1 UI token 收口：危险色、遗留硬编码色收敛到 design token
- 补充 service 单元测试（syncService、reportService、userService）
- 归档 phase6-plan.md 和 phase7-plan.md 的完成状态

### 2.2 禁止做的内容

- 重写 V1 数据模型（userHabitId、policyVersion、dailyCheckinState 不可动）
- 重写打卡链路（checkinService 已稳定）
- 重写报表聚合（reportService 已稳定）
- 重写同步系统（syncService 已稳定）
- 重写登录体系（userService 已接入）
- 大规模修改 app.js（只做最小清理，不做架构重构）
- 大规模修改 pages/（只做 service 接入，不做业务逻辑迁移）
- 修改 WXML / WXSS 布局和交互路径
- 引入 EventBus / IOC / Repository / Redux / MobX / Zustand 等复杂架构
- 页面层直接读写 storage
- 页面层直接调用云函数
- 前端保存或传递 openid
- 一次性删除 legacy 代码而无回滚策略
- 修改云函数逻辑（V2 不碰 cloudfunctions）

### 2.3 明确延后到 V3 / 后续阶段的内容

- AI 复盘 / AI 建议能力（deepseekProxy 接入）
- 个性化修习建议
- 分享卡片 / 成就文案生成
- 完整用户偏好设置（user_settings 云集合）
- 完整多端冲突裁决 UI
- 完整低可信日期用户确认交互
- 历史报表快照持久化（年度、月度统计快照）
- 单用户万条以上历史明细的断点续传

---

## 3. 当前 V1 基线判断

### 数据模型

- **已完成**：`userHabitId` 生命周期、`habitId` 与 `userHabitId` 严格区分
- **已完成**：V1 数据格式（userHabits / policyVersions / dailyStates）替换 legacy（MyHabits / CheckinLogs / AllHabitsInfo）
- **已完成**：reportService 基于 V1 数据格式生成周/月/年报表

### userHabitId 生命周期

- **已完成**：删除习惯软删除，不复用已删除 userHabitId
- **已完成**：同一内置习惯删除后重新添加，生成新 userHabitId
- **已完成**：recoverData 云函数从 V1 集合恢复数据

### 打卡状态

- **已完成**：checkinService 统一打卡 / 取消打卡
- **已完成**：dailyCheckinState 作为首页和报表的事实源
- **已完成**：checkinOperation 生成，pending 队列管理

### 同步

- **已完成**：syncService 离线优先，pending 队列，retry，幂等
- **已完成**：syncCheckin 云函数幂等写入
- **已完成**：recoverOrSync 网络恢复自动同步
- **已完成**：needsLocalRecovery 判断

### 报表

- **已完成**：reportService / reportAggregator 周/月/年报聚合
- **已完成**：删除当天、策略修改当天特殊口径
- **已完成**：同 habitId 多 userHabitId 聚合展示
- **已完成**：V1 测试 511/511 通过

### 页面瘦身

- **已完成**：stats.js 运行时 legacy 边界清理（commit 998cca5）
- **已完成**：loadRealData 不再读取 MyHabits / CheckinLogs
- **已完成**：loadWeekData / loadMonthData / loadYearData 不再接收 myHabits 参数

### 登录 / 用户资料

- **已完成**：userService 收敛登录逻辑，openid 安全边界
- **已完成**：profile.js 接入 getProfileViewModel
- **已完成**：Phase 7D 头像上传核心链路

### 头像 / 昵称

- **已完成**：userService.saveUserInfo 支持头像和昵称
- **已完成**：云函数 getUserProfile / saveUserProfile 接入

### 测试状态

- **通过**：511 测试全部通过
- **覆盖**：reportService、checkinService、habitService、storageService、timeService、userService
- **未覆盖**：syncService 单元测试（需 V2 补充），reportService 部分边界用例

---

## 4. V2 推荐拆分

### V2A：legacy 代码正式清理

**阶段目标**：将 stats.js 中已无运行时入口的 deprecated 方法正式移出 Page 层，迁移到 services 层或独立工具模块

**允许修改文件**：
- `miniprogram/pages/stats/stats.js`（移出 legacy 方法）
- `miniprogram/services/statsLegacyService.js`（新建，承接近日无调用入口的 legacy 方法）
- `__tests__/unit/pages/stats-date-display.test.js`（静态检查补充）

**禁止修改文件**：
- 任何 WXML / WXSS
- 任何云函数
- reportService / checkinService / syncService

**具体实施步骤**：
1. 创建 `services/statsLegacyService.js`，承接 `mergeWithDeletedHabits`、`calculateDueCount`、`calculateStatsWithStrategy`
2. stats.js 中这些方法标记为 `@deprecated，委托 statsLegacyService`，移除运行时调用
3. 运行静态检查：`rg -n "mergeWithDeletedHabits\|calculateDueCount\|calculateStatsWithStrategy" miniprogram/pages/stats/stats.js`，确认无运行时调用
4. 运行 `npm test -- --runInBand` 确认 511/511 仍然通过

**测试方式**：
- 静态检查无新增页面层违规
- 511 测试全通过

**回滚方案**：
- 保留 stats.js 中方法的 stub 版本，revert 即可恢复

**验收标准**：
- stats.js 中 `mergeWithDeletedHabits`、`calculateDueCount`、`calculateStatsWithStrategy` 无运行时调用
- stats.js 页面代码量减少（可量化）
- 测试无新增失败

**风险点**：
- 低风险：这些方法在 stats.js 中已无调用入口，移除不影响任何功能

---

### V2B：homeService 接入 home.js

**阶段目标**：home.js 的今日习惯视图模型由 homeService 统一提供，页面只负责 setData

**允许修改文件**：
- `miniprogram/services/homeService.js`（新建）
- `miniprogram/pages/home/home.js`（接入 homeService）
- `miniprogram/app.js`（移除 globalData 中 home.js 直接依赖的旧字段）
- `__tests__/unit/pages/home.test.js`（若存在则更新）

**禁止修改文件**：
- home.wxml / home.wxss（不改变 UI）
- checkinService / habitService / storageService / reportService

**具体实施步骤**：
1. 分析 home.js 当前 onShow / loadViewModel 中的今日习惯数据拼装逻辑
2. 在 homeService 中实现 `getTodayViewModel()` 函数，返回 `{ taskList, timeInfo, checkedCount, totalCount, progressPercent }`
3. home.js 的 `loadViewModel()` 改为调用 `homeService.getTodayViewModel()`
4. 检查 app.js globalData 中 MyHabits / CheckinLogs 在 home.js 中的直接引用，改为通过 service 访问

**测试方式**：
- 手工验证首页：今日习惯展示、打卡、取消打卡正常
- 回归测试通过

**回滚方案**：
- revert homeService 接入，home.js 恢复直接拼装逻辑

**验收标准**：
- home.js 不直接调用 `wx.getStorageSync` 读取习惯或打卡数据
- home.js 的 taskList / progressPercent 等字段由 homeService 返回
- 511 测试全通过

**风险点**：
- 中风险：home.js 涉及首页打卡闭环，需确保打卡、取消、进度更新路径不变

---

### V2C：shareService 规范化

**阶段目标**：四个主页面分享入口统一由 shareService 管理，分享文案规范化

**允许修改文件**：
- `miniprogram/services/shareService.js`（若已存在则完善，否则新建）
- `miniprogram/pages/home/home.js`（接入 shareService）
- `miniprogram/pages/habits/habits.js`（接入 shareService）
- `miniprogram/pages/stats/stats.js`（接入 shareService）
- `miniprogram/pages/profile/profile.js`（已有 share.enableShareMenu 调用，可统一）

**禁止修改文件**：
- 任何 WXML / WXSS
- 任何云函数

**具体实施步骤**：
1. 创建 / 完善 `shareService.js`，提供：`getShareMessage(page)` 返回各页面标准分享文案
2. 各页面 onShow 中 `share.enableShareMenu()` 改为 `shareService.enableShareMenu()`
3. `onShareAppMessage` 改为调用 `shareService.getShareMessage(currentPage)`
4. 分享文案按 PRD 规范：安静陪伴式语气，不携带隐私数据

**测试方式**：
- 手工验证四页面分享菜单和分享卡片
- 回归测试通过

**回滚方案**：
- revert shareService 接入，各页面恢复原有 share.js 调用

**验收标准**：
- 四主页面分享入口统一由 shareService 管理
- 分享文案不包含 openid、昵称、头像、打卡明细
- 511 测试全通过

**风险点**：
- 低风险：shareService 是独立 service，不影响打卡和报表主链路

---

### V2D：UI token 治理收口

**阶段目标**：V1 遗留的 `#e64340` 等硬编码危险色收敛到 design token，app.wxss 危险色统一

**允许修改文件**：
- `miniprogram/app.wxss`（危险色 token 补齐）
- `miniprogram/styles/` 下的 design token 文件（如有）
- 涉及危险色的 WXSS（如 confirm-dialog 等组件）

**禁止修改文件**：
- 任何 WXML 布局文件
- 任何业务逻辑页面
- 任何云函数

**具体实施步骤**：
1. 全局搜索 `#e64340`：`rg -n "#e64340" miniprogram/`
2. 将所有残留 `#e64340` 替换为 `--color-danger` 或 `#F0655B`
3. 检查 `custom-tab-bar` 是否还有残留旧色，统一到五主题 token
4. app.wxss 中补齐所有 design token 注释

**测试方式**：
- 手工验证删除确认、危险操作按钮颜色
- 视觉回归检查

**回滚方案**：
- revert 色值替换即可

**验收标准**：
- 全局搜索 `#e64340` 无新增（历史遗留可接受，但不可扩散）
- 删除确认、危险操作使用正确危险色
- 511 测试全通过

**风险点**：
- 低风险：纯视觉 token 替换，不影响业务逻辑

---

### V2E：syncService 单元测试补齐

**阶段目标**：为 syncService 编写单元测试，确保同步逻辑可测试、可回归

**允许修改文件**：
- `__tests__/unit/services/syncService.test.js`（新建）
- `miniprogram/services/syncService.js`（如需拆分内部逻辑以提高可测试性）

**禁止修改文件**：
- 云函数
- 页面层
- WXML / WXSS

**具体实施步骤**：
1. 分析 syncService 现有导出函数
2. 编写覆盖以下场景的单元测试：
   - `push` / `pushWithDedup` / `hasDuplicatePending`
   - `processQueue` 的 happy path
   - `retry` 成功 / 失败
   - `recoverOrSync` 网络恢复
   - `needsLocalRecovery`
3. 使用 Jest mock 模拟 cloudService 和 storageService

**测试方式**：
- `npm test -- __tests__/unit/services/syncService.test.js`
- 全部新测试通过

**回滚方案**：
- 删除测试文件 revert

**验收标准**：
- syncService 覆盖率提升（可量化，如从 X% 到 Y%）
- 511 测试全通过

**风险点**：
- 低风险：纯测试文件新增

---

## 5. 文件修改清单

### 新增文件

| 文件 | 所属阶段 | 说明 |
|------|---------|------|
| `docs/v2/v2-plan.md` | V2 | 本方案文档 |
| `miniprogram/services/statsLegacyService.js` | V2A | 承接受废弃 legacy 方法 |
| `miniprogram/services/homeService.js` | V2B | 首页今日习惯视图模型 |
| `__tests__/unit/services/syncService.test.js` | V2E | syncService 单元测试 |

### 修改文件

| 文件 | 阶段 | 修改内容 |
|------|------|---------|
| `miniprogram/pages/stats/stats.js` | V2A | 移除 deprecated 方法，改为委托 statsLegacyService |
| `miniprogram/pages/home/home.js` | V2B | 接入 homeService |
| `miniprogram/app.js` | V2B | 清理 globalData 中 home.js 直接依赖的旧字段 |
| `miniprogram/services/shareService.js` | V2C | 规范化分享入口和文案 |
| `miniprogram/pages/home/home.js` | V2C | 接入 shareService |
| `miniprogram/pages/habits/habits.js` | V2C | 接入 shareService |
| `miniprogram/pages/profile/profile.js` | V2C | 统一 shareService |
| `miniprogram/app.wxss` | V2D | 危险色 token 补齐 |
| 相关 WXSS 文件 | V2D | `#e64340` 替换为 token |

### 不允许修改的文件

- 所有云函数（cloudfunctions/）
- 所有 WXML 文件
- reportService.js、checkinService.js、habitService.js、userService.js、storageService.js、cloudService.js、timeService.js（除非 V2A 清理需要）
- 任何新增业务逻辑文件

---

## 6. 数据与状态影响评估

| 数据对象 | 是否影响 | 说明 |
|---------|---------|------|
| userHabitId | **不影响** | V2 不修改 userHabitId 生成和生命周期 |
| policyVersion | **不影响** | V2 不修改策略版本逻辑 |
| dailyCheckinState | **不影响** | V2 不修改每日最终状态逻辑 |
| checkinOperation | **不影响** | V2 不修改操作流水逻辑 |
| pendingOperations | **不影响** | V2 不修改 pending 队列结构（仅补充测试） |
| reportData | **不影响** | V2 不修改报表计算口径 |
| userInfo | **不影响** | V2 不修改用户资料存储结构 |
| cacheMeta | **不影响** | V2 不修改缓存元数据结构 |
| cloud collections | **不影响** | V2 不修改云端集合结构 |
| migration | **不影响** | V2 不涉及数据迁移 |

---

## 7. 云函数与安全边界

1. **是否新增云函数**：否，V2 不新增云函数
2. **是否修改现有云函数**：否，V2 不修改任何云函数
3. **是否涉及 cloud.getWXContext()**：否
4. **是否涉及 openid**：否，V2 不涉及 openid 读取或传递
5. **是否涉及隐私数据**：否
6. **是否涉及 DeepSeek / AI API Key**：否
7. **前端禁止传递 openid 的约束**：V2 继续遵守，statsLegacyService / homeService / shareService 均不得传递 openid

---

## 8. UI 边界

1. **是否修改 WXML**：否
2. **是否修改 WXSS**：仅限 V2D 阶段的危险色 token 替换，不改变布局和交互
3. **是否修改 UI 风格**：否
4. **是否影响四主页面信息架构**：否，V2B homeService 接入只改变数据来源，不改变展示结构
5. **是否需要视觉验收**：V2D 需要手工验证危险色替换效果，其他阶段不需要

---

## 9. 测试策略

1. **service 单元测试**：补充 syncService 单元测试（V2E）
2. **页面轻量测试**：确保 V2A-V2D 任何修改后 511 测试全通过
3. **同步测试**：syncService 单元测试覆盖 pending / retry / recoverOrSync
4. **报表回归测试**：V2A 移除 deprecated 方法后，确保 reportService 测试仍全通过
5. **登录 / 用户资料回归测试**：V2 不修改 userService，现有测试继续通过
6. **AI 降级测试**：不适用，V2 不涉及 AI

---

## 10. 执行顺序

### 建议执行顺序

**V2A → V2E → V2B → V2C → V2D**

理由：
1. **V2A 最先执行**：stats.js legacy 清理风险最低，只影响已无调用入口的方法，验证后为后续阶段减少技术债
2. **V2E 其次**：syncService 单元测试是纯测试补充，不影响业务逻辑，但为后续阶段提供回归安全网
3. **V2B 第三**：homeService 接入 home.js 涉及首页打卡闭环，需要在确保 syncService 可测试后进行，且可独立验证
4. **V2C 第四**：shareService 规范化是纯 service 接入，不影响打卡和报表，独立验证
5. **V2D 最后**：UI token 治理是纯视觉收尾，在所有功能稳定后进行

### 每一步为什么安全

- **V2A**：移除的代码在 stats.js 中已无运行时调用，revert 成本极低
- **V2E**：纯新增测试文件，不改变任何业务逻辑，revert 即删除
- **V2B**：homeService 提供纯函数，home.js 接入后仍可 revert 到直接拼装
- **V2C**：shareService 是独立 service，各页面逐步接入，单页面 revert 不影响其他
- **V2D**：纯视觉 token 替换，revert 即恢复旧色值

---

## 11. 验收标准

### V2 总体验收标准

- 所有 V2 阶段完成，且每个子阶段单独通过验收
- 511 测试全通过
- 无新增 WXML / WXSS 布局和交互变更
- 无新增云函数修改
- V2 提交历史可追溯，每个子阶段单独 commit

### V2A 验收标准

- stats.js 中 `mergeWithDeletedHabits`、`calculateDueCount`、`calculateStatsWithStrategy` 无运行时调用（静态检查通过）
- stats.js 代码行数减少
- 511 测试全通过

### V2B 验收标准

- home.js 不直接调用 `wx.getStorageSync` 读取习惯或打卡数据
- home.js 的 taskList / checkedCount / totalCount / progressPercent 由 homeService 返回
- app.js globalData 中 MyHabits / CheckinLogs 在 home.js 中无直接引用
- 511 测试全通过
- 手工验证首页打卡 / 取消 / 进度更新正常

### V2C 验收标准

- 四主页面分享入口统一由 shareService 管理
- 分享文案不含 openid、昵称、头像、打卡明细
- 511 测试全通过

### V2D 验收标准

- 全局搜索 `#e64340` 无新增
- 删除确认、危险操作使用正确危险色（`--color-danger` 或 `#F0655B`）
- 511 测试全通过

### V2E 验收标准

- syncService 单元测试新增，覆盖 pending / retry / recoverOrSync / needsLocalRecovery
- 新增测试全部通过
- 511 总测试全通过

---

## 12. 给 Claude Code / Minimax 的执行规则

1. **每次只执行一个子阶段**：V2A 完成并验收后，才可开始 V2B
2. **每个子阶段单独提交**：每个 V2X 完成验收后单独 commit，不得合并多个 V2X 到一个 commit
3. **每个子阶段完成后必须等待人工验收**：不得跳过人工验收进入下一阶段
4. **不得跨阶段实施**：V2A 的代码改动不得包含 V2B 的内容
5. **不得顺手重构无关文件**：执行 V2A 时只改 stats.js 和 statsLegacyService.js，不得顺手修改 home.js 或其他文件
6. **不得修改 UI**：除非该子阶段明确允许（V2D 允许色值替换），不得修改 WXML / WXSS 布局
7. **不得绕过 service 层**：所有业务逻辑走 service，不得在页面层直接实现
8. **不得绕过 cloudService / storageService / syncService / reportService**：V2 阶段不修改这些核心 service 的接口契约
9. **不得保存或传递 openid**：statsLegacyService / homeService / shareService 不得包含 openid 传递逻辑
10. **V2 禁止修改云函数**：不得修改 cloudfunctions/ 下任何文件

---

## 附录：V1 已具备能力 vs V2 计划

| 能力域 | V1 状态 | V2 计划 |
|--------|---------|---------|
| 数据模型 | V1 完成 | V2 不动 |
| 打卡链路 | V1 完成 | V2 不动 |
| 报表聚合 | V1 完成 | V2 不动 |
| 同步系统 | V1 完成 | V2 补充测试（V2E） |
| 登录/用户资料 | V1 完成 | V2 不动 |
| stats.js legacy 清理 | 部分完成（无运行时调用） | V2A 正式移除（V2A） |
| home.js 视图模型 | 页面内拼装 | V2B 收敛到 homeService |
| 分享入口 | 各页面分散 | V2C 收敛到 shareService |
| 危险色 token | 部分完成 | V2D 收口 |
| AI 能力 | 骨架预留 | 延后 V3 |
| 多端冲突裁决 | 骨架预留 | 延后 V3 |
| 用户偏好设置 | 未开始 | 延后 V3 |