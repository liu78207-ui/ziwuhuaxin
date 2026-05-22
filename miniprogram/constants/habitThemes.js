/**
 * habitThemes.js
 * 主题色常量定义（模型层语义 key）
 *
 * 注意：
 * - 此文件只定义模型层语义 key，不接入 WXML/WXSS 的 UI theme class
 * - 不修改任何 WXML/WXSS 文件
 * - UI token 对齐在阶段6统一处理
 *
 * 三类 theme key：
 * - sports：运动类习惯
 * - therapy：理疗类习惯
 * - daily：起居类习惯
 */

const habitThemes = {
  /** 运动类主题 */
  sports: 'sports',

  /** 理疗类主题 */
  therapy: 'therapy',

  /** 起居类主题 */
  daily: 'daily'
}

/**
 * 验证 theme key 是否有效
 * @param {string} theme
 * @returns {boolean}
 */
function isValidTheme(theme) {
  return Object.values(habitThemes).includes(theme)
}

/**
 * 获取所有 theme key
 * @returns {Array<string>}
 */
function getAllThemes() {
  return Object.values(habitThemes)
}

module.exports = {
  habitThemes,
  isValidTheme,
  getAllThemes
}