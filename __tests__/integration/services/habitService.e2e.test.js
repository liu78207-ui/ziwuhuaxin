/**
 * __tests__/integration/services/habitService.e2e.test.js
 *
 * 端到端：模拟用户「从明天开始的策略」添加揉腹 (habitId 20)，
 * 验证「今日修习」home 视图不会显示该 habit。
 */

let mockStorage = {
  myHabits: [],
  policyVersions: [],
  dailyStates: [],
  migrationMeta: { userHabitInstances: {}, status: 'completed' }
}

jest.mock('../../../miniprogram/services/storageService', () => {
  const STORAGE_KEYS = {
    habits: 'MyHabits',
    logs: 'CheckinLogs',
    allHabitsInfo: 'AllHabitsInfo',
    dailyStates: 'dailyCheckinStates',
    policyVersions: 'policyVersions',
    checkinOperations: 'checkinOperations',
    migrationMeta: 'migrationMeta',
    pendingOperations: 'pendingOperations',
    clientSequenceCounter: 'clientSequenceCounter'
  }
  return {
    STORAGE_KEYS,
    getMigrationMeta: jest.fn(() => mockStorage.migrationMeta),
    setMigrationMeta: jest.fn((m) => { mockStorage.migrationMeta = m }),
    getMyHabitsWithMigration: jest.fn(() => mockStorage.myHabits),
    setMyHabits: jest.fn((h) => { mockStorage.myHabits = h }),
    getMyHabits: jest.fn(() => mockStorage.myHabits),
    getPolicyVersions: jest.fn(() => mockStorage.policyVersions),
    setPolicyVersions: jest.fn((v) => { mockStorage.policyVersions = v }),
    getPolicyVersionsByUserHabitId: jest.fn((uhId) =>
      mockStorage.policyVersions.filter(pv => pv.userHabitId === uhId)
    ),
    getActivePolicyVersion: jest.fn((uhId) =>
      mockStorage.policyVersions.find(
        pv => pv.userHabitId === uhId && pv.effectiveEndDate === null
      ) || null
    ),
    savePolicyVersion: jest.fn((pv) => {
      const idx = mockStorage.policyVersions.findIndex(p => p.policyVersionId === pv.policyVersionId)
      if (idx >= 0) mockStorage.policyVersions[idx] = pv
      else mockStorage.policyVersions.push(pv)
    }),
    closePolicyVersion: jest.fn((pvId, endDate) => {
      const pv = mockStorage.policyVersions.find(p => p.policyVersionId === pvId)
      if (pv) pv.effectiveEndDate = endDate
    }),
    getDailyCheckinStates: jest.fn(() => mockStorage.dailyStates),
    getDailyState: jest.fn((userHabitId, date) =>
      mockStorage.dailyStates.find(s => s.userHabitId === userHabitId && s.date === date) || null
    ),
    getDailyStatesByDate: jest.fn((date) =>
      mockStorage.dailyStates.filter(s => s.date === date)
    ),
    setDailyState: jest.fn((s) => {
      const idx = mockStorage.dailyStates.findIndex(x =>
        x.userHabitId === s.userHabitId && x.date === s.date
      )
      if (idx >= 0) mockStorage.dailyStates[idx] = s
      else mockStorage.dailyStates.push(s)
    }),
    getNextClientSequence: jest.fn(() => 1),
    saveCheckinOperation: jest.fn(),
    backupMyHabitsForMigration: jest.fn(),
    backupCheckinLogsForMigration: jest.fn(),
    backupPolicyVersionsForMigration: jest.fn()
  }
})

// mock 同步服务
jest.mock('../../../miniprogram/services/syncService', () => ({
  pushWithDedup: jest.fn(),
  processQueue: jest.fn(() => Promise.resolve())
}))

// 锁定业务日期 = 2026-06-02（今天）
jest.mock('../../../miniprogram/services/timeService', () => {
  const actual = jest.requireActual('../../../miniprogram/services/timeService')
  return {
    ...actual,
    getBusinessDate: jest.fn(() => '2026-06-02'),
    getTodayKey: jest.fn(() => '2026-06-02'),
    getSimulatedDateStr: jest.fn(() => '2026-06-02')
  }
})

const habitService = require('../../../miniprogram/services/habitService')
const syncService = require('../../../miniprogram/services/syncService')

describe('habitService E2E - 揉腹 (habitId 20) 从明天开始', () => {
  beforeEach(() => {
    mockStorage = {
      myHabits: [],
      policyVersions: [],
      dailyStates: [],
      migrationMeta: { userHabitInstances: {}, status: 'completed' }
    }
  })

  test('端到端：用户添加「揉腹」策略从明天 (2026-06-03) 开始，今日不展示', async () => {
    // 1. 用户从 picker 选「明天」并点击确认
    const userHabit = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-03' // 明天
    })

    // 2. 验证 userHabit 已落库
    expect(userHabit.status).toBe('active')
    expect(userHabit.habitId).toBe('20')

    // 3. 验证 policy 正确落库
    const policies = mockStorage.policyVersions.filter(p => p.userHabitId === userHabit.userHabitId)
    expect(policies).toHaveLength(1)
    expect(policies[0].effectiveStartDate).toBe('2026-06-03')
    expect(policies[0].effectiveEndDate).toBeNull()

    // 4. 调用 getTodayHabits (今天 = 2026-06-02)
    const todayHabits = await habitService.getTodayHabits('2026-06-02')

    // 5. 关键断言：今日不应展示从明天开始的揉腹
    const found = todayHabits.find(h => h.habitId === '20')
    expect(found).toBeUndefined()
    expect(todayHabits).toHaveLength(0)
  })

  test('端到端：从明天开始的策略，明天开始时进入「今日修习」', async () => {
    const userHabit = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-03'
    })

    // 模拟时间走到 2026-06-03（明天）
    const tomorrowHabits = await habitService.getTodayHabits('2026-06-03')

    const found = tomorrowHabits.find(h => h.habitId === '20')
    expect(found).toBeDefined()
    expect(found.userHabitId).toBe(userHabit.userHabitId)
  })

  test('端到端：编辑策略 startDate 从今天改为明天，userHabitId 保持不变', async () => {
    // 1. 第一次添加（今天开始）
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02' // 今天
    })
    const originalUserHabitId = uh1.userHabitId

    // 验证今天会展示
    const todayList1 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList1.find(h => h.habitId === '20')).toBeDefined()

    // 2. 编辑策略（改为明天开始），必须复用原 userHabitId
    const uh2 = await habitService.updateHabitPolicy(originalUserHabitId, {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-03' // 改为明天
    })

    // 关键断言：userHabitId 必须保持不变
    expect(uh2.userHabitId).toBe(originalUserHabitId)

    // 验证总 userHabit 数量没有增加（没有创建新 userHabit）
    const allUserHabits = mockStorage.myHabits.filter(h => h.habitId === '20' && h.status === 'active')
    expect(allUserHabits).toHaveLength(1)

    // 3. 验证策略历史：旧策略被关闭，新策略是最新版
    const policies = mockStorage.policyVersions.filter(p => p.userHabitId === originalUserHabitId)
    const oldPolicy = policies.find(p => p.effectiveStartDate === '2026-06-02')
    const newPolicy = policies.find(p => p.effectiveStartDate === '2026-06-03')

    expect(oldPolicy).toBeDefined()
    expect(oldPolicy.effectiveEndDate).toBe('2026-06-03') // 旧策略在编辑当天关闭
    expect(newPolicy).toBeDefined()
    expect(newPolicy.effectiveEndDate).toBeNull() // 新策略是最新版

    // 4. 验证今日不展示（因为新策略从明天开始）
    const todayList2 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList2.find(h => h.habitId === '20')).toBeUndefined()

    // 5. 验证明天开始展示
    const tomorrowList = await habitService.getTodayHabits('2026-06-03')
    expect(tomorrowList.find(h => h.habitId === '20')).toBeDefined()
  })

  test('端到端：当天未打卡时编辑策略，写入低压力锁定状态', async () => {
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02'
    })

    await habitService.updateHabitPolicy(uh1.userHabitId, {
      duration: 20,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [3] },
      startDate: '2026-06-02'
    })

    const state = mockStorage.dailyStates.find(s =>
      s.userHabitId === uh1.userHabitId && s.date === '2026-06-02'
    )

    expect(state).toBeDefined()
    expect(state.status).toBe('unchecked')
    expect(state.hasPolicyChangedToday).toBe(true)
    expect(state.lockedReason).toBe('strategy_changed_without_checkin')
    expect(state.lockReason).toBe('strategy_changed_without_checkin')
    expect(syncService.pushWithDedup).toHaveBeenLastCalledWith(
      'habit',
      'updatePolicy',
      expect.objectContaining({
        strategyChangedDailyState: expect.objectContaining({
          userHabitId: uh1.userHabitId,
          date: '2026-06-02',
          status: 'unchecked',
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_without_checkin'
        })
      })
    )
  })

  test('端到端：当天已打卡后编辑策略，写入已完成锁定状态', async () => {
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02'
    })

    mockStorage.dailyStates.push({
      stateId: 'state_existing',
      userHabitId: uh1.userHabitId,
      habitId: '20',
      date: '2026-06-02',
      status: 'checked',
      lastOperationId: 'op_checkin'
    })

    await habitService.updateHabitPolicy(uh1.userHabitId, {
      duration: 20,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [3] },
      startDate: '2026-06-02'
    })

    const state = mockStorage.dailyStates.find(s =>
      s.userHabitId === uh1.userHabitId && s.date === '2026-06-02'
    )

    expect(state).toBeDefined()
    expect(state.status).toBe('checked')
    expect(state.hasPolicyChangedToday).toBe(true)
    expect(state.lockedReason).toBe('strategy_changed_after_checkin')
    expect(state.lockReason).toBe('strategy_changed_after_checkin')
    expect(syncService.pushWithDedup).toHaveBeenLastCalledWith(
      'habit',
      'updatePolicy',
      expect.objectContaining({
        strategyChangedDailyState: expect.objectContaining({
          userHabitId: uh1.userHabitId,
          date: '2026-06-02',
          status: 'checked',
          hasPolicyChangedToday: true,
          lockedReason: 'strategy_changed_after_checkin'
        })
      })
    )
  })

  test('端到端：daily → weekly 周三（今天周二），编辑后今日不展示', async () => {
    // 今天 = 2026-06-02 = 周二
    // 1. 第一次添加（daily，今天开始）
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02' // 周二
    })
    const originalUserHabitId = uh1.userHabitId

    // 验证今天会展示
    const todayList1 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList1.find(h => h.habitId === '20')).toBeDefined()

    // 2. 编辑为 weekly 周三，startDate = 今天 (2026-06-02 周二)
    // 这是用户实际场景：今天修改策略，未来从今天开始但是 weekly 频率
    const uh2 = await habitService.updateHabitPolicy(originalUserHabitId, {
      duration: 10,
      frequencyType: 'weekly',
      frequencyConfig: { weekdays: [3] }, // 周三
      startDate: '2026-06-02' // 今天 = 周二
    })

    expect(uh2.userHabitId).toBe(originalUserHabitId)

    // 验证最新策略的频率
    const latestPolicy = mockStorage.policyVersions.find(
      p => p.userHabitId === originalUserHabitId && p.effectiveEndDate === null
    )
    expect(latestPolicy).toBeDefined()
    expect(latestPolicy.frequencyType).toBe('weekly')
    expect(latestPolicy.frequencyConfig.weekdays).toEqual([3])

    // 3. 关键断言：今天 (周二) 不是周三，不展示
    const todayList2 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList2.find(h => h.habitId === '20')).toBeUndefined()

    // 4. 周三 (2026-06-03) 展示
    const wedList = await habitService.getTodayHabits('2026-06-03')
    expect(wedList.find(h => h.habitId === '20')).toBeDefined()
  })

  test('端到端：先添加「今天」开始 → 用户删除 → 重新添加「明天」开始', async () => {
    // 1. 第一次添加，今天开始
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02'
    })

    // 验证今天会展示
    const todayList1 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList1.find(h => h.habitId === '20')).toBeDefined()

    // 2. 软删除
    await habitService.softDeleteHabit(uh1.userHabitId)

    // 删除后今天不展示
    const todayList2 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList2.find(h => h.habitId === '20')).toBeUndefined()

    // 3. 重新添加，从明天开始
    const uh2 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-03'
    })

    expect(uh2.userHabitId).not.toBe(uh1.userHabitId) // 新 userHabitId

    // 验证新实例的策略
    const newPolicy = mockStorage.policyVersions.find(
      p => p.userHabitId === uh2.userHabitId
    )
    expect(newPolicy.effectiveStartDate).toBe('2026-06-03')

    // 今天不展示新实例
    const todayList3 = await habitService.getTodayHabits('2026-06-02')
    expect(todayList3.find(h => h.habitId === '20')).toBeUndefined()

    // 明天展示新实例
    const tomorrowList = await habitService.getTodayHabits('2026-06-03')
    expect(tomorrowList.find(h => h.habitId === '20')).toBeDefined()
  })

  test('删除当天已打卡：写入 deleted_after_checkin 锁定状态并保留首页取消入口', async () => {
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02'
    })

    mockStorage.dailyStates.push({
      stateId: 'state_checked',
      userHabitId: uh1.userHabitId,
      habitId: '20',
      date: '2026-06-02',
      status: 'checked',
      lastOperationId: 'op_checkin'
    })

    await habitService.softDeleteHabit(uh1.userHabitId)

    const state = mockStorage.dailyStates.find(s =>
      s.userHabitId === uh1.userHabitId && s.date === '2026-06-02'
    )
    expect(state.status).toBe('checked')
    expect(state.hasDeletionToday).toBe(true)
    expect(state.isLocked).toBe(true)
    expect(state.lockReason).toBe('deleted_after_checkin')

    const todayHabits = await habitService.getTodayHabits('2026-06-02')
    expect(todayHabits).toHaveLength(1)
    expect(todayHabits[0].userHabitId).toBe(uh1.userHabitId)
    expect(todayHabits[0].isChecked).toBe(true)
    expect(syncService.pushWithDedup).toHaveBeenLastCalledWith(
      'habit',
      'deleteHabit',
      expect.objectContaining({
        userHabitId: uh1.userHabitId,
        deletionDailyState: expect.objectContaining({
          status: 'checked',
          lockReason: 'deleted_after_checkin'
        })
      })
    )
  })

  test('删除当天未打卡：写入 deleted_without_checkin 且首页移除', async () => {
    const uh1 = await habitService.addHabit('20', {
      duration: 10,
      frequencyType: 'daily',
      frequencyConfig: { intervalDays: 1 },
      startDate: '2026-06-02'
    })

    await habitService.softDeleteHabit(uh1.userHabitId)

    const state = mockStorage.dailyStates.find(s =>
      s.userHabitId === uh1.userHabitId && s.date === '2026-06-02'
    )
    expect(state.status).toBe('not_required')
    expect(state.hasDeletionToday).toBe(true)
    expect(state.lockReason).toBe('deleted_without_checkin')

    const todayHabits = await habitService.getTodayHabits('2026-06-02')
    expect(todayHabits).toHaveLength(0)
  })
})
