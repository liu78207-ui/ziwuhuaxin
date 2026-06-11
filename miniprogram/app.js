const timeService = require('./services/timeService.js')
const iconMap = require('./utils/iconMap.js')
const syncService = require('./services/syncService.js')
const userService = require('./services/userService.js')
const storageService = require('./services/storageService.js')

function getErrorMessage(err) {
  return err && err.message ? err.message : String(err || 'unknown error')
}

App({
  globalData: {
    fontsLoaded: false,

    // ========== 调试配置 ==========
    // 调试模式：模拟日期偏移（天数），0表示今天，1表示明天，-1表示昨天
    DEBUG_DAY_OFFSET: 0,

    // ========== 双表数据模型 ==========
    // 表1: MyHabits - 用户习惯配置表（用户在修习页面添加的习惯，
    // 数据结构: [{ habitId: 'h_001', name: '易筋经', themeClass: 't-red', targetMinutes: 20, createdAt: '2026-04-13' }]
    MyHabits: [],

    // 表2: CheckinLogs - 打卡流水表（记录每一次打卡的真实动作，
    // 数据结构: [{ logId: 'L_123', habitId: 'h_001', date: '2026-04-13', timestamp: 1712966400000, sync_status: 0 }]
    // sync_status: 0=待同步 1=已同步 2=待删除
    CheckinLogs: [],

    // 网络状态
    isOnline: true,
    isSyncing: false
  },

  // 获取调试日期偏移
  getDebugOffset() {
    const offset = this.globalData.DEBUG_DAY_OFFSET;
    return offset !== undefined ? offset : 0;
  },

  // 获取模拟日期（如果处于调试模式）
  getSimulatedDate() {
    return timeService.getSimulatedDate(this);
  },

  formatDateKey(date) {
    return timeService.formatDate(date);
  },

  getEntityHabitId(entity) {
    if (!entity) return '';
    return String(
      (entity.strategy && entity.strategy.habit_id) ||
      entity.habitId ||
      entity.habit_id ||
      entity._id ||
      ''
    );
  },

  getLogDate(log) {
    return String((log && (log.date || log.checkin_date)) || '').split('T')[0];
  },

  isLogDeleted(log) {
    return log && log.sync_status === 2;
  },

  // 获取模拟日期字符串
  getSimulatedDateStr() {
    const dateStr = this.formatDateKey(this.getSimulatedDate());
    console.log('getSimulatedDateStr:', dateStr, 'DEBUG_DAY_OFFSET:', this.getDebugOffset());
    return dateStr;
  },

  onLaunch() {
    console.log('App onLaunch')
    // 初始化云开区
    wx.cloud.init({
      traceUser: true
    })
    // 从本地存储加载全局数据
    this.loadGlobalDataFromStorage()
    // Phase 7: 登录逻辑收敛到 userService（静默模式）
    // 初始化网络状态监听
    this.initNetworkListener()
    userService.login({ force: false })
      .then(() => {
        console.info('app.onLaunch login 完成')
        // 启动时：登录成功后再检查本地缓存是否需要从云端恢复
        if (syncService.needsLocalRecovery()) {
          return syncService.recoverFromCloud()
        }
        return { success: true, source: 'localCache' }
      })
      .then((recoverResult) => {
        console.info('app.onLaunch recover 完成:', recoverResult && recoverResult.source ? recoverResult.source : 'none')
        // 登录成功后再处理 pending 队列同步，避免云环境异常时启动连环 timeout
        return syncService.recoverOrSync()
      })
      .then((syncResult) => {
        console.info('app.onLaunch recoverOrSync 完成:', syncResult && syncResult.reason ? syncResult.reason : 'done')
      })
      .catch(err => {
        console.warn('登录或云端恢复失败（继续使用本地数据）：', err.message)
      })
  },

  // ========== 数据持久层==========

  // 从本地存储加载全局数据
  loadGlobalDataFromStorage() {
    try {
      // 加载 MyHabits（用户习惯配置表）
      let myHabits = storageService.getMyHabits()
      if (myHabits && Array.isArray(myHabits)) {
        // 数据修复：确保每个习惯都有 freq_type 和 freq_rules
        myHabits = myHabits.map(habit => {
          if (!habit.freq_type) {
            console.log('修复习惯数据，添加默认 freq_type:', habit.name)
            habit.freq_type = 'daily'
            habit.freq_rules = 1
          }
          // 数据修复：如果 freq_category 指示间隔打卡，但 freq_type 被保存为 daily
          if (habit.freq_category === 'daily-interval' && habit.freq_type === 'daily') {
            console.log('修复习惯数据，修正 freq_type:', habit.name, '从 daily -> interval')
            habit.freq_type = 'interval'
          }
          return habit
        })
        this.globalData.MyHabits = myHabits
        // 如果有变更，存回本地
        this.saveMyHabits(myHabits)
      } else {
        // 兼容旧式数据：尝试从 userStrategies 迁移
        const oldStrategies = storageService.getItem('userStrategies')
        if (oldStrategies && Array.isArray(oldStrategies)) {
          this.globalData.MyHabits = oldStrategies.map(s => this.migrateOldStrategy(s))
          this.saveMyHabits(this.globalData.MyHabits)
        }
      }

      // 加载 CheckinLogs（打卡流水表）
      const checkinLogs = storageService.getCheckinLogs()
      if (checkinLogs && Array.isArray(checkinLogs)) {
        this.globalData.CheckinLogs = checkinLogs
      } else {
        // 兼容旧式数据：尝试从 checkin_records 迁移
        const oldRecords = storageService.getItem('checkin_records')
        if (oldRecords && typeof oldRecords === 'object') {
          this.globalData.CheckinLogs = this.migrateOldRecords(oldRecords)
          this.saveCheckinLogs(this.globalData.CheckinLogs)
        }
      }

      console.log('全局数据已从本地存储加载:', {
        MyHabits: this.globalData.MyHabits.length,
        CheckinLogs: this.globalData.CheckinLogs.length
      })
    } catch (e) {
      console.error('加载全局数据失败:', e)
    }
  },

  // 迁移旧式策略数据格式
  migrateOldStrategy(oldStrategy) {
    // 使用模拟日期作为创建日期（如果处于调试模式且没有指定 createdAt）
    const createdAt = oldStrategy.createdAt || this.getSimulatedDateStr()
    // 计划开始日期，默认今天
    const planStartDate = oldStrategy.plan_start_date || this.getSimulatedDateStr()
    const habitName = oldStrategy.habit_title || oldStrategy.name || oldStrategy.title || '未知习惯'
    return {
      habitId: String(oldStrategy.habit_id || oldStrategy.habitId || Date.now()),
      name: habitName,
      themeClass: this.getThemeForHabit({
        ...oldStrategy,
        name: habitName
      }),
      targetMinutes: oldStrategy.duration || oldStrategy.targetMinutes || 20,
      category: oldStrategy.category || 'sports',
      freq_type: oldStrategy.freq_type || 'daily',
      freq_rules: oldStrategy.freq_rules || 1,
      freq_category: oldStrategy.freq_category || 'everyday',
      createdAt: createdAt,
      plan_start_date: planStartDate
    }
  },

  // 迁移旧式打卡记录格式
  migrateOldRecords(oldRecords) {
    const logs = []
    for (const habitId in oldRecords) {
      const dates = oldRecords[habitId]
      if (Array.isArray(dates)) {
        dates.forEach(dateStr => {
          const parsedDate = timeService.parseDate(dateStr)
          logs.push({
            logId: `L_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            habitId: String(habitId),
            date: dateStr,
            timestamp: parsedDate ? parsedDate.getTime() : 0
          })
        })
      }
    }
    return logs
  },

  // 根据分类获取主题色
  getThemeByCategory(category) {
    const themeMap = {
      sports: 't-green',
      therapy: 't-red',
      life: 't-yellow',
      '运动类': 't-green',
      '理疗类': 't-red',
      '起居类': 't-yellow'
    }
    return themeMap[category] || 't-blue'
  },

  getThemeForHabit(habit) {
    const habitName = habit.name || habit.title || habit.habit_title || habit.habitTitle || ''
    const iconConfig = habitName ? iconMap.getIconConfig(habitName) : null
    if (iconConfig && iconConfig.themeClass) {
      return iconConfig.themeClass
    }
    return habit.themeClass || habit.theme_class || this.getThemeByCategory(habit.category)
  },

  // ========== MyHabits 操作==========

  /**
   * @deprecated V1 legacy compatibility only.
   * 新代码不得调用；习惯读写必须通过 habitService / storageService。
   */
  saveMyHabits(habits) {
    this.globalData.MyHabits = habits
    try {
      storageService.setMyHabits(habits)
      console.log('MyHabits 已保存', habits.length)
    } catch (e) {
      console.error('保存 MyHabits 失败:', e)
    }
  },

  // 添加习惯到 MyHabits
  addHabit(habit) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = this.getEntityHabitId(habit)

    // 检查是否已存在（包括已删除的）
    const existingIndex = habits.findIndex(h => this.getEntityHabitId(h) === habitIdStr)

    if (existingIndex > -1) {
      // 如果习惯已存在且被标记为删除，则恢复
      if (habits[existingIndex].isDeleted) {
        console.log('恢复已删除的习惯:', habit.name)
        habits[existingIndex] = {
          ...habits[existingIndex],
          ...habit,
          isDeleted: false,
          deletedAt: null,
          restoredAt: timeService.getNow().toISOString()
        }
        this.logOperation('restoreHabitOnAdd', { habitId: habitIdStr, name: habit.name })
      } else {
        // 更新已有习惯
        habits[existingIndex] = { ...habits[existingIndex], ...habit }
        this.logOperation('updateHabit', { habitId: habitIdStr, name: habit.name })
      }
    } else {
      // 添加新习惯
      // 使用模拟日期作为创建日期（如果处于调试模式且没有指定 createdAt）
      const createdAt = habit.createdAt || this.getSimulatedDateStr()
      habits.push({
        ...habit,
        habitId: habitIdStr,
        createdAt: createdAt
      })
      this.logOperation('addHabit', { habitId: habitIdStr, name: habit.name })
    }

    this.saveMyHabits(habits)
    return habitIdStr
  },

  // 从 MyHabits 移除习惯（逻辑删除）
  removeHabit(habitId, habitData) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = String(habitId)

    console.log('removeHabit 被调用', habitIdStr)
    console.log('当前 MyHabits:', habits.map(h => ({ habitId: h.habitId, _id: h._id, name: h.name })))

    // 同时匹配 habitId 和 _id（兼容不同数据源）
    const habitIndex = habits.findIndex(h => this.getEntityHabitId(h) === habitIdStr)

    if (habitIndex === -1) {
      console.log('未找到要删除的习惯', habitIdStr)
      return false
    }

    const habitToRemove = habits[habitIndex]
    console.log('找到要删除的习惯', habitToRemove)

    // 逻辑删除：标记为已删除，而不是物理删除
    habits[habitIndex] = {
      ...habitToRemove,
      isDeleted: true,
      deletedAt: timeService.getNow().toISOString()
    }

    this.saveMyHabits(habits)

    // 保存习惯信息到本地存储（用于历史数据显示和恢复）
    // 合并 habitData 中的额外信息
    const habitInfo = habitData ? { ...habitToRemove, ...habitData } : habitToRemove;
    this.saveDeletedHabitInfo(habitInfo)

    this.logOperation('removeHabit', { habitId: habitIdStr, name: habitToRemove.name })

    console.log('习惯已逻辑删除:', habitIdStr)
    return true
  },

  // 保存已删除习惯的信息（用于历史数据显示和恢复）
  saveDeletedHabitInfo(habit) {
    try {
      const allHabitsInfo = storageService.getAllHabitsInfo()
      // 使用 habitId 或 _id 作为键（兼容不同数据源）
      const habitId = this.getEntityHabitId(habit)

      if (!habitId) {
        console.error('无法保存已删除习惯信息：缺少 habitId')
        return
      }

      // 获取图标配置
      const habitName = habit.name || habit.title || habit.habit_title || habit.habitTitle || ''
      let iconUrl = habit.iconUrl || habit.icon_url || ''
      let themeClass = this.getThemeForHabit(habit)
      if (!iconUrl && habitName) {
        try {
          const iconConfig = iconMap.getIconConfig(habitName)
          if (iconConfig) {
            iconUrl = iconConfig.iconUrl
            themeClass = iconConfig.themeClass
          }
        } catch (e) {
          console.error('获取图标配置失败:', e)
        }
      }

      allHabitsInfo[habitId] = {
        habitId: habitId,
        name: habit.name || habit.title || habit.habit_title || habit.habitTitle || '未知习惯',
        category: habit.category || '其他',
        targetMinutes: habit.targetMinutes || habit.duration || 20,
        themeClass: themeClass,
        iconUrl: iconUrl,
        freq_type: habit.freq_type,
        freq_rules: habit.freq_rules,
        freq_category: habit.freq_category,
        createdAt: habit.createdAt,
        plan_start_date: habit.plan_start_date,
        deletedAt: timeService.getNow().toISOString()
      }
      storageService.setAllHabitsInfo(allHabitsInfo)
      console.log('已保存已删除习惯信息', habitId, habit.name)
    } catch (e) {
      console.error('保存已删除习惯信息失败:', e)
    }
  },

  // 获取所有习惯（默认排除已删除的）
  getAllHabits(includeDeleted = false) {
    const habits = this.globalData.MyHabits || []
    if (includeDeleted) {
      return habits
    }
    return habits.filter(h => !h.isDeleted)
  },

  // 获取已删除的习惯
  getDeletedHabits() {
    const habits = this.globalData.MyHabits || []
    return habits.filter(h => h.isDeleted)
  },

  // 恢复已删除的习惯
  restoreHabit(habitId) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = String(habitId)

    const habitIndex = habits.findIndex(h =>
      this.getEntityHabitId(h) === habitIdStr && h.isDeleted
    )

    if (habitIndex === -1) {
      console.log('未找到要恢复的习惯', habitIdStr)
      return false
    }

    // 恢复习惯
    habits[habitIndex] = {
      ...habits[habitIndex],
      isDeleted: false,
      deletedAt: null,
      restoredAt: timeService.getNow().toISOString()
    }

    this.saveMyHabits(habits)
    this.logOperation('restoreHabit', { habitId: habitIdStr, name: habits[habitIndex].name })

    console.log('习惯已恢复', habitIdStr)
    return true
  },

  // 打印所有打卡记录（调试用）
  printAllLogs() {
    const logs = this.globalData.CheckinLogs || []
    console.log('=== 所有打卡记录===')
    console.log('总记录数:', logs.length)
    logs.forEach(log => {
      console.log(`  ${log.date}: habitId=${log.habitId}`)
    })
    console.log('===================')
  },

  // 获取单个习惯
  getHabitById(habitId) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = String(habitId)
    return habits.find(h => this.getEntityHabitId(h) === habitIdStr)
  },

  // ========== CheckinLogs 操作==========

  /**
   * @deprecated V1 legacy compatibility only.
   * 新代码不得调用；打卡最终状态必须通过 checkinService / syncService / dailyCheckinState。
   */
  saveCheckinLogs(logs) {
    this.globalData.CheckinLogs = logs
    try {
      storageService.setCheckinLogs(logs)
      console.log('CheckinLogs 已保存', logs.length)
    } catch (e) {
      console.error('保存 CheckinLogs 失败:', e)
    }
  },

  /**
   * @deprecated V1 legacy compatibility only.
   * 新代码不得调用；打卡必须通过 checkinService.checkin/toggleCheckin。
   */
  addCheckinLog(habitId, dateStr, syncStatus = 0) {
    const logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    const date = dateStr || timeService.getSimulatedDateStr(this)

    // 检查是否已有今日记录
    const existingIndex = logs.findIndex(log =>
      this.getEntityHabitId(log) === habitIdStr && this.getLogDate(log) === date
    )

    if (existingIndex === -1) {
      // 添加新记录
      logs.push({
        logId: `L_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        habitId: habitIdStr,
        date: date,
        timestamp: timeService.parseDate(date) ? timeService.parseDate(date).getTime() : 0,
        sync_status: syncStatus, // 0=待同步 1=已同步
        created_at: timeService.getNow().toISOString()
      })
      this.saveCheckinLogs(logs)
      this.logOperation('addCheckinLog', { habitId: habitIdStr, date, syncStatus })
      return true
    }
    return false
  },

  /**
   * @deprecated V1 legacy compatibility only.
   * 新代码不得调用；取消打卡必须通过 checkinService.undoCheckin/toggleCheckin。
   */
  removeCheckinLog(habitId, dateStr) {
    let logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    const date = dateStr || timeService.getSimulatedDateStr(this)

    const logIndex = logs.findIndex(log => this.getEntityHabitId(log) === habitIdStr && this.getLogDate(log) === date)

    if (logIndex > -1) {
      if (logs[logIndex].sync_status === 1) {
        // 已同步的记录，标记为待删除
        logs[logIndex].sync_status = 2
        logs[logIndex].deleted_at = timeService.getNow().toISOString()
        console.log('标记为待删除:', habitIdStr, date)
      } else {
        // 未同步的记录，直接删除
        logs.splice(logIndex, 1)
        console.log('直接删除未同步记录', habitIdStr, date)
      }
      this.saveCheckinLogs(logs)
      this.logOperation('removeCheckinLog', { habitId: habitIdStr, date })
    }
  },

  // 删除指定日期的所有打卡记录
  removeLogsByDate(dateStr) {
    let logs = this.globalData.CheckinLogs || []
    const originalCount = logs.length

    logs = logs.filter(log => this.getLogDate(log) !== dateStr)
    const removedCount = originalCount - logs.length

    this.saveCheckinLogs(logs)
    console.log(`removed ${removedCount} checkin logs for ${dateStr}`)
    return removedCount
  },

  // 获取某个习惯的打卡记录
  getLogsByHabitId(habitId) {
    const logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    return logs.filter(log => this.getEntityHabitId(log) === habitIdStr)
  },

  // 获取某天的打卡记录
  getLogsByDate(dateStr) {
    const logs = this.globalData.CheckinLogs || []
    return logs.filter(log => this.getLogDate(log) === dateStr)
  },

  // 检查某天是否已打卡
  isCheckedOnDate(habitId, dateStr) {
    const logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    return logs.some(log =>
      !this.isLogDeleted(log) &&
      this.getEntityHabitId(log) === habitIdStr && this.getLogDate(log) === dateStr
    )
  },

  // 删除某个习惯的所有打卡记录
  removeHabitLogs(habitId) {
    let logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    logs = logs.filter(log => this.getEntityHabitId(log) !== habitIdStr)
    this.saveCheckinLogs(logs)
  },

  // 获取日期范围内所有打卡记录
  getLogsByDateRange(startDate, endDate) {
    const logs = this.globalData.CheckinLogs || []
    return logs.filter(log => {
      const date = this.getLogDate(log)
      return date >= startDate && date <= endDate
    })
  },

  // 计算习惯的累计打卡天数（所有历史打卡记录总数）
  calculateStreak(habitId) {
    const logs = this.getLogsByHabitId(habitId)
    return logs.length
  },

  // 计算习惯的累计打卡天数（去重后的日期数）
  calculateTotalDays(habitId) {
    const logs = this.getLogsByHabitId(habitId)
    // 去重后的日期数
    const uniqueDates = new Set(logs.map(log => this.getLogDate(log)))
    return uniqueDates.size
  },

  // ========== 兼容旧API（用于平滑迁移）==========

  // 保存用户策略到本地存储（旧API 兼容）
  saveUserStrategies(strategies) {
    // 转换为新格式并保存
    const habits = strategies.map(s => this.migrateOldStrategy(s))
    this.saveMyHabits(habits)
  },

  // 添加单个用户策略（旧API 兼容）
  addUserStrategy(strategy) {
    const habit = this.migrateOldStrategy(strategy)
    this.addHabit(habit)
  },

  // 删除用户策略（旧API 兼容）
  removeUserStrategy(habitId, habitData) {
    this.removeHabit(habitId, habitData)
  },

  // ========== 其他功能 ==========

  // ========== 网络状态监听==========

  // 初始化网络状态监听
  initNetworkListener() {
    // 获取当前网络状态
    wx.getNetworkType({
      success: (res) => {
        this.globalData.isOnline = res.networkType !== 'none'
        console.log('当前网络状态', res.networkType, '在线:', this.globalData.isOnline)
      }
    })

    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      const wasOffline = !this.globalData.isOnline
      this.globalData.isOnline = res.isConnected
      console.log('网络状态变化', res.isConnected ? '在线' : '离线')

      // 网络恢复时触发同步
      if (res.isConnected && wasOffline) {
        console.log('network restored, trigger sync')
        syncService.recoverOrSync()
      }
    })
  },

  // 检测网络状态
  checkNetworkStatus() {
    return this.globalData.isOnline
  },

  // ========== 数据同步相关 ==========

  /**
   * @deprecated V1 legacy compatibility only. Phase 4+ - 已废弃，同步统一走 syncService
   * 本方法仅保留兼容旧调用方；不得再直接读取旧 checkin_logs 云函数。
   */
  async syncFromCloud() {
    try {
      return await syncService.recoverFromCloud()
    } catch (e) {
      console.error('从云端同步异常:', getErrorMessage(e))
      return { success: false, error: getErrorMessage(e) }
    }
  },

  /**
   * @deprecated Phase 4+ - 已废弃，同步统一走 syncService
   * 本方法仅保留兼容旧调用方；旧 CheckinLogs 待同步项会迁入 pending 队列，
   * 云端最终由 syncService 调用 syncCheckin 完成。
   */
  async syncToCloud() {
    if (!this.globalData.isOnline) {
      console.log('offline, cannot sync to cloud')
      return { success: false, skipped: true, reason: 'OFFLINE' }
    }

    if (this.globalData.isSyncing) {
      console.log('同步进行中，跳过')
      return { success: false, skipped: true, reason: 'SYNCING' }
    }

    const logs = this.globalData.CheckinLogs || []
    const legacySyncItems = logs.filter(log =>
      log.sync_status === 0 || log.sync_status === undefined || log.sync_status === 2
    )

    if (legacySyncItems.length === 0) {
      console.log('没有需要同步的数据')
      return syncService.recoverOrSync()
    }

    this.globalData.isSyncing = true
    try {
      const syncKeys = this.enqueueLegacyCheckinLogs(legacySyncItems)
      await syncService.processQueue()
      this.reconcileLegacyCheckinLogsAfterSync(syncKeys)
      this.saveCheckinLogs(this.globalData.CheckinLogs || [])
      this.notifyPagesToRefresh()
      return { success: true, migratedCount: syncKeys.length }
    } catch (e) {
      console.error('同步异常:', getErrorMessage(e))
      return { success: false, error: getErrorMessage(e) }
    } finally {
      this.globalData.isSyncing = false
    }
  },

  buildLegacyCheckinSyncPayload(log) {
    const date = this.getLogDate(log)
    const userHabitId = String(log.userHabitId || this.getEntityHabitId(log))
    const habitId = String(log.habitId || log.habit_id || userHabitId)
    const queueAction = log.sync_status === 2 ? 'undoCheckin' : 'checkin'
    const action = queueAction === 'undoCheckin' ? 'undo' : 'checkin'
    const operationId = log.operationId || log.logId || `legacy_${action}_${userHabitId}_${date}`
    const idempotencyKey = log.idempotencyKey || `legacy:${userHabitId}:${date}:${action}`

    return {
      syncKey: idempotencyKey,
      queueAction,
      payload: {
        userHabitId,
        habitId,
        date,
        policyVersionId: log.policyVersionId || log.policy_version_id || '',
        operationId,
        idempotencyKey,
        action,
        clientCreatedAt: log.created_at || log.createdAt || timeService.getNow().toISOString(),
        clientSequence: log.clientSequence || 0
      }
    }
  },

  enqueueLegacyCheckinLogs(logs) {
    const syncKeys = []
    logs.forEach(log => {
      const syncItem = this.buildLegacyCheckinSyncPayload(log)
      syncService.pushWithDedup('checkin', syncItem.queueAction, syncItem.payload)
      syncKeys.push(syncItem.syncKey)
    })
    return syncKeys
  },

  reconcileLegacyCheckinLogsAfterSync(syncKeys) {
    const syncedKeys = new Set(
      syncService.getPendingOperations()
        .filter(item => syncKeys.includes(item.idempotencyKey) && item.status === 'synced')
        .map(item => item.idempotencyKey)
    )

    const logs = this.globalData.CheckinLogs || []
    this.globalData.CheckinLogs = logs.reduce((nextLogs, log) => {
      const syncItem = this.buildLegacyCheckinSyncPayload(log)
      if (!syncedKeys.has(syncItem.syncKey)) {
        nextLogs.push(log)
        return nextLogs
      }

      if (log.sync_status === 2) {
        return nextLogs
      }

      nextLogs.push({
        ...log,
        sync_status: 1,
        sync_time: timeService.getNow().toISOString()
      })
      return nextLogs
    }, [])
  },

  // 通知所有页面刷新数据
  notifyPagesToRefresh() {
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (page.onSyncComplete) {
        page.onSyncComplete()
      }
    })
  },

  // ========== 日志记录==========

  // 记录操作日志
  logOperation(action, data) {
    const logEntry = {
      timestamp: timeService.getNow().toISOString(),
      action: action,
      data: data,
      networkStatus: this.globalData.isOnline ? 'online' : 'offline'
    }

    // 获取现有日志
    let operationLogs = storageService.getItem('operationLogs') || []
    operationLogs.push(logEntry)

    // 只保留最近100条日志
    if (operationLogs.length > 100) {
      operationLogs = operationLogs.slice(-100)
    }

    storageService.setItem('operationLogs', operationLogs)
    console.log('操作日志:', action, data)
  },

  // 获取操作日志
  getOperationLogs() {
    return storageService.getItem('operationLogs') || []
  },

  // 清空操作日志
  clearOperationLogs() {
    storageService.removeItem('operationLogs')
  }

})
