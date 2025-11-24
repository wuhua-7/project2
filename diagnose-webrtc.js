// WebRTC 通話診斷腳本
// 在瀏覽器控制台中運行此腳本來診斷問題

console.log('=== WebRTC 通話診斷開始 ===\n');

// 1. 檢查音頻元素
console.log('1. 檢查音頻元素:');
const audioElements = document.querySelectorAll('audio');
console.log(`   找到 ${audioElements.length} 個音頻元素`);

audioElements.forEach((el, i) => {
  console.log(`\n   音頻元素 ${i}:`);
  console.log(`   - srcObject:`, el.srcObject);
  console.log(`   - paused:`, el.paused);
  console.log(`   - muted:`, el.muted);
  console.log(`   - volume:`, el.volume);
  console.log(`   - readyState:`, el.readyState);
  console.log(`   - networkState:`, el.networkState);
  
  if (el.srcObject) {
    const audioTracks = el.srcObject.getAudioTracks();
    const videoTracks = el.srcObject.getVideoTracks();
    console.log(`   - 音頻軌道數量:`, audioTracks.length);
    console.log(`   - 視頻軌道數量:`, videoTracks.length);
    
    audioTracks.forEach((track, j) => {
      console.log(`     音頻軌道 ${j}:`, {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    });
  }
});

// 2. 檢查視頻元素（可能包含音頻）
console.log('\n2. 檢查視頻元素:');
const videoElements = document.querySelectorAll('video');
console.log(`   找到 ${videoElements.length} 個視頻元素`);

videoElements.forEach((el, i) => {
  console.log(`\n   視頻元素 ${i}:`);
  console.log(`   - srcObject:`, el.srcObject);
  console.log(`   - paused:`, el.paused);
  console.log(`   - muted:`, el.muted);
  console.log(`   - volume:`, el.volume);
  
  if (el.srcObject) {
    const audioTracks = el.srcObject.getAudioTracks();
    const videoTracks = el.srcObject.getVideoTracks();
    console.log(`   - 音頻軌道數量:`, audioTracks.length);
    console.log(`   - 視頻軌道數量:`, videoTracks.length);
    
    audioTracks.forEach((track, j) => {
      console.log(`     音頻軌道 ${j}:`, {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    });
  }
});

// 3. 檢查麥克風權限
console.log('\n3. 檢查麥克風權限:');
if (navigator.permissions) {
  navigator.permissions.query({ name: 'microphone' }).then(result => {
    console.log(`   麥克風權限狀態: ${result.state}`);
  }).catch(err => {
    console.log(`   無法查詢麥克風權限:`, err);
  });
} else {
  console.log('   瀏覽器不支援 Permissions API');
}

// 4. 測試音頻播放
console.log('\n4. 測試音頻播放:');
audioElements.forEach((el, i) => {
  if (el.srcObject) {
    console.log(`   嘗試播放音頻元素 ${i}...`);
    el.play()
      .then(() => console.log(`   ✓ 音頻元素 ${i} 播放成功`))
      .catch(err => console.error(`   ✗ 音頻元素 ${i} 播放失敗:`, err));
  }
});

// 5. 檢查系統音量（無法直接檢測，但可以提示）
console.log('\n5. 請手動檢查:');
console.log('   - 系統音量是否開啟');
console.log('   - 瀏覽器標籤頁是否被靜音（右鍵點擊標籤頁查看）');
console.log('   - 耳機/揚聲器是否正常工作');

// 6. 檢查 WebRTC 統計信息（如果可用）
console.log('\n6. WebRTC 連接統計:');
console.log('   請在控制台中查找以下日誌:');
console.log('   - "創建 WebRTC 連接"');
console.log('   - "添加本地軌道"');
console.log('   - "收到遠程流"');
console.log('   - "音頻軌道數量"');

console.log('\n=== 診斷完成 ===');
console.log('\n請將以上所有輸出截圖或複製給開發者');
