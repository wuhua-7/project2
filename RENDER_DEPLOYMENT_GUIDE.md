# Render 部署指南和故障排除

## 🚀 部署狀態

**最新部署:** 2025/9/20 12:30
**Commit:** 53993b7 - 修復頭像顯示和群組成員問題
**狀態:** 🔄 部署中

## 📋 部署檢查清單

### ✅ 已完成
- [x] 代碼推送到 GitHub
- [x] 修復頭像和群組成員問題
- [x] 創建部署腳本
- [x] 備份項目信息

### 🔄 進行中
- [ ] Render 自動部署
- [ ] 服務器啟動驗證

### ⚠️ 需要檢查
- [ ] 環境變數配置
- [ ] MongoDB 連接
- [ ] Cloudinary 配置

## 🔧 Render 配置

### 構建設置
```bash
Build Command: chmod +x build.sh && ./build.sh
Start Command: chmod +x start.sh && ./start.sh
```

### 環境變數
確保在 Render Dashboard 中設置以下環境變數：

```env
NODE_ENV=production
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-jwt-secret
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-cloudinary-key
CLOUDINARY_API_SECRET=your-cloudinary-secret
PORT=10000
```

## 🐛 故障排除

### 1. 部署超時
**症狀:** 部署過程中超時
**解決方案:**
- 檢查 build.sh 和 start.sh 權限
- 確認 package.json 中的 start 腳本正確
- 檢查依賴安裝是否成功

### 2. 服務器無法啟動
**症狀:** 部署成功但服務器不響應
**解決方案:**
- 檢查 PORT 環境變數（Render 使用動態端口）
- 確認 MongoDB 連接字符串正確
- 檢查 server.js 中的端口配置

### 3. 404 錯誤
**症狀:** 所有 API 端點返回 404
**解決方案:**
- 確認路由配置正確
- 檢查靜態文件服務設置
- 驗證 Express 應用配置

## 📊 監控和測試

### 健康檢查端點
```
GET /health
GET /
GET /api/auth/check
```

### 測試命令
```bash
# 檢查部署狀態
node scripts/check-deployment.js

# 本地測試
cd backend && npm start
```

## 🔄 重新部署步驟

如果需要重新部署：

1. **手動觸發部署**
   - 登入 Render Dashboard
   - 找到你的服務
   - 點擊 "Manual Deploy" > "Deploy latest commit"

2. **推送新的提交**
   ```bash
   git add .
   git commit -m "觸發重新部署"
   git push origin main
   ```

3. **檢查日誌**
   - 在 Render Dashboard 查看部署日誌
   - 檢查運行時日誌

## 📞 支援資源

- **Render 文檔:** https://render.com/docs
- **GitHub 倉庫:** https://github.com/wuhua-7/project2
- **應用網址:** https://project2-g1cl.onrender.com

## 🎯 下一步

1. 等待 Render 部署完成（5-10 分鐘）
2. 測試應用功能
3. 驗證修復效果
4. 監控應用性能