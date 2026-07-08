const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_NICKNAME_LENGTH = 24;

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

function normalizeNickName(nickName) {
  return String(nickName || '').trim().slice(0, MAX_NICKNAME_LENGTH);
}

function normalizeAvatarUrl(avatarUrl) {
  return String(avatarUrl || '').trim();
}

/**
 * 保存用户资料（昵称/头像）
 * 云端按 OPENID 隔离查询并更新 users 文档
 * 入参: { nickName?, avatarUrl? }
 * 返回: { success }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  const updateData = {
    updatedAt: new Date().toISOString()
  };

  if (Object.prototype.hasOwnProperty.call(event || {}, 'nickName')) {
    const normalizedNickName = normalizeNickName(event.nickName);
    if (normalizedNickName) {
      updateData.nickName = normalizedNickName;
    }
  }
  if (Object.prototype.hasOwnProperty.call(event || {}, 'avatarUrl')) {
    const normalizedAvatarUrl = normalizeAvatarUrl(event.avatarUrl);
    if (normalizedAvatarUrl) {
      updateData.avatarUrl = normalizedAvatarUrl;
    }
  }

  if (Object.keys(updateData).length === 1) {
    return { success: false, code: 'PARAM_ERROR', message: '至少需要提供 nickName 或 avatarUrl' };
  }

  try {
    // 查询用户的 openid 记录
    const userResult = await queryUserByOpenid(OPENID, event);

    if (!userResult.data || userResult.data.length === 0) {
      const now = new Date().toISOString();
      const addResult = await collection('users', event).add({
        data: {
          _openid: OPENID,
          createdAt: now,
          ...updateData
        }
      });
      return { success: true, userId: addResult._id, created: true };
    }

    const userId = userResult.data[0]._id;

    await collection('users', event).doc(userId).update({
      data: updateData
    });

    return { success: true };
  } catch (e) {
    console.error('saveUserProfile 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};
