require('dotenv').config();
const cloudinary = require('cloudinary').v2;

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testUpload() {
  console.log('測試 Cloudinary 配置...');
  console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
  console.log('API Key:', process.env.CLOUDINARY_API_KEY ? '已設置' : '未設置');
  console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? '已設置' : '未設置');
  
  try {
    // 測試上傳一個簡單的文字文件
    console.log('\n嘗試上傳測試文件...');
    const result = await cloudinary.uploader.upload_stream(
      { 
        folder: 'chat-app',
        resource_type: 'raw',
        public_id: 'test-' + Date.now()
      },
      (error, result) => {
        if (error) {
          console.error('上傳失敗:', error);
        } else {
          console.log('上傳成功!');
          console.log('文件 URL:', result.secure_url);
          console.log('Public ID:', result.public_id);
          console.log('資源類型:', result.resource_type);
          console.log('格式:', result.format);
        }
      }
    ).end(Buffer.from('This is a test file'));
    
  } catch (error) {
    console.error('測試失敗:', error);
  }
}

// 測試獲取帳戶信息
async function testAccount() {
  try {
    console.log('\n測試獲取 Cloudinary 帳戶信息...');
    const result = await cloudinary.api.ping();
    console.log('Cloudinary 連接成功:', result);
    
    // 獲取使用量信息
    const usage = await cloudinary.api.usage();
    console.log('\n帳戶使用量:');
    console.log('- 儲存空間:', usage.storage.usage, '/', usage.storage.limit);
    console.log('- 帶寬:', usage.bandwidth.usage, '/', usage.bandwidth.limit);
    console.log('- 轉換:', usage.transformations.usage, '/', usage.transformations.limit);
  } catch (error) {
    console.error('無法獲取帳戶信息:', error.message);
  }
}

async function main() {
  await testAccount();
  await testUpload();
}

main();
