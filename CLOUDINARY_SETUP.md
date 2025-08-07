# Cloudinary 雲端儲存設置指南

## 1. 註冊 Cloudinary 帳戶

1. 前往 [Cloudinary 官網](https://cloudinary.com/)
2. 註冊一個免費帳戶
3. 登入後進入 Dashboard

## 2. 獲取 API 憑證

在 Cloudinary Dashboard 中：
1. 找到 "Account Details" 部分
2. 記錄以下信息：
   - Cloud Name
   - API Key
   - API Secret

## 3. 配置環境變數

### 本地開發
在 `backend` 目錄下創建 `.env` 文件：

```env
# MongoDB 連接
MONGODB_URI=mongodb://localhost:27017/chat-app

# JWT 密鑰
JWT_SECRET=your-secret-key-here

# Cloudinary 配置
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# 服務器端口
PORT=3000
```

### Render 部署
在 Render 的環境變數中添加：

```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## 4. 功能特點

### 圖片優化
- 自動調整圖片尺寸為 400x400
- 自動優化圖片質量
- 支持多種圖片格式 (jpg, jpeg, png, gif, webp)

### 安全性
- 自動刪除舊的頭像圖片
- 安全的文件上傳處理
- 支持 HTTPS

### 性能
- CDN 加速
- 自動圖片轉換
- 響應式圖片支持

## 5. 遷移現有數據

如果從本地存儲遷移到 Cloudinary：

1. 備份現有的頭像文件
2. 更新用戶頭像 URL 格式
3. 測試新的上傳功能

## 6. 故障排除

### 常見問題

1. **圖片上傳失敗**
   - 檢查 Cloudinary 憑證是否正確
   - 確認網絡連接
   - 檢查文件大小限制

2. **圖片顯示問題**
   - 確認 URL 格式正確
   - 檢查 CORS 設置
   - 驗證圖片權限

3. **群組成員顯示 undefined**
   - 檢查後端 populate 設置
   - 確認數據庫連接
   - 驗證 API 響應格式

## 7. 監控和維護

- 定期檢查 Cloudinary 使用量
- 監控圖片上傳成功率
- 備份重要的用戶數據
