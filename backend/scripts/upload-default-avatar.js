require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// 檢查環境變數
console.log('檢查環境變數:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '已設置' : '未設置');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '已設置' : '未設置');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '已設置' : '未設置');

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadDefaultAvatar() {
  try {
    console.log('開始上傳預設頭像到 Cloudinary...');
    
    // 預設頭像檔案路徑
    const defaultAvatarPath = path.join(__dirname, '../src/uploads/2.jpeg');
    
    // 檢查檔案是否存在
    if (!fs.existsSync(defaultAvatarPath)) {
      console.error('預設頭像檔案不存在:', defaultAvatarPath);
      return;
    }
    
    console.log('找到預設頭像檔案:', defaultAvatarPath);
    
    // 上傳到 Cloudinary
    const result = await cloudinary.uploader.upload(defaultAvatarPath, {
      folder: 'chat-app',
      public_id: 'default-avatar',
      overwrite: true,
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ]
    });
    
    console.log('預設頭像上傳成功！');
    console.log('Cloudinary URL:', result.secure_url);
    console.log('Public ID:', result.public_id);
    
    // 更新預設頭像 URL 常數
    const defaultAvatarUrl = result.secure_url;
    console.log('\n=== 預設頭像 URL ===');
    console.log(defaultAvatarUrl);
    console.log('\n請將此 URL 更新到前端 App.js 中的預設頭像路徑');
    
  } catch (error) {
    console.error('上傳預設頭像失敗:', error.message);
    console.error('錯誤詳情:', error);
    if (error.response) {
      console.error('錯誤詳情:', error.response.data);
    }
  }
}

uploadDefaultAvatar();
