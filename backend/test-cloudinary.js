require('dotenv').config();
const cloudinary = require('cloudinary').v2;

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testCloudinary() {
  try {
    console.log('測試 Cloudinary 配置...');
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('API Key:', process.env.CLOUDINARY_API_KEY ? '已設置' : '未設置');
    console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? '已設置' : '未設置');
    
    // 測試上傳一個簡單的圖片
    const result = await cloudinary.uploader.upload(
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+VGVzdDwvdGV4dD48L3N2Zz4=',
      {
        folder: 'chat-app',
        public_id: 'test-image'
      }
    );
    
    console.log('上傳成功:', result.secure_url);
    
    // 測試刪除
    await cloudinary.uploader.destroy('chat-app/test-image');
    console.log('刪除成功');
    
    console.log('✅ Cloudinary 配置正確！');
  } catch (error) {
    console.error('❌ Cloudinary 配置錯誤:', error.message);
    console.log('請檢查環境變數設置');
  }
}

testCloudinary();
