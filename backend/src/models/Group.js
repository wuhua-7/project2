const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 原 creator 改為 owner
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // 新增 admins 欄位
  announcement: { type: String, default: '' }, // 新增公告欄位
  tags: [{
    name: { type: String, required: true },
    color: { type: String, default: '#1976d2' }, // 預設藍色
    count: { type: Number, default: 0 } // 使用次數（可選）
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', groupSchema); 