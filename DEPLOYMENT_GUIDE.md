# 部署指南

## 📦 部署到 Render

### 後端部署 (Backend)

#### 1. 準備工作
確保你的 `backend/package.json` 有正確的啟動腳本：
```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

#### 2. 在 Render 創建 Web Service
1. 登入 [Render](https://render.com)
2. 點擊 "New +" → "Web Service"
3. 連接你的 GitHub 倉庫
4. 配置如下：
   - **Name**: `your-app-backend`
   - **Region**: 選擇最近的區域
   - **Branch**: `main` 或 `master`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

#### 3. 環境變量設置
在 Render 的 Environment 頁面添加：
```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
PORT=3001
NODE_ENV=production
```

#### 4. 部署
點擊 "Create Web Service"，Render 會自動部署

### 前端部署 (Frontend)

#### 方案 1: Vercel 部署

1. 安裝 Vercel CLI
```bash
npm install -g vercel
```

2. 在 `apps/web-pure` 目錄下運行
```bash
cd apps/web-pure
vercel
```

3. 按照提示完成部署

4. 設置環境變量
在 Vercel 項目設置中添加：
```
REACT_APP_API_URL=https://your-backend.onrender.com
```

#### 方案 2: Render 靜態網站部署

1. 在 Render 創建 Static Site
2. 配置：
   - **Build Command**: `cd apps/web-pure && npm install && npm run build`
   - **Publish Directory**: `apps/web-pure/build`

3. 設置環境變量（同上）

## 🔧 配置更新

### 更新 API URL

#### 前端 (apps/web-pure/config.js)
```javascript
export const API_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://your-backend.onrender.com' 
    : 'http://localhost:3001');
```

#### 後端 CORS 設置 (backend/src/server.js)
確保允許你的前端域名：
```javascript
const allowedOrigins = [
  'https://your-frontend.vercel.app',
  'https://your-frontend.onrender.com',
  'http://localhost:3000'
];
```

## 🚀 快速部署命令

### 提交並推送代碼
```bash
# 添加所有更改
git add .

# 提交
git commit -m "feat: add group call and optimize read status"

# 推送到 GitHub
git push origin main
```

### 自動部署
- Render 和 Vercel 都支持自動部署
- 推送到 GitHub 後會自動觸發部署

## 📝 部署檢查清單

### 部署前
- [ ] 所有功能本地測試通過
- [ ] 環境變量已配置
- [ ] API URL 已更新
- [ ] CORS 設置正確
- [ ] .gitignore 已配置
- [ ] 敏感信息已移除

### 部署後
- [ ] 後端服務正常運行
- [ ] 前端可以訪問
- [ ] Socket.IO 連接正常
- [ ] 數據庫連接成功
- [ ] 群組通話功能正常
- [ ] 已讀狀態同步正常

## 🔍 故障排查

### 問題 1: 後端無法啟動
**檢查**:
- MongoDB 連接字符串是否正確
- 環境變量是否設置
- 端口是否被佔用

### 問題 2: 前端無法連接後端
**檢查**:
- API_URL 是否正確
- CORS 設置是否包含前端域名
- 後端是否正常運行

### 問題 3: Socket.IO 連接失敗
**檢查**:
- WebSocket 是否被防火牆阻擋
- CORS 設置是否包含 Socket.IO
- 後端 Socket.IO 配置是否正確

### 問題 4: 群組通話無法使用
**檢查**:
- 是否使用 HTTPS（WebRTC 需要）
- 瀏覽器權限是否授予
- STUN/TURN 服務器配置

## 🌐 域名配置

### 自定義域名

#### Render
1. 在項目設置中點擊 "Custom Domain"
2. 添加你的域名
3. 在域名提供商處添加 CNAME 記錄

#### Vercel
1. 在項目設置中點擊 "Domains"
2. 添加你的域名
3. 按照提示配置 DNS

## 📊 監控和日誌

### Render 日誌
- 在 Render Dashboard 查看實時日誌
- 設置日誌告警

### 性能監控
建議使用：
- New Relic
- Datadog
- Sentry (錯誤追蹤)

## 🔐 安全建議

1. **環境變量**
   - 不要在代碼中硬編碼敏感信息
   - 使用環境變量管理配置

2. **HTTPS**
   - 生產環境必須使用 HTTPS
   - Render 和 Vercel 自動提供 SSL

3. **CORS**
   - 只允許信任的域名
   - 不要使用 `*` 通配符

4. **JWT**
   - 使用強密鑰
   - 設置合理的過期時間

## 📈 擴展建議

### 水平擴展
- 使用 Redis 作為 Session 存儲
- 使用 Redis 作為 Socket.IO 適配器
- 使用負載均衡器

### 垂直擴展
- 升級 Render 計劃
- 增加 MongoDB 容量
- 優化數據庫查詢

## 🎯 持續集成/持續部署 (CI/CD)

### GitHub Actions 示例
創建 `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

## 📞 支持

如有問題，請查看：
- [Render 文檔](https://render.com/docs)
- [Vercel 文檔](https://vercel.com/docs)
- [項目 README](README.md)
