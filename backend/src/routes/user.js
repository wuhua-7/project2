const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();
const PushLog = require('../models/PushLog');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const basename = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, basename + ext);
  }
});
const upload = multer({ storage });

// 儲存 Expo Push Token
router.post('/push-token', auth, async (req, res) => {
  const { expoPushToken } = req.body;
  if (!expoPushToken) return res.status(400).json({ error: '缺少 token' });
  await User.findByIdAndUpdate(req.user.id, { expoPushToken });
  res.json({ success: true });
});

// 取得推播偏好
router.get('/push-preferences', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  res.json(user.pushPreferences || {});
});
// 設定推播偏好
router.post('/push-preferences', auth, async (req, res) => {
  const { pushPreferences } = req.body;
  if (!pushPreferences || typeof pushPreferences !== 'object') return res.status(400).json({ error: '缺少推播偏好' });
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  user.pushPreferences = { ...user.pushPreferences, ...pushPreferences };
  await user.save();
  res.json({ message: '推播偏好已更新', pushPreferences: user.pushPreferences });
});

// 上傳頭像
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  console.log('收到頭像上傳請求', req.file);
  if (!req.file) return res.status(400).json({ error: '未收到頭像檔案' });
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  // 刪除舊頭像檔案（如果有且不是2.jpeg）
  if (user.avatar && user.avatar !== '/uploads/2.jpeg') {
    const oldPath = path.join(__dirname, '..', user.avatar);
    fs.unlink(oldPath, err => {
      if (err) console.log('刪除舊頭像失敗', oldPath, err.message);
    });
  }
  user.avatar = `/uploads/${req.file.filename}`;
  await user.save();
  
  // 發送 WebSocket 通知給所有相關群組成員
  try {
    const io = req.app.get('io');
    const Group = require('../models/Group');
    
    // 找到用戶所在的所有群組
    const groups = await Group.find({ members: user._id });
    
    // 向每個群組發送頭像更新通知
    for (const group of groups) {
      io.to(group._id.toString()).emit('avatar updated', {
        userId: user._id,
        username: user.username,
        avatar: user.avatar,
        groupId: group._id
      });
    }
    
    console.log(`已發送頭像更新通知給 ${groups.length} 個群組`);
  } catch (error) {
    console.error('發送頭像更新通知失敗:', error);
  }
  
  res.json({ avatar: user.avatar });
});

// 修改 Email
router.post('/email', auth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '缺少 Email' });
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  user.email = email;
  await user.save();
  res.json({ email: user.email });
});

// 取得個人資料
router.get('/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  res.json({
    username: user.username,
    email: user.email || '',
    avatar: user.avatar || '',
    createdAt: user.createdAt
  });
});

// 查詢推播日誌
router.get('/push-logs', auth, async (req, res) => {
  const { type, userId, skip = 0, limit = 100, start, end } = req.query;
  const q = {};
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  if (type) q.type = type;
  if (user.isAdmin && userId) q.userId = userId;
  else q.userId = req.user.id;
  if (start || end) {
    q.createdAt = {};
    if (start) q.createdAt.$gte = new Date(start);
    if (end) q.createdAt.$lte = new Date(end);
  }
  const logs = await PushLog.find(q)
    .sort({ createdAt: -1 })
    .skip(Number(skip))
    .limit(Math.max(1, Math.min(Number(limit), 200)));
  res.json(logs);
});

// 推播日誌統計 API
router.get('/push-logs/stats', auth, async (req, res) => {
  const { type, userId, start, end } = req.query;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  const match = {};
  if (type) match.type = type;
  if (user.isAdmin && userId) match.userId = userId;
  else match.userId = req.user.id;
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = new Date(start);
    if (end) match.createdAt.$lte = new Date(end);
  }
  const stats = await PushLog.aggregate([
    { $match: match },
    {
      $facet: {
        typeCount: [
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ],
        statusCount: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        total: [ { $count: 'total' } ]
      }
    }
  ]);
  res.json(stats[0]);
});

module.exports = router; 