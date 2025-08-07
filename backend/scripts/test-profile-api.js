require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function testProfileAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // 找到測試用戶
    const user = await User.findOne({ username: 'wuhua' });
    if (!user) {
      console.log('找不到測試用戶 wuhua');
      return;
    }

    console.log('找到用戶:', {
      username: user.username,
      avatar: user.avatar,
      email: user.email
    });

    // 模擬 API 請求
    const profileData = {
      username: user.username,
      email: user.email || '',
      avatar: user.avatar || '',
      createdAt: user.createdAt
    };

    console.log('\n模擬 /api/user/profile 回應:');
    console.log(JSON.stringify(profileData, null, 2));

    // 檢查 avatar 欄位
    if (!profileData.avatar || profileData.avatar === '') {
      console.log('\n❌ 問題: avatar 欄位為空');
      console.log('建議: 更新用戶的 avatar 欄位');
    } else {
      console.log('\n✅ avatar 欄位正常:', profileData.avatar);
    }

  } catch (error) {
    console.error('測試失敗:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testProfileAPI();
