# V2 实施方案（V1 收口治理计划）

> 基础：子午花信小程序 V1 工程治理收口阶段（当前核对基线：2026-06-11，HEAD af6127a，工作区存在未提交变更）
> 测试基线：54 suites / 606 tests 全部通过；cloud function deployment check passed
> 定位：本文档中的 V2 指“V1 收口治理计划”，不是 PRD 中的长期 V2 产品能力。本文档不扩展产品功能，不重写主链路，不引入复杂架构；目标是在 V1 已稳定的 data/sync/report 基础上，完成遗留工程债务登记、边界收口和可执行计划校准。

---

## 0. 当前代码基线核对（执行前必读）

以下判断基于 2026-06-11 当前工作区核对结果。由于仓库存在较多未提交变更，后续每次执行子阶段前必须重新跑静态检查和测试基线，不得继续引用旧 commit 的 39/511 基线。

### 0.1 git HEAD 与测试状态

- **当前 HEAD**：`af6127a`
- **工作区状态**：存在未提交代码、测试、云函数和文档变更；任何阶段执行前必须先确认当前 diff
- **测试通过情况**：`npm test -- --runInBand` → 54 suites / 606 tests / 0 failed
- **代码覆盖率**：statements 89.03% / branches 75.33% / functions 96.29% / lines 93.07%
- **云函数清单验证**：`npm run verify:cloudfunctions` → passed

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
| shareService | services/shareService.js | 已存在，V2C 交付；页面统一接入 |

### 0.3 homeService 当前状态

- `miniprogram/services/homeService.js` **已存在**（确认）
- `getHomeViewModel()` 函数已导出（确认）
- `miniprogram/pages/home/home.js` 已引用 `homeService`，`loadViewModel` 调用 `homeService.getHomeViewModel()`（确认）
- **V2 不新建 homeService**，V2B 改为"homeService 边界审计与补强"

### 0.4 stats.js legacy 方法调用情况

2026-06-11 静态搜索结果：

| 方法名 | 是否在运行时路径中 | 调用方 |
|--------|-----------------|--------|
| `legacyLoadWeekData(myHabits)` | 未发现 | 无 |
| `legacyLoadMonthData(myHabits)` | 未发现 | 无 |
| `legacyLoadYearData(myHabits)` | 未发现 | 无 |
| `calculateStatsWithStrategy(habitMatrix, myHabits, weekDates)` | 未发现 | 无 |
| `calculateDueCount(...)` | 未发现 | 无 |
| `mergeWithDeletedHabits(myHabits)` | 未发现 | 无 |

结论：V2A 原计划中的 stats.js legacy 方法审计已不再是待执行代码任务；保留为“已完成核对项”。后续只需要维持静态红线检查，防止页面层重新引入 storage/cloud/new Date/report 计算。

### 0.5 页面层违规残留检查

- `rg -n "wx\.getStorageSync|wx\.setStorageSync|wx\.removeStorageSync|wx\.cloud\.callFunction|new Date\(" miniprogram/pages miniprogram/app.js` 当前无页面层命中
- stats.js legacy 报表路径当前未发现
- home.js、habits.js、stats.js、profile.js 应继续通过 service 访问核心数据

### 0.6 shareService 当前状态

- `miniprogram/services/shareService.js` **已存在**
- `miniprogram/utils/share.js` **保留为 shareService 内部底层工具**
- home / habits / stats / profile 四主页面均已统一接入 shareService

### 0.7 UI token / #e64340 当前状态

- `rg -n "#e64340" miniprogram/` → **无结果**（已清零）
- `#F0655B` 和 `--c-red` 在部分组件中使用，是否统一到 `--color-danger` token 由 V2F 审计决定

### 0.8 syncService 测试当前状态

- `__tests__/unit/services/syncService.test.js` **已存在**
- 当前覆盖 recoverFromCloud、fallback、recoverOrSync、processQueue retrying 等场景
- V2D 从“新建测试”改为“维护并按风险补充测试”

---

## 1. V2 总体结论

### 1.1 V2 定位

V2 是 V1 重构完成后的**工程治理收口阶段**，不是产品功能大版本。V2 目标：

1. 解决 V1 遗留工程债务的登记和退出条件问题（app.js globalData、旧集合/旧云函数、utils/share.js）
2. 确认 stats.js legacy 报表路径已清理，并把静态红线纳入后续验收
3. 在 V1 主链路稳定的基础上做最小化边界修复，不把治理收口扩大成功能版本

**V2 不做**：
- 不扩展产品功能（AI、分享卡片、成就文案等属于后续版本或专题计划）
- 不重写数据模型、打卡链路、报表聚合、同步系统
- 不引入复杂架构
- 不做 UI 重构

### 1.2 V2 建议目标

1. **V2A：stats.js legacy 路径复核**：当前已无目标 legacy 方法，后续只保留静态红线检查
2. **V2B：homeService 边界维护**：确认 homeService 已正确接入，新增首页场景时补测试
3. **V2C：分享入口治理决策**：在新建 shareService 和冻结 utils/share.js 之间二选一，不扩大分享功能
4. **V2D：syncService 测试维护**：已有单测，后续按 pending/retry/recover 风险补充
5. **V2E：app.js globalData 审计与退出计划**：登记所有兼容读写点，评估是否可分阶段瘦身
6. **V2F：UI token 预防性检查**：确保危险色不扩散

### 1.3 V2 禁止目标

- 重写 V1 数据模型、打卡链路、报表聚合、同步系统、登录体系
- 大规模修改 app.js / pages/
- 修改 WXML / WXSS 布局和交互路径
- 引入重型状态管理框架（Redux / MobX / Zustand）；V2 不主动扩展 EventBus，既有的 Service + EventBus 模式不变
- 为治理目的新增或重写云函数；若修复 V1 验收风险必须改云函数，需同步更新云函数测试和治理文档
- 在未登记兼容入口前删除旧集合、旧云函数或 app.js legacy helper
- 前端保存或传递 openid

### 1.4 V2 与 V1 PRD 的关系

本文档中的 V2 是工程治理收口，不等同于 `prd-v1.md` 中提到的长期 V2 产品目标。V1 PRD 中定义的数据模型、打卡闭环、报表口径、恢复策略在本阶段保持不变。后续若启动 PRD 意义上的 V2 产品能力，必须另开产品边界和架构治理文档，不得直接复用本文档作为功能开发依据。

---

## 2. V2 阶段边界

### 2.1 允许做的内容

- 维护 `services/shareService.js`，`utils/share.js` 仅作为底层工具
- 维护 `syncService` 单元测试
- app.js globalData 审计（定位写入点，评估移除风险，暂不执行精简）
- V1 UI token 预防性检查
- stats.js 静态红线复核
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
- 未经静态复核就恢复或删除 stats.js 报表路径
- 为治理收口批量修改云函数逻辑；云函数只允许在修复明确 V1 验收风险时变更，且必须有测试覆盖

### 2.3 延后到 V3 的内容

- AI 复盘 / AI 建议能力
- 个性化修习建议
- 分享卡片 / 成就文案生成
- 完整用户偏好设置
- 完整多端冲突裁决 UI
- 历史报表快照持久化
- PRD 意义上的 V2 产品能力（完整冲突裁决、报表快照、低可信日期待处理中心等）

---

## 3. V2 推荐拆分（子阶段详解）

每个子阶段必须完整包含以下字段，不得遗漏。

---

### V2A：stats.js legacy 路径复核（已收口）

**当前事实**：
- `loadWeekData()` 是 V1 主路径，调用 `reportService.getWeeklyReport()`
- `legacyLoadWeekData` / `legacyLoadMonthData` / `legacyLoadYearData` 当前未发现
- `calculateStatsWithStrategy` / `calculateDueCount` / `mergeWithDeletedHabits` 当前未发现
- 页面层 storage/cloud/new Date 静态红线当前无命中

**阶段目标**：维持 stats.js 只通过 reportService 获取报表数据，防止 legacy 报表路径回流

**允许修改文件**：
- `docs/v2/v2-plan.md`（记录复核结论）
- `static-audit.md` / `acceptance-report.md`（如执行验收时更新）

**禁止修改文件**：
- 为 V2A 修改业务代码

**实施步骤**：
1. 运行 `rg -n "legacyLoadWeekData|legacyLoadMonthData|legacyLoadYearData|calculateStatsWithStrategy|calculateDueCount|mergeWithDeletedHabits" miniprogram/pages/stats/stats.js`
2. 运行页面层红线搜索：`rg -n "wx\.getStorageSync|wx\.setStorageSync|wx\.removeStorageSync|wx\.cloud\.callFunction|new Date\(" miniprogram/pages miniprogram/app.js`
3. 若无命中，V2A 保持关闭；若有命中，必须先分类为误报、测试辅助或治理违规

**验收标准**：
- legacy 方法搜索无命中
- 页面层不直接读写 storage、不直接调用云函数、不直接 new Date 计算业务日期
- stats.js 不恢复页面层报表聚合

**测试方式**：静态分析 + 代码审查，不执行任何测试套件（无代码变更）

**回滚策略**：不修改代码，无回滚需求

**风险点**：低风险；主要风险是后续修复时重新把报表逻辑塞回页面层

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
- 2026-06-11 审计确认：home.js 无页面层 storage/cloud/new Date 业务日期违规
- 2026-06-11 修复：移除 `home.js onLoad` 对 `getApp().printAllLogs()` 的 legacy 调试调用，页面不再间接读取旧 `CheckinLogs`

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
- homeService 接口契约清晰，有必要的注释或测试覆盖
- 54 suites / 606 tests 全通过，或记录未执行原因

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

### V2C：分享入口治理决策

**当前事实**：
- `miniprogram/services/shareService.js` 已存在
- `miniprogram/utils/share.js` 保留为底层工具，不再由四主页面直接引用
- 四主页面分享入口已统一到 shareService
- 观心页分享文案已由乱码文案收敛为标准中文文案

**阶段目标**：统一分享入口治理口径。实施前必须二选一：

- 方案 A：新建 `services/shareService.js`，四主页面改为调用 service。
- 方案 B：暂不新建 service，将 `utils/share.js` 登记为冻结兼容工具，只允许无隐私、非阻断分享能力继续使用。

**允许修改文件**：
- `miniprogram/services/shareService.js`（仅方案 A）
- `miniprogram/utils/share.js`（仅方案 B 的注释/接口冻结，不改变行为）
- `miniprogram/pages/home/home.js`（仅方案 A 接入 shareService）
- `miniprogram/pages/habits/habits.js`（仅方案 A 接入 shareService）
- `miniprogram/pages/stats/stats.js`（仅方案 A 接入 shareService）
- `miniprogram/pages/profile/profile.js`（仅方案 A 接入 shareService）
- `__tests__/unit/pages/share-and-habits-entry.test.js`（验证分享入口行为不变）

**禁止修改文件**：
- 任何 WXML / WXSS 布局和交互
- 任何云函数
- reportService / checkinService / habitService / syncService / userService / storageService / cloudService / homeService

**实施步骤**：
1. 分析四个主页面当前的分享入口实现（onShareAppMessage、onShareTimeline、左上角菜单）
2. 先决定方案 A 或方案 B，并把理由写入本文件执行结果
3. 若选择方案 A，创建 `services/shareService.js`，导出：
   - `enableShareMenu()`：封装 `wx.showShareMenu`
   - `getShareMessage(page)`：返回各页面标准分享文案（安静陪伴式语气，不携带隐私）
   - `getShareImage(page)`：返回分享封面图路径
4. 若选择方案 B，冻结 `utils/share.js` 作为兼容工具，禁止加入 openid、昵称、头像、打卡明细
5. 检查分享文案不包含 openid、昵称、头像、打卡明细

**2026-06-11 执行决策**：

- 已选择方案 A。
- 原因：`technical-architecture.md` 已定义 `shareService` 为分享与复制兜底边界；迁移范围小，不影响核心打卡、同步、报表链路。
- `utils/share.js` 不删除，作为 `shareService` 内部工具保留。

**验收标准**：
- 分享入口只有一个治理口径：shareService 或冻结的 utils/share.js
- 分享文案不包含 openid、昵称、头像、打卡明细
- 54 suites / 606 tests 全通过，或记录因无代码变更而未执行全量测试的原因

**测试方式**：
- 手工验证四页面分享菜单和分享卡片
- `npm test -- --runInBand`

**回滚策略**：方案 A 可 revert shareService 接入；方案 B 只产生文档/注释治理，无业务回滚

**风险点**：低风险（独立 service，不影响打卡和报表主链路）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否（新增 service，不影响现有缓存逻辑）

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

---

### V2D：syncService 测试维护

**当前事实**：
- syncService.js 已存在并导出所有函数
- `__tests__/unit/services/syncService.test.js` 已存在
- 当前测试覆盖 recoverData fallback、syncLocalData fallback、recoverOrSync 空队列跳过、pending 队列处理、retrying 状态等
- 2026-06-11 已补充 `pushWithDedup` / `hasDuplicatePending` / `retry` / `needsLocalRecovery` 风险用例

**阶段目标**：保持 syncService 可回归；后续只有在 syncService 行为变化时才补充测试

**允许修改文件**：
- `__tests__/unit/services/syncService.test.js`（补充或修正）
- `miniprogram/services/syncService.js`（如需拆分内部逻辑以提高可测试性，需保持接口契约不变）

**禁止修改文件**：
- 云函数
- 页面层
- WXML / WXSS

**实施步骤**：
1. 分析 syncService 现有导出函数列表和已有测试覆盖
2. 仅在行为有变化或风险缺口明确时补充以下场景：
   - `push` / `pushWithDedup` / `hasDuplicatePending` 队列操作
   - `processQueue` 的 happy path（mock cloudService 成功返回）
   - `retry` 成功 / 失败
   - `recoverOrSync` 网络恢复
   - `needsLocalRecovery` 判断
3. 使用 Jest mock 模拟 cloudService 和 storageService
4. 确保测试可独立运行，不依赖外部状态

**验收标准**：
- syncService 相关新增或变更行为有对应测试
- 新增测试全部通过
- 54 suites / 606 tests 全量回归通过，或记录未执行原因

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

### V2E：app.js globalData 审计（暂不执行）

**当前事实**：
- app.js globalData 仍包含 MyHabits / CheckinLogs 字段
- 直接写入点分布在：
  - app.js 内部 legacy helpers
  - 旧测试和兼容迁移路径
- stats.js legacy 报表方法当前未发现，债务重点已转移到 app.js 兼容层和旧缓存/旧云函数退出条件
- `docs/architecture/legacy-compatibility-register.md` 已登记 globalData、旧缓存、旧云函数和 utils/share.js 的保留原因与退出条件
- 2026-06-11 审计确认：四主页面未直接读取 `app.globalData.MyHabits` / `app.globalData.CheckinLogs`；`stats.js` 仅读取 `DEBUG_DAY_OFFSET` 调试配置
- 2026-06-11 审计确认：`app.globalData.MyHabits` / `app.globalData.CheckinLogs` 主要由 `app.js` legacy helpers 和 legacy 测试依赖

**阶段目标**：审计 app.js globalData 当前所有直接写入点，评估移除风险，输出审计结论（是否可安全移除 / 需要哪些前置条件）

**允许修改文件**：
- `miniprogram/app.js`（用于 grep/阅读定位）
- `miniprogram/services/checkinService.js`（定位写入点，不做修改）
- `miniprogram/services/habitService.js`（定位写入点，不做修改）
- `docs/v2/v2-plan.md`（更新 V2E 审计结论章节）
- `docs/architecture/legacy-compatibility-register.md`（更新 legacy 登记项）

**禁止修改文件**：
- 任何云函数、WXML、WXSS
- 任何页面文件
- 任何 service（不做修改，只做定位）

**实施步骤**：
1. 全局搜索 `app\.globalData\.(MyHabits|CheckinLogs|AllHabitsInfo)` 确认所有直接写入位置
2. 逐条分析每处写入的业务含义（是 V1 主链路必要还是遗留路径）
3. 确认 app.js globalData 是否被页面层直接读取（而非通过 service）
4. 评估"低风险移除"结论是否成立：app.js 仍在多个 service 中被写入，直接移除会导致 CheckinLogs 链路断裂
5. 输出审计结论：app.js globalData 中的 MyHabits / CheckinLogs 当前是否可以安全清理

**验收标准**：
- 审计报告列出 app.globalData.MyHabits / CheckinLogs 所有直接写入点
- 审计结论明确：是否可以安全执行"精简"，若不能，原因是哪些前置条件未满足
- V2E 本身不产生功能代码变更，只产生文档更新

**测试方式**：静态分析 + 代码审查，不执行任何测试套件（无代码变更）

**回滚策略**：不修改代码，无回滚需求

**风险点**：零风险（纯审计）

**是否涉及 migration**：否

**是否涉及 cache invalidation**：否

**是否涉及状态机变化**：否

**是否涉及数据模型变化**：否

**是否涉及报表口径变化**：否

**2026-06-11 审计结论**：

- 当前不允许直接删除 `app.globalData.MyHabits` / `app.globalData.CheckinLogs`。
- 页面层没有直接依赖这两个字段，说明页面边界已基本收口。
- app.js 内部仍有兼容 API：`loadGlobalDataFromStorage`、`migrateOldStrategy`、`migrateOldRecords`、`saveMyHabits`、`addHabit`、`removeHabit`、`saveDeletedHabitInfo`、`getAllHabits`、`getDeletedHabits`、`restoreHabit`、`getHabitById`、`saveCheckinLogs`、`addCheckinLog`、`removeCheckinLog`、`removeLogsByDate`、`getLogsByHabitId`、`getLogsByDate`、`isCheckedOnDate`、`removeHabitLogs`、`getLogsByDateRange`、`calculateStreak`、`calculateTotalDays`、`saveUserStrategies`、`addUserStrategy`、`removeUserStrategy`、`syncFromCloud`、`syncToCloud`、`buildLegacyCheckinSyncPayload`、`enqueueLegacyCheckinLogs`、`reconcileLegacyCheckinLogsAfterSync`。
- 现有 legacy 测试仍直接设置或断言 `app.globalData.MyHabits` / `app.globalData.CheckinLogs`，包括 app 兼容测试、manual strategy loader、stats 旧单测和部分页面 mock。
- 退出前置条件：先把 legacy app API 测试迁移到 service/migration 测试；再将 `app.js` 旧 helper 标记为只兼容测试或迁移；最后分批删除 `CheckinLogs` 写路径，再处理 `MyHabits` 读写路径。
- 下一步建议：先做“app.js legacy helper 归类和 deprecation 注释”，不做删除。

---

### V2F：UI token 预防性检查

**当前事实**：
- `#e64340` 全局搜索无结果（已收敛）
- `--color-danger` 和 `#F0655B` 已在多处使用
- custom-tab-bar 已统一主题色
- 2026-06-11 已在 `app.wxss` 补充 `--color-danger` alias；`--c-red` 仅作为火属性主题色兼容 alias，不作为危险操作入口
- 2026-06-11 已将删除确认弹窗 `confirmColor` 固定为 `#F0655B`，避免原生 `wx.showModal` 解析 CSS 变量失败

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
- 危险色使用统一到 `--color-danger` token（或 `#F0655B` 等明确已收敛的色值）
- 自定义危险色（如 `--c-red`）若有新增，必须有对应的 `--color-danger` 替换方案方可合入
- 54 suites / 606 tests 全通过，或记录未执行原因

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
| `miniprogram/services/shareService.js` | V2C | 仅方案 A 新增，统一分享入口和文案 |
| `docs/architecture/legacy-compatibility-register.md` | V2E | legacy 兼容入口、风险和退出条件登记 |

### 修改文件

| 文件 | 阶段 | 修改内容 |
|------|------|---------|
| `miniprogram/pages/home/home.js` | V2B | 边界补强（确认无页面层违规） |
| `miniprogram/pages/home/home.js` | V2C | 仅方案 A 接入 shareService |
| `miniprogram/pages/habits/habits.js` | V2C | 仅方案 A 接入 shareService |
| `miniprogram/pages/stats/stats.js` | V2C | 仅方案 A 接入 shareService |
| `miniprogram/pages/profile/profile.js` | V2C | 仅方案 A 统一到 shareService |
| `miniprogram/app.js` | V2E | globalData 审计定位（写入点定位，不做修改） |
| `miniprogram/app.wxss` | V2F | design token 注释补充 |
| `docs/v2/v2-plan.md` | V2 全程 | 记录阶段执行结论和当前基线 |
| `docs/architecture/technical-architecture.md` | V2 全程 | 保持当前架构现状与真实代码一致 |

### 不允许修改的文件

- 为治理收口批量修改云函数；如修复明确 V1 验收风险需要改云函数，必须同步测试和文档
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
| pendingOperations | **不影响** | V2 不修改 pending 队列结构（仅维护测试） |
| reportData | **不影响** | V2 不修改报表计算口径 |
| userInfo | **不影响** | V2 不修改用户资料存储结构 |
| cacheMeta | **不影响** | V2 不修改缓存元数据结构 |
| cloud collections | **不影响** | V2 不修改云端集合结构 |
| migration | **不影响** | V2 不涉及数据迁移 |

---

## 6. 云函数与安全边界

1. **是否新增云函数**：治理计划本身不新增；如 V1 验收风险要求新增/补齐，必须单独立项并通过测试
2. **是否修改现有云函数**：治理计划本身不修改；如修复 V1 验收风险必须修改，需同步云函数测试和文档
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
5. **是否需要视觉验收**：V2C 选择方案 A 时需手工验证分享菜单和卡片；V2F 需手工验证危险色使用规范；其他阶段不需要

---

## 8. 测试策略

1. **service 单元测试**：维护 syncService 单元测试（V2D）
2. **页面轻量测试**：V2B / V2C / V2E 任何代码修改后确保 54 suites / 606 tests 全通过，或记录未执行原因
3. **同步测试**：syncService 单元测试持续覆盖 pending / retry / recoverOrSync / needsLocalRecovery（V2D）
4. **报表回归测试**：V2 不主动修改 reportService；如因验收风险必须修改，必须补 reportService 测试
5. **登录/用户资料回归测试**：V2 不修改 userService，现有测试继续通过

---

## 9. 执行顺序

### 建议执行顺序

**V2A（stats 静态复核）→ V2E（legacy 兼容登记）→ V2B（homeService 边界维护）→ V2C（分享入口治理决策）→ V2D（syncService 测试维护）→ V2F（UI token 预防）**

理由：
- **V2A 最先**：确认页面层和 stats.js 红线仍清，避免继续追旧任务
- **V2E 提前**：app.js globalData、旧集合、旧云函数和 utils/share.js 是当前最容易误删的兼容入口，需先登记退出条件
- **V2B 之后**：homeService 已落地，边界维护不影响其他逻辑
- **V2C 之后**：分享入口先做治理决策，再决定是否产生代码迁移
- **V2D 之后**：syncService 测试已存在，按风险维护即可
- **V2F 最后**：纯预防性检查，不需要特殊前提

---

## 10. 给 Claude Code / Minimax 的执行规则

1. **每次只执行一个子阶段**：除本文档治理外，后续 V2A/V2E/V2B/V2C/V2D/V2F 必须逐项执行和验收
2. **每个子阶段单独提交**：每个 V2X 完成验收后单独 commit，不得合并多个 V2X 到一个 commit
3. **每个子阶段完成后必须等待人工验收**：不得跳过人工验收进入下一阶段
4. **不得跨阶段实施**：V2C 的代码改动不得包含 V2D 的内容
5. **不得顺手重构无关文件**：执行 V2B 时只补强 homeService 边界，不得顺手修改其他 service
6. **不得修改 UI**：不得修改 WXML / WXSS 布局；V2F 仅允许 token 注释补充
7. **不得绕过 service 层**：所有业务逻辑走 service
8. **V2 不主动扩展 EventBus**：V2 不引入新的 EventBus 监听，但既有的 Service + EventBus 模式（AGENTS.md 已定义）保持不变
9. **不得保存或传递 openid**：shareService 不得包含 openid 传递逻辑
10. **V2 不以治理名义批量修改云函数**：只有明确 V1 验收风险允许修改 cloudfunctions/，且必须同步测试和文档
11. **V2A/V2E 结论必须更新文档**：静态复核和 legacy 登记完成后，必须把结论写回本文档或 legacy register

---

## 附录：V2A 静态复核结论

2026-06-11 复核：

- stats.js legacy 方法搜索无命中。
- 页面层 storage/cloud/new Date 静态红线搜索无命中。
- V2A 旧“legacy 方法保留/迁移/删除”任务关闭，后续只保留静态红线复核。

---

## 附录：V2 执行后更新（各阶段完成后填入）

### V2A 执行结果

commit: 未提交 | 验收结果: 已完成静态复核，等待人工验收

### V2B 执行结果

commit: 未提交 | 验收结果: 已完成 homeService/home.js 边界审计；移除 home.js onLoad legacy 日志调用；等待人工验收

### V2C 执行结果

commit: 未提交 | 验收结果: 已选择方案 A；新增 shareService 并完成四主页面接入；等待人工验收

### V2D 执行结果

commit: 未提交 | 验收结果: 已补齐 `pushWithDedup`、`hasDuplicatePending`、`retry`、`needsLocalRecovery` 测试；syncService 单测 13 tests 通过；等待人工验收

### V2E 执行结果

commit: 未提交 | 验收结果: 已完成 app.js globalData 审计；当前不允许直接删除，已在 legacy register 登记 helper 分组和退出条件

### V2F 执行结果

commit: 未提交 | 验收结果: 已补充 `--color-danger` token alias，并修正删除确认 `confirmColor`；等待人工验收
