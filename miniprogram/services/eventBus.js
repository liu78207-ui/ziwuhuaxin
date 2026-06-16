/**
 * services/eventBus.js
 * 轻量业务事件总线。
 *
 * 页面只订阅事件并重新调用 service 获取视图模型；
 * 业务数据仍由对应 service/storageService 管理。
 */

const listeners = {}

function on(eventName, handler) {
  if (!eventName || typeof handler !== 'function') {
    return () => {}
  }

  if (!listeners[eventName]) {
    listeners[eventName] = []
  }
  listeners[eventName].push(handler)

  return () => off(eventName, handler)
}

function off(eventName, handler) {
  const eventListeners = listeners[eventName]
  if (!eventListeners) return

  const index = eventListeners.indexOf(handler)
  if (index >= 0) {
    eventListeners.splice(index, 1)
  }
}

function emit(eventName, payload = {}) {
  const eventListeners = listeners[eventName]
  if (!eventListeners || eventListeners.length === 0) return

  eventListeners.slice().forEach(handler => {
    try {
      handler(payload)
    } catch (e) {
      console.error(`eventBus handler failed for ${eventName}:`, e)
    }
  })
}

function clear() {
  Object.keys(listeners).forEach(eventName => {
    delete listeners[eventName]
  })
}

module.exports = {
  on,
  off,
  emit,
  clear
}
