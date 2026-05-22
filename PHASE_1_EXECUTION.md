# 阶段1实施步骤：服务层基础设施

**目标**：创建 timeService.js、storageService.js 及相关常量，作为服务层的地基

---

## 步骤总览

| 顺序 | 文件 | 操作 | 风险 |
|------|------|------|------|
| 1 | `constants/storageKeys.js` | 新增 | 低 |
| 2 | `services/timeService.js` | 新增 | 低 |
| 3 | `services/storageService.js` | 新增 | 中 |
| 4 | 现有文件改造 | 修改 | 中 |

---

## Step 1：新增 `constants/storageKeys.js`

### 修改内容
创建存储 Key 常量文件，统一管理所有 storage key。

**文件路径**：`miniprogram/constants/storageKeys.js`

```javascript
// constants/storageKeys.js
// 存储 Key 常量

const STORAGE_KEYS = {
  // 当前使用
  habits: 'MyHabits',
  logs: 'CheckinLogs',
  allHabitsInfo: 'AllHabitsInfo',
  userOpenid: 'user_openid',
  userInfo: 'userInfo',
  operationLogs: 'operationLogs',

  // 旧键（兼容迁移）
  userStrategies: 'userStrategies',
  checkinRecords: 'checkin_records',

  // 新增（V2）
  dailyStates: 'dailyCheckinStates',
  cacheMeta: 'cacheMeta'
}

module.exports = { STORAGE_KEYS }
```

### 验证方式
1. `node -e "require('./miniprogram/constants/storageKeys.js')"` 无报错
2. 确认 `STORAGE_KEYS` 包含习惯、打卡、用户信息等所有 key

### 风险
- **低**：纯常量文件，不涉及运行时逻辑
- **风险点**：如果原有代码使用了不同的 key 名，需要保持兼容

### 回滚方法
删除 `miniprogram/constants/storageKeys.js`，业务代码中直接使用字面量字符串不受影响。

---

## Step 2：新增 `services/timeService.js`

### 修改内容
创建时间服务，统一所有业务时间入口。

**文件路径**：`miniprogram/services/timeService.js`

```javascript
// services/timeService.js
// 唯一业务时间入口，统一 Asia/Shanghai

let _serverTimeOffset = 0
let _serverTimeConfidence = 'low'

function getNow() {
  return new Date(Date.now() + _serverTimeOffset)
}

function getBusinessDate() {
  return formatDate(getNow())
}

function getTodayKey() {
  return getBusinessDate()
}

function getSimulatedDate(app) {
  const DEBUG_DAY_OFFSET = app && app.getDebugOffset ? app.getDebugOffset() : 0
  const today = new Date()
  if (DEBUG_DAY_OFFSET !== 0) {
    today.setDate(today.getDate() + DEBUG_DAY_OFFSET)
  }
  return today
}

function getSimulatedDateStr(app) {
  return formatDate(getSimulatedDate(app))
}

function parseDate(dateStr) {
  if (!dateStr) return null
  const normalized = String(dateStr).split('T')[0]
  const parts = normalized.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr)
  if (!date) return null
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function dateDiff(endDateStr, startDateStr) {
  const start = parseDate(startDateStr)
  const end = parseDate(endDateStr)
  if (!start || !end) return NaN
  return Math.floor((end - start) / (24 * 60 * 60 * 1000))
}

function compareDate(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function minDate(a, b) {
  if (!a) return b || null
  if (!b) return a || null
  return compareDate(a, b) <= 0 ? a : b
}

function buildDateRange(startDate, endDate) {
  const dates = []
  const current = parseDate(startDate)
  const end = parseDate(endDate)
  if (!current || !end || current > end) return dates
  while (current <= end) {
    dates.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function getWeekRange(date) {
  const d = parseDate(date) || new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(d)
  start.setDate(diff)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  }
}

function getMonthRange(date) {
  const d = parseDate(date) || new Date()
  const year = d.getFullYear()
  const month = d.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  return {
    startDate: formatDate(firstDay),
    endDate: formatDate(lastDay)
  }
}

function getYearRange(date) {
  const d = parseDate(date) || new Date()
  const year = d.getFullYear()
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  }
}

function isFutureDate(dateStr) {
  return compareDate(dateStr, getBusinessDate()) > 0
}

function isSameBusinessDay(a, b) {
  return compareDate(a, b) === 0
}

function shouldRefreshByDate(lastDate, currentDate) {
  return lastDate && currentDate && compareDate(lastDate, currentDate) < 0
}

async function refreshServerTime(app) {
  try {
    const { result } = await wx.cloud.callFunction({ name: 'login' })
    if (result && result.serverTime) {
      const localNow = Date.now()
      _serverTimeOffset = result.serverTime - localNow
      _serverTimeConfidence = 'high'
      return { serverTime: result.serverTime, confidence: 'high' }
    }
  } catch (e) {
    console.error('refreshServerTime failed:', e)
  }
  _serverTimeConfidence = 'low'
  return { serverTime: Date.now(), confidence: 'low' }
}

module.exports = {
  getNow,
  getBusinessDate,
  getTodayKey,
  getSimulatedDate,
  getSimulatedDateStr,
  parseDate,
  formatDate,
  addDays,
  dateDiff,
  compareDate,
  minDate,
  buildDateRange,
  getWeekRange,
  getMonthRange,
  getYearRange,
  isFutureDate,
  isSameBusinessDay,
  shouldRefreshByDate,
  refreshServerTime
}
```

### 验证方式
1. `node -e "const ts = require('./miniprogram/services/timeService.js'); console.log(ts.getBusinessDate(), ts.formatDate(new Date()))"` 输出有效日期
2. 单元测试：`npm test -- --grep "timeService"` 通过
3. 验证 `parseDate` 和 `formatDate` 往返一致：`ts.formatDate(ts.parseDate('2026-05-22')) === '2026-05-22'`

### 风险
- **低**：纯函数，无副作用
- **风险点**：`formatDate` 依赖本地时区，确保所有环境使用 Asia/Shanghai

### 回滚方法
删除 `miniprogram/services/timeService.js`。如果其他代码已引用，搜索 `timeService` 并逐个移除引用。

---

## Step 3：新增 `services/storageService.js`

### 修改内容
创建存储服务，统一所有本地缓存读写入口。

**文件路径**：`miniprogram/services/storageService.js`

```javascript
// services/storageService.js
// 所有本地缓存读写统一入口

const { STORAGE_KEYS } = require('../constants/storageKeys')

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getItem(key) {
  try {
    return wx.getStorageSync(key)
  } catch (e) {
    console.error(`storageService.getItem ${key} failed:`, e)
    return null
  }
}

function setItem(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error(`storageService.setItem ${key} failed:`, e)
    return false
  }
}

function getMyHabits() {
  return asArray(getItem(STORAGE_KEYS.habits))
}

function setMyHabits(habits) {
  return setItem(STORAGE_KEYS.habits, asArray(habits))
}

function getCheckinLogs() {
  return asArray(getItem(STORAGE_KEYS.logs))
}

function setCheckinLogs(logs) {
  return setItem(STORAGE_KEYS.logs, asArray(logs))
}

function getAllHabitsInfo() {
  return asObject(getItem(STORAGE_KEYS.allHabitsInfo))
}

function setAllHabitsInfo(info) {
  return setItem(STORAGE_KEYS.allHabitsInfo, asObject(info))
}

function getUserOpenid() {
  return getItem(STORAGE_KEYS.userOpenid)
}

function setUserOpenid(openid) {
  return setItem(STORAGE_KEYS.userOpenid, openid)
}

function getUserInfo() {
  return getItem(STORAGE_KEYS.userInfo)
}

function setUserInfo(info) {
  return setItem(STORAGE_KEYS.userInfo, info)
}

function removeItem(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    console.error(`storageService.removeItem ${key} failed:`, e)
  }
}

function clear() {
  try {
    wx.clearStorageSync()
  } catch (e) {
    console.error('storageService.clear failed: ', e)
  }
}

module.exports = {
  getItem,
  setItem,
  getMyHabits,
  setMyHabits,
  getCheckinLogs,
  setCheckinLogs,
  getAllHabitsInfo,
  setAllHabitsInfo,
  getUserOpenid,
  setUserOpenid,
  getUserInfo,
  setUserInfo,
  removeItem,
  clear
}
```

### 验证方式
1. 手动测试：打开小程序，添加习惯、打卡，关闭再打开，数据仍存在
2. 验证 key 统一：确认 storage 中 key 为 `MyHabits`、`CheckinLogs` 等，而非散落的字面量

### 风险
- **中**：涉及现有数据的读写路径，稍有不慎会破坏现有数据
- **风险点**：
  - `getItem`/`setItem` 在微信开发者工具可能报 "fail" 权限错误，需确保 storage key 在 app.json 中配置
  - 并发写入：多个地方同时调用 `setMyHabits` 可能覆盖

### 回滚方法
删除 `miniprogram/services/storageService.js`。原有代码直接使用 `wx.getStorageSync`/`wx.setStorageSync` 不受影响。

---

## Step 4：现有文件改造

### 目标
逐步将现有代码中的日期操作和存储操作迁移到 timeService 和 storageService。

### 优先级

1. **home.js** — 打卡核心页面，涉及日期计算和存储
2. **habits.js** — 习惯管理，涉及 MyHabits 存储
3. **stats.js** — 统计页面，涉及日期范围计算
4. **app.js** — 启动逻辑，涉及时间校准、用户信息存储

### 改造原则
- 不改变现有业务逻辑，只替换底层调用
- 每次修改不超过 3 个文件
- 每次修改后验证功能正常

### 验证方式
1. 添加习惯后刷新首页，习惯列表正确显示
2. 打卡后，CheckinLogs 中记录正确
3. 查看报表，日期范围计算正确
4. `npm test` 通过

### 风险
- **中**：改造过程中可能遗漏某些调用点，导致数据不一致
- **风险点**：直接使用 `new Date()` 的地方未被完全替换

### 回滚方法
使用 git 回退修改：`git checkout -- miniprogram/pages/home/home.js`

---

## 阶段1验收标准

1. `timeService.js` 和 `storageService.js` 存在且可正常 require
2. `constants/storageKeys.js` 存在且 key 值与现有 storage key 一致
3. 现有代码中的日期操作已逐步迁移到 timeService（不要求全部迁移，但新代码应使用 timeService）
4. 现有代码中的 storage 读写已逐步迁移到 storageService（不要求全部迁移，但新代码应使用 storageService）
5. `npm test` 通过（如果已有测试）
6. 手动测试：添加习惯、打卡、查看报表基本功能正常

---

## 阶段1详细回滚策略

| 回滚场景 | 操作 |
|----------|------|
| 只需回滚新文件 | 删除 `services/timeService.js`, `services/storageService.js`, `constants/storageKeys.js` |
| 需回滚文件和改造 | `git checkout` 已修改的文件 |
| 完全回滚 | `git checkout HEAD -- .` 后手动恢复不属于阶段1的改动 |