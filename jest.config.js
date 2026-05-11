/**
 * Jest 测试配置文件
 * 配置测试环境、覆盖率、测试路径等
 */

module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // 忽略测试的路径
  testPathIgnorePatterns: [
    '/node_modules/',
    '/miniprogram/',
    '^/cloudfunctions/(?!__tests__/)'
  ],

  // 覆盖率配置
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // 需要收集覆盖率的文件（只包含 JavaScript 文件）
  collectCoverageFrom: [
    'miniprogram/utils/**/*.js',
    '!miniprogram/utils/**/*.ts',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],

  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // 模块映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/miniprogram/$1',
    '^@utils/(.*)$': '<rootDir>/miniprogram/utils/$1',
    '^@components/(.*)$': '<rootDir>/miniprogram/components/$1'
  },

  // 设置文件
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // 转换器
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // 不转换的文件模式
  transformIgnorePatterns: [
    '/node_modules/',
    '\\.ts$'
  ],

  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json'],

  // 测试超时时间
  testTimeout: 10000,

  // 详细输出
  verbose: true,

  // 测试报告器
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './reports',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › '
      }
    ]
  ],

  // 全局变量
  globals: {
    wx: {},
    getApp: {},
    Page: {},
    Component: {},
    App: {}
  }
};
