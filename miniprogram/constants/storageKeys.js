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

  // 新增（Phase 3）
  dailyStates: 'dailyCheckinStates',
  policyVersions: 'policyVersions',
  checkinOperations: 'checkinOperations',
  migrationMeta: 'migrationMeta',

  // 新增（Phase 4）
  pendingOperations: 'pendingOperations',

  // 客户端序列号计数器（解决同毫秒操作排序问题）
  clientSequenceCounter: 'clientSequenceCounter'
}

module.exports = { STORAGE_KEYS }