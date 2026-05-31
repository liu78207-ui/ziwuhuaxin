# V2 实施方案

> 基础：子午花信小程序 V1 工程治理收口阶段（commit e5e33ae）
> 测试基线：39 suites / 511 tests 全部通过
> 定位：V2 是 V1 重构完成后的工程治理收口，不是产品功能大版本。V2 不扩展产品功能，不重写主链路，不引入复杂架构。V2 目标是在 V1 稳定的 data/sync/report 基础上，完成遗留的工程债务清理和 service 层边界收口。

---

## 0. 当前代码基线核对（执行前必读）

以下所有判断基于 HEAD `e5e33ae`，执行前必须以当前最新代码状态重新核对。

### 0.1 git HEAD 与测试状态

- **当前 HEAD**：`e5e33ae`（docs: 修订 V2 方案，修复审查指出的 4 个阻断问题）
- **测试通过情况**：`npm test -- --runInBand` → 39 suites / 511 tests / 0 failed
- **代码覆盖率**：statements 89.51% / branches 76.58% / functions 97.5% / lines 93.63%

### 0.2 已存在 service 清单

| service | 路径 | 状态 |
|---------|------|------|
| timeService | services/timeService.js | 完整，V1 交付 |
| storageService | services/storageService.js | 完整，V1 交付 |
| cloudService | services/cloudService.js | 完整，V1 交付 |
| habitService | services/habitService.js | 完整，V1 交付 |
| checkinService | services/checkinService.js | 完整，V1 交付 |
| reportService | services/reportService.js | 完整，V1 交付 |
| reportAggregator | services/reportAggregator.js | 完整，V1 交付 |
| syncService | services/syncService.js | 完整，V1 交付 |
| userService | services/userService.js | 完整，Phase 7 交付 |
| homeService | services/homeService.js | 完整，V1 交付 |
| aiService | services/aiService.js | 骨架预留，未接入 |

### 0.3 homeService 当前状态

- `miniprogram/services/homeService.js` **已存在**（确认）
- `getHomeViewModel()` 函数已导出（确认）
- `miniprogram/pages/home/home.js` 已引用 `homeService`，`loadViewModel` 调用 `homeService.getHomeViewModel()`（确认）
- **V2 不新建 homeService**，V2B 改为"homeService 边界审计与补强"

### 0.4 stats.js legacy 方法调用情况

以下为静态分析结论，**执行 V2A 时必须重新核对当前代码**：

| 方法名 | 是否在运行时路径中 | 调用方 |
|--------|-----------------|--------|
| `legacyLoadWeekData(myHabits)` | **有调用方**（loadWeekData 内部） | loadWeekData 调用 |
| `legacyLoadMonthData(myHabits)` | **有调用方**（loadMonthData 内部） | loadMonthData 调用 |
| `legacyLoadYearData(myHabits)` | **有调用方**（loadYearData 内部） | loadYearData 调用 |
| `calculateStatsWithStrategy(habitMatrix, myHabits, weekDates)` | **有调用方** | legacyLoadWeekData 内部调用（stats.js:581） |
| `calculateDueCount(...)` | **有调用方** | calculateStatsWithStrategy 内部调用（stats.js:1481） |
| `mergeWithDeletedHabits(myHabits)` | **有调用方** | loadRealData 调用（已由 commit 998cca5 移除，方法仍存于 stats.js） |

**重要**：V2A 执行前必须重新 grep 确认当前调用关系，以上为基于摘要的推断，可能有遗漏。

### 0.5 页面层违规残留检查

- `rg -n "wx\.getStorageSync\|wx\.setStorageSync\|wx\.cloud\.callFunction" miniprogram/pages/` 应在 stats.js legacy 区域外无新增
- stats.js 中 `loadRealData` 已移除对 MyHabits / CheckinLogs 的直接读取（commit 998cca5）
- home.js、habits.js、stats.js、profile.js 应均已通过 service 访问数据

### 0.6 shareService 当前状态

- `miniprogram/utils/share.js` **已存在**（分散在各页面直接调用）
- `miniprogram/services/shareService.js` **不存在**（空白）
- V2B（shareService 新建）是正确的实施项

### 0.7 UI token / #e64340 当前状态

- `rg -n "#e64340" miniprogram/` → **无结果**（已收敛）
- 危险色使用 `--color-danger` 或 `#F0655B` 已在多处确认

### 0.8 syncService 测试当前状态

- `__tests__/unit/services/syncService.test.js` **不存在**（空白）
- syncService 已有导出函数但无独立测试文件
- V2C（syncService 单测新建）是正确的实施项

---

## 1. V2 总体结论

### 1.1 V2 定位

V2 是 V1 重构完成后的**工程治理收口阶段**，不是产品功能大版本。V2 目标：

1. 解决 V1 遗留的工程债务（shareService 空白、syncService 无测试、app.js globalData 残留）
2. 完成 stats.js legacy 方法的审计，明确哪些可以清理、哪些需要保留
3. 确保 V1 主链路稳定的基础上做最小化边界修复

**V2 不做**：
- 不扩展产品功能（AI、分享卡片、成就文案等是 V3）
- 不重写数据模型、打卡链路、报表聚合、同步系统
- 不引入复杂架构
- 不做 UI 重构

### 1.2 V2 建议目标

1. **V2A：stats.js legacy 路径审计**：明确调用关系，制定安全清理或迁移策略
2. **V2B：homeService 边界审计与补强**：确认 homeService 已正确接入，边界清晰
3. **V2C：shareService 新建与规范化**：建立统一的分享 service
4. **V2D：syncService 单元测试补齐**：补充 syncService 可测试性
5. **V2E：app.js globalData 精简**：移除已无页面依赖的全局状态
6. **V2F：UI token 预防性检查**：确保危险色不扩散

### 1.3 V2 禁止目标

- 重写 V1 数据模型、打卡链路、报表聚合、同步系统、登录体系
- 大规模修改 app.js / pages/
- 修改 WXML / WXSS 布局和交互路径
- 引入重型状态管理框架（Redux / MobX / Zustand）；V2 不主动扩展 EventBus，既有的 Service + EventBus 模式不变
- 修改云函数
- 假设 stats.js legacy 方法无运行时入口而直接删除（必须先审计）
- 前端保存或传递 openid

### 1.4 V2 与 V1 PRD 的关系

V2 是工程治理收口，不影响 V1 PRD 定义的产品边界。V1 PRD 中定义的数据模型、打卡闭环、报表口径、恢复策略在 V2 阶段保持不变。V2 如需补充 v2-product-boundary 文档，仅当 V2 产生新的产品决策时（例如 shareService 分享文案规范），才需要补充说明；V2 本身不扩展产品功能，不需要完整 PRD。

---

## 2. V2 阶段边界

### 2.1 允许做的内容

- 新建 `services/shareService.js`
- 补充 `syncService` 单元测试
- app.js globalData 精简
- V1 UI token 预防性检查
- stats.js legacy 路径审计（纯审计，基于结论再决定后续行动）
- homeService 边界审计（确认接入正确性，不做大幅重构）

### 2.2 禁止做的内容

- 重写 V1 数据模型（userHabitId、policyVersion、dailyCheckinState 不可动）
- 重写打卡链路（checkinService 已稳定）
- 重写报表聚合（reportService 已稳定）
- 重写同步系统（syncService 已稳定）
- 重写登录体系（userService 已接入）
- 大规模修改 app.js / pages/
- 修改 WXML / WXSS 布局和交互路径
- 引入 Redux / MobX / Zustand 等重型状态管理框架；V2 不主动扩展 EventBus，既有的 Service + EventBus 模式不变（AGENTS.md 已定义）
- 页面层直接读写 storage
- 页面层直接调用云函数
- 前端保存或传递 openid
- 假设 stats.js legacy 方法无运行时入口而直接删除
- 修改云函数逻辑（V2 不碰 cloudfunctions）

### 2.3 延后到 V3 的内容

- AI 复盘 / AI 建议能力
- 个性化修习建议
- 分享卡片 / 成就文案生成
- 完整用户偏好设置
- 完整多端冲突裁决 UI
- 历史报表快照持久化
- stats.js legacy 方法正式迁移（需 V2A 审计确认安全路径后单独立项）

---

## 3. V2 推荐拆分（子阶段详解）

每个子阶段必须完整包含以下字段，不得遗漏。

---

### V2A：stats.js legacy 路径审计与安全迁移评估

**当前事实**：
- `legacyLoadWeekData(myHabits)` 在 `loadWeekData` 中被调用
- `calculateStatsWithStrategy` 在 `legacyLoadWeekData` 中被调用
- `calculateDueCount` 在 `calculateStatsWithStrategy` 中被调用
- `mergeWithDeletedHabits` 在 `loadRealData` 中曾被调用（commit 998cca5 已移除调用），方法体仍存于 stats.js

**阶段目标**：完整梳理 stats.js 所有 legacy 方法的调用关系，输出审计结论，明确每个方法"保留 / 迁移 / 删除"决策

**允许修改文件**：
- `miniprogram/pages/stats/stats.js`（代码不变动，用于 grep/阅读）
- `docs/v2/v2-plan.md`（更新 V2A 审计结论章节）

**禁止修改文件**：
- 任何云函数、WXML、WXSS、service、测试文件、业务逻辑文件

**实施步骤**：
1. `rg -n "legacyLoadWeekData|legacyLoadMonthData|legacyLoadYearData|calculateStatsWithStrategy|calculateDueCount|mergeWithDeletedHabits" miniprogram/pages/stats/stats.js` 完整梳理所有出现位置
2. 确认每个方法的：
   - 定义位置（行号）
   - 调用方（内部调用 + 外部调用）
   - 是 V1 主路径还是 legacy 回退路径
   - 是否可安全移除（无任何调用方）
   - 是否需要迁移到 service（如果仍被使用但应该废弃）
3. 输出调用关系图（文本格式）
4. 给出审计结论：每个方法的决策（保留 / 迁移 / 删除）
5. 将审计结论填入本文档 V2A 章节的"审计结论"部分

**验收标准**：
- 审计报告包含所有 legacy 方法的调用关系
- 审计结论明确每个方法"保留 / 迁移 / 删除"
- V2A 本身不产生功能代码变更，只产生文档更新

**测试方式**：静态分析 + 代码审查，不执行任何测试套件（无代码变更）

**回滚策略**：不修改代码，无回滚需求

**风险点**：零风险（纯审计）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

### V2B：homeService 边界审计与补强

**当前事实**：
- `homeService.js` 已存在，`getHomeViewModel()` 已导出
- `home.js` 已调用 `homeService.getHomeViewModel()`
- 但需确认 homeService 边界是否清晰：是否承担了不该承担的逻辑，是否有遗漏的页面层直接调用

**阶段目标**：确认 homeService 接入正确，边界清晰，无页面层违规调用

**允许修改文件**：
- `miniprogram/services/homeService.js`（如需补强边界，确保接口契约不变）
- `miniprogram/pages/home/home.js`（如需补强接入，确保不改变 UI）
- `docs/v2/v2-plan.md`（更新 V2B 执行结论）

**禁止修改文件**：
- home.wxml / home.wxss
- 任何云函数
- checkinService / habitService / storageService / reportService / syncService / userService / cloudService

**实施步骤**：
1. 确认 homeService 导出函数列表：哪些是已有函数，哪些是应补充函数
2. `rg -n "homeService\." miniprogram/pages/home/home.js` 确认调用路径正确
3. 确认 home.js 不直接调用 `wx.getStorageSync` / `wx.cloud.callFunction`（静态搜索）
4. 确认 homeService 不直接调用云函数（只通过 cloudService 间接调用）
5. 如有边界不清晰处，在 homeService.js 中补充 JSDoc 和注释
6. 如有页面层违规调用，修复为通过 homeService

**验收标准**：
- home.js 不直接读取业务缓存和云函数
- homeService 接口契约清晰，有 JSDoc
- 511 测试全通过

**测试方式**：
- `npm test -- --runInBand` 确保无回归
- 静态搜索确认无页面层违规

**回滚策略**：revert homeService.js 或 home.js 变更

**风险点**：低风险（边界补强不改变主逻辑）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否（仅边界补强，不改变缓存读写）

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

### V2C：shareService 新建与规范化

**当前事实**：
- `miniprogram/utils/share.js` 存在但分散在页面中
- `miniprogram/services/shareService.js` 不存在（空白）
- 四主页面分享入口不统一

**阶段目标**：建立 `services/shareService.js`，四主页面分享入口和文案统一由 service 管理

**允许修改文件**：
- `miniprogram/services/shareService.js`（新建）
- `miniprogram/pages/home/home.js`（接入 shareService）
- `miniprogram/pages/habits/habits.js`（接入 shareService）
- `miniprogram/pages/stats/stats.js`（接入 shareService）
- `miniprogram/pages/profile/profile.js`（统一到 shareService）

**禁止修改文件**：
- 任何 WXML / WXSS 布局和交互
- 任何云函数
- reportService / checkinService / habitService / syncService / userService / storageService / cloudService / homeService

**实施步骤**：
1. 分析四个主页面当前的分享入口实现（onShareAppMessage、onShareTimeline、左上角菜单）
2. 创建 `services/shareService.js`，导出：
   - `enableShareMenu()`：封装 `wx.showShareMenu`
   - `getShareMessage(page)`：返回各页面标准分享文案（安静陪伴式语气，不携带隐私）
   - `getShareImage(page)`：返回分享封面图路径
3. 各页面接入：onShow 中调用 `shareService.enableShareMenu()`，onShareAppMessage 返回 `shareService.getShareMessage(currentPage)`
4. 检查分享文案不包含 openid、昵称、头像、打卡明细
5. utils/share.js 保留还是废弃需审计后决定（不影响 shareService 新建）

**验收标准**：
- services/shareService.js 存在且导出 `enableShareMenu` 和 `getShareMessage`
- 四主页面分享入口统一由 shareService 管理
- 分享文案不包含 openid、昵称、头像、打卡明细
- 511 测试全通过

**测试方式**：
- 手工验证四页面分享菜单和分享卡片
- `npm test -- --runInBand`

**回滚策略**：revert shareService 接入，各页面恢复原有 share.js 调用

**风险点**：低风险（独立 service，不影响打卡和报表主链路）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否（新增 service，不影响现有缓存逻辑）

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

### V2D：syncService 单元测试补齐

**当前事实**：
- syncService.js 已存在并导出所有函数
- `__tests__/unit/services/syncService.test.js` 不存在（空白）
- syncService 无独立测试文件

**阶段目标**：为 syncService 编写单元测试，确保同步逻辑可测试、可回归

**允许修改文件**：
- `__tests__/unit/services/syncService.test.js`（新建）
- `miniprogram/services/syncService.js`（如需拆分内部逻辑以提高可测试性，需保持接口契约不变）

**禁止修改文件**：
- 云函数
- 页面层
- WXML / WXSS

**实施步骤**：
1. 分析 syncService 现有导出函数列表
2. 编写覆盖以下场景的单元测试：
   - `push` / `pushWithDedup` / `hasDuplicatePending` 队列操作
   - `processQueue` 的 happy path（mock cloudService 成功返回）
   - `retry` 成功 / 失败
   - `recoverOrSync` 网络恢复
   - `needsLocalRecovery` 判断
3. 使用 Jest mock 模拟 cloudService 和 storageService
4. 确保测试可独立运行，不依赖外部状态

**验收标准**：
- syncService 覆盖率显著提升（有覆盖率报告）
- 新增测试全部通过
- 511 总测试全通过

**测试方式**：
- `npm test -- __tests__/unit/services/syncService.test.js`
- `npm test -- --runInBand` 全量回归

**回滚策略**：删除测试文件 revert

**风险点**：低风险（纯新增测试文件）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

### V2E：app.js globalData 精简

**当前事实**：
- app.js globalData 仍包含 MyHabits / CheckinLogs 字段
- stats.js loadRealData 已不再写入 app.globalData（commit 998cca5）
- 需确认四主页面无其他代码直接依赖这些全局字段

**阶段目标**：移除 app.js globalData 中已无页面依赖的 MyHabits / CheckinLogs 全局状态写入

**允许修改文件**：
- `miniprogram/app.js`（精简 globalData）
- `miniprogram/pages/stats/stats.js`（确认不再依赖 app.globalData.MyHabits / CheckinLogs）

**禁止修改文件**：
- home.js / habits.js / profile.js
- 任何云函数
- 任何 WXML / WXSS

**实施步骤**：
1. 全局搜索 `app\.globalData\.(MyHabits|CheckinLogs|AllHabitsInfo)` 确认所有直接引用位置
2. 确认 stats.js 中 loadRealData 已不再写入 app.globalData（已由 commit 998cca5 完成）
3. 确认无其他页面直接依赖 app.globalData 中的这些字段
4. 如确认无依赖，从 app.js globalData 中移除这些字段
5. 如仍有依赖，先修复依赖再移除

**验收标准**：
- app.globalData 中 MyHabits / CheckinLogs 相关写入已清除
- 四主页面功能无回归
- 511 测试全通过

**测试方式**：
- 全局静态搜索确认无新增依赖
- `npm test -- --runInBand`

**回滚策略**：revert app.js 变更即可恢复

**风险点**：低风险（静态搜索确认无依赖后再修改）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否（移除的是 globalData 写入，不影响 storageService）

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

### V2F：UI token 预防性检查

**当前事实**：
- `#e64340` 全局搜索无结果（已收敛）
- `--color-danger` 和 `#F0655B` 已在多处使用
- custom-tab-bar 已统一主题色

**阶段目标**：确保危险色和硬编码色不扩散，以预防为主

**允许修改文件**：
- `miniprogram/app.wxss`（design token 注释补充）
- 涉及危险色使用的 WXSS（如 confirm-dialog 等组件，若有新增危险色使用需引导到 token）

**禁止修改文件**：
- 任何 WXML 布局文件
- 任何业务逻辑页面
- 任何云函数

**实施步骤**：
1. `rg -n "#e64340" miniprogram/` 验证无残留（当前无结果，保持）
2. `rg -n "color:\s*#[EF]" miniprogram/` 检查是否引入新的非 token 危险色
3. app.wxss 补充 design token 注释，明确 `--color-danger` 和 `#F0655B` 使用场景
4. 确认 custom-tab-bar 无残留旧色

**验收标准**：
- 全局搜索 `#e64340` 无结果
- 危险色使用统一到 token
- 511 测试全通过

**测试方式**：静态搜索，无代码变更则无测试影响

**回滚策略**：revert 色值变更即可

**风险点**：极低风险（纯视觉预防）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

## 4. 文件修改清单

### 新增文件

| 文件 | 所属阶段 | 说明 |
|------|---------|------|
| `__tests__/unit/services/syncService.test.js` | V2D | syncService 单元测试 |
| `miniprogram/services/shareService.js` | V2C | 统一分享入口和文案 |

### 修改文件

| 文件 | 阶段 | 修改内容 |
|------|------|---------|
| `miniprogram/pages/home/home.js` | V2B | 边界补强（确认无页面层违规） |
| `miniprogram/pages/home/home.js` | V2C | 接入 shareService |
| `miniprogram/pages/habits/habits.js` | V2C | 接入 shareService |
| `miniprogram/pages/stats/stats.js` | V2C | 接入 shareService |
| `miniprogram/pages/profile/profile.js` | V2C | 统一到 shareService |
| `miniprogram/app.js` | V2E | globalData 精简，移除 MyHabits/CheckinLogs 写入 |
| `miniprogram/app.wxss` | V2F | design token 注释补充 |

### 不允许修改的文件

- 所有云函数（cloudfunctions/）
- 所有 WXML 文件
- reportService.js、checkinService.js、habitService.js、userService.js、storageService.js、cloudService.js、timeService.js、syncService.js（接口契约不变）、homeService.js（V2B 边界补强除外）

---

## 5. 数据与状态影响评估

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

## 6. 云函数与安全边界

1. **是否新增云函数**：否
2. **是否修改现有云函数**：否
3. **是否涉及 cloud.getWXContext()**：否
4. **是否涉及 openid**：否，V2 不涉及 openid 读取或传递
5. **是否涉及隐私数据**：否
6. **是否涉及 DeepSeek / AI API Key**：否
7. **前端禁止传递 openid 的约束**：V2 继续遵守，shareService 不得传递 openid

---

## 7. UI 边界

1. **是否修改 WXML**：否
2. **是否修改 WXSS**：仅限 V2F 的预防性 token 注释补充，不改变布局和交互
3. **是否修改 UI 风格**：否
4. **是否影响四主页面信息架构**：否
5. **是否需要视觉验收**：V2C（shareService 接入）需手工验证分享菜单和卡片；V2F 需手工验证危险色使用规范；其他阶段不需要

---

## 8. 测试策略

1. **service 单元测试**：补充 syncService 单元测试（V2D）
2. **页面轻量测试**：V2B / V2C / V2E 任何修改后确保 511 测试全通过
3. **同步测试**：syncService 单元测试覆盖 pending / retry / recoverOrSync / needsLocalRecovery（V2D）
4. **报表回归测试**：V2 不修改 reportService，现有测试继续通过
5. **登录/用户资料回归测试**：V2 不修改 userService，现有测试继续通过

---

## 9. 执行顺序

### 建议执行顺序

**V2A（审计）→ V2B（homeService 审计）→ V2C（shareService）→ V2D（syncService 单测）→ V2E（app.js 精简）→ V2F（UI token 预防）**

理由：
- **V2A 最先**：纯审计不产生代码，确保后续执行不被未知 legacy 调用阻断
- **V2B 其次**：homeService 已落地，边界审计可快速完成，不影响其他逻辑
- **V2C 其次**：shareService 新建不影响其他逻辑，建完后可被各页面引用
- **V2D 第四**：syncService 单元测试是纯测试补充，不影响业务逻辑，提供回归安全网
- **V2E 第五**：app.js globalData 精简以静态搜索确认无依赖为前提
- **V2F 最后**：纯预防性检查，不需要特殊前提

---

## 10. 给 Claude Code / Minimax 的执行规则

1. **每次只执行一个子阶段**：V2A 完成并验收后，才可开始 V2B；V2B 完成并验收后，才可开始 V2C
2. **每个子阶段单独提交**：每个 V2X 完成验收后单独 commit，不得合并多个 V2X 到一个 commit
3. **每个子阶段完成后必须等待人工验收**：不得跳过人工验收进入下一阶段
4. **不得跨阶段实施**：V2C 的代码改动不得包含 V2D 的内容
5. **不得顺手重构无关文件**：执行 V2B 时只补强 homeService 边界，不得顺手修改其他 service
6. **不得修改 UI**：不得修改 WXML / WXSS 布局；V2F 仅允许 token 注释补充
7. **不得绕过 service 层**：所有业务逻辑走 service
8. **V2 不主动扩展 EventBus**：V2 不引入新的 EventBus 监听，但既有的 Service + EventBus 模式（AGENTS.md 已定义）保持不变
9. **不得保存或传递 openid**：shareService 不得包含 openid 传递逻辑
10. **V2 禁止修改云函数**：不得修改 cloudfunctions/ 下任何文件
11. **V2A 审计结果必须更新文档**：审计完成后必须将结论填入本文档 V2A 章节"审计结论"部分，再决定后续行动

---

## 附录：V2A 审计结论（执行后填入）

（V2A 审计完成后填入，每个 legacy 方法的决策：保留 / 迁移 / 删除）

---

## 附录：V2 执行后更新（各阶段完成后填入）

### V2A 执行结果

commit: ___ | 验收结果: ___

### V2B 执行结果

commit: ___ | 验收结果: ___

### V2C 执行结果

commit: ___ | 验收结果: ___

### V2D 执行结果

commit: ___ | 验收结果: ___

### V2E 执行结果

commit: ___ | 验收结果: ___

### V2F 执行结果

commit: ___ | 验收结果: ___