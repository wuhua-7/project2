const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const PushLog = require('../models/PushLog');
const User = require('../models/User');

async function sendExpoPush(to, title, body, data = {}) {
  let status = 'success', error = '';
  let userId = data.userId || null;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, title, body, data })
    });
    const result = await res.json();
    if (result.data && result.data.status === 'error') {
      status = 'fail';
      error = result.data.message || '';
    }
  } catch (e) {
    status = 'fail';
    error = e.message;
  }
  // 嘗試自動查 userId
  if (!userId) {
    const u = await User.findOne({ expoPushToken: to });
    if (u) userId = u._id;
  }
  await PushLog.create({ userId, type: data.type || '', title, body, data, status, error });
}

module.exports = sendExpoPush; 