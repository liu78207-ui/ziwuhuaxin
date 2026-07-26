# 1. 项目简介

《子午花信》是一个东方养生习惯打卡小程序，面向个人长期修习、每日打卡、云端恢复和周/月/年报表复盘。

核心目标是让用户稳定完成个人习惯闭环：

```text
用户进入
  -> 恢复数据
  -> 查看今日应修
  -> 打卡
  -> 云同步
  -> 生成周/月/年报表
```

当前版本阶段为 V1 工程化治理阶段。项目已经有微信小程序 UI 骨架、CloudBase 云函数、治理文档、V1 产品边界、报表规则、同步策略和测试策略。当前工程状态不是快速堆功能，而是收敛数据模型、服务层、同步层、恢复链路、时间系统和报表口径。

# 2. 技术栈

- 微信小程序。
- 腾讯云开发 CloudBase。
- DeepSeek API，可选 AI 能力，不进入核心打卡链路。
- Service Layer 架构。
- EventBus 状态同步。
- Jest 自动化测试。

核心运行关系：

```text
miniprogram
  -> services
  -> cloudService
  -> cloudfunctions
  -> CloudBase database
```

# 3. 当前工程策略（非常重要）

当前项目采用：

**B. 保留 UI，重写数据层、服务层、同步层。**

不整体重做 UI，不重画产品，不新增与 V1 主链路无关的复杂能力。现阶段重点是：

- 数据稳定。
- sync 稳定。
- report 稳定。
- recoverData 稳定。
- TimeService 稳定。

当前 UI 骨架、四个主页面和 `custom-tab-bar` 优先保留；旧的数据读写、页面内报表计算、页面直连云函数、页面直接读写缓存等实现需要逐步收敛到 service。

# 4. 核心架构原则

长期架构方向：

```text
pages
  -> components
  -> services
  -> models / constants / utils
  -> cloudService
  -> cloudfunctions
  -> CloudBase database
```

简化理解：

```text
pages -> services -> cloudfunctions
```

核心原则：

- 页面层只负责展示、事件响应、调用 service、渲染视图模型。
- 页面层不允许复杂业务逻辑。
- 时间统一走 `timeService`。
- 缓存统一走 `storageService`。
- 云函数调用统一走 `cloudService`。
- 打卡和取消统一走 `checkinService`。
- sync、pending、retry、recoverData 统一走 `syncService`。
- report 必须统一走 `reportService` / `reportAggregator`。
- 所有状态必须遵循状态机，由 service 或云函数修改。

# 5. 项目目录结构

当前仓库核心结构：

```text
.
├─ AGENTS.md
├─ README.md
├─ miniprogram/
│  ├─ assets/
│  ├─ components/
│  ├─ custom-tab-bar/
│  ├─ pages/
│  ├─ static/
│  ├─ styles/
│  └─ utils/
├─ cloudfunctions/
│  ├─ login/
│  ├─ doCheckin/
│  ├─ undoCheckin/
│  ├─ syncLocalData/
│  ├─ getTodayTasks/
│  ├─ getStatsReport/
│  └─ ...
├─ docs/
│  ├─ architecture/
│  ├─ governance/
│  ├─ product/
│  ├─ ui/
│  └─ v1/
├─ reports/
├─ __tests__/
├─ package.json
└─ project.config.json
```

`cloudfunctions/` 中仍保留部分旧函数形态。V1 治理方向是逐步收敛到 `syncHabit`、`syncCheckin`、`recoverData` 等幂等同步与恢复入口。

# 6. 文档导航（最重要）

修改代码前，必须先阅读 `AGENTS.md` 和任务相关治理文档。

## 工程治理

- [AGENTS.md](AGENTS.md)
- [docs/governance/code-boundary-rules.md](docs/governance/code-boundary-rules.md)
- [docs/governance/change-impact-and-regression.md](docs/governance/change-impact-and-regression.md)
- [docs/governance/testing-strategy.md](docs/governance/testing-strategy.md)
- [docs/governance/logging-debugging.md](docs/governance/logging-debugging.md)

## 事故复盘

- [2026 年 7 月环境隔离导致云同步失效事故复盘](docs/incidents/2026-07-environment-isolation-cloud-sync-incident.md)

## 架构

- [docs/architecture/technical-architecture.md](docs/architecture/technical-architecture.md)
- [docs/architecture/state-machine.md](docs/architecture/state-machine.md)
- [docs/architecture/migration-plan.md](docs/architecture/migration-plan.md)
- [docs/architecture/legacy-compatibility-register.md](docs/architecture/legacy-compatibility-register.md)

## UI

- [docs/ui/ui-visual-guidelines.md](docs/ui/ui-visual-guidelines.md)
- [docs/ui/ui-interaction-guidelines.md](docs/ui/ui-interaction-guidelines.md)

## V1

- [docs/v1/v1-product-boundary.md](docs/v1/v1-product-boundary.md)
- [docs/v1/v1-report-rules.md](docs/v1/v1-report-rules.md)
- [docs/v1/v1-sync-strategy.md](docs/v1/v1-sync-strategy.md)
- [docs/v2/v2-plan.md](docs/v2/v2-plan.md)

## Product

- [docs/product/prd-v1.md](docs/product/prd-v1.md)


## AI 重构开发必读

所有 AI Agent（Claude Code / Codex / Cursor / Minimax）在进行重构、架构调整、状态管理修改、云同步修改前，必须优先阅读：

1. docs/architecture/technical-architecture.md
   - 十三、分阶段实施路线图
   - 最终技术策略结论

2. AGENTS.md
3. docs/governance/code-boundary-rules.md
4. docs/governance/testing-strategy.md

禁止：
- 一次性推倒重构
- 未经验证的大规模改动
- 脱离当前 PRD 的抽象设计
- 修改现有 UI 风格与核心交互路径


阅读顺序建议：

```text
AGENTS.md
  -> code-boundary-rules.md
  -> docs/architecture/technical-architecture.md
  -> 当前任务相关专题文档
  -> docs/governance/testing-strategy.md
```


# 7. AI Coding Agent 协作规则

AI coding agent 修改代码前必须先阅读 `AGENTS.md`。

硬性规则：

- 不允许绕过 service 层。
- 不允许页面层直接 storage。
- 不允许页面层直接 `new Date()` 计算业务日期。
- 不允许页面层直接调用业务云函数。
- 不允许页面层直接计算 report。
- 不允许用 `habitId` 替代 `userHabitId`。
- 不允许直接操作 pending 队列。
- 修改状态机必须同步更新状态机文档和测试。
- 修改 report 规则必须同步更新 V1 报表规则和测试。
- 修改 sync 规则必须同步评估 migration、cache invalidation 和测试。

每次修改代码后，需要说明：

- 修改了哪些文件。
- 修改了哪些函数。
- 是否影响旧功能。
- 如何测试。
- 是否涉及 migration。
- 是否涉及 cache invalidation。
- 是否涉及状态机变化。
- 是否涉及数据模型变化。
- 是否涉及报表口径变化。

# 8. 当前开发优先级

当前优先级：

1. TimeService
2. storageService
3. cloudService
4. syncService
5. reportService
6. recoverData
7. UI token 对齐

当前不优先：

- AI 能力。
- 动效。
- 社交。
- feed。
- 排行榜。
- 课程体系。
- 复杂多端冲突裁决。

# 9. 当前项目状态

项目已经进入工程化治理阶段。

当前重点不是快速堆功能，而是建立长期稳定的数据、sync、report、TimeService 和工程边界。任何新功能都必须先判断是否影响数据模型、状态机、同步、报表、缓存、迁移、CloudBase 权限和日志调试体系。

# 10. 后续版本演进原则

- V2/V3 功能应新增 `docs/v2/`、`docs/v3/` 或专题治理文档。
- `AGENTS.md` 不应频繁重写，它只记录长期稳定的工程规则。
- 新功能优先扩展治理文档，再进入代码实现。
- 不允许破坏现有数据模型和状态机。
- 不允许让 AI、分享、社交、内容或动效能力阻断打卡、取消打卡、恢复、同步和报表主链路。

# 11. 最后一段（很重要）

修改代码前，先阅读 AGENTS.md。
