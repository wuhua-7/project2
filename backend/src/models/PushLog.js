const mongoose = require('mongoose');

const pushLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String },
  body: { type: String },
  data: { type: Object },
  status: { type: String, enum: ['success', 'fail'], default: 'success' },
  error: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PushLog', pushLogSchema); 