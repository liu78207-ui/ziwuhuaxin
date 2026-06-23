# 阶段2实施计划：数据模型层（Models + ID 体系设计）

> 生成时间：2026/05/22
> 阶段：Phase 2（按 REFACTORING_PLAN.md 执行）
> 状态：等待确认后执行

---

## A. 阶段目标

建立数据模型层，明确 `builtInHabit.habitId` 与 `userHabit.userHabitId` 的边界，设计 ID 体系。

**分层归属**：`models/` + `constants/`

**核心约束**：
- `builtInHabit.habitId`：固定 25 个，不可变，作为内置习惯唯一标识
- `userHabit.userHabitId`：独立字段，不以 `habitId` 替代用户习惯实例
- 同一 `habitId` 可以有多个活跃的 `userHabit`（删除后重加生成新实例）
- `policyVersion` 必须归属 `userHabitId`，不得只靠 `habitId` 归属
- **Phase 2 只定义字段、约束、纯校验函数，不生成、不迁移、不落地真实 ID**

---

## B. 将修改的文件（5个，分2步）

### 第一步（2个文件）
| 文件 | 性质 |
|------|------|
| `miniprogram/constants/habitLibrary.js` | 新增 |
| `miniprogram/constants/habitThemes.js` | 新增 |

### 第二步（3个文件）
| 文件 | 性质 |
|------|------|
| `miniprogram/models/builtInHabit.js` | 新增 |
| `miniprogram/models/userHabit.js` | 新增 |
| `miniprogram/models/policyVersion.js` | 新增 |

阶段2不碰任何旧代码，仅纯新增。

---

## C. 文件修改顺序

```
Step 1: habitLibrary.js  (25个内置习惯常量，从 habits.js 现有数据提取)
Step 2: habitThemes.js   (主题色常量)

Step 3: builtInHabit.js  (模型 + 校验函数)
Step 4: userHabit.js      (模型 + 校验函数)
Step 5: policyVersion.js (模型 + 校验函数)
```

**25个内置习惯来源**：从 `pages/habits/habits.js` 的 `allHabits` 数组提取值，保持既有习惯 ID 不变，新增习惯追加 ID。

**字段映射（旧字段 -> 新模型规范）**：
- `_id` -> `habitId`（内置习惯唯一标识，字符串 '1'-'25'）
- `title` -> `name`
- `default_duration` -> `defaultDuration`
- `category` -> `category`（保持不变）
- `description` -> `description`（保持不变）

**重要**：保留旧数据的值，但字段名需转换为新模型规范。不得把 `_id`、`title`、`default_duration` 等旧字段名带入 model 层或 constants 层。

**builtInHabit canonical 字段**（共9个）：
```
habitId, name, category, description, defaultDuration,
defaultFrequency, defaultTheme, sortOrder, enabled
```

**habitThemes.js 说明**：
- 定义 `sports` / `therapy` / `daily` 三类 theme key，作为模型层语义标识
- **不接入现有 WXML/WXSS 的 theme class**（如 `t-green`、`t-red` 等 UI token）
- **不修改任何 WXML/WXSS 文件**
- 后续 UI token 对齐在阶段6统一处理

---

## D. 核心边界约束（Phase 2 严格遵守）

### D.1 userHabitId 生成边界
- Phase 2 **只定义字段和校验**，不实现真实 ID 生成逻辑
- 真实 `userHabitId` 生成在 Phase 3（habitService 层）
- model 文件不得包含 `addHabit`、`createUserHabit`、`generateId` 等业务方法

### D.2 policyVersion 归属约束
- `policyVersion.userHabitId` **必填**，不得为空
- `policyVersion.habitId` 仅作为内置习惯引用和报表聚合辅助字段
- 禁止 `policyVersion` 只靠 `habitId` 归属

### D.3 model 文件约束
- 只包含数据结构、默认字段、纯校验/纯转换函数
- 无 storage、cloud、page、app、sync、report、migration 依赖
- 无副作用，不读写全局状态

### D.4 policyVersion 时间段约束
- 同一 `userHabitId` 下，策略版本的有效时间段（effectiveStartDate - effectiveEndDate）**不得重叠**
- Phase 2 只声明此约束，不实现业务校验逻辑（校验在 habitService 层）

---

## E. 风险分析

- **低风险**：纯新增文件，不涉及旧数据迁移
- 不改 `pages/habits/habits.js` 中硬编码的 25 个习惯
- 不涉及打卡链路、sync、报表、DailyCheckinState
- 不修改云端数据库结构

---

## F. 验证方案

### 最小测试标准（每步完成后验证）
1. 5个新文件都能 `require` 无报错
2. `habitLibrary` 保留 25 个固定 `habitId`（'1'-'25'）
3. `habitThemes` 提供稳定 theme key（sports/therapy/daily）
4. `userHabit` model 包含独立 `userHabitId` 字段（非 `habitId`）
5. `policyVersion` model 包含 `policyVersionId` 与必填 `userHabitId`
6. 所有 validator 是纯函数，无 side effect

### 最终验收
1. `npm test` 通过
2. 代码审查确认5个文件结构和约束

---

## G. 回滚方案

删除以下文件即可回滚：
- `miniprogram/constants/habitLibrary.js`
- `miniprogram/constants/habitThemes.js`
- `miniprogram/models/builtInHabit.js`
- `miniprogram/models/userHabit.js`
- `miniprogram/models/policyVersion.js`

---

## H. 阶段完成标准

| 标准 | 验证方式 |
|------|----------|
| builtInHabit 模型覆盖全部 25 个内置习惯 | 代码审查 |
| habitThemes.js 提供稳定 theme key | 代码审查 |
| userHabit 模型有独立 userHabitId 字段 | 代码审查 |
| policyVersion 模型关联 userHabitId（必填） | 代码审查 |
| habitId / userHabitId 边界明确 | 代码审查 |
| 无 ID 生成、迁移、业务写入逻辑 | 代码审查 |
| 所有 validator 为纯函数 | 代码审查 |
| npm test 通过 | 测试通过 |
| 无 UI 回归 | 手动验证 |

---

## I. 实施限制

- 单次修改不超过 3 个文件
- 单次修改不超过 200 行
- 每完成一步必须说明：修改内容、原因、是否影响旧数据、是否影响 UI、是否可回滚

---

## J. 本阶段禁止事项

- 不进行旧数据迁移（不迁移 MyHabits / CheckinLogs）
- 不修改打卡链路
- 不引入 syncService / cloudService / checkinService
- 不修改报表系统
- 不修改 DailyCheckinState
- 不修改云端数据库
- 不修改 UI / WXML / WXSS
- 不提前进入阶段3
- 不实现 `habitService.addHabit` / `deleteHabit` / `editPolicy`
- 不生成真实 `userHabitId` / `policyVersionId`
- 不补旧数据 userHabitId 字段

---

*确认后开始编码。*
