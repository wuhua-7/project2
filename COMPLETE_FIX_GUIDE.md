# WebRTC 完整修復指南

## 當前問題
1. ❌ 沒有頭像
2. ❌ 沒有聲音傳遞
3. ❌ 沒有綠色發光

## 診斷步驟

### 步驟 1: 打開瀏覽器控制台（F12）

在通話過程中，查找以下關鍵日誌：

#### 必須看到的日誌（按順序）：

**發起者（第一個加入的人）：**
```
✓ 發起者成功獲取音頻流 { audioTracks: 1 }
發起群組語音通話
```

**加入者（第二個加入的人）：**
```
✓ 成功獲取本地媒體流 { audioTracks: 1, videoTracks: 0 }
發送加入群組通話請求
收到現有成員列表: [...]
為現有成員創建 WebRTC 連接
創建 WebRTC 連接: [userId], isInitiator: true
添加本地軌道: audio { enabled: true, ... }
```

**雙方都應該看到：**
```
🔗 連接狀態 [userId]: connecting
🔗 連接狀態 [userId]: connected
✓ 與 [userId] 連接成功
收到遠程流: [userId]
音頻軌道數量: 1
為遠程用戶 [userId] 設置音頻檢測
設置音頻流: [username]
✓ [username] 的音頻開始播放
```

### 步驟 2: 如果沒有看到 "收到遠程流"

這意味著 WebRTC 連接失敗。可能的原因：

1. **防火牆阻擋**
   - 檢查防火牆設置
   - 嘗試關閉防火牆測試

2. **NAT 穿透失敗**
   - 需要 TURN 服務器
   - 當前只有 STUN 服務器

3. **信令失敗**
   - 檢查是否看到 "發送 offer 給: [userId]"
   - 檢查是否看到 "發送 answer 給: [userId]"

### 步驟 3: 如果看到 "收到遠程流" 但沒聲音

執行以下診斷命令：

```javascript
// 在控制台執行
document.querySelectorAll('audio').forEach((el, i) => {
  console.log(`Audio ${i}:`, {
    srcObject: !!el.srcObject,
    audioTracks: el.srcObject?.getAudioTracks().length,
    paused: el.paused,
    muted: el.muted,
    volume: el.volume,
    readyState: el.readyState
  });
  
  // 嘗試播放
  if (el.srcObject) {
    el.play().then(() => {
      console.log(`✓ Audio ${i} 播放成功`);
    }).catch(err => {
      console.error(`✗ Audio ${i} 播放失敗:`, err);
    });
  }
});
```

### 步驟 4: 檢查音頻軌道狀態

```javascript
// 在控制台執行
document.querySelectorAll('audio').forEach((el, i) => {
  if (el.srcObject) {
    const tracks = el.srcObject.getAudioTracks();
    tracks.forEach((track, j) => {
      console.log(`Audio ${i} Track ${j}:`, {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    });
  }
});
```

## 常見問題和解決方案

### 問題 1: 連接狀態一直是 "connecting"

**原因**: ICE candidate 交換失敗或 NAT 穿透失敗

**解決方案**:
1. 檢查網絡環境（是否在同一局域網）
2. 嘗試使用 4G/5G 網絡
3. 需要配置 TURN 服務器

### 問題 2: 音頻元素沒有 srcObject

**原因**: 遠程流沒有正確設置到音頻元素

**解決方案**:
查看控制台是否有 "設置音頻流" 的日誌

### 問題 3: 音頻元素有 srcObject 但 paused = true

**原因**: 自動播放被瀏覽器阻止

**解決方案**:
手動點擊頁面任意位置，然後在控制台執行：
```javascript
document.querySelectorAll('audio').forEach(el => el.play());
```

### 問題 4: 頭像不顯示

**原因**: 成員數據沒有包含 avatar 字段

**解決方案**:
查看控制台日誌：
```
收到 member-joined 事件 { joinedUserId: "...", joinedUsername: "...", joinedAvatar: "..." }
```

如果沒有 `joinedAvatar`，說明後端沒有發送頭像數據。

## 緊急修復命令

如果一切都失敗了，在控制台執行以下命令強制播放：

```javascript
// 強制播放所有音頻
setInterval(() => {
  document.querySelectorAll('audio').forEach(el => {
    if (el.srcObject && el.paused) {
      el.play().catch(() => {});
    }
  });
}, 1000);
```

## 需要提供的信息

如果問題仍然存在，請提供：

1. **完整的控制台日誌**（從加入通話開始）
2. **網絡環境**（WiFi / 4G / 5G / 有線）
3. **設備信息**（瀏覽器版本、操作系統）
4. **是否在同一局域網**
5. **防火牆狀態**（開啟 / 關閉）
