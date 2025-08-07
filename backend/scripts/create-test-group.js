require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Group = require('../src/models/Group');
const User = require('../src/models/User');

async function createTestGroup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // 找到測試用戶
    const user = await User.findOne({ username: 'wuhua' });
    if (!user) {
      console.log('找不到測試用戶 wuhua');
      return;
    }

    console.log('找到測試用戶:', user.username);

    // 創建測試群組
    const testGroup = new Group({
      name: '測試群組',
      owner: user._id,
      members: [user._id],
      admins: [user._id]
    });

    await testGroup.save();
    console.log('測試群組創建成功:', testGroup.name);

    // 驗證群組
    const group = await Group.findById(testGroup._id)
      .populate('owner', 'username avatar')
      .populate('members', 'username avatar');

    console.log('\n群組詳情:');
    console.log(`- 群組名稱: ${group.name}`);
    console.log(`- 群主: ${group.owner.username} (avatar: ${group.owner.avatar})`);
    console.log(`- 成員數量: ${group.members.length}`);
    group.members.forEach((member, idx) => {
      console.log(`  ${idx + 1}. ${member.username} (avatar: ${member.avatar})`);
    });

  } catch (error) {
    console.error('創建測試群組失敗:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createTestGroup();
