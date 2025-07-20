const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String },
  type: { type: String, enum: ['text', 'voice', 'image', 'video', 'file'], default: 'text' },
  url: { type: String },
  filename: { type: String },
  size: { type: Number }, // 新增檔案大小
  mimetype: { type: String }, // 新增 MIME 型別
  tags: [{ type: String }],
  archived: { type: Boolean, default: false },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isRevoked: { type: Boolean, default: false },
  editedAt: { type: Date },
  optimisticId: { type: String },
  createdAt: { type: Date, default: Date.now }
});

messageSchema.index({ content: 'text', filename: 'text' });

module.exports = mongoose.model('Message', messageSchema); 