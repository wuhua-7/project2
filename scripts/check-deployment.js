// 檢查 Render 部署狀態
async function checkDeployment() {
  const baseUrl = 'https://project2-g1cl.onrender.com';
  
  console.log('🚀 檢查 Render 部署狀態...\n');
  console.log(`目標 URL: ${baseUrl}`);
  console.log(`檢查時間: ${new Date().toLocaleString()}\n`);
  
  // 等待部署完成的函數
  async function waitForDeployment(maxAttempts = 20, interval = 30000) {
    for (let i = 1; i <= maxAttempts; i++) {
      console.log(`🔍 第 ${i}/${maxAttempts} 次檢查...`);
      
      try {
        // 檢查健康端點
        const healthResponse = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          console.log('✅ 服務器健康檢查通過:', healthData);
          
          // 檢查 CORS 配置
          console.log('🔍 檢查 CORS 配置...');
          const corsResponse = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'OPTIONS',
            headers: {
              'Origin': 'https://project2-g1cl.onrender.com',
              'Access-Control-Request-Method': 'POST',
              'Access-Control-Request-Headers': 'Content-Type'
            }
          });
          
          if (corsResponse.ok) {
            console.log('✅ CORS 配置正常');
            console.log('🎉 部署成功！應用已就緒');
            return true;
          } else {
            console.log('⚠️ CORS 配置可能有問題，狀態碼:', corsResponse.status);
          }
        } else {
          console.log(`⚠️ 健康檢查失敗，狀態碼: ${healthResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ 連接失敗: ${error.message}`);
      }
      
      if (i < maxAttempts) {
        console.log(`⏳ 等待 ${interval/1000} 秒後重試...\n`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    console.log('❌ 部署檢查超時，請手動檢查 Render 控制台');
    return false;
  }
  
  const success = await waitForDeployment();
  
  if (success) {
    console.log('\n🎯 下一步操作:');
    console.log('1. 打開瀏覽器訪問: https://project2-g1cl.onrender.com');
    console.log('2. 測試登入功能');
    console.log('3. 檢查控制台是否還有 CORS 錯誤');
    console.log('4. 測試群組功能和頭像顯示');
  } else {
    console.log('\n🔧 故障排除建議:');
    console.log('1. 檢查 Render 控制台的部署日誌');
    console.log('2. 確認環境變數設置正確');
    console.log('3. 檢查 MongoDB 連接狀態');
    console.log('4. 查看服務器錯誤日誌');
  }
}

// 檢查是否在 Node.js 環境中運行
if (typeof fetch === 'undefined') {
  // 如果沒有 fetch，提供替代方案
  const https = require('https');
  
  global.fetch = function(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const req = https.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: () => Promise.resolve(JSON.parse(data)),
            text: () => Promise.resolve(data)
          });
        });
      });
      
      req.on('error', reject);
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  };
}

checkDeployment().catch(console.error);