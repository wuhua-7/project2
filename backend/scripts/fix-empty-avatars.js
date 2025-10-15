const mongoose = require('mongoose');
const User = require('../src/models/User');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function fixEmptyAvatars() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const defaultAvatarUrl = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';

    // 找到所有 avatar 為空字串或 null 的用戶
    const users = await User.find({ 
      $or: [
        { avatar: '' },
        { avatar: null },
        { avatar: { $exists: false } }
      ]
    });

    console.log(`找到 ${users.length} 個用戶的 avatar 為空`);

    let updated = 0;
    for (const user of users) {
      user.avatar = defaultAvatarUrl;
      await user.save();
      console.log(`[OK] ${user.username} -> ${defaultAvatarUrl}`);
      updated++;
    }

    console.log(`\n更新完成：成功更新 ${updated} 個用戶的頭像`);
    process.exit(0);
  } catch (err) {
    console.error('更新失敗:', err.message);
    process.exit(1);
  }
}

fixEmptyAvatars();
