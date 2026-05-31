/**
 * services/cloudService.js
 * 统一云函数调用入口（Phase 4）
 *
 * 职责：
 * - 封装 wx.cloud.callFunction
 * - 标准化错误码和返回结构
 * - 超时处理（默认 10s）
 * - 网络异常时标记 shouldPending（供 syncService 入队）
 * - serverTime 校准
 * - Phase 7D: 新增云存储上传/临时 URL 能力
 *
 * 禁止：
 * - pending 队列操作
 * - 本地状态读写
 * - 业务逻辑判断
 */

const CLOUD_FUNCTION_TIMEOUT = 10000 // 10s

const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  SERVER_ERROR: 'SERVER_ERROR',
  PARAM_ERROR: 'PARAM_ERROR',
  UNAUTH: 'UNAUTH'
}

/**
 * 统一云函数调用入口
 * @param {string} name - 云函数名称
 * @param {object} data - 调用参数
 * @param {object} options - { timeout, retries }
 * @returns {Promise<{success: boolean, data?: object, error?: {code: string, message: string}, serverTime?: number, shouldPending?: boolean}>}
 */
async function callFunction(name, data, options = {}) {
  const { timeout = CLOUD_FUNCTION_TIMEOUT } = options

  try {
    const result = await wx.cloud.callFunction({
      name,
      data,
      timeout
    })

    if (result.errMsg && !result.errMsg.includes('ok')) {
      return {
        success: false,
        error: { code: ERROR_CODES.SERVER_ERROR, message: result.errMsg }
      }
    }

    // 识别云函数内部返回的 { success: false, ... }
    if (result.result && result.result.success === false) {
      return {
        success: false,
        error: result.result.error || { code: ERROR_CODES.SERVER_ERROR, message: result.result.message || '云函数返回错误' }
      }
    }

    return {
      success: true,
      data: result.result,
      serverTime: result.result?.serverTime || null
    }
  } catch (e) {
    const errMsg = e.message || ''
    const isNetworkError = errMsg.includes('network') || errMsg.includes('ERR_NETWORK') || errMsg.includes('fail')

    return {
      success: false,
      error: {
        code: isNetworkError ? ERROR_CODES.NETWORK_ERROR : ERROR_CODES.SERVER_ERROR,
        message: errMsg || '调用失败'
      },
      shouldPending: isNetworkError // 网络异常时标记进入 pending 队列
    }
  }
}

/**
 * 获取 openid（通过 login 云函数）
 * @returns {Promise<{openid: string|null}>}
 */
async function getOpenId() {
  const result = await callFunction('login', {})
  if (result.success && result.data?.openid) {
    return { openid: result.data.openid }
  }
  return { openid: null }
}

/**
 * 获取服务端时间
 * @returns {Promise<number>} serverTime 或本地 Date.now()
 */
async function getServerTime() {
  const result = await callFunction('login', {})
  return result.success ? (result.data?.serverTime || Date.now()) : Date.now()
}

/**
 * 上传文件到云存储
 * @param {string} tempFilePath - 临时文件路径（wx.chooseImage 返回的临时路径）
 * @param {string} cloudPath - 云存储目标路径
 * @returns {Promise<string>} - 云存储 cloud:// URL
 */
async function uploadFile(tempFilePath, cloudPath) {
  try {
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    })
    if (result.errMsg && result.errMsg.includes('ok')) {
      return result.fileID
    }
    throw new Error(result.errMsg || '上传失败')
  } catch (e) {
    console.error('cloudService.uploadFile 失败:', e)
    throw e
  }
}

/**
 * 将云存储 cloud:// URL 转换为临时 URL
 * @param {string} cloudPath - 云存储路径（cloud:// 开头）
 * @returns {Promise<string>} - 临时 URL，失败时返回原路径
 */
async function getTempFileURL(cloudPath) {
  if (!cloudPath || !cloudPath.startsWith('cloud://')) {
    return cloudPath
  }
  try {
    const res = await wx.cloud.getTempFileURL({
      fileList: [cloudPath]
    })
    const file = res.fileList && res.fileList[0]
    return (file && file.tempFileURL) || cloudPath
  } catch (e) {
    console.error('cloudService.getTempFileURL 失败:', e)
    return cloudPath
  }
}

module.exports = {
  callFunction,
  getOpenId,
  getServerTime,
  uploadFile,
  getTempFileURL,
  ERROR_CODES
}