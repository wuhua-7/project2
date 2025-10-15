import { API_URL } from '../config.js';

// 檢查服務器狀態
export async function checkServerStatus() {
  try {
    console.log('檢查服務器狀態:', API_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超時
    
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      mode: 'cors',
      credentials: 'include',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log('服務器狀態正常:', data);
      return { status: 'ok', data };
    } else {
      console.warn('服務器響應異常:', response.status, response.statusText);
      return { status: 'error', error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error('服務器檢查失敗:', error);
    if (error.name === 'AbortError') {
      return { status: 'timeout', error: '服務器響應超時' };
    }
    return { status: 'error', error: error.message };
  }
}

// 等待服務器就緒
export async function waitForServer(maxRetries = 5, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    console.log(`嘗試連接服務器 (${i + 1}/${maxRetries})...`);
    
    const result = await checkServerStatus();
    
    if (result.status === 'ok') {
      console.log('服務器已就緒！');
      return true;
    }
    
    if (i < maxRetries - 1) {
      console.log(`等待 ${delay/1000} 秒後重試...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error('服務器連接失敗，已達到最大重試次數');
  return false;
}