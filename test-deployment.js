const https = require('https');

const BACKEND_URL = 'https://project2-g1cl.onrender.com';
const FRONTEND_URL = 'https://project2-omega-seven.vercel.app';

console.log('🚀 開始測試部署...\n');

// 測試後端連接
function testBackend() {
  return new Promise((resolve, reject) => {
    const req = https.request(`${BACKEND_URL}`, {
      method: 'GET',
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ 後端連接成功:', data.trim());
          resolve();
        } else {
          reject(new Error(`後端狀態碼: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('後端連接超時')));
    req.end();
  });
}

// 測試前端連接
function testFrontend() {
  return new Promise((resolve, reject) => {
    const req = https.request(`${FRONTEND_URL}`, {
      method: 'GET',
      timeout: 10000
    }, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ 前端連接成功');
        resolve();
      } else {
        reject(new Error(`前端狀態碼: ${res.statusCode}`));
      }
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('前端連接超時')));
    req.end();
  });
}

// 測試註冊功能
function testRegister() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      username: `testuser${Date.now()}`,
      password: 'testpass123',
      email: `test${Date.now()}@example.com`
    });

    const req = https.request(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          console.log('✅ 註冊功能正常，獲得 token');
          resolve(response.token);
        } else {
          reject(new Error(`註冊失敗: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('註冊請求超時')));
    req.write(postData);
    req.end();
  });
}

// 執行所有測試
async function runTests() {
  try {
    await testBackend();
    await testFrontend();
    const token = await testRegister();
    
    console.log('\n🎉 所有測試通過！');
    console.log('\n📋 使用指南:');
    console.log('1. 訪問前端: https://project2-omega-seven.vercel.app');
    console.log('2. 註冊新用戶（密碼需至少8碼且包含字母與數字）');
    console.log('3. 登入並開始使用聊天功能');
    console.log('\n🔧 如需設置環境變數，在 Vercel 中添加:');
    console.log('   REACT_APP_API_URL=https://project2-g1cl.onrender.com');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
  }
}

runTests(); 