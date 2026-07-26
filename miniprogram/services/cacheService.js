/**
 * services/cacheService.js
 * 本地缓存治理服务。
 *
 * 页面层只调用本 service，不直接读写 storage 或调用云函数。
 */

const storageService = require('./storageService')
const syncService = require('./syncService')
const eventBus = require('./eventBus')

function getErrorMessage(err) {
  return err && err.message ? err.message : String(err || 'unknown error')
}

async function clearLocalUserCacheAndRecover(options = {}) {
  let syncResult
  try {
    syncResult = await syncService.recoverOrSync()
  } catch (e) {
    return {
      success: false,
      cleared: false,
      restored: false,
      blocked: true,
      blockedReason: 'SYNC_BEFORE_CLEAR_FAILED',
      syncSummary: syncService.getSyncSummary(),
      failedKeys: [],
      recoveryError: getErrorMessage(e)
    }
  }
  const syncSummary = syncResult.summary || syncService.getSyncSummary()
  if (!syncResult.success || !syncSummary.allSynced) {
    return {
      success: false,
      cleared: false,
      restored: false,
      blocked: true,
      blockedReason: syncResult.reason || 'UNSYNCED_OPERATIONS_REMAIN',
      syncSummary,
      failedKeys: [],
      recoveryError: syncResult.error || ''
    }
  }

  try {
    const snapshot = await syncService.fetchRecoverySnapshot({
      historyScope: 'all',
      pageTimeoutMs: options.pageTimeoutMs
    })
    if (!storageService.stageRecoverySnapshot(snapshot)) {
      throw new Error('恢复快照暂存失败')
    }
    const replaceResult = storageService.replaceUserDataCacheFromRecoverySnapshot()
    if (!replaceResult.success) {
      return {
        success: false,
        cleared: false,
        restored: false,
        blocked: false,
        blockedReason: '',
        failedKeys: replaceResult.failedKeys || [],
        recoveryError: replaceResult.reason || '恢复快照替换失败'
      }
    }

    eventBus.emit('cache:invalidated', {
      scope: 'userData',
      source: 'profile.clearCache',
      removedKeys: replaceResult.removedKeys || [],
      failedKeys: replaceResult.failedKeys || []
    })

    return {
      success: true,
      cleared: true,
      restored: true,
      restoreSource: 'recoverData',
      blocked: false,
      blockedReason: '',
      failedKeys: replaceResult.failedKeys || [],
      recoveryError: ''
    }
  } catch (e) {
    storageService.discardRecoverySnapshot()
    return {
      success: false,
      cleared: false,
      restored: false,
      restoreSource: '',
      blocked: false,
      blockedReason: '',
      failedKeys: [],
      recoveryError: getErrorMessage(e)
    }
  }
}

module.exports = {
  clearLocalUserCacheAndRecover
}
