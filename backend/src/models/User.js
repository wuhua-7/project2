const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, default: '' },
  expoPushToken: { type: String },
  createdAt: { type: Date, default: Date.now },
  refreshTokens: [{ type: String }], // 新增，支援多端 refresh token
  pushPreferences: {
    type: Object,
    default: () => ({ mention: true, announcement: true, message: true, voice: true, file: true, system: true })
  }, // 新增，推播偏好
  isAdmin: { type: Boolean, default: false }, // 新增，管理員權限
  avatar: { type: String, default: "" }, // 新增，頭像網址
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema); 