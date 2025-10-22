# WebRTC 群組通話實現

## 🎯 架構說明

實現了 **WebRTC Mesh** 架構，類似 Discord 的早期版本。

### Mesh 架構特點
- 每個用戶與其他所有用戶建立 P2P 連接
- 適合小型群組（2-8人）
- 無需額外媒體服務器
- 低延遲

### 連接流程

```
用戶A (發起者)
  ↓
發起通話
  ↓
用戶B 加入 → 創建 A↔B 連接
  ↓
用戶C 加入 → 創建 A↔C 和 B↔C 連接
```

## 📝 實現細節

### 1. 狀態管理
```javascript
const [peerConnections, setPeerConnections] = useState(new Map());
// Map<userId, RTCPeerConnection>
```

### 2. 核心函數

#### createPeerConnection(remoteUserId, isInitiator, localStream)
- 創建 RTCPeerConnection
- 添加本地媒體軌道
- 設置事件監聽器（ontrack, onicecandidate）
- 如果是發起者，創建並發送 offer

#### handleWebRTCSignal(fromUserId, signal)
- 處理收到的 WebRTC 信令
- 支持三種信令類型：
  - `offer`: 設置遠程描述，創建並發送 answer
  - `answer`: 設置遠程描述
  - `ice-candidate`: 添加 ICE candidate

### 3. Socket 事件

#### group-call:signal
```javascript
{
  groupId: string,
  targetUserId: string,
  signal: {
    type: 'offer' | 'answer' | 'ice-candidate',
    sdp?: RTCSessionDescription,
    candidate?: RTCIceCandidate
  }
}
```

#### group-call:existing-members
- 新用戶加入時收到現有成員列表
- 為每個現有成員創建 WebRTC 連接（作為發起者）

#### group-call:member-joined
- 其他用戶收到新成員加入通知
- 等待新成員發起連接（不主動創建）

### 4. ICE 服務器配置
```javascript
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
```

## 🔧 工作流程

### 發起通話
1. 用戶A 點擊"群組語音/視訊"
2. 獲取本地媒體流
3. 發送 `group-call:invite` 事件
4. 設置通話狀態

### 加入通話
1. 用戶B 收到通知或點擊"加入"
2. 獲取本地媒體流
3. 發送 `group-call:join` 事件
4. 收到 `group-call:existing-members`（包含用戶A）
5. 為用戶A 創建 WebRTC 連接（作為發起者）
6. 創建 offer 並發送給用戶A
7. 用戶A 收到 offer，創建 answer 並發送回用戶B
8. 交換 ICE candidates
9. 連接建立，開始傳輸音視頻

### 第三人加入
1. 用戶C 加入
2. 收到現有成員列表（用戶A 和 B）
3. 為 A 和 B 分別創建連接
4. A 和 B 收到 C 的 offer
5. 建立 A↔C 和 B↔C 連接

### 離開通話
1. 停止本地媒體流
2. 關閉所有 WebRTC 連接
3. 如果是最後一人，結束通話
4. 清理狀態

## 🎨 UI 更新

### 遠程流顯示
```javascript
pc.ontrack = (event) => {
  setGroupCallState(prev => ({
    ...prev,
    streams: {
      ...prev.streams,
      [remoteUserId]: event.streams[0]
    }
  }));
};
```

### 視訊元素
```jsx
<video
  autoPlay
  playsInline
  muted={member.userId === userId}
  ref={el => {
    if (el && groupCallState.streams[member.userId]) {
      el.srcObject = groupCallState.streams[member.userId];
    }
  }}
/>
```

## 🐛 調試

### 控制台日誌
- `創建 WebRTC 連接: ${userId}`
- `收到遠程流: ${userId}`
- `發送 ICE candidate 給: ${userId}`
- `連接狀態 ${userId}: ${state}`

### 常見問題

#### 1. 沒有音頻/視訊
- 檢查瀏覽器權限
- 檢查 `getUserMedia` 是否成功
- 檢查 ICE 連接狀態

#### 2. 連接失敗
- 檢查 STUN 服務器是否可達
- 檢查防火牆設置
- 可能需要 TURN 服務器（NAT 穿透）

#### 3. 音頻延遲
- Mesh 架構的限制
- 考慮升級到 SFU 架構

## 📊 性能考慮

### Mesh 架構限制
- **2-4 人**: 良好
- **5-8 人**: 可接受
- **8+ 人**: 不推薦（考慮 SFU）

### 帶寬計算
每個用戶需要：
- 上傳: (n-1) × 流帶寬
- 下載: (n-1) × 流帶寬

例如 4 人通話，每人需要：
- 上傳: 3 × 500kbps = 1.5Mbps
- 下載: 3 × 500kbps = 1.5Mbps

## 🚀 未來改進

### 短期
- [ ] 添加 TURN 服務器（NAT 穿透）
- [ ] 連接質量指示器
- [ ] 自動重連機制

### 長期
- [ ] 升級到 SFU 架構（支持更多人）
- [ ] 屏幕分享
- [ ] 錄音功能
- [ ] 背景模糊

## 🔗 參考資料

- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [Perfect Negotiation Pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)

## 📝 測試清單

- [ ] 2人語音通話
- [ ] 2人視訊通話
- [ ] 3人語音通話
- [ ] 3人視訊通話
- [ ] 中途加入
- [ ] 中途離開
- [ ] 最後一人離開自動結束
- [ ] 網絡斷開重連
- [ ] 跨瀏覽器測試（Chrome, Firefox, Safari）
