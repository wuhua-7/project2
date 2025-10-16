const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function backupCloudinaryAssets() {
  try {
    console.log('開始備份 Cloudinary 資源...');
    
    // 獲取所有資源
    const result = await cloudinary.api.resources({
      type: 'upload',
      max_results: 500,
      resource_type: 'image'
    });
    
    console.log(`找到 ${result.resources.length} 個圖片資源`);
    
    // 創建備份目錄
    const backupDir = path.join(__dirname, '../backups/cloudinary');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // 創建資源清單
    const manifest = {
      backup_date: new Date().toISOString(),
      total_resources: result.resources.length,
      resources: result.resources.map(resource => ({
        public_id: resource.public_id,
        url: resource.secure_url,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        bytes: resource.bytes,
        created_at: resource.created_at
      }))
    };
    
    // 保存清單文件
    const manifestPath = path.join(backupDir, `manifest-${Date.now()}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    console.log(`備份清單已保存到: ${manifestPath}`);
    console.log('Cloudinary 備份完成！');
    
    return manifest;
    
  } catch (error) {
    console.error('備份失敗:', error);
    throw error;
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  backupCloudinaryAssets()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { backupCloudinaryAssets };