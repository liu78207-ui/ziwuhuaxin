/**
 * config/env.js
 * Runtime environment mapping for CloudBase isolation.
 */

const ENV_TYPES = {
  test: 'test',
  prod: 'prod'
}

const MINI_PROGRAM_ENV = {
  develop: 'develop',
  trial: 'trial',
  release: 'release'
}

const ENV_VERSION_TO_ENV = {
  [MINI_PROGRAM_ENV.develop]: ENV_TYPES.test,
  [MINI_PROGRAM_ENV.trial]: ENV_TYPES.test,
  [MINI_PROGRAM_ENV.release]: ENV_TYPES.prod
}

const PLACEHOLDER_ENV_IDS = {
  test: '',
  prod: ''
}

const SHARED_CLOUD_ENV_ID = 'cloud1-6gjv79k431b8103b'

const CLOUD_ENV_CONFIG = {
  [ENV_TYPES.test]: {
    runtimeEnv: ENV_TYPES.test,
    cloudEnvId: SHARED_CLOUD_ENV_ID,
    collectionPrefix: 'test_',
    cloudFunctions: {},
    showEnvBadge: true,
    envBadgeText: '测试环境'
  },
  [ENV_TYPES.prod]: {
    runtimeEnv: ENV_TYPES.prod,
    cloudEnvId: SHARED_CLOUD_ENV_ID,
    collectionPrefix: '',
    cloudFunctions: {},
    showEnvBadge: false,
    envBadgeText: ''
  }
}

function getMiniProgramEnvVersion() {
  try {
    if (!wx || typeof wx.getAccountInfoSync !== 'function') {
      return MINI_PROGRAM_ENV.develop
    }
    const info = wx.getAccountInfoSync()
    return info && info.miniProgram && info.miniProgram.envVersion
      ? info.miniProgram.envVersion
      : MINI_PROGRAM_ENV.develop
  } catch (e) {
    return MINI_PROGRAM_ENV.develop
  }
}

function getRuntimeEnv(envVersion = getMiniProgramEnvVersion()) {
  return ENV_VERSION_TO_ENV[envVersion] || ENV_TYPES.test
}

function isPlaceholderCloudEnvId(runtimeEnv, cloudEnvId) {
  return cloudEnvId === PLACEHOLDER_ENV_IDS[runtimeEnv]
}

function getCurrentEnvConfig() {
  const envVersion = getMiniProgramEnvVersion()
  const runtimeEnv = getRuntimeEnv(envVersion)
  const config = CLOUD_ENV_CONFIG[runtimeEnv] || CLOUD_ENV_CONFIG[ENV_TYPES.test]

  return {
    ...config,
    envVersion,
    runtimeEnv,
    isCloudEnvPlaceholder: isPlaceholderCloudEnvId(runtimeEnv, config.cloudEnvId)
  }
}

function assertCloudEnvReady(config = getCurrentEnvConfig()) {
  if (!config.cloudEnvId) {
    throw new Error(`CloudBase 环境 ID 未配置: ${config.runtimeEnv}`)
  }
  if (config.runtimeEnv === ENV_TYPES.prod && config.isCloudEnvPlaceholder) {
    throw new Error('正式版 CloudBase 环境 ID 仍为占位值，已阻断云初始化')
  }
}

function isTestEnv() {
  return getRuntimeEnv() === ENV_TYPES.test
}

function isProdEnv() {
  return getRuntimeEnv() === ENV_TYPES.prod
}

module.exports = {
  ENV_TYPES,
  MINI_PROGRAM_ENV,
  ENV_VERSION_TO_ENV,
  CLOUD_ENV_CONFIG,
  PLACEHOLDER_ENV_IDS,
  getMiniProgramEnvVersion,
  getRuntimeEnv,
  getCurrentEnvConfig,
  assertCloudEnvReady,
  isPlaceholderCloudEnvId,
  isTestEnv,
  isProdEnv
}
