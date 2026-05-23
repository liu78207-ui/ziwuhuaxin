# Phase 3 实施计划：userHabitId 迁移 + habitService/checkinService 基础层

> 生成时间：2026/05/23
> 阶段：Phase 3（修订版 v4）
> 依赖：Phase 2 完成
> 状态：正式方案（修复后，可执行）

---

## A. Phase 3 总体目标

### A.1 核心目标

Phase 3 的核心目标是：**让每次添加同一内置习惯都生成唯一的 userHabitId，拆除 habitId 与用户实例的直接绑定**。

具体目标：
1. **建立 userHabitId 生成规则**：`uh_{habitId}_{timestamp}_{random}` 格式，不可复用已删除的 userHabitId
2. **建立 habitService 基础层**：addHabit / deleteHabit / getActiveHabits / getHabitByUserHabitId / generateUserHabitId
3. **建立 checkinService 本地层**：checkin / undoCheckin / getTodayState（纯本地，不含云同步）
4. **建立 DailyCheckinState 本地状态模型**
5. **建立旧数据迁移方案**：MyHabits 补 userHabitId，CheckinLogs 基于生命周期区间安全映射，含备份和幂等保证
6. **建立 policyVersion 本地存储**：policyVersion 本地集合、storage key、读写方法

### A.2 明确禁止事项

以下内容**不得**在 Phase 3 实施：
- 新增 `cloudService.js` / `syncService.js`
- 调用 `wx.cloud.callFunction`
- 引入 EventBus
- 修改 WXML/WXSS
- 修改云端集合结构
- 修改云函数
- 修改 stats.js、profile.js

### A.3 页面打卡入口约束

- `taskList` 的 `_id` 字段承载 `userHabitId`（复用了现有字段，不改 WXML）
- **严格禁止**按 `habitId` 查 first active 实例作为打卡入口

---

## B. userHabitId 生命周期设计

### B.1 userHabitId 生成规则

```javascript
// 格式：uh_{habitId}_{timestamp}_{random}
// 示例：uh_1_1622505600000_a1b2
```

### B.2 实例生命周期边界

```javascript
// userHabit 实例生命周期
{
  userHabitId: 'uh_1_xxx_abc1',
  habitId: '1',
  status: 'deleted',          // 'active' | 'deleted'
  createdAt: '2026-04-13',    // 实例创建时间
  deletedAt: '2026-05-01',    // 删除时间（active 实例为 null）
  // 有效区间：[createdAt, deletedAt)
  // active 实例 deletedAt = null，视为 end = +Infinity
}
```

**约束**：
- `createdAt` 必填，实例创建时间
- `deletedAt` 可选，删除时间为 null 表示 active
- 有效打卡日期区间：`createdAt <= date < deletedAt`
- 删除后重新添加生成新的 userHabitId

---

## C. 数据迁移方案（安全版 v2）

### C.1 migrationMeta 结构（修订）

```javascript
// storageService.getMigrationMeta() 返回
{
  migrationVersion: 1,
  migratedAt: '2026-05-23T10:00:00.000Z',
  // key 是 userHabitId，value 是实例生命周期信息
  userHabitInstances: {
    'uh_1_xxx_abc1': {
      userHabitId: 'uh_1_xxx_abc1',
      habitId: '1',
      status: 'deleted',
      createdAt: '2026-04-13',
      deletedAt: '2026-05-01'
    },
    'uh_1_xxx_abc2': {
      userHabitId: 'uh_1_xxx_abc2',
      habitId: '1',
      status: 'deleted',
      createdAt: '2026-05-01',
      deletedAt: '2026-05-10'
    },
    'uh_1_xxx_abc3': {
      userHabitId: 'uh_1_xxx_abc3',
      habitId: '1',
      status: 'active',
      createdAt: '2026-05-10',
      deletedAt: null  // active 实例，结束时间为 null
    }
  },
  status: 'completed'
}
```

### C.2 MyHabits 迁移

**迁移步骤**：
1. 读取 migrationMeta，如果已迁移且版本一致，跳过
2. 备份当前 MyHabits 到 `MyHabits_backup_phase3_{timestamp}`
3. 初始化 `userHabitInstances`
4. 对每条记录：
   - 检查是否有 userHabitId（已有则跳过）
   - 生成新的 userHabitId
   - 补充 `status`、`deletedAt`、`latestPolicyVersionId`、`syncStatus`
   - 将 `isDeleted` 映射到 `status`（isDeleted=true → deletedAt=now，status='deleted'）
   - 更新 `userHabitInstances`
5. 保存新结构和 migrationMeta
6. 保留备份

### C.3 CheckinLogs 迁移（关键修订）

**核心原则**：基于实例生命周期区间判断归属。

```
有效打卡日期区间：[createdAt, deletedAt)
- active 实例 deletedAt = null，视为 [createdAt, +Infinity)
- deleted 实例 deletedAt 非 null，区间为 [createdAt, deletedAt)
```

**映射算法（按日期区间精确判断）**：

```javascript
/**
 * 安全映射 CheckinLog 到 userHabitId
 * @param {object} log - CheckinLogs 单条记录 { logId, habitId, date, ... }
 * @param {object} meta - migrationMeta
 * @returns {object} - 映射后的记录
 */
function safeMapUserHabitId(log, meta) {
  if (log.userHabitId) {
    // 已有 userHabitId，跳过
    return log
  }

  const { userHabitInstances } = meta

  // 收集所有命中该 habitId 的实例
  const candidates = []
  for (const [uhId, instance] of Object.entries(userHabitInstances)) {
    if (instance.habitId !== log.habitId) continue
    candidates.push({ uhId, instance })
  }

  if (candidates.length === 0) {
    // 没有该 habitId 的实例，标记 needRepair
    return { ...log, needRepair: true }
  }

  // 按 createdAt 排序
  candidates.sort((a, b) => a.instance.createdAt.localeCompare(b.instance.createdAt))

  // 精确区间匹配：log.date 必须在 [createdAt, deletedAt) 区间内
  const validCandidates = candidates.filter(({ instance }) => {
    const createdAt = instance.createdAt
    const deletedAt = instance.deletedAt // null 表示 active

    // log.date >= createdAt 且（deletedAt 为 null 或 log.date < deletedAt）
    return log.date >= createdAt && (deletedAt === null || log.date < deletedAt)
  })

  if (validCandidates.length === 1) {
    // 唯一匹配，归属确定
    return { ...log, userHabitId: validCandidates[0].uhId }
  } else if (validCandidates.length === 0) {
    // 没有区间命中（日志日期早于所有实例创建，或晚于所有实例删除）
    return { ...log, needRepair: true }
  } else {
    // 多个区间命中（理论上不应该发生，因为区间互斥）
    // 这说明数据有异常，标记 needRepair
    return { ...log, needRepair: true }
  }
}
```

**验证示例**：

```
实例 A：createdAt=2026-04-13, deletedAt=2026-05-01
实例 B：createdAt=2026-05-01, deletedAt=null（active）

日志 date=2026-04-20 → 命中 A → 归到 uh_A
日志 date=2026-05-01 → 不命中 A（date < deletedAt），命中 B → 归到 uh_B
日志 date=2026-05-10 → 命中 B（active，deletedAt=null）→ 归到 uh_B
日志 date=2026-03-01 → 无实例创建于此日期之前 → needRepair
```

**约束**：
- **不是**按 habitId_active 默认映射全部历史日志
- 必须同时满足 `log.date >= createdAt` 和 `log.date < deletedAt`
- ambiguous 日志（无法唯一归属）必须 `needRepair: true`
- 不存在靠 "最接近但不超过 createdAt" 的模糊判断

### C.4 迁移幂等保证

```javascript
// storageService.js

function getMyHabits() {
  const habits = asArray(getItem(STORAGE_KEYS.habits))
  const meta = getMigrationMeta()

  // 幂等：如果已有 userHabitId，跳过迁移
  return habits.map(habit => {
    if (!habit.userHabitId && meta.userHabitInstances) {
      // 渐进迁移：为没有 userHabitId 的记录补齐
      const userHabitId = generateUserHabitId(habit.habitId)
      return {
        ...habit,
        userHabitId,
        status: habit.isDeleted ? 'deleted' : 'active',
        deletedAt: habit.isDeleted ? new Date().toISOString() : null,
        latestPolicyVersionId: '',
        syncStatus: 1
      }
    }
    return habit
  })
}

function getCheckinLogs() {
  const logs = asArray(getItem(STORAGE_KEYS.logs))
  const meta = getMigrationMeta()

  if (!meta.userHabitInstances) {
    return logs
  }

  return logs.map(log => safeMapUserHabitId(log, meta))
}
```

### C.5 迁移失败兜底

- 读取失败保留旧数据，不返回空数组，不写回
- 无法安全映射时标记 `needRepair: true`，保留旧数据

---

## D. habitService 设计

### D.1 模块职责

```
habitService 负责：
- 内置习惯读取
- 用户习惯实例 CRUD
- 策略版本管理
- 今日习惯生成
- userHabitId 生成
- policyVersion 本地集合读写
```

### D.2 核心接口

```javascript
// ==================== 内置习惯 ====================
function getBuiltInHabits()
function getBuiltInHabitDef(habitId)

// ==================== 用户习惯实例 ====================
async function addHabit(habitId, policyInput)
function getActiveUserHabits()
function getHabitByUserHabitId(userHabitId)
function getHabitsByHabitId(habitId)
async function softDeleteHabit(userHabitId)

// ==================== 策略版本 ====================
async function createPolicyVersion(userHabitId, policyInput)
function getActivePolicyVersion(userHabitId)
function getPolicyVersionsByUserHabitId(userHabitId)
function closePolicyVersion(policyVersionId, effectiveEndDate)

// ==================== 今日习惯 ====================
async function getTodayHabits(date)

// ==================== userHabitId 生成 ====================
function generateUserHabitId(habitId)
```

### D.3 关键实现逻辑

#### addHabit 流程

```
addHabit(habitId, policyInput)
  |
  v
1. 校验 habitId 有效性
2. 校验 policyInput 合法性
3. 生成新的 userHabitId
4. 创建 UserHabit 对象 { userHabitId, habitId, status: 'active', createdAt, deletedAt: null, ... }
5. 保存到 storageService（触发迁移）
6. 调用 createPolicyVersion 创建首个策略版本
7. 更新 UserHabit.latestPolicyVersionId
8. 更新 migrationMeta.userHabitInstances
9. 返回 UserHabit
```

#### softDeleteHabit 流程

```
softDeleteHabit(userHabitId)
  |
  v
1. 查找 UserHabit
2. 更新 status = 'deleted', deletedAt = 当前时间
3. 关闭当前策略版本（effectiveEndDate = 当天）
4. 更新 migrationMeta.userHabitInstances 中该实例的 deletedAt
5. 返回 true
```

---

## E. checkinService 设计（纯本地）

### E.1 模块职责

```
checkinService 负责（纯本地，不含云同步）：
- 打卡操作（checkin / undoCheckin）
- DailyCheckinState 本地状态管理
- 操作流水（checkinOperation）本地记录
```

### E.2 核心接口

```javascript
async function toggleCheckin(userHabitId, date)
async function checkin(userHabitId, date)
async function undoCheckin(userHabitId, date)
function getDailyState(userHabitId, date)
function getDailyStatesByDate(date)
function getDailyStatesByRange(startDate, endDate)
function getCheckinHistory(userHabitId, date)
```

### E.3 关键约束

- 不调用 wx.cloud.callFunction
- pendingOperations 由 Phase 4 syncService 消费
- 打卡前校验 userHabitId 对应实例是否 active

---

## F. DailyCheckinState 设计

### F.1 数据结构（最小化）

```javascript
const DAILY_STATE_STATUS = {
  unchecked: 'unchecked',
  checked: 'checked',
  canceled: 'canceled'
}
```

本阶段只实现这三个状态。

### F.2 存储方式

```javascript
// storageService 扩展
function getDailyCheckinStates()
function setDailyCheckinStates(states)
function getDailyState(userHabitId, date)
function setDailyState(state)
```

存储位置：`dailyCheckinStates`

---

## G. policyVersion 本地存储

### G.1 storage key 定义

在 `constants/storageKeys.js` 新增：

```javascript
const STORAGE_KEYS = {
  // ... 现有 keys ...
  policyVersions: 'policyVersions',
  dailyStates: 'dailyCheckinStates',
  checkinOperations: 'checkinOperations',
  migrationMeta: 'migrationMeta'
}
```

### G.2 storageService 扩展

```javascript
function getPolicyVersions() {
  return asArray(getItem(STORAGE_KEYS.policyVersions))
}

function setPolicyVersions(versions) {
  return setItem(STORAGE_KEYS.policyVersions, asArray(versions))
}

function getPolicyVersionsByUserHabitId(userHabitId) {
  return getPolicyVersions().filter(pv => pv.userHabitId === userHabitId)
}

function getActivePolicyVersion(userHabitId) {
  return getPolicyVersions().find(pv =>
    pv.userHabitId === userHabitId &&
    pv.effectiveEndDate === null
  )
}

function savePolicyVersion(policyVersion) {
  const versions = getPolicyVersions()
  const index = versions.findIndex(pv => pv.policyVersionId === policyVersion.policyVersionId)
  if (index >= 0) {
    versions[index] = policyVersion
  } else {
    versions.push(policyVersion)
  }
  setPolicyVersions(versions)
}

function closePolicyVersion(policyVersionId, effectiveEndDate) {
  const versions = getPolicyVersions()
  const pv = versions.find(pv => pv.policyVersionId === policyVersionId)
  if (pv) {
    pv.effectiveEndDate = effectiveEndDate
    setPolicyVersions(versions)
  }
}
```

### G.3 迁移备份

```javascript
const backupKey = `policyVersions_backup_phase3_${Date.now()}`
setItem(backupKey, getPolicyVersions())
```

---

## H. Phase 3 实施阶段拆分

### Phase 3A：本地迁移 + habitService + userHabitId 生命周期

**修改文件**（4个）：

| 文件 | 性质 | 说明 |
|------|------|------|
| `miniprogram/constants/idPrefixes.js` | 新增 | ID 前缀常量 |
| `miniprogram/constants/storageKeys.js` | 修改 | 新增 key |
| `miniprogram/services/storageService.js` | 修改 | 迁移逻辑 + policyVersion 读写 |
| `miniprogram/services/habitService.js` | 新增 | 习惯服务层 |

**Phase 3A 验收项**：
1. `addHabit('1', {...})` 生成带 userHabitId 的记录
2. 同一 habitId 添加两次，生成不同的 userHabitId
3. `softDeleteHabit` 后 status='deleted'，deletedAt 非 null
4. `getActiveUserHabits()` 不返回已删除记录
5. policyVersion 创建后保存在 `policyVersions`
6. `closePolicyVersion` 正确设置 effectiveEndDate
7. 迁移前有备份文件（MyHabits_backup、CheckinLogs_backup、policyVersions_backup）
8. 迁移幂等（重复读取不生成新 ID）
9. CheckinLogs 映射：按生命周期区间判断，ambiguous 日志标记 needRepair
10. 删除后重加生成新 userHabitId（不是恢复旧实例）

---

### Phase 3B：checkinOperation + DailyCheckinState + checkinService 本地

**修改文件**（3个）：

| 文件 | 性质 | 说明 |
|------|------|------|
| `miniprogram/models/checkinOperation.js` | 新增 | 操作流水模型 |
| `miniprogram/models/dailyCheckinState.js` | 新增 | 每日状态模型 |
| `miniprogram/services/checkinService.js` | 新增 | 打卡服务层 |

**Phase 3B 验收项**：
1. `checkin()` 生成 DailyCheckinState
2. `undoCheckin()` 更新状态为 canceled
3. 重复打卡幂等返回已有状态
4. `getDailyState()` 返回正确状态
5. `checkinHistory` 可查询操作记录

---

### Phase 3C：home/habits 最小 JS 接入

**修改文件**（2个）：

| 文件 | 性质 | 说明 |
|------|------|------|
| `miniprogram/pages/home/home.js` | 修改 | 接入 habitService + checkinService |
| `miniprogram/pages/habits/habits.js` | 修改 | 接入 habitService |

**Phase 3C 验收拆分**：

**Phase 3C-1**（先接 habits.js）：
- 添加习惯后 MyHabits 有 userHabitId
- 删除习惯后 status='deleted'，deletedAt 非 null
- 重新添加生成新的 userHabitId（不是恢复旧实例）

**Phase 3C-2**（再接 home.js）：
- 首页习惯列表正常显示
- 打卡/取消操作正常
- 进度显示正确

---

## I. Phase 3 验收标准

### I.1 允许进入 Phase 4 的条件

| 验收项 | 标准 | 验证方式 |
|--------|------|----------|
| habitService 可用 | `addHabit` 生成唯一 userHabitId | 单元测试 |
| 多实例 | 同一 habitId 多次添加生成不同 userHabitId | 单元测试 |
| 软删除 | `softDeleteHabit` 后 status='deleted'，deletedAt 非 null | 单元测试 |
| checkinService 可用 | `checkin` 生成 DailyCheckinState | 单元测试 |
| 重复打卡幂等 | 同一 userHabitId + date 重复打卡返回已有状态 | 单元测试 |
| DailyCheckinState | 打卡后 checked，取消后 canceled | 单元测试 |
| CheckinLogs 映射安全 | 基于生命周期区间判断，ambiguous 标记 needRepair | 单元测试 |
| 区间边界 | 删除后重加的日志不会归到旧实例 | 单元测试 |
| 迁移幂等 | 重复读取不生成新 userHabitId | 集成测试 |
| 迁移有备份 | 三个备份文件都存在 | 代码审查 |
| policyVersion 存储 | 创建后保存在 policyVersions，关闭后 effectiveEndDate 正确 | 单元测试 |
| habits.js 接入 | 添加/删除正常，重新添加生成新 userHabitId | 手动测试 |
| home.js 接入 | 打卡/取消正常，进度正确 | 手动测试 |
| npm test 通过 | 所有单元测试通过 | CI |

### I.2 明确禁止事项

- cloudService / syncService / EventBus
- WXML/WXSS 修改
- 按 `habitId` 查 first active 作为打卡入口
- ambiguous CheckinLogs 强行补错 userHabitId
- 迁移无备份
- policyVersion 未持久化

---

## J. 文件修改清单（Phase 3 最终版）

### Phase 3A
| 文件 | 性质 |
|------|------|
| `miniprogram/constants/idPrefixes.js` | 新增 |
| `miniprogram/constants/storageKeys.js` | 修改 |
| `miniprogram/services/storageService.js` | 修改 |
| `miniprogram/services/habitService.js` | 新增 |

### Phase 3B
| 文件 | 性质 |
|------|------|
| `miniprogram/models/checkinOperation.js` | 新增 |
| `miniprogram/models/dailyCheckinState.js` | 新增 |
| `miniprogram/services/checkinService.js` | 新增 |

### Phase 3C
| 文件 | 性质 |
|------|------|
| `miniprogram/pages/home/home.js` | 修改 |
| `miniprogram/pages/habits/habits.js` | 修改 |

---

## K. 关键技术约束（最终版）

### K.1 不修改云函数

### K.2 不调用云函数

pendingOperations 由 Phase 4 syncService 消费。

### K.3 不引入 EventBus

页面调用 service 后显式刷新。

### K.4 不修改 WXML/WXSS

### K.5 页面打卡入口必须获取唯一 userHabitId

`taskList._id` 承载 userHabitId，禁止按 habitId 查 first active。

### K.6 CheckinLogs 映射必须基于生命周期区间

`log.date >= createdAt && log.date < deletedAt`，ambiguous 日志必须 `needRepair: true`。

### K.7 policyVersion 必须持久化

storage key、读写方法、备份必须完整。

---

*本方案为 Phase 3 正式实施方案（v4 修复版），所有重构工作须严格按阶段执行。*