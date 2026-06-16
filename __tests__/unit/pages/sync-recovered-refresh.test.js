function createPageFactory() {
  let page = null
  global.Page = jest.fn(config => {
    page = {
      data: { ...(config.data || {}) },
      setData: jest.fn(function(data, callback) {
        Object.assign(this.data, data)
        if (typeof callback === 'function') callback()
      }),
      getTabBar: jest.fn(() => null)
    }
    Object.keys(config).forEach(key => {
      if (typeof config[key] === 'function') {
        page[key] = config[key].bind(page)
      } else if (key !== 'data') {
        page[key] = config[key]
      }
    })
    return page
  })
  return () => page
}

describe('pages refresh after cloud recovery events', () => {
  let eventBus

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    eventBus = require('../../../miniprogram/services/eventBus')
    eventBus.clear()
    wx.nextTick = jest.fn(callback => callback())
  })

  test('home refreshes view model after sync:recovered', () => {
    jest.doMock('../../../miniprogram/services/homeService', () => ({
      getHomeViewModel: jest.fn()
    }))
    jest.doMock('../../../miniprogram/services/habitService', () => ({
      requestPendingTab: jest.fn()
    }))
    jest.doMock('../../../miniprogram/services/checkinService', () => ({
      toggleCheckin: jest.fn()
    }))
    jest.doMock('../../../miniprogram/services/timeService', () => ({
      getTodayKey: jest.fn(() => '2026-06-16')
    }))
    jest.doMock('../../../miniprogram/services/shareService', () => ({
      enableShareMenu: jest.fn(),
      appMessage: jest.fn(),
      getShareTimeline: jest.fn()
    }))

    const getPage = createPageFactory()
    require('../../../miniprogram/pages/home/home.js')
    const page = getPage()
    page.loadViewModel = jest.fn()

    page.onLoad()
    eventBus.emit('sync:recovered', { source: 'recoverData', restored: true })

    expect(page.loadViewModel).toHaveBeenCalledTimes(2)
  })

  test('habits refreshes display list after sync:recovered', () => {
    jest.doMock('../../../miniprogram/utils/iconMap.js', () => ({
      getIconConfig: jest.fn(() => null),
      getThemeByCategory: jest.fn(() => 't-green')
    }))
    jest.doMock('../../../miniprogram/services/shareService', () => ({
      enableShareMenu: jest.fn()
    }))
    jest.doMock('../../../miniprogram/services/habitService', () => ({
      buildHabitDisplayList: jest.fn(habits => habits),
      consumePendingTabIntent: jest.fn(() => null)
    }))

    const getPage = createPageFactory()
    require('../../../miniprogram/pages/habits/habits.js')
    const page = getPage()
    page.loadUserHabitsStatus = jest.fn()

    page.onLoad()
    eventBus.emit('sync:recovered', { source: 'recoverData', restored: true })

    expect(page.loadUserHabitsStatus).toHaveBeenCalledTimes(2)
  })

  test('stats reloads report data after sync:recovered', () => {
    jest.doMock('../../../miniprogram/utils/iconMap.js', () => ({
      getIconConfig: jest.fn(() => null),
      getThemeByCategory: jest.fn(() => 't-blue')
    }))
    jest.doMock('../../../miniprogram/utils/lunarCalendar.js', () => ({
      formatLunarRange: jest.fn(() => '')
    }))
    jest.doMock('../../../miniprogram/services/shareService', () => ({
      enableShareMenu: jest.fn(),
      getShareMessage: jest.fn(),
      getShareTimeline: jest.fn()
    }))
    jest.doMock('../../../miniprogram/services/timeService.js', () => ({
      getSimulatedDate: jest.fn(() => new Date(Date.UTC(2026, 5, 16))),
      getWeekRange: jest.fn(() => ({ startDate: '2026-06-15', endDate: '2026-06-21' })),
      formatDate: jest.fn(date => {
        const d = new Date(date)
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      }),
      formatTimestamp: jest.fn(() => '2026-06-16'),
      addDays: jest.fn((date, days) => {
        const d = new Date(`${date}T00:00:00.000Z`)
        d.setUTCDate(d.getUTCDate() + days)
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      }),
      getMonthRange: jest.fn(() => ({ startDate: '2026-06-01', endDate: '2026-06-30' })),
      getYearRange: jest.fn(() => ({ startDate: '2026-01-01', endDate: '2026-12-31' })),
      parseDate: jest.fn(date => new Date(`${date}T00:00:00.000Z`)),
      dateDiff: jest.fn(() => 29)
    }))
    jest.doMock('../../../miniprogram/services/reportService', () => ({
      getWeeklyReport: jest.fn(),
      getMonthlyReport: jest.fn(),
      getYearlyReport: jest.fn()
    }))

    const getPage = createPageFactory()
    require('../../../miniprogram/pages/stats/stats.js')
    const page = getPage()
    page.loadRealData = jest.fn()

    page.onLoad()
    eventBus.emit('sync:recovered', { source: 'recoverData', restored: true })

    expect(page.loadRealData).toHaveBeenCalledTimes(1)
  })
})
