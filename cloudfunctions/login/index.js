const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const COLLECTIONS = {
  users: 'users'
};

function getCollectionName(key) {
  const name = COLLECTIONS[key];
  if (!name) {
    throw new Error(`未登记的 CloudBase 集合: ${key}`);
  }
  return name;
}

function getCollectionPrefix(event = {}) {
  const prefix = String(event.__collectionPrefix || event.collectionPrefix || '');
  if (!prefix) return '';
  if (prefix === 'test_') return prefix;
  throw new Error(`非法集合前缀: ${prefix}`);
}

function getResolvedCollectionName(key, event = {}) {
  return `${getCollectionPrefix(event)}${getCollectionName(key)}`;
}

function collection(key, event = {}) {
  return db.collection(getResolvedCollectionName(key, event));
}

function isCollectionMissing(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -502005 ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('Table not exist')
  );
}

async function ensureTestCollection(key, event = {}) {
  if (getCollectionPrefix(event) !== 'test_') {
    return;
  }
  const name = getResolvedCollectionName(key, event);
  if (typeof db.createCollection !== 'function') {
    return;
  }
  try {
    await db.createCollection(name);
  } catch (createErr) {
    const message = createErr && (createErr.message || createErr.errMsg || '');
    if (!isCollectionAlreadyExists(createErr)) {
      throw createErr;
    }
  }
}

function isCollectionAlreadyExists(err) {
  const message = err && (err.message || err.errMsg || '');
  return err && (
    err.errCode === -501001 ||
    message.includes('already exists') ||
    message.includes('collection exists') ||
    message.includes('DATABASE_COLLECTION_ALREADY_EXIST') ||
    message.includes('ResourceExist') ||
    message.includes('Table exist')
  );
}

async function queryUserByOpenid(openid, event = {}) {
  try {
    return await collection('users', event)
      .where({ _openid: openid })
      .limit(1)
      .get();
  } catch (err) {
    if (!isCollectionMissing(err) || getCollectionPrefix(event) !== 'test_') {
      throw err;
    }
    await ensureTestCollection('users', event);
    return { data: [] };
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;
  const serverTime = Date.now();

  // Phase 7: openid 安全边界 — 云端自行通过 getWXContext 获取，不落地到前端
  // login 云函数职责：查询/创建 users 文档，返回内部 userId，不返回 openid

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份', serverTime };
  }

  try {
    // 查询是否已存在 users 文档（按 OPENID 隔离）
    const userResult = await queryUserByOpenid(OPENID, event);

    const now = new Date().toISOString();

    if (userResult.data && userResult.data.length > 0) {
      // 已存在，返回 userId 和 createdAt
      const user = userResult.data[0];
      const createdAt = user.createdAt || now;
      const patch = {};
      if (!user.createdAt) {
        patch.createdAt = createdAt;
      }
      if (!user.updatedAt) {
        patch.updatedAt = createdAt;
      }
      if (Object.keys(patch).length > 0) {
        await collection('users', event).doc(user._id).update({
          data: patch
        });
      }
      return {
        success: true,
        userId: user._id,
        createdAt,
        serverTime
      };
    }

    // 不存在则创建
    const newUser = {
      _openid: OPENID,
      createdAt: now,
      updatedAt: now,
      nickName: '',
      avatarUrl: ''
    };

    const addResult = await collection('users', event).add({
      data: newUser
    });

    return {
      success: true,
      userId: addResult._id,
      createdAt: now,
      serverTime
    };
  } catch (e) {
    console.error('login 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message, serverTime };
  }
};
