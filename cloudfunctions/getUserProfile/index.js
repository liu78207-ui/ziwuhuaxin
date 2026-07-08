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

/**
 * 获取用户资料
 * 云端按 OPENID 隔离查询 users 文档
 * 返回: { success, userId, userInfo: { nickName, avatarUrl, createdAt, updatedAt } }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份' };
  }

  try {
    const result = await collection('users', event)
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      const user = result.data[0];
      return {
        success: true,
        userId: user._id,
        userInfo: {
          nickName: user.nickName || '',
          avatarUrl: user.avatarUrl || '',
          createdAt: user.createdAt || '',
          updatedAt: user.updatedAt || ''
        }
      };
    }

    // 用户不存在，返回空资料
    return {
      success: true,
      userId: null,
      userInfo: {
        nickName: '',
        avatarUrl: '',
        createdAt: '',
        updatedAt: ''
      }
    };
  } catch (e) {
    if (isCollectionMissing(e) && getCollectionPrefix(event) === 'test_') {
      return {
        success: true,
        userId: null,
        userInfo: {
          nickName: '',
          avatarUrl: '',
          createdAt: '',
          updatedAt: ''
        }
      };
    }
    console.error('getUserProfile 云函数异常:', e);
    return { success: false, code: 'CLOUD_ERROR', message: e.message };
  }
};
