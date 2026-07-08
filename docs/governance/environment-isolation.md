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

## 访问边界

- 前端云函数调用必须走 `services/cloudService.js`。
- 前端数据库集合名必须走 `cloudService.getCollectionName()`、`cloudService.database()` 或 `cloudService.collection()`。
- 页面层禁止直接调用 `wx.cloud.callFunction`、`wx.cloud.database`。
- 除 `app.js` 和 `cloudService.js` 外，前端不得直接使用 `wx.cloud.init` 或 `wx.cloud.database`。
- 集合名必须登记在 `miniprogram/constants/cloudCollections.js`，未知集合禁止访问。

云函数继续使用 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`。前端调用云函数时会传入内部字段 `__runtimeEnv` 与 `__collectionPrefix`，云函数必须通过集合 helper 访问集合，develop/trial 进入 `test_` 集合，release 进入正式集合。

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
- 本地 pending 队列不存在跨环境遗留操作。
- 未使用真实正式账号测试 develop/trial。
- 已运行 `npm run verify:cloud-env`、`npm run verify:legacy-boundaries`、`npm run verify:field-naming`。
