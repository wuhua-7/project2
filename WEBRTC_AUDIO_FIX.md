# WebRTC 通話音頻修復摘要

## 問題描述
群組通話時沒有聲音，無法聽到其他參與者的語音。

## 根本原因分析

### 1. 音頻元素缺少手動播放調用
在群組通話的音頻元素中，雖然設置了 `autoPlay` 屬性，但在某些瀏覽器中（特別是 Chrome 和 Safari），由於自動播放策略的限制，音頻可能不會自動播放。

### 2. createAnswer 缺少音頻接收選項
在處理 WebRTC offer 時，`createAnswer()` 沒有明確指定 `offerToReceiveAudio: true`，可能導致音頻軌道協商失敗。

### 3. getUserMedia 音頻約束不完整
音頻捕獲時沒有啟用回音消除、噪音抑制等重要的音頻處理選項，可能影響音頻質量。

## 已實施的修復

### 修復 1: 添加手動播放調用
**位置**: `apps/web-pure/App.js` (約第 3843 行)

```javascript
// 修復前
<audio
  autoPlay
  ref={el => {
    if (el && groupCallState.streams[member.userId] && member.userId !== userId) {
      el.srcObject = groupCallState.streams[member.userId];
    }
  }}
/>

// 修復後
<audio
  autoPlay
  ref={el => {
    if (el && groupCallState.streams[member.userId] && member.userId !== userId) {
      el.srcObject = groupCallState.streams[member.userId];
      // 確保音頻播放
      el.play().catch(err => console.error('音頻播放失敗:', err));
    }
  }}
/>
```

### 修復 2: 完善 createAnswer 配置
**位置**: `apps/web-pure/App.js` (約第 2298 行)

```javascript
// 修復前
const answer = await pc.createAnswer();

// 修復後
const answer = await pc.createAnswer({
  offerToReceiveAudio: true,
  offerToReceiveVideo: groupCallState.type === 'video'
});
```

### 修復 3: 優化音頻捕獲配置
**位置**: `apps/web-pure/App.js` (約第 2169 行)

```javascript
// 修復前
const stream = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: isVideo
});

// 修復後
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,    // 回音消除
    noiseSuppression: true,    // 噪音抑制
    autoGainControl: true      // 自動增益控制
  },
  video: isVideo
});
```

### 修復 4: 增強調試日誌
添加了詳細的音頻軌道狀態日誌，幫助診斷問題：

```javascript
// 在 ontrack 事件中
const audioTracks = stream.getAudioTracks();
console.log(`音頻軌道數量: ${audioTracks.length}`);

audioTracks.forEach((track, index) => {
  console.log(`音頻軌道 ${index}:`, {
    id: track.id,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState
  });
});
```

## 測試步驟

### 1. 使用測試工具
打開 `test-webrtc-audio.html` 文件進行基礎音頻測試：
- 測試麥克風權限
- 測試音頻捕獲
- 測試本地播放（回音測試）

### 2. 實際通話測試
1. 啟動應用並登入兩個不同的帳號
2. 在同一個群組中發起語音通話
3. 另一個用戶加入通話
4. 檢查瀏覽器控制台的日誌輸出
5. 確認能聽到對方的聲音

### 3. 檢查控制台日誌
應該看到以下日誌：
```
創建 WebRTC 連接: [userId], isInitiator: true/false
添加本地軌道: audio { id: ..., enabled: true, muted: false, readyState: "live" }
收到遠程流: [userId] MediaStream {...}
音頻軌道數量: 1
音頻軌道 0: { id: ..., enabled: true, muted: false, readyState: "live" }
```

## 常見問題排查

### 問題 1: 仍然沒有聲音
**檢查項目**:
- 瀏覽器是否授予了麥克風權限
- 檢查系統音量和瀏覽器音量設置
- 查看控制台是否有 "音頻播放失敗" 錯誤
- 確認音頻軌道的 `enabled` 和 `readyState` 狀態

**解決方案**:
```javascript
// 在瀏覽器控制台手動測試
const audioElement = document.querySelector('audio');
console.log('Audio element:', audioElement);
console.log('srcObject:', audioElement.srcObject);
console.log('Audio tracks:', audioElement.srcObject?.getAudioTracks());
```

### 問題 2: 音頻斷斷續續
**可能原因**:
- 網絡連接不穩定
- ICE candidate 交換失敗
- STUN/TURN 服務器配置問題

**解決方案**:
檢查 WebRTC 連接狀態：
```javascript
pc.onconnectionstatechange = () => {
  console.log('連接狀態:', pc.connectionState);
  console.log('ICE 連接狀態:', pc.iceConnectionState);
};
```

### 問題 3: 只有一方能聽到聲音
**可能原因**:
- 音頻軌道方向設置不對稱
- createOffer/createAnswer 配置不一致

**解決方案**:
確保雙方都正確設置了音頻接收選項（已在修復 2 中實施）

## 瀏覽器兼容性

| 瀏覽器 | 版本要求 | 注意事項 |
|--------|---------|---------|
| Chrome | 74+ | 需要 HTTPS 或 localhost |
| Firefox | 66+ | 完全支援 |
| Safari | 12+ | 需要用戶手勢觸發 getUserMedia |
| Edge | 79+ | 基於 Chromium，同 Chrome |

## 後續優化建議

1. **添加 TURN 服務器**: 當前只使用 STUN 服務器，在某些網絡環境下可能無法建立連接
2. **實現音頻質量自適應**: 根據網絡狀況動態調整音頻比特率
3. **添加音頻可視化**: 顯示說話者的音量波形
4. **實現靜音檢測**: 自動檢測並提示用戶麥克風被靜音
5. **添加音頻錄製功能**: 允許用戶錄製通話內容

## 相關文件
- `apps/web-pure/App.js` - 主要修復文件
- `test-webrtc-audio.html` - 音頻測試工具
- `backend/src/server.js` - WebRTC 信令服務器

## 修復日期
2025-11-23
