const admin = require('firebase-admin');

let firebaseInitialized = false;
let db = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://ddos-c147a-default-rtdb.firebaseio.com'
      });
      firebaseInitialized = true;
      db = admin.database();
      console.log('[FIREBASE] ✅ Initialized successfully.');
    }
  } else {
    console.warn('[FIREBASE] ⚠️ FIREBASE_SERVICE_ACCOUNT env var not set. Bot management will not work.');
  }
} catch (err) {
  console.error('[FIREBASE] ❌ Initialization error:', err.message);
}

// ---- Bot Model (safe fallback) ----
const botModel = {
  create: async (data) => {
    if (!firebaseInitialized) throw new Error('Firebase not initialized.');
    const ref = db.ref('bots').push();
    await ref.set({ ...data, createdAt: Date.now(), active: data.active || false });
    return { id: ref.key, ...data };
  },
  getAll: async (ownerFbid = null) => {
    if (!firebaseInitialized) return [];
    const snapshot = await db.ref('bots').once('value');
    const bots = snapshot.val() || {};
    const entries = Object.entries(bots).map(([id, bot]) => ({ id, ...bot }));
    if (ownerFbid) return entries.filter(bot => bot.ownerFbid === ownerFbid);
    return entries;
  },
  getById: async (id) => {
    if (!firebaseInitialized) return null;
    const snapshot = await db.ref(`bots/${id}`).once('value');
    const bot = snapshot.val();
    if (!bot) return null;
    return { id, ...bot };
  },
  update: async (id, data) => {
    if (!firebaseInitialized) throw new Error('Firebase not initialized.');
    await db.ref(`bots/${id}`).update(data);
    return await botModel.getById(id);
  },
  delete: async (id) => {
    if (!firebaseInitialized) throw new Error('Firebase not initialized.');
    await db.ref(`bots/${id}`).remove();
    return true;
  }
};

// ---- Admin config (safe fallback) ----
const getAdminConfig = async () => {
  if (!firebaseInitialized) {
    return { adminKey: null, trustedAdminIDs: [] };
  }
  const snapshot = await db.ref('adminConfig').once('value');
  const config = snapshot.val() || {};
  return {
    adminKey: config.adminKey || null,
    trustedAdminIDs: config.trustedAdminIDs || []
  };
};

const setAdminConfig = async (data) => {
  if (!firebaseInitialized) throw new Error('Firebase not initialized.');
  await db.ref('adminConfig').update(data);
};

module.exports = { botModel, getAdminConfig, setAdminConfig };
