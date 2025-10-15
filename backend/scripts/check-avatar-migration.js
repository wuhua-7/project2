const mongoose = require('mongoose');
const User = require('../src/models/User');
require('dotenv').config();

async function checkAvatars() {
  await mongoose.connect(process.env.MONGODB_URI);
  const cloudUsers = await User.find({ avatar: { $regex: '^http' } }, { username: 1, avatar: 1 });
  const localUsers = await User.find({ avatar: { $regex: '^/uploads/' } }, { username: 1, avatar: 1 });
  console.log('Cloudinary 頭像用戶數:', cloudUsers.length);
  if (cloudUsers.length > 0) {
    console.log('範例:', cloudUsers.slice(0, 3));
  }
  console.log('本地 uploads 頭像用戶數:', localUsers.length);
  if (localUsers.length > 0) {
    console.log('範例:', localUsers.slice(0, 3));
  }
  process.exit(0);
}
checkAvatars();
