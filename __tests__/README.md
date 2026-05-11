# 测试文档

## 测试概览

本项目使用 Jest 作为测试框架，包含单元测试、集成测试和 E2E 测试三个层次。

## 测试统计

- **测试套件**: 7 个
- **测试用例**: 101 个
- **代码覆盖率**: 100% (utils 目录)

## 测试结构

```
__tests__/
├── setup.js                          # 测试环境设置
├── unit/                             # 单元测试
│   ├── utils/
│   │   ├── ziwu.test.js             # 子午流注工具测试
│   │   ├── iconMap.test.js          # 图标映射工具测试
│   │   └── util.test.js             # 通用工具函数测试
│   ├── pages/
│   │   ├── home.test.js             # 首页测试
│   │   └── habits.test.js           # 修习页面测试
│   └── app.test.js                  # App.js 测试
├── integration/                      # 集成测试
│   └── cloudfunctions/
│       ├── doCheckin.test.js        # 打卡云函数测试
│       ├── getTodayTasks.test.js    # 获取任务云函数测试
│       └── login.test.js            # 登录云函数测试
└── e2e/
    └── user-flow.test.js            # 用户流程 E2E 测试
```

## 运行测试

### 运行所有测试
```bash
npm test
```

### 运行特定类型的测试
```bash
# 只运行单元测试
npm run test:unit

# 只运行集成测试
npm run test:integration

# 只运行 E2E 测试
npm run test:e2e

# 只运行工具函数测试
npm run test:utils

# 只运行页面测试
npm run test:pages

# 只运行云函数测试
npm run test:cloud
```

### 其他测试命令
```bash
# 监视模式（自动运行修改的测试）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# CI 模式（用于持续集成）
npm run test:ci
```

## 测试覆盖范围

### 1. 单元测试 (Unit Tests)

#### 工具函数测试
- **ziwu.test.js**: 测试子午流注时辰计算
  - 12个时辰数据完整性
  - 当前时辰获取
  - 时间信息格式化
  
- **iconMap.test.js**: 测试图标映射
  - 习惯图标配置获取
  - 主题分类映射
  - 21个预定义习惯支持

- **util.test.js**: 测试通用工具
  - 时间格式化函数
  - 边界条件处理

#### 页面测试
- **home.test.js**: 首页功能测试
  - 页面生命周期
  - 时辰信息显示
  - 任务列表加载
  - 打卡功能
  - 导航跳转

- **habits.test.js**: 修习页面测试
  - 习惯列表加载
  - 分类筛选
  - 添加习惯弹窗
  - 时长和频次设置

#### App.js 测试
- 全局数据管理
- 登录流程
- 数据持久化
- 数据迁移

### 2. 集成测试 (Integration Tests)

#### 云函数测试
- **doCheckin.test.js**: 打卡功能
  - 参数验证
  - 重复打卡检测
  - 策略验证
  - 数据存储
  - 数据隔离

- **getTodayTasks.test.js**: 获取今日任务
  - 频次筛选（每天/每周/间隔）
  - 打卡状态标记
  - 连续天数计算
  - 边界情况处理

- **login.test.js**: 登录功能
  - OpenID 获取
  - 上下文信息
  - 多用户隔离

### 3. E2E 测试 (End-to-End Tests)

- **user-flow.test.js**: 完整用户流程
  - 新用户首次使用
  - 老用户日常使用
  - 习惯管理
  - 数据统计
  - 异常处理

## 测试环境

- **测试框架**: Jest 29.7.0
- **环境**: Node.js
- **Babel**: 用于 ES6+ 语法转换
- **覆盖率工具**: Jest 内置覆盖率

## 模拟对象

测试中使用以下全局模拟：

### 微信小程序 API 模拟
- `wx.getStorageSync` / `wx.setStorageSync`
- `wx.cloud.callFunction`
- `wx.showToast` / `wx.showModal`
- `wx.navigateTo` / `wx.switchTab`
- `wx.request` / `wx.downloadFile`

### 小程序框架模拟
- `App()` - 应用构造函数
- `Page()` - 页面构造函数
- `Component()` - 组件构造函数
- `getApp()` - 获取应用实例

## 编写新测试

### 单元测试示例
```javascript
describe('功能描述', () => {
  test('应该做某事', () => {
    // 准备数据
    const input = 'test';
    
    // 执行操作
    const result = functionToTest(input);
    
    // 验证结果
    expect(result).toBe('expected');
  });
});
```

### 集成测试示例
```javascript
describe('云函数测试', () => {
  test('应该正确处理请求', async () => {
    // 模拟数据库
    mockDb.get.mockResolvedValue({ data: [] });
    
    // 调用云函数
    const result = await main({ habit_id: '1' }, {});
    
    // 验证结果
    expect(result.success).toBe(true);
  });
});
```

## 持续集成

测试已配置支持 CI 环境：
- 生成 JUnit XML 报告
- 生成覆盖率报告
- 支持覆盖率阈值检查

## 注意事项

1. **TypeScript 文件**: 由于项目使用 TypeScript，部分测试直接模拟函数实现而非导入
2. **云函数测试**: 使用模拟数据库，不依赖真实云环境
3. **覆盖率目标**: 当前 utils 目录达到 100% 覆盖率
