function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }, options = {}) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [], creates: [] }
  const counters = {}
  const missingCollections = new Set(options.missingCollections || [])

  function ensureCollection(name) {
    if (!collections[name]) {
      collections[name] = []
    }
    return collections[name]
  }

  function matches(query, doc) {
    return Object.keys(query || {}).every(key => doc[key] === query[key])
  }

  function collectionApi(name) {
    return {
      where(query) {
        if (missingCollections.has(name)) {
          throw new Error(`collection.get:fail -502005 database collection not exists: ${name}`)
        }
        const matched = ensureCollection(name).filter(doc => matches(query, doc))
        const state = { limitValue: matched.length }
        const queryApi = {
          limit(value) {
            state.limitValue = value
            return queryApi
          },
          get: jest.fn(() => Promise.resolve({
            data: matched.slice(0, state.limitValue)
          }))
        }
        return queryApi
      },
      add(payload) {
        counters[name] = (counters[name] || 0) + 1
        const record = {
          ...(payload.data || {}),
          _id: `${name}_${counters[name]}`
        }
        ensureCollection(name).push(record)
        calls.adds.push({ collection: name, payload })
        return Promise.resolve({ _id: record._id })
      },
      doc(id) {
        return {
          update(payload) {
            const record = ensureCollection(name).find(item => item._id === id)
            if (record) {
              Object.assign(record, payload.data || {})
            }
            calls.updates.push({ collection: name, id, payload })
            return Promise.resolve({ updated: record ? 1 : 0 })
          }
        }
      }
    }
  }

  jest.doMock('wx-server-sdk', () => ({
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: jest.fn(),
    getWXContext: jest.fn(() => wxContext),
    database: jest.fn(() => ({
      createCollection: jest.fn(name => {
        calls.creates.push(name)
        missingCollections.delete(name)
        ensureCollection(name)
        return Promise.resolve({ errMsg: 'collection.create:ok' })
      }),
      collection: jest.fn(collectionApi)
    }))
  }), { virtual: true })

  return { collections, calls }
}

describe('saveUserProfile cloud function', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('creates missing prefixed test users collection and saves profile', async () => {
    const { collections, calls } = createMockCloud({}, { OPENID: 'openid_1' }, {
      missingCollections: ['test_users']
    })

    const { main } = require('../../../cloudfunctions/saveUserProfile/index.js')
    const result = await main({
      __collectionPrefix: 'test_',
      nickName: '测试用户'
    }, {})

    expect(result).toEqual(expect.objectContaining({
      success: true,
      userId: 'test_users_1',
      created: true
    }))
    expect(calls.creates).toContain('test_users')
    expect(collections.test_users[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      nickName: '测试用户'
    }))
    expect(collections.users).toBeUndefined()
  })

  test('updates existing prefixed test user profile', async () => {
    const { collections, calls } = createMockCloud({
      test_users: [{
        _id: 'test_user_1',
        _openid: 'openid_1',
        nickName: '旧名',
        createdAt: '2026-07-07T00:00:00.000Z'
      }]
    })

    const { main } = require('../../../cloudfunctions/saveUserProfile/index.js')
    const result = await main({
      __collectionPrefix: 'test_',
      nickName: '新名'
    }, {})

    expect(result).toEqual({ success: true })
    expect(calls.updates).toHaveLength(1)
    expect(collections.test_users[0]).toEqual(expect.objectContaining({
      nickName: '新名'
    }))
  })
})
