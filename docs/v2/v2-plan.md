# V2 实施方案

> 基础：子午花信小程序 V1 已完成重构基线（commit 5492e70，测试基线 39 suites / 511 tests 全部通过）
> 目标：V2 以工程治理收尾为主，渐进引入轻量产品增强

---

## 1. V2 总体结论

### V2 建议目标

1. **shareService 新建与规范化**：四主页面分享入口分散在 utils/share.js，V2 需建立 services/shareService.js 统一管理分享文案和入口
2. **UI token 治理收口**：`--color-danger` 危险色统一，当前全局无 `#e64340` 残留（已验证），以预防为主
3. **syncService 单元测试补齐**：syncService 已有基本逻辑但无独立测试文件，V2 补充单元测试
4. **app.js globalData 清理**：移除 stats.js 已不直接依赖的 MyHabits / CheckinLogs 全局数据写入，四主页面统一走 service
5. **归档 phase 文档**：归档 phase6-plan.md / phase7-plan.md 的完成状态

### V2 不建议目标

- AI 能力（deepseekProxy 接入）：V1 验收通过后再评估，V2 阶段仅预留 aiService 骨架
- homeService 接入（已落地）：homeService.js 已存在，home.js 已接入 getHomeViewModel，V2 不重复建设
- stats.js legacy 方法迁移（前提不成立）：`calculateStatsWithStrategy` 和 `calculateDueCount` 仍在 `legacyLoadWeekData` 运行时路径中，需先审计再决策，不得按"清理死代码"执行
- 头像上传完整实现：Phase 7D 的 profile.js 头像上传已完成核心链路，V2 非优先
- 用户偏好设置：PRD 中 V2 长期目标，V2 阶段仅预留 user_settings 云集合
- 复杂多端冲突裁决：V1 已建立 conflictLogs，V2 暂不扩展完整裁决逻辑
- V3 能力（分享卡片、成就文案、个性化建议）：这些是 V3 目标，V2 阶段不做

### 为什么现在适合做这些

- V1 主链路已稳定，测试 511/511 通过，具备工程基础
- phase7-plan.md 已定义用户服务层重构路径，userService 已接入 profile.js
- shareService 是空白领域，V2 必须新建；其他目标均为已有能力的边界补强

### 为什么不适合做其他内容

- AI 能力牵涉 deepseekProxy 云函数、API Key 安全、prompt 工程，需单独评估产品价值
- stats.js legacy 方法有运行时调用，不能按死代码清理，需先审计
- 多端冲突裁决需要完整 operation 流水归并设计，超出 V1 已稳定域

---

## 2. V2 阶段边界

### 2.1 允许做的内容

- 新建 `services/shareService.js`，统一四主页面分享入口和文案
- 补充 `syncService` 单元测试（新建测试文件）
- app.js globalData 精简（移除 MyHabits / CheckinLogs 全局写入，四主页面统一走 service）
- V1 UI token 预防性检查：确保危险色和硬编码色不扩散
- 归档 phase6-plan.md 和 phase7-plan.md 的完成状态
- stats.js legacy 路径审计（见 V2A），基于审计结论再决定是否迁移

### 2.2 禁止做的内容

- 重写 V1 数据模型（userHabitId、policyVersion、dailyCheckinState 不可动）
- 重写打卡链路（checkinService 已稳定）
- 重写报表聚合（reportService 已稳定）
- 重写同步系统（syncService 已稳定）
- 重写登录体系（userService 已接入）
- 大规模修改 app.js（只做 globalData 精简，不做架构重构）
- 大规模修改 pages/（只做 shareService 接入，不做业务逻辑迁移）
- 修改 WXML / WXSS 布局和交互路径
- 引入 Redux / MobX / Zustand 等重型状态管理框架（在既有 EventBus 模式下 V2 不主动扩展）
- 页面层直接读写 storage
- 页面层直接调用云函数
- 前端保存或传递 openid
- 一次性删除 legacy 代码而无回滚策略
- 修改云函数逻辑（V2 不碰 cloudfunctions）
- 假设 stats.js legacy 方法无运行时入口而直接迁移（必须先审计）

### 2.3 明确延后到 V3 / 后续阶段的内容

- AI 复盘 / AI 建议能力（deepseekProxy 接入）
- 个性化修习建议
- 分享卡片 / 成就文案生成
- 完整用户偏好设置（user_settings 云集合）
- 完整多端冲突裁决 UI
- 完整低可信日期用户确认交互
- 历史报表快照持久化（年度、月度统计快照）
- 单用户万条以上历史明细的断点续传
- stats.js legacy 方法正式迁移（需 V2A 审计确认有安全迁移路径后再评估）

---

## 3. 当前 V1 基线判断（HEAD 5492e70）

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
- **注意**：`legacyLoadWeekData` 仍通过 myHabits 参数接收数据（有调用方），`calculateStatsWithStrategy` 和 `calculateDueCount` 仍在 legacy 路径中被调用，V2A 需先审计再决策

### 登录 / 用户资料

- **已完成**：userService 收敛登录逻辑，openid 安全边界
- **已完成**：profile.js 接入 getProfileViewModel
- **已完成**：Phase 7D 头像上传核心链路

### 头像 / 昵称

- **已完成**：userService.saveUserInfo 支持头像和昵称
- **已完成**：云函数 getUserProfile / saveUserProfile 接入

### 首页视图模型

- **已完成**：homeService.js 已存在，`getHomeViewModel()` 已导出
- **已完成**：home.js 已接入 `homeService.getHomeViewModel()`
- V2 不重复建设 homeService

### 测试状态

- **通过**：511 测试全部通过（39 suites）
- **覆盖**：reportService、checkinService、habitService、storageService、timeService、userService
- **未覆盖**：syncService 单元测试（需 V2E 补充）

### UI token 状态

- **无残留**：`#e64340` 全局搜索无结果，危险色已收敛
- V2D 以预防为主，确保不扩散

### shareService 状态

- **空白**：utils/share.js 存在但分散在页面中，无统一 services/shareService.js
- V2C 需新建 services/shareService.js

---

## 4. V2 推荐拆分

### V2A：stats.js legacy 路径审计

**阶段目标**：审计 stats.js 中所有 legacy 方法的真实调用关系，基于审计结论制定安全迁移或保留策略

**允许修改文件**：
- `miniprogram/pages/stats/stats.js`（审计用，代码不变动）
- `docs/v2/v2-plan.md`（更新审计结论和后续建议）

**禁止修改文件**：
- 任何云函数、WXML、WXSS、service、测试文件

**具体实施步骤**：
1. 完整梳理 stats.js 中所有 legacy 方法（`legacyLoadWeekData`、`legacyLoadMonthData`、`legacyLoadYearData`、`mergeWithDeletedHabits`、`calculateDueCount`、`calculateStatsWithStrategy`）的调用关系
2. 确认哪些是 V1 主路径（`loadWeekData / loadMonthData / loadYearData`），哪些是 legacy 回退路径
3. 确认 `calculateStatsWithStrategy` 和 `calculateDueCount` 是否有 V1 主路径调用，还是只在 legacy 路径中被调用
4. 输出审计结论：每个 legacy 方法的调用方、是否仍在使用、是否可安全移除或需迁移到 service
5. 基于审计结论，更新 v2-plan.md 中的 V2A 后续行动（可能是"保留观察"而非"迁移"）

**测试方式**：
- 静态分析 + 代码审查
- 不修改任何代码，只输出审计文档

**回滚方案**：
- 不修改代码，无回滚需求

**验收标准**：
- 审计报告包含所有 legacy 方法的调用关系图
- 审计结论明确每个方法"保留/迁移/删除"
- V2A 本身不产生代码改动，只产生文档更新

**风险点**：
- 零风险：纯审计，不改代码

**审计结论后续行动（待审计后填入）**：
- [ ] 若 `calculateStatsWithStrategy` 只在 legacy 路径中被调用，则标记为"仅 legacy 调用，V2 不迁移，V3 再处理"
- [ ] 若有其他 legacy 方法需要迁移，在审计报告中明确目标 service
- [ ] 审计结论填入本文档 V2A 执行结果章节

---

### V2B：shareService 新建与规范化

**阶段目标**：建立 services/shareService.js，四主页面分享入口统一由 service 管理

**允许修改文件**：
- `miniprogram/services/shareService.js`（新建）
- `miniprogram/pages/home/home.js`（接入 shareService）
- `miniprogram/pages/habits/habits.js`（接入 shareService）
- `miniprogram/pages/stats/stats.js`（接入 shareService）
- `miniprogram/pages/profile/profile.js`（已有 share.enableShareMenu 调用，统一到 shareService）

**禁止修改文件**：
- 任何 WXML / WXSS 布局和交互
- 任何云函数
- reportService / checkinService / habitService / syncService / userService / storageService / cloudService

**具体实施步骤**：
1. 分析四个主页面当前的分享入口实现（`onShareAppMessage`、`onShareTimeline`、左上角菜单）
2. 创建 `services/shareService.js`，提供：
   - `enableShareMenu()`：封装 `wx.showShareMenu`
   - `getShareMessage(page)`：返回各页面标准分享文案（按 PRD 安静陪伴式语气，不携带隐私）
   - `getShareImage(page)`：返回分享封面图路径
3. 各页面接入：优先在 onShow 中调用 `shareService.enableShareMenu()`
4. 检查分享文案不包含 openid、昵称、头像、打卡明细

**测试方式**：
- 手工验证四页面分享菜单和分享卡片
- 回归测试通过

**回滚方案**：
- revert shareService 接入，各页面恢复原有 share.js 调用

**验收标准**：
- services/shareService.js 存在且导出 `enableShareMenu` 和 `getShareMessage`
- 四主页面分享入口统一由 shareService 管理
- 分享文案不包含 openid、昵称、头像、打卡明细
- 511 测试全通过

**风险点**：
- 低风险：shareService 是独立 service，不影响打卡和报表主链路

---

### V2C：syncService 单元测试补齐

**阶段目标**：为 syncService 编写单元测试，确保同步逻辑可测试、可回归

**允许修改文件**：
- `__tests__/unit/services/syncService.test.js`（新建）
- `miniprogram/services/syncService.js`（如需拆分内部逻辑以提高可测试性，需保持接口契约不变）

**禁止修改文件**：
- 云函数
- 页面层
- WXML / WXSS

**具体实施步骤**：
1. 分析 syncService 现有导出函数
2. 编写覆盖以下场景的单元测试：
   - `push` / `pushWithDedup` / `hasDuplicatePending` 队列操作
   - `processQueue` 的 happy path（模拟 cloudService 成功返回）
   - `retry` 成功 / 失败
   - `recoverOrSync` 网络恢复
   - `needsLocalRecovery` 判断
3. 使用 Jest mock 模拟 cloudService 和 storageService

**测试方式**：
- `npm test -- __tests__/unit/services/syncService.test.js`
- 全部新测试通过

**回滚方案**：
- 删除测试文件 revert

**验收标准**：
- syncService 覆盖率显著提升（有可量化的覆盖率报告）
- 新增测试全部通过
- 511 总测试全通过

**风险点**：
- 低风险：纯新增测试文件

---

### V2D：app.js globalData 精简

**阶段目标**：app.js globalData 中 MyHabits / CheckinLogs 已无页面直接依赖（stats.js 已清理），进一步移除不必要的全局状态写入

**允许修改文件**：
- `miniprogram/app.js`（精简 globalData）
- `miniprogram/pages/stats/stats.js`（确认不再依赖 app.globalData.MyHabits / CheckinLogs）

**禁止修改文件**：
- home.js / habits.js / profile.js（WXML / WXSS 布局不变）
- 任何云函数
- 任何 WXML / WXSS

**具体实施步骤**：
1. 确认 stats.js 中 `loadRealData` 不再写入 `app.globalData.MyHabits / CheckinLogs`（已由 commit 998cca5 完成）
2. 确认四主页面中无其他代码直接依赖 `app.globalData.MyHabits / CheckinLogs`
3. 全局搜索 `app\.globalData\.(MyHabits|CheckinLogs|AllHabitsInfo)` 确认无运行时依赖
4. app.js globalData 中清理相关字段（保留 `fontsLoaded`、`DEBUG_DAY_OFFSET` 等必要字段）

**测试方式**：
- 全局静态搜索确认无新增依赖
- 回归测试通过

**回滚方案**：
- revert app.js 变更即可恢复

**验收标准**：
- `app.globalData` 中 MyHabits / CheckinLogs / CheckinLogs 相关写入已清除
- 四主页面功能无回归
- 511 测试全通过

**风险点**：
- 低风险：静态搜索确认无依赖后再修改

---

### V2E：UI token 预防性检查

**阶段目标**：确保危险色和硬编码色不扩散，当前已无 `#e64340` 残留，以预防为主

**允许修改文件**：
- `miniprogram/app.wxss`（design token 注释补充）
- 涉及危险色使用的 WXSS（如 confirm-dialog 等组件，若有新增危险色使用需引导到 token）

**禁止修改文件**：
- 任何 WXML 布局文件
- 任何业务逻辑页面
- 任何云函数

**具体实施步骤**：
1. 全局搜索 `#e64340`：`rg -n "#e64340" miniprogram/`（当前无结果，验证）
2. 全局搜索危险色使用模式：`rg -n "color:\s*#[EF]" miniprogram/` 检查是否引入了新的非 token 危险色
3. app.wxss 中补充 design token 注释，明确 `--color-danger` 和 `#F0655B` 的使用场景
4. 确认 custom-tab-bar 中无残留旧色

**测试方式**：
- 静态搜索
- 手工验证删除确认、危险操作按钮颜色（如有页面修改）

**回滚方案**：
- revert 色值变更即可

**验收标准**：
- 全局搜索 `#e64340` 无结果
- 危险色使用统一到 token
- 511 测试全通过

**风险点**：
- 极低风险：纯视觉预防，不改变现有代码

---

## 5. 文件修改清单

### 新增文件

| 文件 | 所属阶段 | 说明 |
|------|---------|------|
| `__tests__/unit/services/syncService.test.js` | V2C | syncService 单元测试 |
| `miniprogram/services/shareService.js` | V2B | 统一分享入口和文案 |

### 修改文件

| 文件 | 阶段 | 修改内容 |
|------|------|---------|
| `miniprogram/app.js` | V2D | globalData 精简，移除 MyHabits/CheckinLogs 写入 |
| `miniprogram/pages/home/home.js` | V2B | 接入 shareService |
| `miniprogram/pages/habits/habits.js` | V2B | 接入 shareService |
| `miniprogram/pages/stats/stats.js` | V2B | 接入 shareService |
| `miniprogram/pages/profile/profile.js` | V2B | 统一到 shareService |
| `miniprogram/app.wxss` | V2E | design token 注释补充 |

### 不允许修改的文件

- 所有云函数（cloudfunctions/）
- 所有 WXML 文件
- reportService.js、checkinService.js、habitService.js、userService.js、storageService.js、cloudService.js、timeService.js、syncService.js（现有接口契约不变）、homeService.js
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
7. **前端禁止传递 openid 的约束**：V2 继续遵守，shareService 不得传递 openid

---

## 8. UI 边界

1. **是否修改 WXML**：否
2. **是否修改 WXSS**：仅限 V2E 的预防性 token 注释补充，不改变布局和交互
3. **是否修改 UI 风格**：否
4. **是否影响四主页面信息架构**：否，V2B shareService 接入只改变分享数据来源，不改变展示结构
5. **是否需要视觉验收**：V2E 需要手工验证危险色使用规范，其他阶段不需要

---

## 9. 测试策略

1. **service 单元测试**：补充 syncService 单元测试（V2C）
2. **页面轻量测试**：V2B / V2D 任何修改后确保 511 测试全通过
3. **同步测试**：syncService 单元测试覆盖 pending / retry / recoverOrSync / needsLocalRecovery（V2C）
4. **报表回归测试**：V2 不修改 reportService，现有测试继续通过
5. **登录 / 用户资料回归测试**：V2 不修改 userService，现有测试继续通过
6. **AI 降级测试**：不适用，V2 不涉及 AI

---

## 10. 执行顺序

### 建议执行顺序

**V2A（审计）→ V2B（shareService）→ V2C（syncService 测试）→ V2D（app.js 精简）→ V2E（UI token 预防）**

理由：
- **V2A 最先**：纯审计不产生代码，确保后续执行不被未知 legacy 调用阻断
- **V2B 其次**：shareService 新建不影响其他逻辑，建完后可被各页面引用
- **V2C 其次**：syncService 单元测试是纯测试补充，不影响业务逻辑，提供回归安全网
- **V2D 第四**：app.js globalData 精简在确认无页面依赖后进行
- **V2E 最后**：纯预防性检查，不需要特殊前提

### 每一步为什么安全

- **V2A**：纯审计，不改代码，无回滚需求
- **V2B**：shareService 新建为独立文件，各页面逐步接入，单页面 revert 不影响其他
- **V2C**：纯新增测试文件，不改变任何业务逻辑，revert 即删除
- **V2D**：globalData 精简以静态搜索确认无依赖为前提，revert 即恢复
- **V2E**：纯视觉预防，不改变现有代码，revert 成本极低

---

## 11. 验收标准

### V2 总体验收标准

- 所有 V2 阶段完成，且每个子阶段单独通过验收
- 511 测试全通过
- 无新增 WXML / WXSS 布局和交互变更
- 无新增云函数修改
- V2 提交历史可追溯，每个子阶段单独 commit

### V2A 验收标准

- 审计报告包含所有 legacy 方法的调用关系
- 审计结论明确每个方法的"保留/迁移/删除"决策
- V2A 本身不产生功能代码变更，只产生文档更新

### V2B 验收标准

- services/shareService.js 存在且导出 `enableShareMenu` 和 `getShareMessage`
- 四主页面分享入口统一由 shareService 管理
- 分享文案不包含 openid、昵称、头像、打卡明细
- 511 测试全通过

### V2C 验收标准

- syncService 单元测试新增，覆盖 pending / retry / recoverOrSync / needsLocalRecovery
- 新增测试全部通过
- 511 总测试全通过

### V2D 验收标准

- app.globalData 中 MyHabits / CheckinLogs 相关写入已清除
- 四主页面功能无回归
- 511 测试全通过

### V2E 验收标准

- 全局搜索 `#e64340` 无结果
- 危险色使用统一到 token
- 511 测试全通过

---

## 12. 给 Claude Code / Minimax 的执行规则

1. **每次只执行一个子阶段**：V2A 完成并验收后，才可开始 V2B
2. **每个子阶段单独提交**：每个 V2X 完成验收后单独 commit，不得合并多个 V2X 到一个 commit
3. **每个子阶段完成后必须等待人工验收**：不得跳过人工验收进入下一阶段
4. **不得跨阶段实施**：V2B 的代码改动不得包含 V2C 的内容
5. **不得顺手重构无关文件**：执行 V2B 时只改 shareService 相关文件，不得顺手修改 home.js 或其他文件
6. **不得修改 UI**：除非该子阶段明确允许（V2E 允许 token 注释补充），不得修改 WXML / WXSS 布局
7. **不得绕过 service 层**：所有业务逻辑走 service，不得在页面层直接实现
8. **V2 不主动扩展 EventBus**：V2 不引入新的 EventBus 监听，但既有的 EventBus 模式（AGENTS.md 已定义）保持不变
9. **不得保存或传递 openid**：shareService 不得包含 openid 传递逻辑
10. **V2 禁止修改云函数**：不得修改 cloudfunctions/ 下任何文件
11. **V2A 审计结果必须更新文档**：审计完成后必须将结论填入 V2-plan.md 的 V2A 章节，再决定后续行动

---

## 附录：V2 执行后更新（由各阶段完成后填写）

### V2A 审计结论

（审计完成后填入）

### V2B 执行结果

（完成后填入 commit ID 和验收结果）

### V2C 执行结果

（完成后填入 commit ID 和验收结果）

### V2D 执行结果

（完成后填入 commit ID 和验收结果）

### V2E 执行结果

（完成后填入 commit ID 和验收结果）

---

## 附录：V1 已具备能力 vs V2 计划

| 能力域 | V1 状态 | V2 计划 |
|--------|---------|---------|
| 数据模型 | V1 完成 | V2 不动 |
| 打卡链路 | V1 完成 | V2 不动 |
| 报表聚合 | V1 完成 | V2 不动 |
| 同步系统 | V1 完成 | V2 补充测试（V2C） |
| 登录/用户资料 | V1 完成 | V2 不动 |
| shareService | 空白（utils/share.js 分散） | V2B 新建 services/shareService.js |
| homeService | 已落地 | V2 不重复建设 |
| stats.js legacy 方法 | 有运行时调用 | V2A 审计后再决策（不按死代码清理） |
| 危险色 token | 已收敛（无 #e64340 残留） | V2E 预防性检查 |
| app.js globalData | 有残留 MyHabits/CheckinLogs 写入 | V2D 精简清理 |
| AI 能力 | 骨架预留 | 延后 V3 |
| 多端冲突裁决 | 骨架预留 | 延后 V3 |
| 用户偏好设置 | 未开始 | 延后 V3 |