# Cloudinary 媒體上傳問題修復總結

## 問題描述
圖片和視頻載入失敗，錯誤顯示嘗試從 Render 後端載入（`https://project2-g1cl.onrender.com/uploads/...`），但實際應該使用 Cloudinary URL。

## 根本原因
1. 後端的媒體上傳路由（`/api/upload/media` 和 `/api/upload/voice`）仍然使用本地 multer 存儲
2. 返回的 URL 格式是 `/uploads/...` 而不是 Cloudinary 的完整 URL
3. 前端沒有正確識別 Cloudinary URL

## 修復內容 (已完成 - 2025/01/08)

### 1. 後端修改

#### `backend/src/server.js`
- 移除本地 multer 配置
- 改為使用 Cloudinary 配置的 upload
```javascript
// 之前：使用本地存儲
const storage = multer.diskStorage({...});
const upload = multer({ storage });

// 之後：使用 Cloudinary
const { upload } = require('./config/cloudinary');
```

- 更新上傳路由以使用 Cloudinary URL
```javascript
// 之前
url: `/uploads/${req.file.filename}`

// 之後
url: req.file.path  // Cloudinary 返回的完整 URL
```

#### `backend/src/config/cloudinary.js`
- 更新配置以支持所有媒體類型（圖片、視頻、音頻）
- 根據文件類型動態設置參數
```javascript
params: async (req, file) => {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');
  const isAudio = file.mimetype.startsWith('audio/');
  
  let params = {
    folder: 'chat-app',
    resource_type: 'auto'
  };
  
  // 只對圖片應用轉換
  if (isImage) {
    params.transformation = [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto' }
    ];
  }
  
  // 視頻和音頻使用 video 資源類型
  if (isVideo || isAudio) {
    params.resource_type = 'video';
  }
  
  return params;
}
```

### 2. 前端修改

#### `apps/web-pure/App.js`
- 更新 URL 處理邏輯，識別 Cloudinary URL
```javascript
// 之前
src={msg.url.startsWith('blob:') ? msg.url : API_URL + msg.url}

// 之後
src={msg.url.startsWith('blob:') || msg.url.startsWith('http') ? msg.url : API_URL + msg.url}
```

## 部署步驟

### 1. 確認環境變數
在 Render 中確認以下環境變數已設置：
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 2. 部署更新
1. 提交代碼到 Git
```bash
git add .
git commit -m "Fix: Use Cloudinary for all media uploads"
git push
```

2. Render 會自動部署更新

### 3. 驗證功能
1. 測試圖片上傳
2. 測試視頻上傳
3. 測試語音訊息
4. 測試文件上傳

## 預期結果
- 所有媒體文件都會上傳到 Cloudinary
- URL 格式為 `https://res.cloudinary.com/...`
- 圖片會自動優化尺寸和質量
- 視頻和音頻保持原始格式
- 不再出現載入失敗的錯誤

## 注意事項
1. 現有的本地文件（`/uploads/...`）需要手動遷移到 Cloudinary
2. 確保 Cloudinary 帳戶有足夠的存儲空間和帶寬
3. 監控 Cloudinary 使用量避免超出限制

## 回滾方案
如果需要回滾到本地存儲：
1. 恢復 `server.js` 中的本地 multer 配置
2. 更新 URL 處理邏輯
3. 重新部署

## 測試結果
✅ Cloudinary 連接成功
✅ 文件上傳功能正常
✅ 返回完整的 HTTPS URL

## 相關文件
- `backend/src/server.js` - 主服務器文件（已更新）
- `backend/src/config/cloudinary.js` - Cloudinary 配置（已更新）
- `backend/test-cloudinary-upload.js` - 測試腳本（新增）
- `apps/web-pure/App.js` - 前端應用（已更新）
- `CLOUDINARY_SETUP.md` - Cloudinary 設置指南
- `CLOUDINARY_MIGRATION_SUMMARY.md` - 之前的遷移總結
