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
  migrationMeta: 'migrationMeta'
}

module.exports = { STORAGE_KEYS }