/**
 * Jest 测试环境设置文件
 * 在所有测试运行前执行，用于设置全局模拟
 */

// 模拟微信小程序全局 API
global.wx = {
  // 存储相关
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  getStorage: jest.fn(),
  setStorage: jest.fn(),

  // 网络请求
  request: jest.fn(),
  downloadFile: jest.fn(),
  uploadFile: jest.fn(),

  // 界面交互
  showToast: jest.fn(),
  showModal: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showActionSheet: jest.fn(),

  // 导航
  navigateTo: jest.fn(),
  redirectTo: jest.fn(),
  switchTab: jest.fn(),
  navigateBack: jest.fn(),
  reLaunch: jest.fn(),

  // 云开发
  cloud: {
    init: jest.fn(),
    callFunction: jest.fn(),
    getTempFileURL: jest.fn(),
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(),
        where: jest.fn(() => ({
          get: jest.fn(),
          update: jest.fn(),
          remove: jest.fn(),
          count: jest.fn()
        })),
        add: jest.fn(),
        get: jest.fn(),
        orderBy: jest.fn(() => ({
          get: jest.fn()
        })),
        limit: jest.fn(),
        skip: jest.fn()
      })),
      command: {
        eq: jest.fn(),
        neq: jest.fn(),
        gt: jest.fn(),
        gte: jest.fn(),
        lt: jest.fn(),
        lte: jest.fn(),
        in: jest.fn(),
        nin: jest.fn(),
        and: jest.fn(),
        or: jest.fn()
      }
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'test_openid',
      APPID: 'test_appid',
      UNIONID: 'test_unionid',
      ENV: 'test-env'
    }))
  },

  // 系统信息
  getSystemInfoSync: jest.fn(() => ({
    windowWidth: 375,
    windowHeight: 667,
    screenWidth: 375,
    screenHeight: 667,
    statusBarHeight: 20,
    platform: 'ios'
  })),
  getAccountInfoSync: jest.fn(() => ({
    miniProgram: {
      envVersion: 'develop'
    }
  })),

  // 用户相关
  getUserInfo: jest.fn(),
  login: jest.fn(),
  checkSession: jest.fn(),

  // 其他常用API
  scanCode: jest.fn(),
  makePhoneCall: jest.fn(),
  setClipboardData: jest.fn(),
  getClipboardData: jest.fn(),
  openLocation: jest.fn(),
  getLocation: jest.fn(),

  // 页面生命周期相关
  pageScrollTo: jest.fn(),
  createAnimation: jest.fn(() => ({
    opacity: jest.fn().mockReturnThis(),
    scale: jest.fn().mockReturnThis(),
    step: jest.fn().mockReturnThis(),
    export: jest.fn()
  })),
  createSelectorQuery: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    boundingClientRect: jest.fn().mockReturnThis(),
    exec: jest.fn((callback) => callback && callback([{ width: 100, height: 100 }]))
  }))
};

// 模拟 App 构造函数
global.App = jest.fn((options) => {
  const app = {
    globalData: options.globalData || {},
    onLaunch: options.onLaunch || jest.fn(),
    onShow: options.onShow || jest.fn(),
    onHide: options.onHide || jest.fn(),
    onError: options.onError || jest.fn()
  };
  // 执行 onLaunch
  if (options.onLaunch) {
    options.onLaunch.call(app);
  }
  return app;
});

// 模拟 Page 构造函数
global.Page = jest.fn((options) => {
  const page = {
    data: options.data || {},
    setData: jest.fn(function(data) {
      Object.assign(this.data, data);
    }),
    onLoad: options.onLoad || jest.fn(),
    onShow: options.onShow || jest.fn(),
    onReady: options.onReady || jest.fn(),
    onHide: options.onHide || jest.fn(),
    onUnload: options.onUnload || jest.fn(),
    onPullDownRefresh: options.onPullDownRefresh || jest.fn(),
    onReachBottom: options.onReachBottom || jest.fn(),
    onPageScroll: options.onPageScroll || jest.fn(),
    onShareAppMessage: options.onShareAppMessage || jest.fn(),
    route: 'pages/test/test'
  };

  // 绑定所有方法到 page 对象
  Object.keys(options).forEach(key => {
    if (typeof options[key] === 'function') {
      page[key] = options[key].bind(page);
    }
  });

  return page;
});

// 模拟 Component 构造函数
global.Component = jest.fn((options) => {
  const component = {
    data: options.data || {},
    properties: options.properties || {},
    methods: options.methods || {},
    setData: jest.fn(function(data) {
      Object.assign(this.data, data);
    }),
    triggerEvent: jest.fn()
  };

  // 绑定方法
  if (options.methods) {
    Object.keys(options.methods).forEach(key => {
      component.methods[key] = options.methods[key].bind(component);
    });
  }

  return component;
});

// 模拟 getApp
global.getApp = jest.fn(() => ({
  globalData: {
    userInfo: null,
    openid: 'test_openid',
    MyHabits: [],
    CheckinLogs: []
  }
}));

// 模拟 Behavior
global.Behavior = jest.fn((options) => options);

// 全局测试工具函数
global.testUtils = {
  // 创建模拟事件对象
  createMockEvent: (dataset = {}) => ({
    currentTarget: { dataset },
    target: { dataset },
    detail: {}
  }),

  // 创建模拟回调
  createMockCallback: (returnValue) => {
    return jest.fn().mockImplementation((options) => {
      if (options && options.success) {
        options.success(returnValue || {});
      }
    });
  },

  // 等待指定时间
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // 模拟异步操作
  flushPromises: () => new Promise(resolve => setImmediate(resolve)),

  // 生成测试数据
  generateTestData: {
    // 生成测试习惯
    habit: (overrides = {}) => ({
      _id: `h_${Date.now()}`,
      title: '测试习惯',
      category: '运动类',
      description: '测试描述',
      default_duration: 20,
      ...overrides
    }),

    // 生成测试策略
    strategy: (overrides = {}) => ({
      _id: `s_${Date.now()}`,
      habit_id: `h_${Date.now()}`,
      habit_title: '测试习惯',
      category: '运动类',
      duration: 20,
      freq_type: 'daily',
      freq_rules: 1,
      created_at: new Date().toISOString(),
      ...overrides
    }),

    // 生成测试打卡记录
    checkinLog: (overrides = {}) => ({
      _id: `l_${Date.now()}`,
      habit_id: `h_${Date.now()}`,
      checkin_date: new Date().toISOString().split('T')[0],
      created_at: new Date(),
      ...overrides
    })
  }
};

// 在每个测试前清理
beforeEach(() => {
  jest.clearAllMocks();
});

// 全局测试超时设置
jest.setTimeout(10000);
