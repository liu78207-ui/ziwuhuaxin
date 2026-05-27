const timeService = require('./services/timeService.js')
const iconMap = require('./utils/iconMap.js')
const syncService = require('./services/syncService.js')

App({
  globalData: {
    userInfo: null,
    openid: null,
    fontsLoaded: false,

    // ========== 璋冭瘯閰嶇疆 ==========
    // 璋冭瘯妯″紡锛氭ā鎷熸棩鏈熷亸绉伙紙澶╂暟锛夛紝0琛ㄧず浠婂ぉ锛?琛ㄧず鏄庡ぉ锛?1琛ㄧず鏄ㄥぉ
    DEBUG_DAY_OFFSET: 0,

    // ========== 鍙岃〃鏁版嵁妯″瀷 ==========
    // 琛?: MyHabits - 鐢ㄦ埛鐨勪慨涔犻厤缃〃锛堢敤鎴峰湪淇範椤垫坊鍔犵殑涔犳儻锛?
    // 鏁版嵁缁撴瀯: [{ habitId: 'h_001', name: '鍙ゆ硶鑹剧伕', themeClass: 't-red', targetMinutes: 20, createdAt: '2026-04-13' }]
    MyHabits: [],

    // 琛?: CheckinLogs - 鎵撳崱娴佹按琛紙璁板綍姣忎竴娆℃墦鍗＄殑鐪熷疄鍔ㄤ綔锛?
    // 鏁版嵁缁撴瀯: [{ logId: 'L_123', habitId: 'h_001', date: '2026-04-13', timestamp: 1712966400000, sync_status: 0 }]
    // sync_status: 0=寰呭悓姝? 1=宸插悓姝? 2=寰呭垹闄?
    CheckinLogs: [],

    // 缃戠粶鐘舵€?
    isOnline: true,
    isSyncing: false
  },

  // 鑾峰彇璋冭瘯鏃ユ湡鍋忕Щ
  getDebugOffset() {
    const offset = this.globalData.DEBUG_DAY_OFFSET;
    return offset !== undefined ? offset : 0;
  },

  // 鑾峰彇妯℃嫙鏃ユ湡锛堝鏋滃浜庤皟璇曟ā寮忥級
  getSimulatedDate() {
    const DEBUG_DAY_OFFSET = this.getDebugOffset();
    const today = new Date();
    if (DEBUG_DAY_OFFSET !== 0) {
      today.setDate(today.getDate() + DEBUG_DAY_OFFSET);
    }
    return today;
  },

  formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  // 鑾峰彇妯℃嫙鏃ユ湡瀛楃涓?
  getSimulatedDateStr() {
    const dateStr = this.formatDateKey(this.getSimulatedDate());
    console.log('getSimulatedDateStr:', dateStr, 'DEBUG_DAY_OFFSET:', this.getDebugOffset());
    return dateStr;
  },

  onLaunch() {
    console.log('App onLaunch')
    // 鍒濆鍖栦簯寮€鍙?
    wx.cloud.init({
      traceUser: true
    })
    // 浠庢湰鍦板瓨鍌ㄥ姞杞藉叏灞€鏁版嵁

    this.loadGlobalDataFromStorage()
    // 鎵ц闈欓粯鐧诲綍
    this.checkAndDoLogin()
    // 鍒濆鍖栫綉缁滅姸鎬佺洃鍚?
    this.initNetworkListener()
    // 鍚姩鏃跺悓姝ヤ簯绔暟鎹?
    this.syncFromCloud()
  },

  // ========== 闈欓粯鐧诲綍涓?OpenID 绠＄悊 ==========

  // 妫€鏌ュ苟鎵ц鐧诲綍
  checkAndDoLogin() {
    // 鍏堜粠鏈湴缂撳瓨璇诲彇 openid
    const cachedOpenid = wx.getStorageSync('user_openid')
    if (cachedOpenid) {
      this.globalData.openid = cachedOpenid
      console.log('浠庣紦瀛樻仮澶?openid:', cachedOpenid)
    } else {
      // 鏈湴娌℃湁锛岃皟鐢ㄤ簯鍑芥暟鑾峰彇
      this.doLogin()
    }
  },

  // 璋冪敤浜戝嚱鏁拌幏鍙?OpenID
  doLogin() {
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        const openid = res.result.openid
        if (openid) {
          // 瀛樺偍鍒版湰鍦扮紦瀛?
          wx.setStorageSync('user_openid', openid)
          // 瀛樺偍鍒板叏灞€鏁版嵁
          this.globalData.openid = openid
          console.log('鐧诲綍鎴愬姛锛宱penid:', openid)
        } else {
          console.error('浜戝嚱鏁拌繑鍥炵殑 openid 涓虹┖')
        }
      },
      fail: (err) => {
        console.error('璋冪敤 login 浜戝嚱鏁板け璐?', err)
      }
    })
  },

  // ========== 鏁版嵁鎸佷箙鍖?==========

  // 浠庢湰鍦板瓨鍌ㄥ姞杞藉叏灞€鏁版嵁
  loadGlobalDataFromStorage() {
    try {
      // 鍔犺浇鐢ㄦ埛淇℃伅
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        this.globalData.userInfo = userInfo
      }

      // 鍔犺浇 MyHabits锛堢敤鎴蜂慨涔犻厤缃〃锛? 浼樺厛浣跨敤鏂扮殑瀛樺偍閿?
      let myHabits = wx.getStorageSync('MyHabits')
      if (myHabits && Array.isArray(myHabits)) {
        // 鏁版嵁淇锛氱‘淇濇瘡涓範鎯兘鏈?freq_type 鍜?freq_rules
        myHabits = myHabits.map(habit => {
          if (!habit.freq_type) {
            console.log('淇涔犳儻鏁版嵁锛屾坊鍔犻粯璁req_type:', habit.name)
            habit.freq_type = 'daily'
            habit.freq_rules = 1
          }
          // 鏁版嵁鎹熷潖妫€鏌ワ細濡傛灉 freq_category 鎸囩ず闂撮殧鎵撳崱锛屼絾 freq_type 琚繚瀛樹负 'daily'
          if (habit.freq_category === 'daily-interval' && habit.freq_type === 'daily') {
            console.log('淇涔犳儻鏁版嵁锛屼慨姝req_type:', habit.name, '浠?daily -> interval')
            habit.freq_type = 'interval'
          }
          return habit
        })
        this.globalData.MyHabits = myHabits
        // 濡傛灉鏈変慨澶嶏紝淇濆瓨鍥炴湰鍦?
        this.saveMyHabits(myHabits)
      } else {
        // 鍏煎鏃ф暟鎹細灏濊瘯浠?userStrategies 杩佺Щ
        const oldStrategies = wx.getStorageSync('userStrategies')
        if (oldStrategies && Array.isArray(oldStrategies)) {
          this.globalData.MyHabits = oldStrategies.map(s => this.migrateOldStrategy(s))
          this.saveMyHabits(this.globalData.MyHabits)
        }
      }

      // 鍔犺浇 CheckinLogs锛堟墦鍗℃祦姘磋〃锛? 浼樺厛浣跨敤鏂扮殑瀛樺偍閿?
      const checkinLogs = wx.getStorageSync('CheckinLogs')
      if (checkinLogs && Array.isArray(checkinLogs)) {
        this.globalData.CheckinLogs = checkinLogs
      } else {
        // 鍏煎鏃ф暟鎹細灏濊瘯浠?checkin_records 杩佺Щ
        const oldRecords = wx.getStorageSync('checkin_records')
        if (oldRecords && typeof oldRecords === 'object') {
          this.globalData.CheckinLogs = this.migrateOldRecords(oldRecords)
          this.saveCheckinLogs(this.globalData.CheckinLogs)
        }
      }

      console.log('鍏ㄥ眬鏁版嵁宸蹭粠鏈湴瀛樺偍鍔犺浇:', {
        MyHabits: this.globalData.MyHabits.length,
        CheckinLogs: this.globalData.CheckinLogs.length
      })
    } catch (e) {
      console.error('鍔犺浇鍏ㄥ眬鏁版嵁澶辫触:', e)
    }
  },

  // 杩佺Щ鏃х瓥鐣ユ暟鎹牸寮?
  migrateOldStrategy(oldStrategy) {
    // 浣跨敤妯℃嫙鏃ユ湡浣滀负鍒涘缓鏃ユ湡锛堝鏋滃浜庤皟璇曟ā寮忎笖娌℃湁鎸囧畾createdAt锛?
    const createdAt = oldStrategy.createdAt || this.getSimulatedDateStr()
    // 璁″垝寮€濮嬫棩鏈燂紝榛樿涓轰粖澶?
    const planStartDate = oldStrategy.plan_start_date || this.getSimulatedDateStr()
    const habitName = oldStrategy.habit_title || oldStrategy.name || oldStrategy.title || '鏈煡涔犳儻'
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

  // 杩佺Щ鏃ф墦鍗¤褰曟牸寮?
  migrateOldRecords(oldRecords) {
    const logs = []
    const today = new Date()
    for (const habitId in oldRecords) {
      const dates = oldRecords[habitId]
      if (Array.isArray(dates)) {
        dates.forEach(dateStr => {
          logs.push({
            logId: `L_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            habitId: String(habitId),
            date: dateStr,
            timestamp: new Date(dateStr).getTime()
          })
        })
      }
    }
    return logs
  },

  // 鏍规嵁鍒嗙被鑾峰彇涓婚鑹?
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

  // ========== MyHabits 琛ㄦ搷浣?==========

  // 淇濆瓨 MyHabits 鍒版湰鍦板瓨鍌?
  saveMyHabits(habits) {
    this.globalData.MyHabits = habits
    try {
      wx.setStorageSync('MyHabits', habits)
      console.log('MyHabits 宸蹭繚瀛?', habits.length)
    } catch (e) {
      console.error('淇濆瓨 MyHabits 澶辫触:', e)
    }
  },

  // 娣诲姞涔犳儻鍒?MyHabits
  addHabit(habit) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = this.getEntityHabitId(habit)

    // 妫€鏌ユ槸鍚﹀凡瀛樺湪锛堝寘鎷凡鍒犻櫎鐨勶級
    const existingIndex = habits.findIndex(h => this.getEntityHabitId(h) === habitIdStr)

    if (existingIndex > -1) {
      // 濡傛灉涔犳儻宸插瓨鍦ㄤ笖琚爣璁颁负鍒犻櫎锛屽垯鎭㈠瀹?
      if (habits[existingIndex].isDeleted) {
        console.log('鎭㈠宸插垹闄ょ殑涔犳儻:', habit.name)
        habits[existingIndex] = {
          ...habits[existingIndex],
          ...habit,
          isDeleted: false,
          deletedAt: null,
          restoredAt: new Date().toISOString()
        }
        this.logOperation('restoreHabitOnAdd', { habitId: habitIdStr, name: habit.name })
      } else {
        // 鏇存柊宸叉湁涔犳儻
        habits[existingIndex] = { ...habits[existingIndex], ...habit }
        this.logOperation('updateHabit', { habitId: habitIdStr, name: habit.name })
      }
    } else {
      // 娣诲姞鏂颁範鎯?
      // 浣跨敤妯℃嫙鏃ユ湡浣滀负鍒涘缓鏃ユ湡锛堝鏋滃浜庤皟璇曟ā寮忥級
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

  // 浠?MyHabits 绉婚櫎涔犳儻锛堣蒋鍒犻櫎锛?
  removeHabit(habitId, habitData) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = String(habitId)

    console.log('removeHabit 琚皟鐢?', habitIdStr)
    console.log('褰撳墠 MyHabits:', habits.map(h => ({ habitId: h.habitId, _id: h._id, name: h.name })))

    // 鍚屾椂鍖归厤 habitId 鍜?_id锛堝吋瀹逛笉鍚屾暟鎹簮锛?
    const habitIndex = habits.findIndex(h => this.getEntityHabitId(h) === habitIdStr)

    if (habitIndex === -1) {
      console.log('鏈壘鍒拌鍒犻櫎鐨勪範鎯?', habitIdStr)
      return false
    }

    const habitToRemove = habits[habitIndex]
    console.log('鎵惧埌瑕佸垹闄ょ殑涔犳儻:', habitToRemove)

    // 杞垹闄わ細鏍囪涓哄凡鍒犻櫎锛岃€屼笉鏄墿鐞嗗垹闄?
    habits[habitIndex] = {
      ...habitToRemove,
      isDeleted: true,
      deletedAt: new Date().toISOString()
    }

    this.saveMyHabits(habits)

    // 淇濆瓨涔犳儻淇℃伅鍒版湰鍦板瓨鍌紙鐢ㄤ簬鍘嗗彶鏁版嵁鏄剧ず鍜屾仮澶嶏級
    // 鍚堝苟 habitData 涓殑棰濆淇℃伅
    const habitInfo = habitData ? { ...habitToRemove, ...habitData } : habitToRemove;
    this.saveDeletedHabitInfo(habitInfo)

    this.logOperation('removeHabit', { habitId: habitIdStr, name: habitToRemove.name })

    console.log('涔犳儻宸茶蒋鍒犻櫎:', habitIdStr)
    return true
  },

  // 淇濆瓨宸插垹闄や範鎯殑淇℃伅锛堢敤浜庡巻鍙叉暟鎹樉绀猴級
  saveDeletedHabitInfo(habit) {
    try {
      const allHabitsInfo = wx.getStorageSync('AllHabitsInfo') || {}
      // 浣跨敤 habitId 鎴?_id 浣滀负閿紙鍏煎涓嶅悓鏁版嵁婧愶級
      const habitId = this.getEntityHabitId(habit)

      if (!habitId) {
        console.error('鏃犳硶淇濆瓨宸插垹闄や範鎯俊鎭細缂哄皯 habitId')
        return
      }

      // 鑾峰彇鍥炬爣閰嶇疆
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
          console.error('鑾峰彇鍥炬爣閰嶇疆澶辫触:', e)
        }
      }

      allHabitsInfo[habitId] = {
        habitId: habitId,
        name: habit.name || habit.title || habit.habit_title || habit.habitTitle || '鏈煡涔犳儻',
        category: habit.category || '鍏朵粬',
        targetMinutes: habit.targetMinutes || habit.duration || 20,
        themeClass: themeClass,
        iconUrl: iconUrl,
        freq_type: habit.freq_type,
        freq_rules: habit.freq_rules,
        freq_category: habit.freq_category,
        createdAt: habit.createdAt,
        plan_start_date: habit.plan_start_date,
        deletedAt: new Date().toISOString()
      }
      wx.setStorageSync('AllHabitsInfo', allHabitsInfo)
      console.log('宸蹭繚瀛樺垹闄や範鎯俊鎭?', habitId, habit.name)
    } catch (e) {
      console.error('淇濆瓨宸插垹闄や範鎯俊鎭け璐?', e)
    }
  },

  // 鑾峰彇鎵€鏈変範鎯紙榛樿鎺掗櫎宸插垹闄ょ殑锛?
  getAllHabits(includeDeleted = false) {
    const habits = this.globalData.MyHabits || []
    if (includeDeleted) {
      return habits
    }
    return habits.filter(h => !h.isDeleted)
  },

  // 鑾峰彇宸插垹闄ょ殑涔犳儻
  getDeletedHabits() {
    const habits = this.globalData.MyHabits || []
    return habits.filter(h => h.isDeleted)
  },

  // 鎭㈠宸插垹闄ょ殑涔犳儻
  restoreHabit(habitId) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = String(habitId)

    const habitIndex = habits.findIndex(h =>
      this.getEntityHabitId(h) === habitIdStr && h.isDeleted
    )

    if (habitIndex === -1) {
      console.log('鏈壘鍒拌鎭㈠鐨勪範鎯?', habitIdStr)
      return false
    }

    // 鎭㈠涔犳儻
    habits[habitIndex] = {
      ...habits[habitIndex],
      isDeleted: false,
      deletedAt: null,
      restoredAt: new Date().toISOString()
    }

    this.saveMyHabits(habits)
    this.logOperation('restoreHabit', { habitId: habitIdStr, name: habits[habitIndex].name })

    console.log('涔犳儻宸叉仮澶?', habitIdStr)
    return true
  },

  // 鎵撳嵃鎵€鏈夋墦鍗¤褰曪紙璋冭瘯鐢級
  printAllLogs() {
    const logs = this.globalData.CheckinLogs || []
    console.log('=== 鎵€鏈夋墦鍗¤褰?===')
    console.log('鎬昏褰曟暟:', logs.length)
    logs.forEach(log => {
      console.log(`  ${log.date}: habitId=${log.habitId}`)
    })
    console.log('===================')
  },

  // 鑾峰彇鍗曚釜涔犳儻
  getHabitById(habitId) {
    const habits = this.globalData.MyHabits || []
    const habitIdStr = String(habitId)
    return habits.find(h => this.getEntityHabitId(h) === habitIdStr)
  },

  // ========== CheckinLogs 琛ㄦ搷浣?==========

  // 淇濆瓨 CheckinLogs 鍒版湰鍦板瓨鍌?
  saveCheckinLogs(logs) {
    this.globalData.CheckinLogs = logs
    try {
      wx.setStorageSync('CheckinLogs', logs)
      console.log('CheckinLogs 宸蹭繚瀛?', logs.length)
    } catch (e) {
      console.error('淇濆瓨 CheckinLogs 澶辫触:', e)
    }
  },

  // 娣诲姞鎵撳崱璁板綍
  addCheckinLog(habitId, dateStr, syncStatus = 0) {
    const logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    const date = dateStr || this.formatDateKey(new Date())

    // 妫€鏌ユ槸鍚﹀凡瀛樺湪浠婃棩璁板綍
    const existingIndex = logs.findIndex(log =>
      this.getEntityHabitId(log) === habitIdStr && this.getLogDate(log) === date
    )

    if (existingIndex === -1) {
      // 娣诲姞鏂拌褰?
      logs.push({
        logId: `L_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        habitId: habitIdStr,
        date: date,
        timestamp: new Date(date).getTime(),
        sync_status: syncStatus, // 0=寰呭悓姝? 1=宸插悓姝?
        created_at: new Date().toISOString()
      })
      this.saveCheckinLogs(logs)
      this.logOperation('addCheckinLog', { habitId: habitIdStr, date, syncStatus })
      return true
    }
    return false
  },

  // 鍙栨秷鎵撳崱璁板綍锛堣蒋鍒犻櫎锛屾爣璁颁负寰呭垹闄わ級
  removeCheckinLog(habitId, dateStr) {
    let logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    const date = dateStr || this.formatDateKey(new Date())

    const logIndex = logs.findIndex(log => this.getEntityHabitId(log) === habitIdStr && this.getLogDate(log) === date)

    if (logIndex > -1) {
      if (logs[logIndex].sync_status === 1) {
        // 宸插悓姝ョ殑璁板綍锛屾爣璁颁负寰呭垹闄?
        logs[logIndex].sync_status = 2
        logs[logIndex].deleted_at = new Date().toISOString()
        console.log('鏍囪涓哄緟鍒犻櫎:', habitIdStr, date)
      } else {
        // 鏈悓姝ョ殑璁板綍锛岀洿鎺ュ垹闄?
        logs.splice(logIndex, 1)
        console.log('鐩存帴鍒犻櫎鏈悓姝ヨ褰?', habitIdStr, date)
      }
      this.saveCheckinLogs(logs)
      this.logOperation('removeCheckinLog', { habitId: habitIdStr, date })
    }
  },

  // 鍒犻櫎鎸囧畾鏃ユ湡鐨勬墍鏈夋墦鍗¤褰?
  removeLogsByDate(dateStr) {
    let logs = this.globalData.CheckinLogs || []
    const originalCount = logs.length

    logs = logs.filter(log => this.getLogDate(log) !== dateStr)
    const removedCount = originalCount - logs.length

    this.saveCheckinLogs(logs)
    console.log(`removed ${removedCount} checkin logs for ${dateStr}`)
    return removedCount
  },

  // 鑾峰彇鏌愪釜涔犳儻鐨勬墦鍗¤褰?
  getLogsByHabitId(habitId) {
    const logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    return logs.filter(log => this.getEntityHabitId(log) === habitIdStr)
  },

  // 鑾峰彇鏌愬ぉ鐨勬墦鍗¤褰?
  getLogsByDate(dateStr) {
    const logs = this.globalData.CheckinLogs || []
    return logs.filter(log => this.getLogDate(log) === dateStr)
  },

  // 妫€鏌ユ煇澶╂槸鍚﹀凡鎵撳崱
  isCheckedOnDate(habitId, dateStr) {
    const logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    return logs.some(log =>
      !this.isLogDeleted(log) &&
      this.getEntityHabitId(log) === habitIdStr && this.getLogDate(log) === dateStr
    )
  },

  // 绉婚櫎鏌愪釜涔犳儻鐨勬墍鏈夋墦鍗¤褰?
  removeHabitLogs(habitId) {
    let logs = this.globalData.CheckinLogs || []
    const habitIdStr = String(habitId)
    logs = logs.filter(log => this.getEntityHabitId(log) !== habitIdStr)
    this.saveCheckinLogs(logs)
  },

  // 鑾峰彇鏃ユ湡鑼冨洿鍐呯殑鎵撳崱璁板綍
  getLogsByDateRange(startDate, endDate) {
    const logs = this.globalData.CheckinLogs || []
    return logs.filter(log => {
      const date = this.getLogDate(log)
      return date >= startDate && date <= endDate
    })
  },

  // 璁＄畻涔犳儻鐨勭疮璁℃墦鍗″ぉ鏁帮紙鎵€鏈夊巻鍙叉墦鍗¤褰曟€绘暟锛?
  calculateStreak(habitId) {
    const logs = this.getLogsByHabitId(habitId)
    return logs.length
  },

  // 璁＄畻涔犳儻鐨勬€绘墦鍗″ぉ鏁?
  calculateTotalDays(habitId) {
    const logs = this.getLogsByHabitId(habitId)
    // 鍘婚噸鍚庣殑鏃ユ湡鏁?
    const uniqueDates = new Set(logs.map(log => this.getLogDate(log)))
    return uniqueDates.size
  },

  // ========== 鍏煎鏃?API锛堢敤浜庡钩婊戣繃娓★級==========

  // 淇濆瓨鐢ㄦ埛绛栫暐鍒版湰鍦板瓨鍌紙鏃?API 鍏煎锛?
  saveUserStrategies(strategies) {
    // 杞崲涓烘柊鏍煎紡骞朵繚瀛?
    const habits = strategies.map(s => this.migrateOldStrategy(s))
    this.saveMyHabits(habits)
  },

  // 娣诲姞鍗曚釜鐢ㄦ埛绛栫暐锛堟棫 API 鍏煎锛?
  addUserStrategy(strategy) {
    const habit = this.migrateOldStrategy(strategy)
    this.addHabit(habit)
  },

  // 绉婚櫎鐢ㄦ埛绛栫暐锛堟棫 API 鍏煎锛?
  removeUserStrategy(habitId, habitData) {
    this.removeHabit(habitId, habitData)
  },

  // ========== 鍏朵粬鍔熻兘 ==========

  // 淇濆瓨鐢ㄦ埛淇℃伅
  saveUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    try {
      wx.setStorageSync('userInfo', userInfo)
    } catch (e) {
      console.error('淇濆瓨鐢ㄦ埛淇℃伅澶辫触:', e)
    }
  },

  // ========== 缃戠粶鐘舵€佺洃鍚?==========

  // 鍒濆鍖栫綉缁滅姸鎬佺洃鍚?
  initNetworkListener() {
    // 鑾峰彇褰撳墠缃戠粶鐘舵€?
    wx.getNetworkType({
      success: (res) => {
        this.globalData.isOnline = res.networkType !== 'none'
        console.log('褰撳墠缃戠粶鐘舵€?', res.networkType, '鍦ㄧ嚎:', this.globalData.isOnline)
      }
    })

    // 鐩戝惉缃戠粶鐘舵€佸彉鍖?
    wx.onNetworkStatusChange((res) => {
      const wasOffline = !this.globalData.isOnline
      this.globalData.isOnline = res.isConnected
      console.log('缃戠粶鐘舵€佸彉鍖?', res.isConnected ? '鍦ㄧ嚎' : '绂荤嚎')

      // 缃戠粶鎭㈠鏃惰Е鍙戝悓姝?
      if (res.isConnected && wasOffline) {
        console.log('network restored, trigger sync')
        syncService.recoverOrSync()
      }
    })
  },

  // 妫€鏌ョ綉缁滅姸鎬?
  checkNetworkStatus() {
    return this.globalData.isOnline
  },

  // ========== 鏁版嵁鍚屾鐩稿叧 ==========
  async syncFromCloud() {
    if (!this.globalData.isOnline) {
      console.log('offline, skip cloud sync')
      return
    }

    if (this.globalData.isSyncing) {
      console.log('鍚屾杩涜涓紝璺宠繃')
      return
    }

    this.globalData.isSyncing = true
    console.log('寮€濮嬩粠浜戠鍚屾鏁版嵁...')

    try {
      // 鑾峰彇浜戠鎵撳崱璁板綍
      const { result } = await wx.cloud.callFunction({
        name: 'getCheckinLogsByRange',
        data: {
          startDate: '2020-01-01',
          endDate: '2099-12-31'
        }
      })

      if (result.success && result.logs) {
        // 鍚堝苟浜戠鏁版嵁鍜屾湰鍦版暟鎹紝浠ヤ簯绔负鍑?
        const cloudLogs = result.logs.map(log => ({
          logId: `cloud_${log._id}`,
          habitId: String(log.habit_id),
          date: log.checkin_date,
          timestamp: new Date(log.checkin_date).getTime(),
          sync_status: 1,
          cloud_id: log._id,
          updated_at: log.created_at || new Date().toISOString()
        }))

        // 鑾峰彇鏈湴寰呭悓姝ョ殑璁板綍锛坰ync_status=0锛?
        const localLogs = this.globalData.CheckinLogs || []
        const pendingLogs = localLogs.filter(log => log.sync_status === 0 || log.sync_status === undefined)

        // 鍚堝苟绛栫暐锛氫簯绔暟鎹鐩栨湰鍦板凡鍚屾鏁版嵁锛屼繚鐣欐湰鍦板緟鍚屾鏁版嵁
        const cloudHabitDateMap = new Map()
        cloudLogs.forEach(log => {
          const key = `${log.habitId}_${log.date}`
          cloudHabitDateMap.set(key, log)
        })

        // 淇濈暀鏈湴寰呭悓姝ヨ褰曪紝浣嗘鏌ユ槸鍚︿笌浜戠鍐茬獊
        const mergedLogs = [...cloudLogs]
        let conflictCount = 0

        pendingLogs.forEach(localLog => {
          const key = `${localLog.habitId}_${localLog.date}`
          if (!cloudHabitDateMap.has(key)) {
            // 浜戠娌℃湁杩欐潯璁板綍锛屼繚鐣欐湰鍦板緟鍚屾
            mergedLogs.push({
              ...localLog,
              sync_status: 0
            })
          } else {
            // 鍐茬獊锛氫互浜戠涓哄噯锛屼涪寮冩湰鍦拌褰?
            conflictCount++
            console.log('鏁版嵁鍐茬獊锛屼互浜戠涓哄噯:', key)
          }
        })

        // 淇濆瓨鍚堝苟鍚庣殑鏁版嵁
        this.saveCheckinLogs(mergedLogs)
        console.log(`浠庝簯绔悓姝ュ畬鎴? ${cloudLogs.length} 鏉′簯绔褰? 淇濈暀 ${pendingLogs.length - conflictCount} 鏉℃湰鍦板緟鍚屾璁板綍`)

        // 瑙﹀彂寰呭悓姝ユ暟鎹笂浼?
        if (pendingLogs.length > conflictCount) {
          this.syncToCloud()
        }
      }
    } catch (e) {
      console.error('浠庝簯绔悓姝ュけ璐?', e)
    } finally {
      this.globalData.isSyncing = false
    }
  },

  // 鍚屾鏈湴鏁版嵁鍒颁簯绔?
  async syncToCloud() {
    if (!this.globalData.isOnline) {
      console.log('offline, cannot sync to cloud')
      return
    }

    if (this.globalData.isSyncing) {
      console.log('鍚屾杩涜涓紝璺宠繃')
      return
    }

    const logs = this.globalData.CheckinLogs || []
    const pendingLogs = logs.filter(log => log.sync_status === 0 || log.sync_status === undefined)
    const toDeleteLogs = logs.filter(log => log.sync_status === 2)

    if (pendingLogs.length === 0 && toDeleteLogs.length === 0) {
      console.log('娌℃湁闇€瑕佸悓姝ョ殑鏁版嵁')
      return
    }

    this.globalData.isSyncing = true
    console.log(`寮€濮嬪悓姝ュ埌浜戠: ${pendingLogs.length} 鏉″緟鍚屾, ${toDeleteLogs.length} 鏉″緟鍒犻櫎`)

    let successCount = 0
    let failCount = 0

    // 鍚屾鏂板璁板綍
    for (const log of pendingLogs) {
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'doCheckin',
          data: { habit_id: log.habitId, checkin_date: log.date }
        })

        if (result.success) {
          // 鏇存柊鏈湴璁板綍鐘舵€佷负宸插悓姝?
          const logIndex = logs.findIndex(l => l.logId === log.logId)
          if (logIndex > -1) {
            logs[logIndex].sync_status = 1
            logs[logIndex].sync_time = new Date().toISOString()
          }
          successCount++
          console.log('鍚屾鎴愬姛:', log.habitId, log.date)
        } else if (
          result.code === 'ALREADY_CHECKED' ||
          result.message === 'already checked' ||
          (result.message && result.message.includes('已打卡'))
        ) {
          // 浜戠宸插瓨鍦紝鏍囪涓哄凡鍚屾
          const logIndex = logs.findIndex(l => l.logId === log.logId)
          if (logIndex > -1) {
            logs[logIndex].sync_status = 1
          }
          successCount++
          console.log('浜戠宸插瓨鍦紝鏍囪涓哄凡鍚屾:', log.habitId, log.date)
        } else {
          failCount++
          console.error('鍚屾澶辫触:', result.message)
        }
      } catch (e) {
        failCount++
        console.error('鍚屾寮傚父:', e)
      }
    }

    // 鍚屾鍒犻櫎璁板綍
    for (const log of toDeleteLogs) {
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'undoCheckin',
          data: { habit_id: log.habitId, checkin_date: log.date }
        })

        if (result.success || result.code === 'CHECKIN_NOT_FOUND' || (result.message && result.message.includes('未打卡'))) {
          // 浠庢湰鍦板交搴曞垹闄?
          const logIndex = logs.findIndex(l => l.logId === log.logId)
          if (logIndex > -1) {
            logs.splice(logIndex, 1)
          }
          successCount++
          console.log('鍒犻櫎鍚屾鎴愬姛:', log.habitId, log.date)
        } else {
          failCount++
          console.error('鍒犻櫎鍚屾澶辫触:', result.message)
        }
      } catch (e) {
        failCount++
        console.error('鍒犻櫎鍚屾寮傚父:', e)
      }
    }

    // 淇濆瓨鏇存柊鍚庣殑璁板綍
    this.saveCheckinLogs(logs)
    this.globalData.isSyncing = false

    console.log(`鍚屾瀹屾垚: 鎴愬姛 ${successCount}, 澶辫触 ${failCount}`)

    // 閫氱煡椤甸潰鍒锋柊
    if (successCount > 0) {
      this.notifyPagesToRefresh()
    }
  },

  // 閫氱煡鎵€鏈夐〉闈㈠埛鏂版暟鎹?
  notifyPagesToRefresh() {
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (page.onSyncComplete) {
        page.onSyncComplete()
      }
    })
  },

  // ========== 鏃ュ織璁板綍 ==========

  // 璁板綍鎿嶄綔鏃ュ織
  logOperation(action, data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      data: data,
      networkStatus: this.globalData.isOnline ? 'online' : 'offline'
    }

    // 鑾峰彇鐜版湁鏃ュ織
    let operationLogs = wx.getStorageSync('operationLogs') || []
    operationLogs.push(logEntry)

    // 鍙繚鐣欐渶杩?00鏉℃棩蹇?
    if (operationLogs.length > 100) {
      operationLogs = operationLogs.slice(-100)
    }

    wx.setStorageSync('operationLogs', operationLogs)
    console.log('鎿嶄綔鏃ュ織:', action, data)
  },

  // 鑾峰彇鎿嶄綔鏃ュ織
  getOperationLogs() {
    return wx.getStorageSync('operationLogs') || []
  },

  // 娓呯┖鎿嶄綔鏃ュ織
  clearOperationLogs() {
    wx.removeStorageSync('operationLogs')
  }

})
