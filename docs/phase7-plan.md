# Phase 7 实现计划：用户服务层重构

> 修订版：针对评审指出的 5 个必须修复问题

---

## A. 当前用户体系问题分析

### 问题现状

| 问题 | 位置 | 影响 |
|------|------|------|
| 登录逻辑散落在 app.js | app.js onLaunch | 代码膨胀，难以测试 |
| openid 获取分散 | cloudService + 多处 | 安全风险，前端存储/传输明文 openid 违反 CloudBase 原则 |
| 用户资料读写分散 | storageService + profile.js | 维护困难，数据一致性隐患 |
| profile.js 过薄 | profile.js | 无法构造完整的 ProfileViewModel |
| 头像上传未实现 | profile.js | 功能缺失 |
| 昵称更新仅本地 | profile.js | 用户感知不到修改生效 |

### 根因

Phase 6 完成了 pages → services 的信任边界的建立，但 **app.js 登录逻辑**和**用户资料体系**尚未纳入 service 层抽象。

---

## B. userService 职责设计

```
userService.js
├── login()                   — 登录（静默 + 强制）
├── getUserInfo()             — 读本地缓存用户资料（不含 openid）
├── saveUserInfo()            — 写本地缓存 + 云端
├── getProfileViewModel()     — 构造 ProfileViewModel（纯同步）
├── refreshUserInfo()         — 从云端刷新用户资料
├── logout()                  — 退出登录（仅清除 profile 登录态）
└── _handleUserInfoFallback() — 内部兜底逻辑（无网络/无资料时）
```

**设计原则：**

1. **openid 安全边界（最高优先级）**
   - `openid` 只能由云函数 `cloud.getWXContext()` 获取，前端绝对不存储、不传输明文 openid
   - `userInfo` 本地缓存字段：**不得包含可信 openid**（仅作展示用途的昵称/头像/时间戳）
   - 云函数入参不得以 openid 作为业务标识，云端必须以 `cloud.getWXContext().OPENID` 为准
   - `user_openid` 旧缓存标记为 **deprecated**，Phase 7 停止新增写入，不清理（兼容历史缓存）

2. `getProfileViewModel()` 为**纯同步函数**，从 storageService 读取缓存，无网络开销

3. 所有用户资料写入前需完成登录态校验

---

## C. 登录流程设计

### 流程图

```
app.js onLaunch
    │
    ▼
userService.login({ force: false })
    │
    ├─► cloudService.callFunction('login')
    │       │
    │       ▼
    │       login 云函数
    │           → cloud.getWXContext() 获取 OPENID（可信来源）
    │           → 查询 users 文档，不存在则创建
    │           → 返回 { userId, createdAt }（不含 openid）
    │
    ├─► 本地记录登录态（不存 openid）
    │
    └─► 返回登录结果
```

### 关键设计

1. **静默登录 vs 强制登录**
   - `login({ force: false })` — 网络失败时返回本地缓存，不阻塞启动
   - `login({ force: true })` — 网络失败时抛出异常，触发错误提示

2. **openid 安全（执行红线）**
   - `login` 云函数返回数据：**不得包含 openid**
   - 前端 `userInfo` 缓存结构：`{ nickName, avatarUrl, createdAt, updatedAt }`
   - `user_openid` storage key：Phase 7 标记为 deprecated，不再读写
   - 云函数调用时若需 openid，云端自行通过 `cloud.getWXContext()` 获取，前端不传

3. **重复登录防护 + 异步刷新**
   - 有本地缓存时 `login()` 直接返回缓存，不阻塞启动
   - 网络可用时异步调用 `refreshUserInfo()` 拉取云端最新资料，避免本地缓存长期不更新
   - 通过 `storageService.getUserInfo().createdAt` 判断登录态

4. **Phase 7 云函数边界（新增/修改需明确）**
   - `login` 云函数：**修改**，返回结构增加 userId/createdAt，不返回 openid
   - `getUserProfile` 云函数：**新增**，供 refreshUserInfo 使用，云端用 OPENID 查询 users 文档
   - `saveUserProfile` 云函数：**新增**，供 saveUserInfo 使用，云端用 OPENID 更新 users 文档
   - `userId` 明确为云端 users 文档 `_id`（不可逆内部 ID），**不得是 openid 原文或可逆派生值**
   - **不允许**前端直接 `db.collection('users')` 操作，必须通过云函数

---

## D. 用户资料流程设计

### 资料读取

```
profile.js onShow
    │
    ▼
userService.getProfileViewModel()
    │
    ├─► userInfo = storageService.getUserInfo()
    ├─► isLoggedIn = !!userInfo.createdAt
    │
    └─► return { userInfo, isLoggedIn, displayAvatarUrl, nickName, buttonText }
```

> 注意：ProfileViewModel 只包含 profile 展示直接需要的字段，不含 habitCount/checkinCount/todayHabitText（详见章节 E）

### 资料更新（头像）

```
userService.saveUserInfo({ avatarUrl })
    │
    ├─► 校验登录态（检查 userInfo.createdAt）
    ├─► cloudService.uploadFile(tempFilePath)  → 获取 cloudPath
    ├─► cloudService.callFunction('saveUserProfile', { avatarUrl: cloudPath })
    └─► 更新本地缓存 { ...userInfo, avatarUrl: cloudPath }
```

### 资料更新（昵称）

```
userService.saveUserInfo({ nickName })
    │
    ├─► 校验登录态
    ├─► cloudService.callFunction('saveUserProfile', { nickName })
    └─► 更新本地缓存
```

---

## E. ProfileViewModel 设计（修订版）

### 原则

- **只读缓存**，不从其他 service 聚合数据，不引入 habit/checkin/report 依赖
- **纯同步**，无网络调用
- **最小字段集**，仅覆盖当前 WXML 展示所需字段

### 字段定义

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| isLoggedIn | boolean | `storageService.getUserInfo().createdAt` 存在即为 true | 登录态 |
| displayAvatarUrl | string | `userInfo.avatarUrl` 或默认头像 | 头像 URL |
| nickName | string | `userInfo.nickName` 或 '点击登录' | 昵称 |
| buttonText | string | isLoggedIn ? '退出登录' : '登录，子午花信' | 按钮文案 |
| memberSince | string | `userInfo.createdAt` 或 '' | 入驻时间 |

### 实现

```javascript
function getProfileViewModel() {
  const userInfo = storageService.getUserInfo()
  const isLoggedIn = !!(userInfo && userInfo.createdAt)

  if (!isLoggedIn) {
    return {
      isLoggedIn: false,
      displayAvatarUrl: '/assets/default-avatar.png',
      nickName: '点击登录',
      memberSince: '',
      buttonText: '登录，子午花信'
    }
  }

  return {
    isLoggedIn: true,
    displayAvatarUrl: userInfo.avatarUrl || '/assets/default-avatar.png',
    nickName: userInfo.nickName || '匿名修习者',
    memberSince: userInfo.createdAt || '',
    buttonText: '退出登录'
  }
}
```

### 不包含的字段（暂缓）

以下字段**不在 Phase 7 范围内**，后续如需展示，由对应 service 提供稳定 ViewModel 字段，页面只接收并 setData，**不允许页面自行聚合业务数据**：

- `habitCount` — 后续由 habitService 提供
- `checkinCount` — 后续由 checkinService/storageService 提供
- `todayHabitText` — 后续由 habitService 提供

> 若 profile WXML 必须展示以上字段，须由对应 service 在其 `getXxxViewModel()` 中新增字段，不得在 profile.js 中自行计算或聚合。

---

## F. profile.js 接入方案

### 原则

- **保持 WXML 兼容**：profile.wxml 绑定到 `displayAvatarUrl` 和 `userInfo.nickName`，profile.js setData 保持兼容字段名
- **允许最小 WXML 绑定调整**：仅调整绑定路径（如 `viewModel.xxx` → `viewModel.yyy`），禁止改布局、样式、交互路径

### 改造后的 profile.js 核心逻辑

```javascript
const userService = require('../../services/userService')
const share = require('../../utils/share.js')

Page({
  data: {
    timeInfo: { hour: '00', minute: '00', date: '', shichen: '', meridian: '', advice: '' },
    displayAvatarUrl: '/assets/default-avatar.png',
    userInfo: {},
    loading: false
  },

  onLoad() {
    this.refreshViewModel()
  },

  onShow() {
    share.enableShareMenu()
    this.refreshViewModel()
  },

  refreshViewModel() {
    const vm = userService.getProfileViewModel()
    this.setData({
      displayAvatarUrl: vm.displayAvatarUrl,
      userInfo: { nickName: vm.nickName },
      buttonText: vm.buttonText,
      memberSince: vm.memberSince,
      isLoggedIn: vm.isLoggedIn
    })
  },

  async onChooseAvatar() {
    // Phase 7B: 调用 wx.chooseImage + cloudService.uploadFile + saveUserInfo
  },

  async onNicknameChange(e) {
    // Phase 7B: 调用 saveUserInfo({ nickName: e.detail.value })
  },

  async onLogout() {
    // Phase 7B: 调用 userService.logout() + refreshViewModel
  }
})
```

---

## G. app.js 接入方案

### 改造范围

Phase 7 **只迁移**以下内容：

| 现状 | 目标 |
|------|------|
| login 云函数调用在 app.js onLaunch | 移至 userService.login() |
| globalData.userInfo 读写 | 停止使用，由 storageService 承接 |
| globalData.openid 写入 | 标记 deprecated，停止新增写入 |

**不触碰的内容（Phase 7 范围外）：**

- globalData.MyHabits、CheckinLogs
- globalData.isOnline、isSyncing
- 旧同步兼容逻辑
- pending 队列

### 改造后的 app.js onLaunch

```javascript
const userService = require('./services/userService')

onLaunch(options) {
  this.printAllLogs()

  // Phase 7: 登录逻辑收敛到 userService
  userService.login({ force: false })
    .then(() => {
      this.globalData._launchReady = true
    })
    .catch(err => {
      console.warn('登录失败（静默模式）：', err.message)
      this.globalData._launchReady = true
    })
}
```

### globalData 精简后

```javascript
globalData: {
  _launchReady: false  // 运行时状态，与登录态无关
  // MyHabits、CheckinLogs、isOnline、isSyncing：Phase 7 不触碰
}
```

---

## H. 实施阶段拆分

### Phase 7A：userService 骨架 + 登录收敛 + openid 安全

**目标：** 建立 userService，迁移 app.js login 逻辑，实现 openid 安全治理

| 任务 | 文件 | 验收条件 |
|------|------|----------|
| 新建 userService.js 骨架 | services/userService.js | 模块可 require |
| 实现 login() | services/userService.js | 云函数调用正常，缓存不含 openid |
| 修改 login 云函数 | cloudfunctions/login/index.js | 返回 { userId, createdAt }，不返回 openid |
| 迁移 app.js onLaunch 登录 | app.js | login 逻辑移出 app.js |
| 标记 user_openid 为 deprecated | storageService.js | 不再读写，仅标记 |
| 静态检查：app.js 无 login 云函数调用 | — | 代码审查 |
| 静态检查：userInfo 不含 openid | — | 代码审查 |

**验收：**
- `userService.login()` 正常完成登录流程
- `userService.getUserInfo()` 返回 `{ nickName, avatarUrl, createdAt }` 不含 openid
- `app.js onLaunch` 中无 login 云函数直接调用
- `user_openid` storage key 不再被读写

---

### Phase 7B：用户资料 CRUD + 云函数新增

**目标：** userService 承接所有用户资料操作，云函数支撑云端读存

| 任务 | 文件 | 验收条件 |
|------|------|----------|
| 新增 getUserProfile 云函数 | cloudfunctions/getUserProfile | 云端用 OPENID 查询 users 文档 |
| 新增 saveUserProfile 云函数 | cloudfunctions/saveUserProfile | 云端用 OPENID 更新 users 文档 |
| 实现 getUserInfo() | services/userService.js | 从 storageService 读取 |
| 实现 saveUserInfo() | services/userService.js | 写本地 + 云函数，不含 openid |
| 实现 refreshUserInfo() | services/userService.js | 调用 getUserProfile 云函数 |
| 实现 logout() | services/userService.js | 仅清除 profile 登录态，不删 habit/checkin/pending |
| getServerTime() 委托 cloudService | services/userService.js | 不作为核心职责 |

**验收：**
- `saveUserInfo({ nickName })` 成功保存并同步到云端
- `refreshUserInfo()` 正确处理网络失败（返回本地缓存兜底）
- `logout()` 不影响习惯、打卡、pending 队列

---

### Phase 7C：ProfileViewModel + profile.js 接入

**目标：** profile.js 瘦身后调用 userService，WXML 绑定兼容

| 任务 | 文件 | 验收条件 |
|------|------|----------|
| 实现 getProfileViewModel() | services/userService.js | 返回 5 字段 ViewModel |
| 接入 profile.js onShow/onLoad | pages/profile/profile.js | 使用 getProfileViewModel() |
| 保持 WXML 兼容字段名 | pages/profile/profile.wxml | displayAvatarUrl / userInfo.nickName |
| 删除冗余 data 字段 | pages/profile/profile.js | 精简 setData |

**验收：**
- profile.js 代码量减少 ≥ 50%
- `getProfileViewModel()` 返回数据驱动 UI
- WXML 绑定不变，无布局/样式回归

---

### Phase 7D：头像上传 + 昵称更新（可选，视 Phase 7A-7C 时间弹性决定是否本阶段完成）

**目标：** 完整实现用户资料编辑功能

| 任务 | 文件 | 验收条件 |
|------|------|----------|
| 实现 cloudService.uploadFile | services/cloudService.js | 若不存在则暂缓头像上传 |
| 实现 onChooseAvatar | pages/profile/profile.js | 图片选择 + 上传 + 保存 |
| 实现 onNicknameChange | pages/profile/profile.js | 昵称修改并保存 |

**验收：**
- 头像上传成功，更新云端并刷新本地缓存
- 昵称修改后 UI 立即反馈

---

## I. 测试策略

### 单元测试

| 测试文件 | 测试内容 |
|----------|----------|
| `__tests__/unit/services/userService.test.js` | login, getUserInfo, saveUserInfo, getProfileViewModel, logout |
| `__tests__/unit/pages/profile.test.js` | onShow/onLoad 调用 getProfileViewModel, onChooseAvatar, onNicknameChange |

### 集成测试

| 测试文件 | 测试内容 |
|----------|----------|
| `__tests__/integration/profile-flow.test.js` | 登录 → 查看 profile → 修改昵称 → 刷新 |

### Mock 策略

- `wx.cloud.callFunction` — mock 为返回 `{ userId, createdAt }`，不含 openid
- `storageService.getUserInfo` — mock 为已登录/未登录两种状态
- `storageService.setUserInfo` — spy 记录调用参数，验证不含 openid

### 边界测试

| 场景 | 期望行为 |
|------|----------|
| 未登录状态查看 profile | 显示"点击登录"默认态 |
| 网络失败 login(force=false) | 返回本地缓存，不抛异常 |
| 网络失败 login(force=true) | 抛出异常 |
| 云端 userInfo 为空时 refreshUserInfo | 返回本地缓存兜底 |
| 重复调用 login() | 返回缓存，不重复请求云函数 |
| logout() 调用 | 仅清除 userInfo createdAt，不影响 habit/checkin/pending |

### 静态检查命令（补充）

```bash
# 检查 app.js 无 login 云函数直接调用
grep -n "callFunction.*login\|login.*云函数" miniprogram/app.js

# 检查 profile.js 无 storage/cloud 直接调用
grep -n "getStorageSync\|setStorageSync\|wx.cloud\|db.collection" miniprogram/pages/profile/profile.js

# 检查 userInfo 缓存结构不含 openid
grep -rn "openid\|openId\|OPENID" miniprogram/services/userService.js
```

---

## J. Phase 7 验收标准

### 定量标准

| 指标 | 阈值 |
|------|------|
| profile.js 代码行数减少 | ≥ 50% |
| app.js login 相关代码减少 | ≥ 70% |
| 新增 userService 单元测试覆盖率 | ≥ 80% |
| 所有测试通过率 | 100% |

### 定性标准

| 检查项 | 通过条件 |
|--------|----------|
| app.js 无直接 login 云函数调用 | `grep -n "callFunction.*login" app.js` 无输出 |
| profile.js 无直接 storage/cloud 读写 | `grep -n "getStorageSync\|setStorageSync\|wx.cloud\|db.collection" profile.js` 无输出 |
| userInfo 缓存结构不含 openid | 代码审查 + 单元测试 mock 验证 |
| userService 提供完整登录/资料接口 | 接口签名审查 |
| 所有 userService 方法有 JSDoc | 文档完整性 |
| logout() 不影响 habit/checkin/pending | 单元测试验证 |

### 功能验收 Checklist

- [ ] `userService.login()` 成功完成登录，`login` 云函数返回不含 openid
- [ ] `userService.getUserInfo()` 返回缓存不含 openid（字段：`nickName/avatarUrl/createdAt/updatedAt`）
- [ ] `userService.saveUserInfo({ nickName })` 成功保存并同步云端
- [ ] `userService.getProfileViewModel()` 返回 5 字段（isLoggedIn/displayAvatarUrl/nickName/memberSince/buttonText）
- [ ] `userService.refreshUserInfo()` 从云端刷新并更新本地，网络失败时返回兜底
- [ ] `userService.logout()` 仅清除 profile 登录态，不删 habit/checkin/pending
- [ ] profile.js onShow 使用 getProfileViewModel() 渲染
- [ ] profile.js 头像上传功能可用（若 cloudService.uploadFile 未实现则不作为验收阻塞项）
- [ ] profile.js 昵称修改功能可用
- [ ] app.js onLaunch 精简，登录逻辑收敛到 userService
- [ ] `user_openid` storage key 标记 deprecated，不再读写
- [ ] 所有 512+ 测试通过，无新增失败

---

## 附录：openid 安全执行红线

以下行为在 Phase 7 及后续任何阶段均为**严格执行红线**，违者代码审查直接拒绝：

1. **禁止将 openid 写入任何对象**（本地 storage、userInfo、云端 users 文档）
2. **禁止将 openid 作为任何云函数入参**传递，无论调试或业务用途
3. **禁止将 openid 存储到任何 storage key**，包括 `user_openid`（该 key 仅作历史遗留标记，不再读写）
4. **禁止在前端日志、控制台输出 openid**
5. 云函数业务标识必须以 `cloud.getWXContext().OPENID` 为准，前端传入的 openid 不落地、不使用、不作为业务判断依据

---

**计划完成日期：** Phase 7 预计在 Phase 6 验收后 5 个工作日内完成