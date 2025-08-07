const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();
const PushLog = require('../models/PushLog');
const { upload, cloudinary } = require('../config/cloudinary');

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
  try {
    console.log('收到頭像上傳請求', req.file);
    console.log('用戶ID:', req.user.id);
    
    if (!req.file) {
      console.log('未收到頭像檔案');
      return res.status(400).json({ error: '未收到頭像檔案' });
    }
    
    console.log('檔案信息:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: req.file.path
    });
    
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('用戶不存在:', req.user.id);
      return res.status(404).json({ error: '用戶不存在' });
    }
    
    console.log('當前用戶頭像:', user.avatar);
    
    // 刪除舊的 Cloudinary 圖片（如果有且不是預設頭像）
    if (user.avatar && user.avatar !== '/uploads/2.jpeg' && user.avatar.includes('cloudinary')) {
      try {
        // 從 URL 中提取 public_id
        const urlParts = user.avatar.split('/');
        const publicId = urlParts[urlParts.length - 1].split('.')[0];
        await cloudinary.uploader.destroy(publicId);
        console.log('成功刪除舊的 Cloudinary 圖片:', publicId);
      } catch (error) {
        console.log('刪除舊的 Cloudinary 圖片失敗:', error.message);
      }
    }
    
    // 使用 Cloudinary URL
    user.avatar = req.file.path;
    await user.save();
    console.log('已保存新頭像路徑:', user.avatar);
    
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
    
    console.log('頭像上傳成功，返回路徑:', user.avatar);
    res.json({ avatar: user.avatar });
  } catch (error) {
    console.error('頭像上傳過程中發生錯誤:', error);
    res.status(500).json({ error: '頭像上傳失敗', details: error.message });
  }
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

// 重置頭像為預設值
router.post('/reset-avatar', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: '用戶不存在' });
    
    // 重置為預設頭像 (使用 Cloudinary URL)
    user.avatar = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';
    await user.save();
    
    console.log('已重置用戶頭像為預設值:', user.username);
    res.json({ avatar: user.avatar });
  } catch (error) {
    console.error('重置頭像失敗:', error);
    res.status(500).json({ error: '重置頭像失敗' });
  }
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