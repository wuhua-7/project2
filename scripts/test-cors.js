const https = require('https');

// 測試 CORS 和 API 連接
async function testCORS() {
  console.log('🔍 測試 CORS 和 API 連接...\n');
  
  const baseUrl = 'https://project2-g1cl.onrender.com';
  
  // 測試 1: 健康檢查
  console.log('1. 測試健康檢查端點...');
  try {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    console.log('✅ 健康檢查成功:', data);
  } catch (error) {
    console.log('❌ 健康檢查失敗:', error.message);
  }
  
  // 測試 2: OPTIONS 預檢請求
  console.log('\n2. 測試 OPTIONS 預檢請求...');
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://project2-g1cl.onrender.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    console.log('✅ OPTIONS 請求成功:', response.status);
    console.log('CORS 標頭:', {
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
      'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials')
    });
  } catch (error) {
    console.log('❌ OPTIONS 請求失敗:', error.message);
  }
  
  // 測試 3: 實際登入請求
  console.log('\n3. 測試登入請求...');
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://project2-g1cl.onrender.com'
      },
      credentials: 'include',
      body: JSON.stringify({
        username: 'test',
        password: 'test123'
      })
    });
    
    console.log('登入請求狀態:', response.status);
    const data = await response.json();
    console.log('登入響應:', data);
    
    if (response.ok) {
      console.log('✅ 登入請求成功');
    } else {
      console.log('⚠️ 登入請求失敗（可能是帳號不存在，但 CORS 正常）');
    }
  } catch (error) {
    console.log('❌ 登入請求失敗:', error.message);
  }
}

// 如果是 Node.js 環境，使用 node-fetch
if (typeof fetch === 'undefined') {
  console.log('Node.js 環境，需要安裝 node-fetch');
  console.log('請執行: npm install node-fetch');
  process.exit(1);
}

testCORS().catch(console.error);