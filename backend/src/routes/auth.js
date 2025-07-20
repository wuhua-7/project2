const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const crypto = require('crypto'); // 新增

const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

// 註冊
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ error: '缺少帳號、密碼或Email' });
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: '密碼需至少8碼且包含字母與數字' });
  }
  try {
    const exist = await User.findOne({ username });
    if (exist) return res.status(409).json({ error: '帳號已存在' });
    const user = new User({ username, password, email });
    await user.save();
    // 新增：註冊後直接發 token
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push(refreshToken);
    await user.save();
    res.json({ token, refreshToken, username: user.username });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 登入
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '缺少帳號或密碼' });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: '帳號或密碼錯誤' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: '帳號或密碼錯誤' });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    // 產生 refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    // 儲存 refresh token
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push(refreshToken);
    await user.save();
    res.json({ token, refreshToken, username: user.username });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 用 refresh token 換取新 access token
router.post('/auth/refresh', async (req, res) => {
  const { username, refreshToken } = req.body;
  if (!username || !refreshToken) return res.status(400).json({ error: '缺少參數' });
  try {
    const user = await User.findOne({ username });
    if (!user || !user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({ error: 'Refresh token 無效' });
    }
    // 檢查通過，發新 access token
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 用戶登出，移除 refresh token
router.post('/logout', async (req, res) => {
  const { username, refreshToken } = req.body;
  if (!username || !refreshToken) return res.status(400).json({ error: '缺少參數' });
  try {
    const user = await User.findOne({ username });
    if (!user || !user.refreshTokens) {
      return res.status(400).json({ error: '用戶不存在或未登入' });
    }
    user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken);
    await user.save();
    res.json({ message: '登出成功' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router; 