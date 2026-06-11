function createMockCloud(initialCollections, wxContext = { OPENID: 'openid_1' }) {
  const collections = JSON.parse(JSON.stringify(initialCollections))
  const calls = { adds: [], updates: [] }
  const counters = {}

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
    ensureCollection(name)
    return {
      where(query) {
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
      collection: jest.fn(collectionApi)
    }))
  }), { virtual: true })

  return { collections, calls }
}

describe('login cloud function', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('creates a user document for a new openid without returning openid', async () => {
    const { collections } = createMockCloud({ users: [] })

    const { main } = require('../../../cloudfunctions/login/index.js')
    const result = await main({ code: 'wx_code_1' }, {})

    expect(result).toEqual(expect.objectContaining({
      success: true,
      userId: 'users_1',
      createdAt: expect.any(String),
      serverTime: expect.any(Number)
    }))
    expect(result.openid).toBeUndefined()
    expect(collections.users[0]).toEqual(expect.objectContaining({
      _openid: 'openid_1',
      createdAt: result.createdAt,
      updatedAt: result.createdAt
    }))
  })

  test('returns existing createdAt without updating a complete user document', async () => {
    const { calls } = createMockCloud({
      users: [{
        _id: 'user_1',
        _openid: 'openid_1',
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z'
      }]
    })

    const { main } = require('../../../cloudfunctions/login/index.js')
    const result = await main({}, {})

    expect(result).toEqual(expect.objectContaining({
      success: true,
      userId: 'user_1',
      createdAt: '2026-05-31T00:00:00.000Z',
      serverTime: expect.any(Number)
    }))
    expect(calls.updates).toHaveLength(0)
  })

  test('backfills createdAt for an existing legacy user document', async () => {
    const { collections, calls } = createMockCloud({
      users: [{
        _id: 'legacy_user_1',
        _openid: 'openid_1',
        nickName: 'Legacy User'
      }]
    })

    const { main } = require('../../../cloudfunctions/login/index.js')
    const result = await main({}, {})

    expect(result).toEqual(expect.objectContaining({
      success: true,
      userId: 'legacy_user_1',
      createdAt: expect.any(String),
      serverTime: expect.any(Number)
    }))
    expect(collections.users[0]).toEqual(expect.objectContaining({
      createdAt: result.createdAt,
      updatedAt: result.createdAt
    }))
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0]).toEqual(expect.objectContaining({
      collection: 'users',
      id: 'legacy_user_1'
    }))
  })

  test('returns NO_OPENID when wx context has no openid', async () => {
    createMockCloud({}, { OPENID: '' })

    const { main } = require('../../../cloudfunctions/login/index.js')
    const result = await main({}, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'NO_OPENID'
    }))
  })
})
