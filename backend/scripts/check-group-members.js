require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Group = require('../src/models/Group');

async function checkGroupMembers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // 找到所有群組
    const groups = await Group.find()
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .populate('members', 'username avatar');

    console.log(`找到 ${groups.length} 個群組:`);

    groups.forEach((group, index) => {
      console.log(`\n群組 ${index + 1}: ${group.name}`);
      console.log(`- 群主: ${group.owner?.username} (avatar: ${group.owner?.avatar || '無'})`);
      console.log(`- 管理員: ${group.admins?.map(a => a.username).join(', ') || '無'}`);
      console.log(`- 成員 (${group.members?.length || 0} 人):`);
      
      if (group.members && group.members.length > 0) {
        group.members.forEach((member, idx) => {
          console.log(`  ${idx + 1}. ${member.username} (avatar: ${member.avatar || '無'})`);
        });
      } else {
        console.log('  無成員');
      }
    });

    // 檢查是否有成員的 avatar 為空
    let emptyAvatarCount = 0;
    groups.forEach(group => {
      if (group.members) {
        group.members.forEach(member => {
          if (!member.avatar || member.avatar === '') {
            emptyAvatarCount++;
            console.log(`\n⚠️  發現空頭像: ${member.username} (群組: ${group.name})`);
          }
        });
      }
    });

    if (emptyAvatarCount > 0) {
      console.log(`\n總共發現 ${emptyAvatarCount} 個用戶的頭像為空`);
    } else {
      console.log('\n✅ 所有成員都有頭像');
    }

  } catch (error) {
    console.error('檢查失敗:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkGroupMembers();
