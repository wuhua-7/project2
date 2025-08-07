const mongoose = require('mongoose');
const User = require('../src/models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function checkUserAvatars() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const users = await User.find({}, { username: 1, avatar: 1 });

    console.log(`\n總共 ${users.length} 個用戶:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username}: "${user.avatar}"`);
    });

    process.exit(0);
  } catch (err) {
    console.error('檢查失敗:', err.message);
    process.exit(1);
  }
}

checkUserAvatars();
