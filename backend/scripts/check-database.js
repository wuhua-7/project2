const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
    console.log('Database:', mongoose.connection.db.databaseName);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n資料庫集合:');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });

    // 檢查 users 集合
    const User = require('../src/models/User');
    const userCount = await User.countDocuments();
    console.log(`\nusers 集合文檔數量: ${userCount}`);

    if (userCount > 0) {
      const users = await User.find({}, { username: 1, avatar: 1 }).limit(5);
      console.log('\n前 5 個用戶:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username}: "${user.avatar}"`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('檢查失敗:', err.message);
    process.exit(1);
  }
}

checkDatabase();
