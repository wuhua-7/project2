const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const authRouter = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
// 配置 multer 以支持文件副檔名
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // 確保目錄存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 根據 MIME 類型添加副檔名
    const ext = file.mimetype.split('/')[1];
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const filename = `${timestamp}-${random}.${ext}`;
    console.log('生成文件名:', filename, 'MIME類型:', file.mimetype);
    cb(null, filename);
  }
});

const upload = multer({ storage });
const userRouter = require('./routes/user');
const groupRouter = require('./routes/group');
const PushLog = require('./models/PushLog');
const Message = require('./models/Message');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

// 移除 https、fs、credentials、server.key/server.cert 相關程式碼

const app = express();
// 簡化 CORS 配置，允許所有 Vercel 域名
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // 允許所有 vercel.app 域名和本地開發
    if (origin.includes('vercel.app') || origin.includes('localhost') || origin.includes('192.168.1.121') || origin.includes('127.0.0.1')) {
      console.log('CORS allowed origin:', origin);
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With', 'Accept', 'Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
// 處理 OPTIONS 預檢請求
app.options('*', cors({
  origin: function(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // 允許所有 vercel.app 域名和本地開發
    if (origin.includes('vercel.app') || origin.includes('localhost') || origin.includes('192.168.1.121') || origin.includes('127.0.0.1')) {
      console.log('OPTIONS CORS allowed origin:', origin);
      callback(null, true);
    } else {
      console.log('OPTIONS CORS blocked origin:', origin);
      callback(new Error('Not allowed by OPTIONS CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With', 'Accept', 'Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());

// 公開的 manifest.json 路由
app.get('/manifest.json', (req, res) => {
  res.json({
    "name": "Chat App",
    "short_name": "Chat",
    "description": "A real-time chat application",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#2196f3",
    "icons": [
      {
        "src": "/assets/icon.png",
        "sizes": "192x192",
        "type": "image/png"
      }
    ]
  });
});

// 靜態檔案服務 - 必須在認證路由之前，確保公開訪問
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 添加公開的 assets 路由
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// API 路由 - 需要認證
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/group', groupRouter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // 允許所有 vercel.app 域名和本地開發
      if (origin.includes('vercel.app') || origin.includes('localhost') || origin.includes('192.168.1.121') || origin.includes('127.0.0.1')) {
        console.log('Socket.IO CORS allowed origin:', origin);
        callback(null, true);
      } else {
        console.log('Socket.IO CORS blocked origin:', origin);
        callback(new Error('Not allowed by Socket.IO CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未授權'));
  try {
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'secretkey');
    socket.user = payload;
    next();
  } catch {
    next(new Error('JWT 驗證失敗'));
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 新增：用戶連線時自動加入所有群組房間
  socket.on('join group', async ({ groupIds }) => {
    if (!Array.isArray(groupIds)) return;
    groupIds.forEach(groupId => {
      socket.join(groupId);
      console.log('用戶', socket.user.username, '加入群組房間', groupId);
    });
  });

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg); // 廣播訊息給所有用戶
  });

  socket.on('group message', async ({ groupId, content, type = 'text', url }) => {
    if (!groupId || (!content && type !== 'voice')) return;
    const Message = require('./models/Message');
    let msg;
    if (type === 'voice') {
      msg = new Message({ group: groupId, sender: socket.user.id, type: 'voice', url });
    } else {
      msg = new Message({ group: groupId, sender: socket.user.id, content, type: 'text' });
    }
    await msg.save();
    io.to(groupId).emit('group message', {
      groupId,
      sender: socket.user.username,
      content,
      createdAt: msg.createdAt,
      type,
      url
    });
    // Expo 推播通知
    const Group = require('./models/Group');
    const group = await Group.findById(groupId).populate('members');
    const User = require('./models/User');
    // --- 新增 @提及推播 ---
    if (type === 'text' && content) {
      // 偵測 @用戶名
      const mentionedUsernames = (content.match(/@([\w\u4e00-\u9fa5]+)/g) || []).map(s => s.slice(1));
      if (mentionedUsernames.length > 0) {
        const mentionedUsers = await User.find({ username: { $in: mentionedUsernames } });
        for (const u of mentionedUsers) {
          if (
            u._id.toString() !== socket.user.id &&
            u.expoPushToken &&
            (u.pushPreferences?.mention !== false)
          ) {
            sendExpoPush(u.expoPushToken, '你被提及', `${socket.user.username} 在群組中提及了你: ${content}`, { groupId, messageId: msg._id, type: 'mention' });
          }
        }
      }
    }
    // --- 原有群組成員推播 ---
    for (const member of group.members) {
      if (
        member._id.toString() !== socket.user.id &&
        member.expoPushToken &&
        ((type === 'voice' && member.pushPreferences?.voice !== false) ||
         (type === 'text' && member.pushPreferences?.message !== false))
      ) {
        if (type === 'voice') {
          sendExpoPush(member.expoPushToken, '新語音訊息', `${socket.user.username} 發送了一則語音訊息`, { groupId, messageId: msg._id, type: 'voice' });
        } else {
          sendExpoPush(member.expoPushToken, '新訊息', `${socket.user.username}: ${content}`, { groupId, messageId: msg._id, type: 'text' });
        }
      }
    }
  });

  // 訊息已讀事件
  socket.on('message read', async ({ groupId, messageIds }) => {
    if (!groupId || !Array.isArray(messageIds)) return;
    const Message = require('./models/Message');
    for (const id of messageIds) {
      if (mongoose.isValidObjectId(id)) {
        await Message.findByIdAndUpdate(id, { $addToSet: { readBy: socket.user.id } });
      }
    }
    // 廣播已讀狀態給群組成員
    io.to(groupId).emit('message read', { messageIds, userId: socket.user.id });
  });

  // 訊息撤回
  socket.on('revoke message', async ({ groupId, messageId }) => {
    if (!groupId || !messageId) return;
    const Message = require('./models/Message');
    if (mongoose.isValidObjectId(messageId)) {
      const msg = await Message.findById(messageId);
      if (!msg || msg.sender.toString() !== socket.user.id) return;
      msg.isRevoked = true;
      await msg.save();
      io.to(groupId).emit('message revoked', { messageId });
    }
  });

  // 訊息編輯
  socket.on('edit message', async ({ groupId, messageId, newContent }) => {
    if (!groupId || !messageId || !newContent) return;
    const Message = require('./models/Message');
    if (mongoose.isValidObjectId(messageId)) {
      const msg = await Message.findById(messageId);
      if (!msg || msg.sender.toString() !== socket.user.id || msg.isRevoked) return;
      msg.content = newContent;
      msg.editedAt = new Date();
      await msg.save();
      io.to(groupId).emit('message edited', { messageId, newContent, editedAt: msg.editedAt });
    }
  });

  // 一對一語音通話信令事件
  socket.on('call:invite', ({ from, to, groupId }) => {
    console.log('call:invite', { from, to, groupId });
    io.toUser?.(to)?.emit('call:invite', { from, to, groupId });
  });
  socket.on('call:accept', ({ from, to, groupId }) => {
    console.log('call:accept', { from, to, groupId });
    io.toUser?.(to)?.emit('call:accept', { from, to, groupId });
  });
  socket.on('call:reject', ({ from, to, groupId, reason }) => {
    console.log('call:reject', { from, to, groupId, reason });
    io.toUser?.(to)?.emit('call:reject', { from, to, groupId, reason });
  });
  socket.on('call:end', ({ from, to, groupId, reason }) => {
    console.log('call:end', { from, to, groupId, reason });
    io.toUser?.(to)?.emit('call:end', { from, to, groupId, reason });
  });
  socket.on('call:signal', ({ from, to, groupId, data }) => {
    console.log('call:signal', { from, to, groupId, data });
    io.toUser?.(to)?.emit('call:signal', { from, to, groupId, data });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// 輔助函式：根據 userId 找 socket
io.toUser = function(userId) {
  for (const [id, s] of io.of('/').sockets) {
    if (s.user && s.user.id === userId) return s;
  }
  return null;
};

// 語音訊息上傳 API
app.post('/api/upload/voice', authMiddleware, upload.single('voice'), async (req, res) => {
  console.log('進入 /api/upload/voice 路由', req.body, req.file);
  if (!req.file) return res.status(400).json({ error: '未收到語音檔案' });
  const { groupId, optimisticId } = req.body; // 新增 optimisticId
  if (!groupId) return res.status(400).json({ error: '缺少群組ID' });
  
  console.log('語音文件信息:', {
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });
  
  const Message = require('./models/Message');
  const msg = new Message({
    group: groupId,
    sender: req.user.id,
    type: 'voice',
    url: `/uploads/${req.file.filename}`,
    optimisticId // 儲存 optimisticId
  });
  await msg.save();
  io.to(groupId).emit('group message', {
    groupId,
    sender: req.user.username,
    type: 'voice',
    url: msg.url,
    createdAt: msg.createdAt,
    _id: msg._id, // 回傳 _id
    optimisticId // 回傳 optimisticId
  });
  res.json({ url: msg.url, _id: msg._id, optimisticId }); // 回傳 _id 和 optimisticId
});

// 多媒體訊息上傳 API
app.post('/api/upload/media', authMiddleware, upload.single('media'), async (req, res) => {
  console.log('收到媒體上傳請求:', req.body);
  console.log('文件信息:', req.file);
  
  if (!req.file) {
    console.error('未收到文件');
    return res.status(400).json({ error: '未收到檔案' });
  }
  
  const { groupId, type, optimisticId } = req.body; // 新增 optimisticId
  if (!groupId || !type) {
    console.error('缺少必要參數:', { groupId, type });
    return res.status(400).json({ error: '缺少群組ID或型別' });
  }
  
  console.log('媒體文件信息:', {
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    type: type,
    path: req.file.path
  });
  
  // 檢查文件是否成功保存
  const filePath = req.file.path;
  if (!fs.existsSync(filePath)) {
    console.error('文件保存失敗，文件不存在:', filePath);
    return res.status(500).json({ error: '文件保存失敗' });
  }
  
  console.log('文件成功保存到:', filePath);
  
  const Message = require('./models/Message');
  const msg = new Message({
    group: groupId,
    sender: req.user.id,
    type,
    url: `/uploads/${req.file.filename}`,
    filename: req.file.originalname, // 保留原始檔名（含副檔名）
    size: req.file.size, // 新增
    mimetype: req.file.mimetype, // 新增
    optimisticId // 儲存 optimisticId
  });
  await msg.save();
  io.to(groupId).emit('group message', {
    groupId,
    sender: req.user.username,
    type,
    url: msg.url,
    filename: msg.filename,
    size: msg.size, // 新增
    mimetype: msg.mimetype, // 新增
    createdAt: msg.createdAt,
    _id: msg._id,
    readBy: [],
    isRevoked: false,
    optimisticId // 推播 optimisticId
  });
  res.json({ url: msg.url, filename: msg.filename, size: msg.size, mimetype: msg.mimetype, _id: msg._id, optimisticId }); // 回傳 optimisticId
});

const encodeRFC5987ValueChars = str =>
  encodeURIComponent(str).
    replace(/'/g, '%27').
    replace(/\(/g, '%28').
    replace(/\)/g, '%29').
    replace(/\*/g, '%2A');

// 下載 API 不驗證
app.get('/api/download/:messageId', async (req, res) => {
  const { messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(messageId)) return res.status(400).send('Invalid messageId');
  const msg = await Message.findById(messageId);
  if (!msg || !msg.url || !msg.filename) return res.status(404).send('File not found');
  const filePath = path.join(__dirname, msg.url.replace('/uploads/', 'uploads/'));
  const filename = msg.filename;
  const encoded = encodeURIComponent(filename);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`
  );
  res.download(filePath, filename);
});

// 測試文件上傳功能
app.get('/test-upload', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');
  const files = fs.readdirSync(uploadDir);
  res.json({
    message: 'Upload test endpoint',
    uploadDir: uploadDir,
    fileCount: files.length,
    files: files.slice(0, 10) // 只顯示前10個文件
  });
});

// 健康檢查端點
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 其他 API 路由、靜態檔案、首頁
app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const PORT = process.env.PORT || 3001;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`HTTP Server running on http://0.0.0.0:${PORT}`);
      console.log('Listening on 0.0.0.0:' + PORT);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`HTTP Server running on http://0.0.0.0:${PORT} (MongoDB 連線失敗)`);
      console.log('Listening on 0.0.0.0:' + PORT);
    });
});

// // 如需同時啟動 HTTP 伺服器，可保留以下註解
// const http = require('http');
// const httpServer = http.createServer(app);
// httpServer.listen(3000, () => {
//   console.log('HTTP Server running on http://localhost:3000');
// });