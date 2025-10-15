const mongoose = require('mongoose');

const operationLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  action: { type: String, required: true }, // e.g. 'batch_delete'
  targetIds: [{ type: mongoose.Schema.Types.ObjectId }], // 被操作的訊息/檔案ID
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OperationLog', operationLogSchema); 