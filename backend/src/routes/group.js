const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { sendExpoPush } = require('../server');
const OperationLog = require('../models/OperationLog');
const Message = require('../models/Message');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// 建立群組
router.post('/create', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '缺少群組名稱' });
  try {
    const group = new Group({
      name,
      members: [req.user.id],
      owner: req.user.id,
      admins: [],
    });
    await group.save();
    // 可選：將群組ID加入用戶資料
    res.json({ message: '群組建立成功', groupId: group._id });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 權限檢查工具
function isOwner(group, userId) {
  return group.owner.toString() === userId;
}
function isAdmin(group, userId) {
  return group.admins.map(id => id.toString()).includes(userId) || isOwner(group, userId);
}

// 邀請成員
router.post('/invite', authMiddleware, async (req, res) => {
  const { groupId, userId } = req.body;
  if (!groupId || !userId) return res.status(400).json({ error: '缺少參數' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  let realUserId = userId;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    // 嘗試用 username 查找
    const user = await require('../models/User').findOne({ username: userId });
    if (!user) return res.status(400).json({ error: '找不到該用戶' });
    realUserId = user._id;
  }
  if (group.members.includes(realUserId)) return res.status(409).json({ error: '用戶已在群組中' });
  group.members.push(realUserId);
  await group.save();
  res.json({ message: '邀請成功' });
});

// 踢人
router.post('/kick', authMiddleware, async (req, res) => {
  const { groupId, userId } = req.body;
  if (!groupId || !userId) return res.status(400).json({ error: '缺少參數' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  if (isOwner(group, userId)) return res.status(403).json({ error: '不能踢出群主' });
  group.members = group.members.filter(id => id.toString() !== userId);
  group.admins = group.admins.filter(id => id.toString() !== userId);
  await group.save();
  res.json({ message: '已踢出成員' });
});

// 設/撤管理員
router.post('/set-admin', authMiddleware, async (req, res) => {
  const { groupId, userId, set } = req.body; // set: true=設, false=撤
  if (!groupId || !userId || typeof set !== 'boolean') return res.status(400).json({ error: '缺少參數' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isOwner(group, req.user.id)) return res.status(403).json({ error: '僅群主可設/撤管理員' });
  if (!group.members.includes(userId)) return res.status(400).json({ error: '用戶不在群組中' });
  if (set) {
    if (!group.admins.includes(userId)) group.admins.push(userId);
  } else {
    group.admins = group.admins.filter(id => id.toString() !== userId);
  }
  await group.save();
  res.json({ message: set ? '已設為管理員' : '已撤銷管理員' });
});

// 轉讓群主
router.post('/transfer-owner', authMiddleware, async (req, res) => {
  const { groupId, userId } = req.body;
  if (!groupId || !userId) return res.status(400).json({ error: '缺少參數' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isOwner(group, req.user.id)) return res.status(403).json({ error: '僅群主可轉讓' });
  if (!group.members.includes(userId)) return res.status(400).json({ error: '用戶不在群組中' });
  group.owner = userId;
  // 可選：自動設前群主為管理員
  if (!group.admins.includes(req.user.id)) group.admins.push(req.user.id);
  await group.save();
  res.json({ message: '已轉讓群主' });
});

// 設公告
router.post('/set-announcement', authMiddleware, async (req, res) => {
  const { groupId, announcement } = req.body;
  if (!groupId) return res.status(400).json({ error: '缺少群組ID' });
  const group = await Group.findById(groupId).populate('members');
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  group.announcement = announcement || '';
  await group.save();
  // --- 新增公告推播 ---
  for (const member of group.members) {
    if (
      member._id.toString() !== req.user.id &&
      member.expoPushToken &&
      (member.pushPreferences?.announcement !== false)
    ) {
      sendExpoPush(
        member.expoPushToken,
        '新公告',
        `${req.user.username} 發佈了新公告：${announcement}`,
        { type: 'announcement', groupId: group._id, announcement }
      );
    }
  }
  res.json({ message: '公告已更新' });
});

// 取得群組完整資訊
router.get('/info/:groupId', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  const group = await Group.findById(groupId)
    .populate('owner', 'username avatar')
    .populate('admins', 'username avatar')
    .populate('members', 'username avatar'); // 確保 members 有 username 和 avatar
  if (!group) return res.status(404).json({ error: '群組不存在' });
  res.json({
    _id: group._id,
    name: group.name,
    announcement: group.announcement,
    owner: group.owner,
    admins: group.admins,
    members: group.members,
    createdAt: group.createdAt
  });
});

// 查詢群組訊息（分頁、搜尋）
router.get('/:groupId/messages', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  const { before, limit = 30, search, type, tags, archived } = req.query;
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!group.members.map(id => id.toString()).includes(req.user.id)) return res.status(403).json({ error: '無權限' });
  let query = { group: groupId };
  if (type) query.type = type;
  if (before) {
    if (/^[0-9a-fA-F]{24}$/.test(before)) {
      const beforeMsg = await Message.findById(before);
      if (beforeMsg) query.createdAt = { $lt: beforeMsg.createdAt };
    } else if (!isNaN(Date.parse(before))) {
      query.createdAt = { $lt: new Date(before) };
    }
  }
  if (search) {
    query.$or = [
      { content: { $regex: search, $options: 'i' } },
      { filename: { $regex: search, $options: 'i' } }
    ];
  }
  if (tags) {
    const tagArr = Array.isArray(tags) ? tags : tags.split(',');
    query.tags = { $all: tagArr };
  }
  if (archived === 'true') query.archived = true;
  if (archived === 'false') query.archived = { $ne: true };
  const msgs = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit), 100)))
    .populate('sender', 'username')
    .populate('readBy', 'username avatar');
  let hasMore = false;
  if (msgs.length > 0) {
    const oldest = msgs[msgs.length - 1].createdAt;
    hasMore = await Message.exists({ group: groupId, createdAt: { $lt: oldest } });
  }
  res.json({
    messages: msgs.reverse().map(m => ({
      _id: m._id,
      sender: m.sender.username,
      content: m.content,
      createdAt: m.createdAt,
      type: m.type,
      url: m.url,
      filename: m.filename,
      size: m.size,
      mimetype: m.mimetype,
      readBy: m.readBy, // 這裡現在是 user 物件陣列
      isRevoked: m.isRevoked,
      editedAt: m.editedAt,
      tags: m.tags,
      archived: m.archived
    })),
    hasMore
  });
});

// 批次下載 zip
router.post('/:groupId/messages/zip', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '缺少檔案 id' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!group.members.map(id => id.toString()).includes(req.user.id)) return res.status(403).json({ error: '無權限' });
  const messages = await Message.find({ _id: { $in: ids }, group: groupId, url: { $exists: true, $ne: '' } });
  if (!messages.length) return res.status(404).json({ error: '找不到檔案' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=group_${groupId}_files.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  for (const msg of messages) {
    // 假設 url 為 /uploads/xxx/filename
    const filePath = path.join(__dirname, '../../', msg.url);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: msg.filename || path.basename(filePath) });
    }
  }
  archive.finalize();
});

// 批次刪除訊息
router.post('/:groupId/messages/batch-delete', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { ids } = req.body;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '缺少訊息 id' });
  if (!ids.every(id => mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: '無效的訊息ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  // 僅群主/管理員可批次刪除
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  // 僅刪除本群組訊息
  const messages = await Message.find({ _id: { $in: ids }, group: groupId });
  const deletedIds = [];
  for (const msg of messages) {
    await Message.deleteOne({ _id: msg._id });
    deletedIds.push(msg._id);
  }
  // 操作日誌
  await OperationLog.create({
    user: req.user.id,
    group: groupId,
    action: 'batch_delete',
    targetIds: deletedIds,
    timestamp: new Date()
  });
  res.json({ success: true, deleted: deletedIds });
});

// 批次標籤
router.post('/:groupId/messages/batch-tag', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { ids, tag } = req.body;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  if (!Array.isArray(ids) || ids.length === 0 || !tag) return res.status(400).json({ error: '缺少參數' });
  if (!ids.every(id => mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: '無效的訊息ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const result = await Message.updateMany({ _id: { $in: ids }, group: groupId }, { $addToSet: { tags: tag } });
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'batch_tag', targetIds: ids, timestamp: new Date() });
  res.json({ success: true, modified: result.nModified });
});
// 批次歸檔
router.post('/:groupId/messages/batch-archive', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { ids } = req.body;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '缺少訊息 id' });
  if (!ids.every(id => mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: '無效的訊息ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const result = await Message.updateMany({ _id: { $in: ids }, group: groupId }, { archived: true });
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'batch_archive', targetIds: ids, timestamp: new Date() });
  res.json({ success: true, modified: result.nModified });
});

// 批次移除標籤
router.post('/:groupId/messages/batch-untag', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { ids, tag } = req.body;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  if (!Array.isArray(ids) || ids.length === 0 || !tag) return res.status(400).json({ error: '缺少參數' });
  if (!ids.every(id => mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: '無效的訊息ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const result = await Message.updateMany({ _id: { $in: ids }, group: groupId }, { $pull: { tags: tag } });
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'batch_untag', targetIds: ids, timestamp: new Date() });
  res.json({ success: true, modified: result.nModified });
});
// 批次取消歸檔
router.post('/:groupId/messages/batch-unarchive', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '缺少訊息 id' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const result = await Message.updateMany({ _id: { $in: ids }, group: groupId }, { archived: false });
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'batch_unarchive', targetIds: ids, timestamp: new Date() });
  res.json({ success: true, modified: result.nModified });
});

// 查詢操作日誌
router.get('/:groupId/operation-logs', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  const { user, action, start, end, skip = 0, limit = 50 } = req.query;
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const query = { group: groupId };
  if (user) query.user = user;
  if (action) query.action = action;
  if (start || end) query.timestamp = {};
  if (start) query.timestamp.$gte = new Date(start);
  if (end) query.timestamp.$lte = new Date(end);
  const logs = await OperationLog.find(query)
    .sort({ timestamp: -1 })
    .skip(Number(skip)).limit(Math.max(1, Math.min(Number(limit), 200)))
    .populate('user', 'username');
  res.json({ logs });
});

// --- 群組標籤管理 API ---
// 查詢群組所有標籤（含顏色/統計，依使用次數排序）
router.get('/:groupId/tags', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!group.members.map(id => id.toString()).includes(req.user.id)) return res.status(403).json({ error: '無權限' });
  // 統計每個標籤的使用次數
  const tagCounts = await Message.aggregate([
    { $match: { group: group._id } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } }
  ]);
  const countMap = Object.fromEntries(tagCounts.map(t => [t._id, t.count]));
  const tags = (group.tags || []).map(t => ({ ...t.toObject(), count: countMap[t.name] || 0 }));
  tags.sort((a, b) => b.count - a.count);
  res.json({ tags });
});
// 新增標籤
router.post('/:groupId/tags', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: '缺少標籤名稱' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  if (group.tags.some(t => t.name === name)) return res.status(409).json({ error: '標籤已存在' });
  group.tags.push({ name, color: color || '#1976d2', count: 0 });
  await group.save();
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'tag_add', targetIds: [], meta: { name, color }, timestamp: new Date() });
  res.json({ success: true, tags: group.tags });
});
// 刪除標籤
router.delete('/:groupId/tags/:tagName', authMiddleware, async (req, res) => {
  const { groupId, tagName } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const idx = group.tags.findIndex(t => t.name === tagName);
  if (idx === -1) return res.status(404).json({ error: '標籤不存在' });
  group.tags.splice(idx, 1);
  await group.save();
  await Message.updateMany({ group: groupId }, { $pull: { tags: tagName } }); // 同步移除訊息上的標籤
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'tag_delete', targetIds: [], meta: { name: tagName }, timestamp: new Date() });
  res.json({ success: true, tags: group.tags });
});
// 重命名標籤
router.put('/:groupId/tags/:tagName/rename', authMiddleware, async (req, res) => {
  const { groupId, tagName } = req.params;
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: '缺少新名稱' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const tag = group.tags.find(t => t.name === tagName);
  if (!tag) return res.status(404).json({ error: '標籤不存在' });
  if (group.tags.some(t => t.name === newName)) return res.status(409).json({ error: '新名稱已存在' });
  tag.name = newName;
  await group.save();
  await Message.updateMany({ group: groupId, tags: tagName }, { $set: { 'tags.$': newName } }); // 同步訊息標籤
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'tag_rename', targetIds: [], meta: { oldName: tagName, newName }, timestamp: new Date() });
  res.json({ success: true, tags: group.tags });
});
// 修改標籤顏色
router.put('/:groupId/tags/:tagName/color', authMiddleware, async (req, res) => {
  const { groupId, tagName } = req.params;
  const { color } = req.body;
  if (!color) return res.status(400).json({ error: '缺少顏色' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!isAdmin(group, req.user.id) && !isOwner(group, req.user.id)) return res.status(403).json({ error: '無權限' });
  const tag = group.tags.find(t => t.name === tagName);
  if (!tag) return res.status(404).json({ error: '標籤不存在' });
  tag.color = color;
  await group.save();
  await OperationLog.create({ user: req.user.id, group: groupId, action: 'tag_color', targetIds: [], meta: { name: tagName, color }, timestamp: new Date() });
  res.json({ success: true, tags: group.tags });
});
// 查詢標籤使用統計
router.get('/:groupId/tags/:tagName/count', authMiddleware, async (req, res) => {
  const { groupId, tagName } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: '無效的群組ID' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: '群組不存在' });
  if (!group.members.map(id => id.toString()).includes(req.user.id)) return res.status(403).json({ error: '無權限' });
  const count = await Message.countDocuments({ group: groupId, tags: tagName });
  res.json({ name: tagName, count });
});

// 取得我加入的所有群組
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user.id })
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .populate('members', 'username avatar'); // 添加 avatar 欄位
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router; 