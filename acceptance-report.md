# Acceptance Report

审计日期：2026-06-11
审计基线：`93d62a9 chore: complete V1 governance validation`

## 总评分

B（基本可用）

理由：本地自动化、静态架构红线、云函数清单均通过；用户反馈的“策略修改后案台与观心不同步”场景已被集成测试覆盖并通过。当前未发现 P0/P1 阻断项。仍未执行微信开发者工具/真机/真实 CloudBase 环境验收，且旧兼容云函数和 `app.js` legacy API 外壳仍存在，因此严格评为 B，不评 A。

## 已执行验证

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 全量测试 | `npm test -- --runInBand` | PASS：54 suites / 606 tests |
| 单元测试 | `npm run test:unit -- --runInBand --coverage=false` | PASS：34 suites / 429 tests |
| 集成测试 | `npm run test:integration -- --runInBand --coverage=false` | PASS：19 suites / 163 tests |
| E2E mock 测试 | `npm run test:e2e -- --runInBand` | PASS：1 suite / 14 tests |
| 云函数清单 | `npm run verify:cloudfunctions` | PASS |
| 语法检查 | `node --check ...` | PASS |
| 静态架构红线 | `rg` 系列检查 | PASS |

## 已通过

- 四主页面页面层红线：无 direct storage、direct cloud、direct business `new Date()`。
- 案台主链路：今日习惯展示、空状态、打卡、重复打卡、删除后重加生命周期测试通过。
- 修习主链路：添加习惯、编辑策略、删除习惯、重复添加、修改弹窗回填测试通过。
- 观心主链路：周报、月报、年报、完成率、streak、删除当天、策略修改当天测试通过。
- 归藏主链路：登录、默认资料、资料更新、登录失败降级测试通过。
- 打卡/取消：`checkinOperation`、`dailyCheckinState`、`syncCheckin`、兼容 `undoCheckin` 测试通过。
- 同步：pending、retrying、retry、recoverData、legacy fallback、本地缓存恢复测试通过。
- 数据模型：`userHabitId` 生命周期、`policyVersionId`、`operationId`、`dailyCheckinState` 主路径测试通过。
- 策略修改专项：案台与观心共用应修判断；daily 改 weekly 后取消、weekly 改 daily、未来策略、当天取消等场景测试通过。
- UI token：`#e64340` 无残留，删除确认使用 `#F0655B`，全局存在 `--color-danger`。

## 风险问题

### P0

未发现 P0 级崩溃、必现数据丢失或主链路不可用问题。

### P1

未发现 P1 阻断项。

### P2

1. 旧兼容打卡云函数仍存在
   - 文件：`cloudfunctions/doCheckin/index.js`
   - 函数：`exports.main`
   - 风险原因：兼容函数仍可按旧集合口径执行打卡。
   - 影响范围：旧调用方如果继续使用，可能绕过新 `syncCheckin`/operation/daily state 主链路。
   - 修复建议：下一阶段将其标记 deprecated，禁止新调用方使用；必要时改为代理新模型。

2. 旧兼容报表云函数仍存在
   - 文件：`cloudfunctions/getStatsReport/index.js`
   - 函数：`exports.main`
   - 风险原因：兼容函数与前端 `reportService/reportAggregator` 报表口径并存。
   - 影响范围：旧版本或后台调用可能出现报表解释差异。
   - 修复建议：登记为兼容窗口能力；后续统一到新集合或下线。

3. `app.js` legacy API 外壳仍保留
   - 文件：`miniprogram/app.js`
   - 函数：`saveMyHabits`、`saveCheckinLogs`、`addCheckinLog`、`removeCheckinLog`、`syncToCloud`
   - 风险原因：旧 API 虽已通过 service/storage/sync 承接关键实现，但入口仍存在。
   - 影响范围：后续开发误用旧入口会扩大维护成本。
   - 修复建议：继续在 legacy compatibility register 中追踪；补 deprecated 静态检查后分阶段删除。

### P3

1. 未执行真实端验收
   - 文件/函数：不适用
   - 风险原因：本轮只执行本地 Jest 和静态检查，未打开微信开发者工具、真机、真实 CloudBase。
   - 影响范围：原生组件、授权、网络恢复、云权限、真机缓存行为仍可能存在环境差异。
   - 修复建议：上线前执行真机清缓存恢复、离线打卡恢复、四主页面视觉巡检。

2. 本地工作区仍有未提交产物/私有配置
   - 文件：`.claude/settings.local.json`、`project.private.config.json`、`reports/junit.xml`
   - 风险原因：这些文件未纳入本次提交，仍显示 dirty。
   - 影响范围：不影响代码运行，但会影响后续 diff 观察。
   - 修复建议：确认是否加入 `.gitignore` 或手动恢复本地配置。

## 建议修复项

1. 给 `doCheckin/getStatsReport` 增加 deprecated 文档和调用方静态检查。
2. 将旧兼容云函数逐步代理到新集合模型，或明确下线窗口。
3. 给 `app.js` legacy API 加 deprecated 注释/静态扫描规则，分阶段迁出。
4. 执行微信开发者工具与真机验收：首次进入、清缓存恢复、离线打卡、网络恢复、多端恢复。
5. 决定 `.claude/settings.local.json`、`project.private.config.json`、`reports/junit.xml` 的版本管理策略。

## 是否允许进入下一阶段

✅ 允许进入下一阶段

理由：自动化和静态治理红线全部通过，未发现 P0/P1 阻断风险。剩余问题是 P2/P3 的兼容债务与真实环境验收缺口，可进入下一阶段继续治理，但上线前仍必须补真机和真实 CloudBase 验收。
