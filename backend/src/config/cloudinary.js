const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary 配置
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 創建 Cloudinary 存儲配置且根據文件類型處理
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // 檢查文件類型
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    const isAudio = file.mimetype.startsWith('audio/');
    
    // 基本參數
    let params = {
      folder: 'chat-app',
      resource_type: 'auto' // 自動識別資源類型
    };
    
    // 只對圖片應用轉換
    if (isImage) {
      params.transformation = [
        { width: 800, height: 800, crop: 'limit' }, // 限制最大尺寸
        { quality: 'auto' }
      ];
    }
    
    // 視頻和音頻不做轉換
    if (isVideo || isAudio) {
      params.resource_type = 'video'; // 視頻和音頻都使用 video 類型
    }
    
    return params;
  }
});

// 創建 multer 實例
const upload = multer({ storage });

module.exports = {
  cloudinary,
  upload,
  storage
};
