# 测试环境与正式环境隔离规范

## 环境映射

小程序运行环境由 `wx.getAccountInfoSync().miniProgram.envVersion` 判断：

| envVersion | runtimeEnv | CloudBase | 集合 |
|---|---|---|
| `develop` | `test` | `cloud1-6gjv79k431b8103b` | `test_` 前缀集合 |
| `trial` | `test` | `cloud1-6gjv79k431b8103b` | `test_` 前缀集合 |
| `release` | `prod` | `cloud1-6gjv79k431b8103b` | 无前缀正式集合 |

配置入口为 `miniprogram/config/env.js`。当前采用同一 CloudBase 环境内的集合前缀隔离：

- develop / trial：`test_users`、`test_user_habits`、`test_daily_checkin_states` 等。
- release：`users`、`user_habits`、`daily_checkin_states` 等。

本地业务缓存采用轻量隔离：

- develop / trial：业务缓存、pending、客户端序列号和恢复事务统一使用 `test:` 前缀。
- release：继续使用现有无前缀缓存 key，不迁移、不重命名。
- 测试环境不得读取或接管无前缀旧缓存；未标环境的旧 pending 仅允许正式环境兼容接管。
- App 必须在第一次读取缓存前，以当前 `runtimeEnv` 初始化 `storageService`。

## 访问边界

- 前端云函数调用必须走 `services/cloudService.js`。
- 前端数据库集合名必须走 `cloudService.getCollectionName()`、`cloudService.database()` 或 `cloudService.collection()`。
- 页面层禁止直接调用 `wx.cloud.callFunction`、`wx.cloud.database`。
- 除 `app.js` 和 `cloudService.js` 外，前端不得直接使用 `wx.cloud.init` 或 `wx.cloud.database`。
- 集合名必须登记在 `miniprogram/constants/cloudCollections.js`，未知集合禁止访问。

云函数继续使用 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`。普通同步函数当前仍通过统一集合 helper 处理环境字段；恢复链路采用更严格的服务器入口固定策略：

- `recoverData` 根据腾讯云内置 `SCF_FUNCTIONNAME` 固定读取无前缀正式集合。
- `recoverDataV2Test` 根据腾讯云内置 `SCF_FUNCTIONNAME` 固定读取 `test_` 集合。
- 两个恢复函数都忽略客户端传入的 `__runtimeEnv`、`__collectionPrefix` 或 `collectionPrefix`。
- 未登记的恢复函数名直接安全失败，不访问任何业务集合。

## 维护函数保护

`clearTestData`、repair 类维护动作默认只允许 dryRun。非 dryRun 写操作必须满足其一：

- 明确传入 `runtimeEnv: "test"` 或 `confirmRuntimeEnv: "test"`。
- 正式环境已完成备份，并传入 `allowProdMaintenance: true`、`backupConfirmed: true`、`prodConfirmPhrase: "ALLOW_PROD_MAINTENANCE_AFTER_BACKUP"`。

正式账号修复前必须先导出目标 openid 的 `users`、`user_habits`、`habit_policy_versions`、`daily_checkin_states`、`checkin_operations` 及 legacy 兼容集合。

## 发布前检查

上传体验版或正式版前必须确认：

- 当前 `envVersion` 与目标版本一致。
- develop/trial 首页显示“测试环境”。
- release 首页不显示“测试环境”。
- develop/trial 数据只进入 `test_` 前缀集合。
- release 数据只进入无前缀正式集合。
- develop/trial 本地缓存只进入 `test:` 前缀，release 继续使用无前缀缓存。
- 本地 pending 队列不存在跨环境遗留操作。
- 未使用真实正式账号测试 develop/trial。
- 已运行 `npm run verify:cloud-env`、`npm run verify:legacy-boundaries`、`npm run verify:field-naming`。
