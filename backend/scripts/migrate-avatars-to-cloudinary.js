const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { cloudinary } = require('../src/config/cloudinary');
const User = require('../src/models/User');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const UPLOADS_DIR = path.resolve(__dirname, '../src/uploads');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  // 1. 取得所有本地檔案
  const files = fs.readdirSync(UPLOADS_DIR).filter(f => !f.endsWith('.gitkeep') && f !== '2.jpeg');
  console.log('本地頭像檔案數量:', files.length);

  let migrated = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const localPath = path.join(UPLOADS_DIR, file);
    const avatarPath = `/uploads/${file}`;
    // 2. 查找對應用戶
    const user = await User.findOne({ avatar: avatarPath });
    if (!user) {
      console.log(`[SKIP] 找不到對應用戶: ${avatarPath}`);
      skipped++;
      continue;
    }
    // 3. 上傳到 Cloudinary
    try {
      const result = await cloudinary.uploader.upload(localPath, {
        folder: 'chat-app',
        public_id: path.parse(file).name,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto' }
        ]
      });
      // 4. 更新用戶 avatar 欄位
      user.avatar = result.secure_url;
      await user.save();
      console.log(`[OK] ${user.username} -> ${result.secure_url}`);
      migrated++;
    } catch (err) {
      console.error(`[FAIL] ${user.username} (${avatarPath}):`, err.message);
      failed++;
    }
  }

  console.log(`\n遷移完成：成功 ${migrated}，跳過 ${skipped}，失敗 ${failed}`);
  process.exit(0);
}

migrate();
