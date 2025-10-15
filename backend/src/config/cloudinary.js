const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary 配置
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 創建 Cloudinary 存儲配置 - 和頭像上傳一模一樣
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log('Cloudinary 上傳文件:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // 檢查文件類型
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    const isAudio = file.mimetype.startsWith('audio/');
    
    // 基本參數 - 和頭像上傳一樣
    let params = {
      folder: 'chat-app',
      resource_type: 'auto', // 自動識別資源類型
      access_mode: 'public' // 確保公開訪問
    };
    
    // 頭像和一般圖片的處理
    if (file.fieldname === 'avatar' && isImage) {
      // 頭像特殊處理
      params.transformation = [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ];
    } else if (isImage) {
      // 一般圖片
      params.transformation = [
        { width: 1200, height: 1200, crop: 'limit' }, // 限制最大尺寸
        { quality: 'auto' }
      ];
    }
    
    // 視頻和音頻使用 video 資源類型
    if (isVideo || isAudio) {
      params.resource_type = 'video';
    }
    
    console.log('Cloudinary 參數:', params);
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
