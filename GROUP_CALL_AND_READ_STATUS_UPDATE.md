# 群組通話與已讀狀態優化更新

## 更新日期
2025-01-15

## 更新內容

### 1. 已讀狀態優化

#### 1.1 只顯示最後一則訊息的已讀狀態
- **修改位置**: `apps/web-pure/App.js`
- **變更內容**:
  - 添加 `isLastMessage` 判斷，只在最後一則訊息顯示已讀標籤
  - 減少視覺干擾，讓聊天界面更清爽

#### 1.2 已讀列表不顯示名字
- **修改位置**: `apps/web-pure/App.js`
- **變更內容**:
  - 移除已讀頭像下方的用戶名顯示
  - 只保留頭像圖標，更簡潔
  - 頭像大小調整為 20x20px
  - 超過3人時顯示 "+N" 而不是 "..."
  - 點擊已讀頭像仍可查看完整已讀名單彈窗

### 2. 群組語音通話功能完善

#### 2.1 後端支持 (backend/src/server.js)

新增 Socket.IO 事件處理：

```javascript
// 群組通話邀請
socket.on('group-call:invite', ({ groupId, type }) => {
  // 廣播給群組內所有其他成員
  socket.to(groupId).emit('group-call:invite', { 
    groupId, type, from, fromUsername 
  });
});

// 成員加入通話
socket.on('group-call:join', ({ groupId, userId }) => {
  // 通知群組內所有成員
  io.to(groupId).emit('group-call:member-joined', { 
    groupId, userId, username 
  });
});

// 成員離開通話
socket.on('group-call:leave', ({ groupId, userId }) => {
  // 通知群組內所有成員
  io.to(groupId).emit('group-call:member-left', { 
    groupId, userId 
  });
});

// WebRTC 信令轉發
socket.on('group-call:signal', ({ groupId, targetUserId, signal }) => {
  // 轉發信令給目標用戶
});

// 結束通話
socket.on('group-call:end', ({ groupId }) => {
  // 通知群組內所有成員通話結束
  io.to(groupId).emit('group-call:ended', { groupId });
});
```

#### 2.2 前端實現 (apps/web-pure/App.js)

##### 新增功能函數：

1. **handleGroupAudioCall()** - 發起群組語音通話
   - 獲取麥克風權限
   - 創建本地音頻流
   - 發送邀請給群組成員

2. **handleGroupVideoCall()** - 發起群組視訊通話
   - 獲取攝像頭和麥克風權限
   - 創建本地音視頻流
   - 發送邀請給群組成員

3. **handleJoinGroupCall()** - 加入群組通話
   - 根據通話類型獲取相應媒體設備
   - 加入通話房間
   - 通知其他成員

4. **handleLeaveGroupCall()** - 離開群組通話
   - 停止所有本地媒體流
   - 通知其他成員
   - 清理狀態

5. **handleEndGroupCall()** - 結束群組通話（僅發起人）
   - 停止所有媒體流
   - 通知所有成員通話結束
   - 清理狀態

6. **toggleGroupCallMute()** - 切換靜音狀態
   - 控制音頻軌道的啟用/禁用

7. **toggleGroupCallVideo()** - 切換視訊開關
   - 控制視頻軌道的啟用/禁用

##### Socket 事件監聽：

```javascript
// 收到群組通話邀請
socket.on('group-call:invite', ({ groupId, type, from, fromUsername }) => {
  // 顯示通話彈窗
});

// 成員加入通話
socket.on('group-call:member-joined', ({ groupId, userId, username }) => {
  // 更新成員列表
});

// 成員離開通話
socket.on('group-call:member-left', ({ groupId, userId }) => {
  // 移除成員，清理流
});

// 通話結束
socket.on('group-call:ended', ({ groupId }) => {
  // 關閉通話彈窗，清理資源
});
```

#### 2.3 UI 改進

群組通話彈窗包含：

1. **成員網格顯示**
   - 視訊通話：顯示視頻畫面
   - 語音通話：顯示用戶頭像
   - 當前用戶有藍色邊框標識

2. **控制按鈕**
   - 加入通話（接收邀請時）
   - 靜音/取消靜音
   - 開啟/關閉視訊（視訊通話）
   - 結束通話（發起人）
   - 離開通話（參與者）

3. **視覺優化**
   - 深色半透明背景
   - 圓角卡片設計
   - 響應式網格布局
   - 清晰的按鈕狀態指示

### 3. 群組視訊通話功能完善

#### 3.1 視訊流管理
- 自動獲取攝像頭和麥克風權限
- 支持視訊開關控制
- 本地視訊預覽（靜音）
- 遠程視訊自動播放

#### 3.2 UI 特性
- 視訊畫面網格顯示
- 視訊關閉時顯示用戶頭像
- 視訊畫面自適應容器大小
- 支持多人同時視訊

## 技術細節

### 媒體設備權限
```javascript
// 語音通話
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: true, 
  video: false 
});

// 視訊通話
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: true, 
  video: true 
});
```

### 狀態管理
```javascript
const [groupCallState, setGroupCallState] = useState({ 
  type: '',           // 'audio' | 'video'
  members: [],        // [{ userId, username }]
  streams: {},        // { userId: MediaStream }
  visible: false,     // 彈窗顯示狀態
  isCaller: false,    // 是否為發起人
  groupId: '',        // 群組ID
  localStream: null,  // 本地媒體流
  isMuted: false,     // 靜音狀態
  isVideoOff: false   // 視訊關閉狀態
});
```

## 使用說明

### 發起群組通話
1. 在聊天界面點擊「群組語音」或「群組視訊」按鈕
2. 系統會請求麥克風/攝像頭權限
3. 授權後自動發送邀請給群組所有成員

### 加入群組通話
1. 收到通話邀請時會彈出通話窗口
2. 點擊「加入通話」按鈕
3. 授權媒體設備權限後即可加入

### 通話控制
- **靜音**: 關閉/開啟麥克風
- **視訊**: 關閉/開啟攝像頭（僅視訊通話）
- **離開**: 退出通話但不結束（其他人可繼續）
- **結束**: 結束整個通話（僅發起人可用）

### 查看已讀狀態
1. 只有最後一則訊息會顯示已讀頭像
2. 點擊已讀頭像可查看完整已讀名單
3. 已讀名單顯示用戶頭像和用戶名

## 注意事項

1. **瀏覽器兼容性**
   - 需要支持 WebRTC 的現代瀏覽器
   - 建議使用 Chrome、Firefox、Edge 最新版本

2. **權限要求**
   - 首次使用需授權麥克風/攝像頭權限
   - HTTPS 環境下才能訪問媒體設備

3. **網絡要求**
   - 穩定的網絡連接
   - 建議使用 TURN 服務器以支持 NAT 穿透

4. **性能考慮**
   - 群組通話成員過多可能影響性能
   - 建議控制在 8 人以內

## 後續優化建議

1. **WebRTC 完整實現**
   - 為每個成員建立獨立的 RTCPeerConnection
   - 實現完整的 ICE 候選交換
   - 添加連接質量監控

2. **UI/UX 改進**
   - 添加通話時長顯示
   - 添加網絡質量指示器
   - 支持畫面布局切換（網格/演講者模式）

3. **功能擴展**
   - 屏幕共享
   - 虛擬背景
   - 美顏濾鏡
   - 通話錄製

4. **已讀狀態優化**
   - 添加已讀時間顯示
   - 支持批量標記已讀
   - 未讀消息計數

## 測試建議

1. 測試不同瀏覽器的兼容性
2. 測試多人同時加入/離開通話
3. 測試網絡不穩定情況下的表現
4. 測試媒體設備權限被拒絕的情況
5. 測試已讀狀態在多設備間的同步
