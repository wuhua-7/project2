# 關鍵問題修復

## ✅ 已修復的問題

### 1. 群組通話只顯示自己
**問題**: 加入通話後只看到自己，看不到其他成員

**根本原因**: 
- 後端使用 `io.to(groupId).emit` 會廣播給所有人包括自己
- 新加入者沒有收到現有成員列表

**修復**:
- 後端改用 `socket.to(groupId).emit` 只廣播給其他人
- 添加 `group-call:existing-members` 事件，發送現有成員列表給新加入者
- 前端監聽並合併現有成員

**文件**:
- `backend/src/server.js` line ~318-350
- `apps/web-pure/App.js` line ~600-620

### 2. 所有人退出時自動結束通話
**問題**: 最後一人離開時通話仍然存在

**修復**:
- `handleLeaveGroupCall` 檢查是否是最後一人
- 如果是最後一人，發送 `group-call:end` 而不是 `group-call:leave`
- 自動清理通話狀態

**文件**:
- `apps/web-pure/App.js` line ~2061-2085

### 3. JWT 驗證失敗
**問題**: 修改用戶名/ID時出現 "JWT驗證失敗"

**根本原因**: 
- 某些請求沒有使用 `safeFetch`
- Token 過期時沒有自動刷新

**修復**:
- 更新個人資料的請求改用 `safeFetch`
- 自動處理 token 刷新
- 添加更好的錯誤提示

**文件**:
- `apps/web-pure/App.js` line ~3154, ~3198

### 4. 頭像顯示問題
**問題**: 偶爾頭像顯示不出來

**修復**:
- 後端 API 添加 `discriminator` 到 populate
- 確保返回完整的用戶信息
- 前端已有錯誤處理和默認頭像

**文件**:
- `backend/src/routes/group.js` line ~167-185

## ⚠️ 音頻問題（待測試）

群組通話目前使用簡單的媒體流共享，**不支持多人音頻**。

### 當前架構限制:
- 沒有使用 WebRTC P2P 連接
- 沒有音頻混音
- 媒體流只在本地播放

### 解決方案選項:

#### 選項 1: 使用 WebRTC Mesh (簡單但不可擴展)
每個用戶與其他所有用戶建立 P2P 連接
- 優點: 實現簡單
- 缺點: 只適合 2-4 人

#### 選項 2: 使用 SFU (推薦)
使用媒體服務器轉發流
- 優點: 可擴展到更多人
- 缺點: 需要額外的媒體服務器（如 mediasoup, Janus）

#### 選項 3: 使用第三方服務
- Agora
- Twilio
- Daily.co

### 快速修復建議:
如果只需要支持 2-4 人，可以實現簡單的 WebRTC Mesh：

1. 每個用戶加入時與現有成員建立 P2P 連接
2. 交換 SDP offer/answer
3. 交換 ICE candidates
4. 播放遠程音頻流

## 🚀 部署

```bash
git add -A
git commit -m "fix: resolve group call visibility, auto-end, JWT, and avatar issues"
git push origin main
```

## 🧪 測試清單

### 群組通話
- [ ] 用戶A發起通話
- [ ] 用戶B加入，A和B都能看到對方
- [ ] 用戶C加入，A、B、C都能看到彼此
- [ ] 用戶A離開，B和C仍能看到對方
- [ ] 最後一人離開，通話自動結束

### 用戶資料
- [ ] 修改用戶名成功
- [ ] 修改ID成功
- [ ] 不會出現 JWT 錯誤

### 頭像
- [ ] 所有成員頭像正確顯示
- [ ] 刷新後頭像仍然顯示

## 📝 已知限制

1. **音頻**: 群組通話目前沒有音頻功能（需要 WebRTC 實現）
2. **視訊**: 群組視訊通話同樣需要 WebRTC P2P 連接
3. **可擴展性**: 當前架構只適合小型群組（<5人）

如需完整的音視頻功能，建議：
- 實現 WebRTC Mesh（簡單場景）
- 或使用第三方服務（生產環境）
