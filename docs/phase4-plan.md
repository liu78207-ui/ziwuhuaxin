# phase4-plan.md

> 生成时间：2026/05/23
> 阶段：Phase 4
> 依赖：Phase 3 完成
> 状态：正式方案

---

## A. Phase 4 总体目标

### A.1 核心目标

Phase 4 的核心目标是：**建立本地优先 + 操作流水云同步架构**，让本地操作在离线时可写、云端确认后同步、失败可重试、幂等不重复。

具体目标：
1. 建立 `cloudService`（统一封装 wx.cloud.callFunction）
2. 建立 `syncService`（pending 队列 + push/pop + retry）
3. 建立 `pendingOperations` 本地队列
4. 建立 `operationId` / `idempotencyKey` 生成规则
5. 建立本地优先同步策略（乐观更新 + 服务端确认）
6. 建立 checkinOperation 云同步链路（checkin / undoCheckin）
7. 建立 userHabit / policyVersion 云同步链路
8. 建立失败重试机制
9. 建立断网恢复机制

### A.2 为什么必须建立"本地优先 + 操作流水同步"架构

**当前核心风险：**

1. **离线打卡风险**：Phase 3 的 `checkinService` 在本地写入 `DailyCheckinState`，但无 pending 队列，网络恢复后无法同步。离线操作会丢失。

2. **重复同步风险**：没有 `idempotencyKey`，同一打卡操作重试可能产生重复计数。

3. **状态错乱风险**：本地状态和云端状态各自为政，没有统一的 `syncing → synced` 确认回写机制。

4. **多端不一致风险**：换设备或清缓存后，没有可靠的 `recoverData` 链路恢复 `userHabit` / `policyVersion` / `dailyCheckinState`。

5. **操作丢失风险**：云端 `doCheckin` / `undoCheckin` 直接删改日志，不保留操作流水，取消打卡无据可查。

6. **undoCheckin 风险**：云端直接物理删除 `checkin_logs`，违反"禁止物理删除唯一历史记录"原则。

7. **删除同步风险**：`softDeleteHabit` 后云端策略记录未同步删除，导致同一习惯再添加时云端冲突。

8. **policyVersion 不一致风险**：云端 `user_strategy_versions` 按 `habit_id` 关闭版本，不按 `userHabitId`，同一内置习惯多实例时版本互相覆盖。

**解决之道：**

- 本地操作立即写（乐观更新），不等待云端
- 操作进入 pending 队列，网络恢复后依次 push
- 云端幂等确认，状态回写本地
- 服务端是最终事实源，本地状态必须与云端对齐
- checkinOperation 保留操作流水，取消不删记录
- 幂等 key 防止重复操作

### A.3 Phase 4 禁止事项

以下内容**不得**在 Phase 4 实施：
- 重构 reportService / stats.js
- 修改 WXML/WXSS / UI 风格
- 引入 WebSocket / 实时同步
- 引入复杂冲突解决系统（CRDT/OT）
- 引入 EventBus（页面通过 service 显式刷新）
- 大规模修改页面结构
- 重构 app.js
- 一次性重写 storageService
- 修改 DailyCheckinState / checkinService 核心业务逻辑

---

## B. 当前同步风险分析

### B.1 离线打卡风险

```
现状：checkinService 本地写 DailyCheckinState，无 pending 队列
网络恢复后本地变更无法同步到云端
用户以为打卡成功，云端无记录，换设备后数据丢失
```

### B.2 重复同步风险

```
现状：云函数 doCheckin 无 idempotencyKey
网络抖动导致重试，可能产生多条 checkin_logs
完成次数被放大
```

### B.3 状态错乱风险

```
现状：本地状态和云端状态各自维护
云端 undoCheckin 直接删除日志，本地状态未同步更新
页面显示与云端不一致
```

### B.4 多端不一致风险

```
现状：syncLocalData 可恢复 MyHabits / CheckinLogs
但无 userHabitId 生命周期映射，恢复后同一 habitId 多实例数据可能错乱
无 dailyCheckinState 恢复能力
```

### B.5 操作丢失风险

```
现状：undoCheckin 直接物理删除 checkin_logs
无操作流水，取消操作无据可查
删除当天报表口径无法正确处理
```

### B.6 undoCheckin 风险

```
云端直接删除日志（而非标记为 canceled）
违反"取消打卡必须生成 operation，禁止物理删除"原则
```

### B.7 删除同步风险

```
现状：habits.js removeStrategy 调用云函数 removeStrategy
但本地 softDeleteHabit 后云端策略记录未同步删除
重新添加同一习惯时云端可能返回旧策略
```

### B.8 policyVersion 同步风险

```
现状：saveStrategyVersion 按 habit_id 关闭版本
同一内置习惯多个 userHabit 实例时，旧版本被错误关闭
```

---

## C. cloudService 设计

### C.1 cloudService 职责

```
cloudService 是唯一前端云函数调用入口，负责：
- 封装 wx.cloud.callFunction
- 标准化错误码（统一错误结构）
- 标准化返回结构（{ success, data, error, serverTime }）
- 超时处理（默认 10s）
- 降级入口（网络异常时走 pending）
- serverTime 读取
- openid 获取（通过 login 云函数）
```

### C.2 允许进入 cloudService 的逻辑

- 所有业务云函数调用（doCheckin / undoCheckin / saveStrategy / removeStrategy / syncHabit / syncCheckin / recoverData）
- 错误码标准化
- 重试逻辑（syncService 调用 cloudService 时自行处理 retry）
- serverTime 校准

### C.3 禁止进入 cloudService 的逻辑

- pending 队列操作
- 本地状态读写
- 业务逻辑判断（幂等判断、冲突裁决）
- 直接操作 storage

### C.4 封装设计

```javascript
// services/cloudService.js

const CLOUD_FUNCTION_TIMEOUT = 10000  // 10s

const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  SERVER_ERROR: 'SERVER_ERROR',
  PARAM_ERROR: 'PARAM_ERROR',
  UNAUTH: 'UNAUTH'
}

// 统一调用入口
async function callFunction(name, data, options = {}) {
  const { timeout = CLOUD_FUNCTION_TIMEOUT, retries = 0 } = options

  try {
    const result = await wx.cloud.callFunction({
      name,
      data,
      timeout
    })

    if (result.errMsg && !result.errMsg.includes('ok')) {
      return {
        success: false,
        error: { code: ERROR_CODES.SERVER_ERROR, message: result.errMsg }
      }
    }

    return {
      success: true,
      data: result.result,
      serverTime: result.result?.serverTime || null
    }
  } catch (e) {
    // 网络异常处理
    if (e.errMsg && e.errMsg.includes('network')) {
      return {
        success: false,
        error: { code: ERROR_CODES.NETWORK_ERROR, message: e.message || '网络异常' },
        shouldPending: true  // 标记是否应进入 pending
      }
    }

    return {
      success: false,
      error: { code: ERROR_CODES.SERVER_ERROR, message: e.message || '调用失败' }
    }
  }
}

// 获取 openid（通过 login 云函数）
async function getOpenId() {
  const result = await callFunction('login', {})
  if (result.success && result.data.openid) {
    return { openid: result.data.openid }
  }
  return { openid: null }
}

// 获取服务端时间
async function getServerTime() {
  const result = await callFunction('login', {})
  return result.success ? (result.data.serverTime || Date.now()) : Date.now()
}

module.exports = {
  callFunction,
  getOpenId,
  getServerTime,
  ERROR_CODES
}
```

### C.5 错误处理规范

云函数返回统一结构：
```javascript
{
  success: true,
  data: { ... },
  serverTime: 1700000000000
}

{
  success: false,
  error: { code: 'ALREADY_CHECKED', message: '今日已打卡' }
}
```

前端 cloudService 根据 `success` 判断是否成功，`shouldPending: true` 时 syncService 将操作入 pending 队列。

---

## D. syncService 设计

### D.1 pendingOperations 队列结构

```javascript
// storageService 新增
{
  key: 'pendingOperations',
  structure: [
    {
      queueId: 'q_${timestamp}_${random}',  // 队列唯一ID
      entityType: 'checkin' | 'undoCheckin' | 'addHabit' | 'deleteHabit' | 'updatePolicy',
      entityId: 'userHabitId',               // 关联实体ID
      action: 'checkin' | 'undoCheckin' | 'add' | 'delete' | 'updatePolicy',
      payload: { userHabitId, habitId, policyVersionId, date, ... },
      idempotencyKey: 'ck_${userHabitId}_${date}_${action}',
      status: 'pending',  // pending | syncing | synced | failed
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      createdAt: '2026-05-23T10:00:00.000Z',
      updatedAt: '2026-05-23T10:00:00.000Z',
      nextRetryAt: null
    }
  ]
}
```

### D.2 operationId 生成规则

```javascript
// 格式：op_${timestamp}_${random}
function generateOperationId() {
  return `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}
```

### D.3 idempotencyKey 生成规则

```javascript
// checkin 操作
function generateCheckinIdempotencyKey(userHabitId, date, action) {
  return `ck_${userHabitId}_${date}_${action}`
}

// addHabit 操作
function generateAddHabitIdempotencyKey(habitId, userHabitId) {
  return `add_${habitId}_${userHabitId}`
}

// deleteHabit 操作
function generateDeleteHabitIdempotencyKey(userHabitId) {
  return `del_${userHabitId}`
}
```

### D.4 push 流程

```javascript
// syncService.push(entityType, action, payload)
// 1. 生成 queueId 和 idempotencyKey
// 2. 创建 pendingItem
// 3. 写入 pendingOperations 队列（unshift 入队）
// 4. 返回 queueId

async function push(entityType, action, payload) {
  const queueId = generateQueueId()
  const idempotencyKey = generateIdempotencyKey(entityType, action, payload)

  const item = {
    queueId,
    entityType,
    action,
    entityId: payload.userHabitId || payload.habitId || '',
    payload,
    idempotencyKey,
    status: 'pending',
    retryCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRetryAt: null
  }

  const queue = getPendingOperations()
  queue.unshift(item)  // 新操作插入队首
  setPendingOperations(queue)

  return queueId
}
```

### D.5 pop / pushToCloud 流程

```javascript
// syncService.processQueue()
// 遍历 pendingOperations，按顺序处理
// 幂等键相同且已 synced 的跳过
// 失败项保留或根据 retryCount 决定是否入队尾重试

async function processQueue() {
  const queue = getPendingOperations()
  if (queue.length === 0) return

  // 按 createdAt 从旧到新处理
  queue.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const processedQueue = []

  for (const item of queue) {
    if (item.status === 'synced') {
      processedQueue.push(item)
      continue
    }

    try {
      // 更新状态为 syncing
      item.status = 'syncing'
      item.updatedAt = new Date().toISOString()

      // 调用云函数
      const result = await cloudService.callFunction(
        getCloudFunctionName(item.entityType, item.action),
        buildCloudPayload(item)
      )

      if (result.success) {
        item.status = 'synced'
        item.updatedAt = new Date().toISOString()
      } else {
        item.status = 'failed'
        item.lastError = result.error?.message || '未知错误'
        item.retryCount += 1

        if (item.retryCount < item.maxRetries) {
          item.nextRetryAt = calculateNextRetry(item.retryCount)
          // 重试项放到队尾
        }
      }
    } catch (e) {
      item.status = 'failed'
      item.lastError = e.message
      item.retryCount += 1
    }

    processedQueue.push(item)
  }

  // 分离失败重试项和新失败项
  const failedItems = processedQueue.filter(i => i.status === 'failed' && i.retryCount < i.maxRetries)
  const finalItems = processedQueue.filter(i => i.status !== 'failed' || i.retryCount >= i.maxRetries)

  // 失败重试项放回队尾
  setPendingOperations([...finalItems, ...failedItems])
}
```

### D.6 retry 流程

```javascript
// syncService.retry(queueId)
// 用户主动重试 或 网络恢复时自动重试
// 复用原始 idempotencyKey

async function retry(queueId) {
  const queue = getPendingOperations()
  const item = queue.find(i => i.queueId === queueId)

  if (!item) return { success: false, error: 'NOT_FOUND' }
  if (item.retryCount >= item.maxRetries) {
    return { success: false, error: 'MAX_RETRIES_EXCEEDED' }
  }

  item.status = 'pending'
  item.updatedAt = new Date().toISOString()

  // 保存更新
  setPendingOperations(queue)

  // 触发处理
  return processQueue()
}

// 计算下次重试时间（指数退避）
function calculateNextRetry(retryCount) {
  const baseDelay = 5000  // 5s
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), 60000)  // 最多 60s
  return new Date(Date.now() + delay).toISOString()
}
```

### D.7 幂等机制

```javascript
// 云端根据 idempotencyKey 判断是否重复
// 前端 syncService 标记已 synced 的跳过重试
// pending 项根据 entityType + entityId + action 查重

function hasDuplicatePending(entityType, entityId, action) {
  const queue = getPendingOperations()
  return queue.some(i =>
    i.entityType === entityType &&
    i.entityId === entityId &&
    i.action === action &&
    (i.status === 'pending' || i.status === 'syncing')
  )
}
```

### D.8 syncStatus 生命周期

```javascript
// pendingOperations 每项的状态机
const SYNC_STATUS = {
  PENDING: 'pending',     // 已本地保存，等待同步
  SYNCING: 'syncing',     // 正在调用云函数
  SYNCED: 'synced',       // 云端确认成功
  FAILED: 'failed',       // 同步失败，等待重试
  RETRYING: 'retrying'    // 正在重试（等同于 syncing）
}

// 注意：页面层不得直接把状态改为 'synced'
// 必须由云端确认后回写
```

### D.9 失败恢复机制

```javascript
// app.onShow / 网络恢复时调用
async function recoverOrSync() {
  // 1. 检测网络状态
  const isOnline = wx.getNetworkType() !== 'none'

  if (!isOnline) return

  // 2. 处理 pending 队列
  await processQueue()

  // 3. 尝试同步最新数据
  await syncFromCloud()
}

// 网络恢复回调
function onNetworkRecovery() {
  // 防抖：延迟 2s 再处理，避免频繁触发
  setTimeout(() => {
    recoverOrSync()
  }, 2000)
}
```

### D.10 重复操作去重机制

```javascript
// push 前先查重
async function pushWithDedup(entityType, action, payload) {
  const queue = getPendingOperations()

  // 查找相同 entityType + action + entityId 的 pending/syncing 项
  const existing = queue.find(i =>
    i.entityType === entityType &&
    i.action === action &&
    i.entityId === payload.userHabitId &&
    (i.status === 'pending' || i.status === 'syncing')
  )

  if (existing) {
    return { success: false, reason: 'DUPLICATE_PENDING', queueId: existing.queueId }
  }

  return push(entityType, action, payload)
}
```

---

## E. checkinOperation 同步设计

### E.1 checkin 操作流程

```
用户点击打卡
  -> checkinService.checkin(userHabitId, date)
    -> 本地 storageService.setDailyState(checked)
    -> 创建 checkinOperation（pending）
  -> syncService.push('checkin', 'checkin', { userHabitId, habitId, date, operationId, idempotencyKey })
    -> 操作进入 pendingOperations 队列
  -> cloudService.callFunction('syncCheckin', payload)
    -> 云端幂等写入 checkin_operations
    -> 云端更新 daily_checkin_states
    -> 云端返回 serverTime、dailyState
  -> syncService 回写 status = 'synced'
  -> EventBus emit checkin:updated
```

### E.2 undoCheckin 操作流程

```
用户点击取消打卡
  -> checkinService.undoCheckin(userHabitId, date)
    -> 本地 storageService.setDailyState(canceled)
    -> 创建 undoCheckinOperation（pending）
  -> syncService.push('checkin', 'undoCheckin', { userHabitId, habitId, date, operationId, idempotencyKey })
  -> cloudService.callFunction('syncCheckin', payload)
    -> 云端幂等写入（action: cancel）
    -> 云端更新 daily_checkin_states
  -> syncService 回写 status = 'synced'
  -> EventBus emit checkin:updated
```

### E.3 operationId 结构

```javascript
// 本地生成 operationId（仅用于关联本地 dailyCheckinState）
{
  operationId: 'op_${timestamp}_${random}',
  idempotencyKey: 'ck_${userHabitId}_${date}_${action}',
  userHabitId: 'uh_1_xxx_abc',
  habitId: '1',
  policyVersionId: 'pv_xxx',
  date: '2026-05-23',
  action: 'checkin' | 'cancel',
  clientTime: '2026-05-23T10:00:00.000+08:00',
  syncStatus: 'pending'
}
```

### E.4 本地状态

```javascript
// DailyCheckinState（Phase 3 已建立）
{
  stateId: 'ds_${timestamp}_${random}',
  userHabitId: 'uh_xxx',
  habitId: '1',
  date: '2026-05-23',
  status: 'checked' | 'canceled' | 'unchecked',
  checkedAt: '2026-05-23T10:00:00.000+08:00' | null,
  canceledAt: '2026-05-23T10:05:00.000+08:00' | null,
  lastOperationId: 'op_xxx',
  syncStatus: 'pending' | 'synced'
}
```

### E.5 云端状态

```javascript
// checkin_operations（云端集合）
{
  _id: '自动生成',
  _openid: '云端获取',
  operationId: 'op_xxx',
  idempotencyKey: 'ck_uh_xxx_2026-05-23_checkin',
  userHabitId: 'uh_xxx',
  habitId: '1',
  policyVersionId: 'pv_xxx',
  date: '2026-05-23',
  action: 'checkin' | 'cancel',
  clientTime: '2026-05-23T10:00:00.000+08:00',
  serverTime: 1700000000000,
  source: 'miniprogram',
  syncStatus: 'synced',
  createdAt: serverTime
}

// daily_checkin_states（云端集合）
{
  _id: '自动生成',
  _openid: '云端获取',
  userHabitId: 'uh_xxx',
  habitId: '1',
  policyVersionId: 'pv_xxx',
  date: '2026-05-23',
  status: 'checked' | 'canceled',
  checkedAt: serverTime,
  canceledAt: null,
  lastOperationId: 'op_xxx',
  syncStatus: 'synced',
  updatedAt: serverTime
}
```

### E.6 pending → syncing → synced → failed 生命周期

```
pending（本地操作已保存，等待同步）
  -> syncing（正在调用云函数 syncCheckin）
    -> synced（云端确认成功，status 回写本地）
    -> failed（同步失败，保留 pending 或标记 failed）
  -> retrying（网络恢复后重试）
    -> syncing（再次调用）
      -> synced
      -> failed（超过最大重试次数）
```

---

## F. userHabit / policyVersion 同步设计

### F.1 addHabit 同步

```
用户确认添加习惯
  -> habitService.addHabit(habitId, policyInput)
    -> 本地创建 userHabit（status: active）
    -> 本地创建 policyVersion（首个版本）
    -> 操作进入 pendingOperations
  -> cloudService.callFunction('syncHabit', payload)
    -> 云端幂等 upsert user_habits
    -> 云端写入 habit_policy_versions
    -> 云端返回确认状态
  -> syncService 回写 status = 'synced'
  -> EventBus emit habit:updated
```

### F.2 deleteHabit 同步

```
用户确认删除习惯
  -> habitService.softDeleteHabit(userHabitId)
    -> 本地更新 userHabit（status: deleted, deletedAt）
    -> 本地关闭 policyVersion（effectiveEndDate）
    -> 操作进入 pendingOperations
  -> cloudService.callFunction('syncHabit', payload)
    -> 云端更新 user_habits（软删除标记）
    -> 云端关闭 habit_policy_versions
  -> syncService 回写 status = 'synced'
  -> EventBus emit habit:updated
```

### F.3 policyVersion 同步

```
用户编辑策略
  -> habitService.createPolicyVersion(userHabitId, policyInput)
    -> 本地关闭旧 policyVersion（effectiveEndDate）
    -> 本地创建新 policyVersion
    -> 操作进入 pendingOperations
  -> cloudService.callFunction('syncHabit', payload)
    -> 云端 upsert 新版本，关闭旧版本
  -> syncService 回写 status = 'synced'
```

### F.4 删除后重加同步

```
删除 habitId=A 的实例，创建新 userHabitId=B
  -> addHabit 操作入 pending
  -> 云端 syncHabit 时 idempotencyKey = add_${habitId}_${userHabitId}
  -> 云端检查已存在的 active userHabit，若有则不重复创建
  -> 本地应生成新的 userHabitId，不会复用已删除实例
```

### F.5 多实例同步

```
同一 habitId 有多个 userHabit 实例时：
  -> 每个实例单独 sync（不同的 userHabitId）
  -> 云端按 userHabitId 区分实例
  -> policyVersion 按 userHabitId 归属，不互相覆盖
```

---

## G. 离线优先策略

### G.1 本地是否允许先写

**是。** 本地操作必须立即写入 storage（乐观更新），不等待云端确认。

```
checkin(userHabitId, date)
  -> 本地 setDailyState(status: checked)
  -> 本地生成 checkinOperation（status: pending）
  -> push 到 pendingOperations 队列
  -> 返回给页面（UI 已更新）
  -> 后台等待网络同步
```

### G.2 云端失败是否回滚

**否。** 云端失败时本地状态保留为 `pending` 或 `failed`，不自动回滚。

```
云端 syncCheckin 失败
  -> pendingOperations 中该项 status = 'failed'
  -> 本地 DailyCheckinState 保持 checked（不自动变回 unchecked）
  -> 用户看到打卡成功状态（即使云端未确认）
  -> 网络恢复后重试，或用户手动重试
```

**原因**：用户已操作成功（本地已记录），不应因网络问题让用户困惑。失败时用户可见同步异常提示，但本地打卡状态不变。

### G.3 如何处理断网

```
1. 网络断开时，cloudService.callFunction 抛出网络异常
2. syncService 捕获异常，标记 shouldPending: true
3. 操作自动进入 pendingOperations 队列
4. 页面显示打卡成功（本地乐观更新）
5. 同步状态显示"待同步"或"同步失败"
6. 网络恢复后，onNetworkRecovery 触发 processQueue
7. 成功时状态变为"已同步"，失败时保留"待重试"
```

### G.4 如何恢复同步

```
app.onShow / onNetworkRecovery
  -> syncService.recoverOrSync()
    -> processQueue() 处理所有 pending 项
    -> 按 createdAt 从旧到新依次同步
    -> 幂等跳过已 synced 的
    -> 失败项根据 retryCount 决定重试或保留
```

### G.5 如何避免页面卡死

```
1. syncService.processQueue() 为异步，不阻塞 UI
2. cloudService.callFunction 设置 timeout（10s），不无限等待
3. 批量同步时每项单独 try-catch，单项失败不阻断队列
4. 网络恢复触发时加防抖（2s），避免频繁重启
5. 页面通过 EventBus 接收同步结果更新，不轮询状态
```

---

## H. 冲突处理策略（简化版）

### H.1 V1 简化冲突模型

V1 采用"服务端最终状态为准"原则，不实现复杂冲突裁决。

**允许的场景：**
- 本地 pending 操作与云端恢复数据冲突时，以云端恢复数据为准
- 多端同时打卡同一习惯时，以云端 `daily_checkin_states` 最终状态为准

**V1 不支持的场景：**
- 多端离线乱序操作的精确裁决（如先打卡后取消，乱序到达）
- 用户手动冲突解决中心

**数据错乱防护：**
- `idempotencyKey` 防止重复操作
- `syncStatus` 防止状态被意外覆盖
- 冲突写入 `conflictLogs`，保留未来 V2 完整裁决空间

### H.2 避免严重数据错乱

```
1. 服务端 daily_checkin_states 按 userHabitId + date 唯一索引
   -> 同一用户同一习惯同一天只有一个最终状态
2. checkin_operations 按 idempotencyKey 唯一索引
   -> 重复操作不产生重复记录
3. 云端操作流水只追加不修改历史
   -> cancel 操作是新建一条 action=cancel 记录
4. 本地 pending 操作失败不自动删除
   -> 用户可手动重试或放弃
```

### H.3 暂不支持的场景

```
1. 多端离线时同一习惯打卡/取消的精确顺序裁决
   -> V1 以服务端最后接收状态为准
2. 用户主动选择"以本地为准"或"以云端为准"
   -> V1 无此功能
3. 跨设备同步时 habitId 多实例的生命周期合并
   -> V1 按 userHabitId 分开处理
```

---

## I. 云端集合设计

### I.1 checkin_operations

```javascript
// 操作流水集合
{
  _id: ObjectId,           // 云端自动生成
  _openid: string,         // 云端获取，禁止前端传入
  operationId: string,     // 前端生成，客户端唯一标识
  idempotencyKey: string,   // 唯一索引，用于幂等
  userHabitId: string,
  habitId: string,
  policyVersionId: string,
  date: string,            // YYYY-MM-DD，业务日期
  action: 'checkin' | 'cancel',
  clientTime: string,       // ISO 时间戳，客户端时间
  serverTime: number,       // 云端时间戳
  timezone: string,         // 'Asia/Shanghai'
  source: 'miniprogram',    // 来源标识
  syncStatus: 'synced',
  createdAt: serverTime
}

// 索引建议
// - idempotencyKey: 唯一索引（防重复）
// - _openid + date: 普通索引（按用户按日期查询）
// - _openid + userHabitId + date: 普通索引（按实例按日期查询）
```

### I.2 daily_checkin_states

```javascript
// 每日最终状态集合
{
  _id: ObjectId,
  _openid: string,
  userHabitId: string,
  habitId: string,
  policyVersionId: string,
  date: string,
  status: 'checked' | 'canceled',
  checkedAt: number | null,
  canceledAt: number | null,
  lastOperationId: string,
  syncStatus: 'synced',
  updatedAt: serverTime
}

// 索引建议
// - _openid + userHabitId + date: 唯一索引（每个实例每天唯一状态）
```

### I.3 user_habits

```javascript
// 用户习惯实例集合
{
  _id: ObjectId,
  _openid: string,
  userHabitId: string,      // 客户端生成，uh_${habitId}_${timestamp}_${random}
  habitId: string,          // 内置习惯 ID
  status: 'active' | 'deleted',
  createdAt: string,        // ISO 时间
  deletedAt: string | null,
  latestPolicyVersionId: string,
  syncStatus: 'synced',
  updatedAt: serverTime
}

// 索引建议
// - _openid + userHabitId: 唯一索引
// - _openid + habitId + status: 普通索引（查询某习惯的所有实例）
```

### I.4 habit_policy_versions

```javascript
// 策略版本集合
{
  _id: ObjectId,
  _openid: string,
  policyVersionId: string,
  userHabitId: string,
  habitId: string,
  duration: number,
  frequencyType: 'daily' | 'interval' | 'weekly',
  frequencyConfig: { intervalDays: number } | { weekdays: number[] },
  startDate: string,        // YYYY-MM-DD
  effectiveStartDate: string | null,
  effectiveEndDate: string | null,  // null 表示当前有效
  syncStatus: 'synced',
  createdAt: serverTime,
  updatedAt: serverTime
}

// 索引建议
// - _openid + userHabitId: 普通索引
// - _openid + userHabitId + effectiveStartDate: 普通索引
```

### I.5 是否 Phase 4 引入 daily_checkin_states 云端集合

**是。** Phase 4 将建立 `daily_checkin_states` 云端集合，用于：
- 服务端记录每日最终打卡状态
- 支持 `recoverData` 恢复近期每日状态
- 报表系统读取服务端最终状态

Phase 4 仅在云端新建集合，不修改本地 `DailyCheckinState` 结构（已由 Phase 3 建立）。

---

## J. 实施阶段拆分

### Step 1：建立 cloudService

**修改文件**：
- 新增 `miniprogram/services/cloudService.js`

**风险**：低（纯新增，不修改现有逻辑）

**验证方式**：
- `require('./cloudService')` 可正常加载
- `cloudService.callFunction('login', {})` 可调用（网络正常时）
- 错误码结构正确返回

**回滚方案**：删除 cloudService.js 即可

**UI 影响**：无

**旧数据影响**：无

---

### Step 2：建立 pendingOperations 存储

**修改文件**：
- 修改 `miniprogram/constants/storageKeys.js`（新增 `pendingOperations` key）
- 修改 `miniprogram/services/storageService.js`（新增 pending 操作读写）

**风险**：低（仅新增 key 和读写方法，不破坏现有数据）

**验证方式**：
- `storageService.getPendingOperations()` 返回空数组或既有数据
- `storageService.pushPending(item)` 可正常添加
- `storageService.updatePendingItem(queueId, updates)` 可正常更新

**回滚方案**：删除新增方法，旧逻辑不变

**UI 影响**：无

**旧数据影响**：无

---

### Step 3：建立 syncService 基础结构

**修改文件**：
- 新增 `miniprogram/services/syncService.js`

**核心函数**：
- `generateQueueId()`
- `generateIdempotencyKey()`
- `push(entityType, action, payload)`
- `pushWithDedup(entityType, action, payload)`
- `getPendingOperations()`
- `setPendingOperations(queue)`
- `hasDuplicatePending(entityType, entityId, action)`

**风险**：中（新增服务层，需与 checkinService/habitService 配合）

**验证方式**：
- `syncService.push('checkin', 'checkin', {...})` 可正常添加 pending 项
- 相同 entityType + action + entityId 的重复 push 返回 `DUPLICATE_PENDING`
- `npm test` 通过

**回滚方案**：删除 syncService.js，pendingOperations 保留在 storage（旧数据无害）

**UI 影响**：无

**旧数据影响**：无

---

### Step 4：cloudService 与 syncService 集成

**修改文件**：
- 修改 `miniprogram/services/cloudService.js`（新增 shouldPending 标记处理）
- 修改 `miniprogram/services/syncService.js`（新增 `processQueue()`, `retry()`, `recoverOrSync()`）

**风险**：中（涉及网络调用和队列处理逻辑）

**验证方式**：
- 断网时 `cloudService.callFunction` 返回 `shouldPending: true`
- pending 项在网络恢复后可被 `processQueue()` 处理
- `npm test` 通过

**回滚方案**：回退 cloudService.js 和 syncService.js

**UI 影响**：无

**旧数据影响**：无

---

### Step 5：checkinService 接入 syncService（关键）

**修改文件**：
- 修改 `miniprogram/services/checkinService.js`（checkin / undoCheckin 后调用 syncService.push）

**关键约束**：
- checkinService 本地操作不变（Phase 3 已建立）
- 仅在本地操作成功后调用 `syncService.push()`
- 不等待云端确认返回（异步）

**风险**：中（涉及业务逻辑修改，需确保本地状态优先）

**验证方式**：
- `checkinService.checkin()` 本地状态更新成功
- pendingOperations 中有对应项
- 重复 checkin 幂等（不生成多个 pending 项）
- `npm test` 通过

**回滚方案**：回退 checkinService.js，移除 syncService.push 调用

**UI 影响**：无（仅内部逻辑）

**旧数据影响**：无

---

### Step 6：habitService 接入 syncService（关键）

**修改文件**：
- 修改 `miniprogram/services/habitService.js`（addHabit / softDeleteHabit / createPolicyVersion 后调用 syncService.push）

**关键约束**：
- habitService 本地操作不变（Phase 3 已建立）
- 仅在本地操作成功后调用 `syncService.push()`

**风险**：中（涉及习惯生命周期修改）

**验证方式**：
- `habitService.addHabit()` 本地状态更新成功
- pendingOperations 中有对应 addHabit 项
- `habitService.softDeleteHabit()` 后有 deleteHabit pending 项
- `npm test` 通过

**回滚方案**：回退 habitService.js，移除 syncService.push 调用

**UI 影响**：无

**旧数据影响**：无

---

### Step 7：网络恢复自动同步

**修改文件**：
- 修改 `miniprogram/app.js`（在 `onShow` 或网络监听中调用 `syncService.recoverOrSync()`）

**风险**：中（涉及 app.js 生命周期修改，需确保不破坏现有启动逻辑）

**验证方式**：
- 网络恢复后 `processQueue()` 被调用
- pending 项被依次同步
- 成功项状态变为 `synced`

**回滚方案**：回退 app.js，移除 syncService 调用

**UI 影响**：无

**旧数据影响**：无

---

### Step 8：云函数 syncCheckin 实现（或兼容现有 doCheckin/undoCheckin）

**修改文件**：
- 新增或修改 `cloudfunctions/syncCheckin/index.js`（或兼容现有 `doCheckin` / `undoCheckin`）

**关键约束**：
- 必须支持 `idempotencyKey` 幂等
- 必须写入 `checkin_operations`
- 必须更新 `daily_checkin_states`
- 必须返回 `serverTime` 和 `dailyState`

**风险**：高（涉及云函数和数据库写入）

**验证方式**：
- 同一 `idempotencyKey` 重复调用不产生重复 operation
- `daily_checkin_states` 状态正确更新
- 返回结构包含 `success`, `data`, `serverTime`

**回滚方案**：回退云函数代码，使用原有 `doCheckin` / `undoCheckin`（但不支持幂等）

**UI 影响**：无

**旧数据影响**：无（仅新增云端集合）

---

## K. Phase 4 验收标准

### K.1 允许进入 Phase 5 的条件

| 验收项 | 标准 | 验证方式 |
|--------|------|----------|
| cloudService 可用 | `cloudService.callFunction()` 正常调用并返回统一结构 | 单元测试 |
| cloudService 错误处理 | 网络异常时返回 `shouldPending: true` | 模拟断网测试 |
| pendingOperations 存储 | 可正常读写 pendingOperations 队列 | 单元测试 |
| syncService.push | 可将操作加入 pending 队列 | 单元测试 |
| syncService.pushWithDedup | 重复操作不生成多个 pending 项 | 单元测试 |
| checkinService 接入 syncService | checkin 后 pendingOperations 有对应项 | 单元测试 |
| habitService 接入 syncService | addHabit/softDeleteHabit 后 pendingOperations 有对应项 | 单元测试 |
| processQueue 可执行 | pending 项可被依次处理 | 集成测试（mock 云函数） |
| 幂等键复用 | 重试使用原始 idempotencyKey | 单元测试 |
| 网络恢复同步 | 网络恢复后 pending 项自动同步 | 手动测试（飞行模式） |
| checkin 操作流贯通 | 本地打卡 -> pending -> 云端确认 -> synced | 手动测试 |
| 云函数幂等 | 同一 idempotencyKey 重复调用不重复计数 | 云函数测试 |
| npm test 通过 | 所有单元测试通过 | CI |

### K.2 禁止事项检查

- ✅ 页面层无新增直接 storage 调用
- ✅ 页面层无新增直接云函数调用
- ✅ 页面层无新增 pending 队列操作
- ✅ checkinService 核心业务逻辑未修改（仅增加 push 调用）
- ✅ habitService 核心业务逻辑未修改（仅增加 push 调用）
- ✅ 无 EventBus（页面通过显式刷新接收更新）
- ✅ 无 UI 修改（WXML/WXSS）
- ✅ 云函数未修改旧集合结构（仅新增 checkin_operations / daily_checkin_states）

---

*本方案为 Phase 4 正式实施方案（v1），所有实施工作须严格按 Step 顺序执行。*