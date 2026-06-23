/**
 * services/cacheService.js
 * 本地缓存治理服务。
 *
 * 页面层只调用本 service，不直接读写 storage 或调用云函数。
 */

const storageService = require('./storageService')
const syncService = require('./syncService')
const userService = require('./userService')
const eventBus = require('./eventBus')

function getErrorMessage(err) {
  return err && err.message ? err.message : String(err || 'unknown error')
}

async function clearLocalUserCacheAndRecover(options = {}) {
  const dailyStateDays = options.dailyStateDays || 90
  let recoveryError = ''

  try {
    await syncService.recoverOrSync()
  } catch (e) {
    console.warn('cacheService.recoverOrSync failed before clear:', getErrorMessage(e))
  }

  const clearResult = storageService.clearUserDataCache()
  const failedKeys = clearResult.failedKeys || []

  eventBus.emit('cache:invalidated', {
    scope: 'userData',
    source: 'profile.clearCache',
    removedKeys: clearResult.removedKeys || [],
    failedKeys
  })

  if (failedKeys.length > 0) {
    return {
      success: false,
      cleared: false,
      restored: false,
      failedKeys,
      recoveryError: ''
    }
  }

  try {
    await userService.login({ force: true })
    const recoverResult = await syncService.bootstrapCloudData({ dailyStateDays })
    if (!recoverResult.success) {
      recoveryError = recoverResult.error || '云端恢复失败'
    }

    return {
      success: true,
      cleared: true,
      restored: Boolean(recoverResult.success && recoverResult.restored),
      failedKeys,
      recoveryError
    }
  } catch (e) {
    recoveryError = getErrorMessage(e)
    return {
      success: true,
      cleared: true,
      restored: false,
      failedKeys,
      recoveryError
    }
  }
}

module.exports = {
  clearLocalUserCacheAndRecover
}
