const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const authRouter = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const upload = multer({ dest: path.join(__dirname, '../uploads') });
const userRouter = require('./routes/user');
const groupRouter = require('./routes/group');
const PushLog = require('./models/PushLog');
const Message = require('./models/Message');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const sendExpoPush = require('./utils/sendExpoPush');

if (!fs.existsSync('server.key') || !fs.existsSync('server.cert')) {
  try {
    execSync("openssl req -nodes -new -x509 -keyout server.key -out server.cert -subj '/CN=localhost' -days 365");
    console.log('自動產生 server.key 和 server.cert');
  } catch (e) {
    console.error('產生憑證失敗，請確認 openssl 已安裝於系統環境');
    process.exit(1);
  }
}

const privateKey = fs.readFileSync('server.key', 'utf8');
const certificate = fs.readFileSync('server.cert', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:19006',
  'http://localhost:8081', // 新增 web 端口
  'http://192.168.1.121:8081', // 區網前端
  // 可根據實際部署增加正式網域
];
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// 允許所有 OPTIONS 預檢請求
app.options('*', cors());

const server = http.createServer(app);

app.use(express.json());

// 設定靜態檔案服務，讓前端可以存取 uploads 目錄的檔案
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/group', groupRouter);

mongoose.connect(process.env.MONGODB_URI + 'chatapp');

// 啟動 HTTPS 伺服器
const httpsServer = https.createServer(credentials, app);

// Socket.IO 必須掛在 httpsServer 上
const io = new Server(httpsServer, {
  cors: {
    origin: '*', // 可根據需要調整
    methods: ['GET', 'POST']
  }
});

// 只允許登入用戶連線 Socket.IO
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
  if (!req.file) return res.status(400).json({ error: '未收到檔案' });
  const { groupId, type, optimisticId } = req.body; // 新增 optimisticId
  if (!groupId || !type) return res.status(400).json({ error: '缺少群組ID或型別' });
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

// 提供靜態語音檔案存取
app.use('/uploads', express.static(path.join(__dirname, './uploads')));

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
  const filePath = path.join(__dirname, '..', msg.url);
  const filename = msg.filename;
  const encoded = encodeURIComponent(filename);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`
  );
  res.download(filePath, filename);
});

app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const PORT = process.env.PORT || 3001;
httpsServer.listen(3001, () => {
  console.log('HTTPS Server running on https://localhost:3001 (或 https://你的區網IP:3001)');
});

// // 如需同時啟動 HTTP 伺服器，可保留以下註解
// const http = require('http');
// const httpServer = http.createServer(app);
// httpServer.listen(3000, () => {
//   console.log('HTTP Server running on http://localhost:3000');
// });

module.exports = { sendExpoPush }; 