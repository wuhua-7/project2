const mongoose = require('mongoose');
const User = require('../src/models/User');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function createTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const hashedPassword = await bcrypt.hash('123456', 10);
    const defaultAvatarUrl = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';

    const testUser = new User({
      username: 'wuhua',
      password: hashedPassword,
      email: 'test@example.com',
      avatar: defaultAvatarUrl
    });

    await testUser.save();
    console.log('測試用戶建立成功:', testUser.username);
    console.log('Avatar:', testUser.avatar);

    process.exit(0);
  } catch (err) {
    console.error('建立失敗:', err.message);
    process.exit(1);
  }
}

createTestUser();
