# 🚀 部署步驟指南

## ✅ 已完成的步驟

1. ✅ 代碼已提交到本地 Git 倉庫
2. ✅ 已添加遠程倉庫：https://github.com/wuhua-7/project2.git
3. ✅ 正在推送到 GitHub...

## 📋 接下來的部署步驟

### 步驟 1: 確認 GitHub 推送成功

等待推送完成後，訪問：
```
https://github.com/wuhua-7/project2
```
確認代碼已成功上傳。

### 步驟 2: 部署後端到 Render

#### 2.1 登入 Render
1. 訪問 https://render.com
2. 使用 GitHub 賬號登入

#### 2.2 創建 Web Service
1. 點擊 "New +" → "Web Service"
2. 選擇 "Connect a repository"
3. 找到並選擇 `wuhua-7/project2`
4. 點擊 "Connect"

#### 2.3 配置服務
填寫以下信息：
```
Name: project2-backend
Region: Singapore (或最近的區域)
Branch: main
Root Directory: backend
Runtime: Node
Build Command: npm install
Start Command: npm start
```

#### 2.4 設置環境變量
點擊 "Advanced" → "Add Environment Variable"，添加：

```
MONGODB_URI=你的MongoDB連接字符串
JWT_SECRET=你的JWT密鑰（建議使用隨機生成的長字符串）
PORT=3001
NODE_ENV=production
```

**生成 JWT_SECRET 的方法**：
```bash
# 在命令行執行
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2.5 部署
1. 點擊 "Create Web Service"
2. 等待部署完成（約 3-5 分鐘）
3. 記下你的後端 URL，例如：`https://project2-backend.onrender.com`

### 步驟 3: 部署前端到 Vercel

#### 3.1 安裝 Vercel CLI（如果還沒安裝）
```bash
npm install -g vercel
```

#### 3.2 登入 Vercel
```bash
vercel login
```

#### 3.3 部署前端
```bash
cd apps/web-pure
vercel
```

按照提示操作：
- Set up and deploy? **Y**
- Which scope? 選擇你的賬號
- Link to existing project? **N**
- What's your project's name? **project2-frontend**
- In which directory is your code located? **./（當前目錄）**
- Want to override the settings? **N**

#### 3.4 設置環境變量
在 Vercel Dashboard 中：
1. 進入你的項目
2. 點擊 "Settings" → "Environment Variables"
3. 添加：
```
REACT_APP_API_URL=https://project2-backend.onrender.com
```

#### 3.5 重新部署
```bash
vercel --prod
```

### 步驟 4: 更新後端 CORS 設置

#### 4.1 獲取前端 URL
部署完成後，Vercel 會給你一個 URL，例如：
```
https://project2-frontend.vercel.app
```

#### 4.2 更新 backend/src/server.js
在 `allowedOrigins` 數組中添加你的前端 URL：

```javascript
const allowedOrigins = [
  'https://project2-frontend.vercel.app',  // 添加這行
  'https://project2-g1cl.onrender.com',
  'http://localhost:3000',
  // ... 其他域名
];
```

#### 4.3 提交並推送更新
```bash
git add backend/src/server.js
git commit -m "fix: update CORS for production frontend"
git push origin main
```

Render 會自動重新部署後端。

### 步驟 5: 測試部署

#### 5.1 測試後端
訪問：`https://project2-backend.onrender.com/health`
應該看到：
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": ...
}
```

#### 5.2 測試前端
1. 訪問你的前端 URL
2. 註冊/登入賬號
3. 測試以下功能：
   - ✅ 發送訊息
   - ✅ 查看已讀狀態（只在最後一則訊息顯示）
   - ✅ 點擊已讀頭像查看名單
   - ✅ 發起群組語音通話
   - ✅ 發起群組視訊通話

### 步驟 6: 配置自定義域名（可選）

#### 6.1 Render 自定義域名
1. 在 Render Dashboard 中選擇你的服務
2. 點擊 "Settings" → "Custom Domain"
3. 添加你的域名（例如：api.yourdomain.com）
4. 在域名提供商處添加 CNAME 記錄

#### 6.2 Vercel 自定義域名
1. 在 Vercel Dashboard 中選擇你的項目
2. 點擊 "Settings" → "Domains"
3. 添加你的域名（例如：app.yourdomain.com）
4. 按照提示配置 DNS

## 🔍 故障排查

### 問題 1: 推送到 GitHub 失敗

**可能原因**：
- 沒有權限
- 網絡問題
- 倉庫不存在

**解決方法**：
```bash
# 檢查遠程倉庫
git remote -v

# 如果需要重新設置
git remote remove origin
git remote add origin https://github.com/wuhua-7/project2.git

# 使用 Personal Access Token 推送
git push https://YOUR_TOKEN@github.com/wuhua-7/project2.git main
```

### 問題 2: Render 部署失敗

**檢查**：
1. Build logs 中的錯誤信息
2. 環境變量是否正確設置
3. package.json 中的 scripts 是否正確

**常見錯誤**：
- MongoDB 連接失敗：檢查 MONGODB_URI
- 端口錯誤：確保使用 `process.env.PORT`
- 依賴安裝失敗：檢查 package.json

### 問題 3: 前端無法連接後端

**檢查**：
1. REACT_APP_API_URL 是否正確
2. 後端 CORS 是否包含前端域名
3. 後端是否正常運行

**調試方法**：
```javascript
// 在瀏覽器 Console 中執行
console.log('API URL:', process.env.REACT_APP_API_URL);
```

### 問題 4: Socket.IO 連接失敗

**檢查**：
1. 後端 Socket.IO CORS 配置
2. 是否使用 HTTPS
3. WebSocket 是否被阻擋

**解決方法**：
在 backend/src/server.js 中確保：
```javascript
const io = new Server(server, {
  cors: {
    origin: [
      'https://project2-frontend.vercel.app',
      // ... 其他域名
    ],
    credentials: true
  }
});
```

## 📊 部署後檢查清單

- [ ] GitHub 代碼已推送
- [ ] 後端在 Render 上運行
- [ ] 前端在 Vercel 上運行
- [ ] 環境變量已設置
- [ ] CORS 配置正確
- [ ] 可以註冊/登入
- [ ] 可以發送訊息
- [ ] 已讀狀態正常顯示
- [ ] 群組語音通話可用
- [ ] 群組視訊通話可用
- [ ] Socket.IO 連接正常
- [ ] MongoDB 連接正常

## 🎉 部署完成！

恭喜！你的應用已成功部署。

**前端 URL**: https://project2-frontend.vercel.app
**後端 URL**: https://project2-backend.onrender.com

## 📝 後續維護

### 更新代碼
```bash
# 1. 修改代碼
# 2. 提交更改
git add .
git commit -m "your commit message"
git push origin main

# 3. Render 和 Vercel 會自動重新部署
```

### 查看日誌
- **Render**: Dashboard → 你的服務 → Logs
- **Vercel**: Dashboard → 你的項目 → Deployments → 點擊部署 → View Function Logs

### 監控性能
建議使用：
- Render 內建監控
- Vercel Analytics
- Google Analytics（前端）
- Sentry（錯誤追蹤）

## 🆘 需要幫助？

- 查看 [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) 獲取詳細信息
- 查看 [TESTING_GUIDE.md](TESTING_GUIDE.md) 進行功能測試
- 查看 Render 文檔：https://render.com/docs
- 查看 Vercel 文檔：https://vercel.com/docs
