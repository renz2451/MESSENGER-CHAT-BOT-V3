// dashboard/firebase.js
const admin = require('firebase-admin');

// Read service account from environment variable (recommended for Render)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Fallback for local development – you can put the JSON directly (but don't commit it)
  // For safety, we throw an error if not set.
  throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable not set.');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://ddos-c147a-default-rtdb.firebaseio.com'
  });
}

const db = admin.database();

// ---- Bot Model using Firebase Realtime DB ----
const botModel = {
  create: async (data) => {
    const ref = db.ref('bots').push();
    await ref.set({
      ...data,
      createdAt: Date.now(),
      active: data.active || false
    });
    return { id: ref.key, ...data };
  },

  getAll: async (ownerFbid = null) => {
    const snapshot = await db.ref('bots').once('value');
    const bots = snapshot.val() || {};
    const entries = Object.entries(bots).map(([id, bot]) => ({ id, ...bot }));
    if (ownerFbid) {
      return entries.filter(bot => bot.ownerFbid === ownerFbid);
    }
    return entries;
  },

  getById: async (id) => {
    const snapshot = await db.ref(`bots/${id}`).once('value');
    const bot = snapshot.val();
    if (!bot) return null;
    return { id, ...bot };
  },

  update: async (id, data) => {
    await db.ref(`bots/${id}`).update(data);
    return await botModel.getById(id);
  },

  delete: async (id) => {
    await db.ref(`bots/${id}`).remove();
    return true;
  }
};

// ---- Admin configuration from Firebase ----
const getAdminConfig = async () => {
  const snapshot = await db.ref('adminConfig').once('value');
  const config = snapshot.val() || {};
  return {
    adminKey: config.adminKey || null,
    trustedAdminIDs: config.trustedAdminIDs || []
  };
};

const setAdminConfig = async (data) => {
  await db.ref('adminConfig').update(data);
};

module.exports = { botModel, getAdminConfig, setAdminConfig };
