/**
 * constants/cloudCollections.js
 * CloudBase collection registry.
 */

const CLOUD_COLLECTIONS = {
  users: 'users',
  userHabits: 'user_habits',
  habitPolicyVersions: 'habit_policy_versions',
  checkinOperations: 'checkin_operations',
  dailyCheckinStates: 'daily_checkin_states',
  syncLogs: 'sync_logs',
  conflictLogs: 'conflict_logs',
  userSettings: 'user_settings',
  reminderSendLogs: 'reminder_send_logs',
  aiLogs: 'ai_logs',

  // Legacy compatibility collections.
  userStrategies: 'user_strategies',
  userStrategyVersions: 'user_strategy_versions',
  checkinLogs: 'checkin_logs',
  habits: 'habits'
}

function getBaseCollectionName(key) {
  const collectionName = CLOUD_COLLECTIONS[key]
  if (!collectionName) {
    throw new Error(`未登记的 CloudBase 集合: ${key}`)
  }
  return collectionName
}

module.exports = {
  CLOUD_COLLECTIONS,
  getBaseCollectionName
}
