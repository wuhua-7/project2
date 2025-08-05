// API 配置 - 支援環境變數 (v3.0 - 終極快取清除)
const getApiUrl = () => {
  // 優先使用環境變數，否則使用預設值
  const apiUrl = process.env.REACT_APP_API_URL || 'https://project2-g1cl.onrender.com';
  console.log('使用雲端後端 URL (v3.0):', apiUrl);
  
  // 終極緩存清除 (v3.0)
  if (typeof window !== 'undefined') {
    // 清除所有可能的 API URL 緩存
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.toLowerCase().includes('api') || key.toLowerCase().includes('localhost') || key.toLowerCase().includes('glcl'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => window.localStorage.removeItem(key));
    
    // 清除 sessionStorage
    window.sessionStorage.clear();
    
    // 強制清除任何可能的錯誤 URL 引用
    if (window.location.href.includes('localhost') || window.location.href.includes('glcl')) {
      console.warn('檢測到錯誤 URL，強制清除快取');
      // 強制重新載入頁面
      if (window.location.href.includes('glcl')) {
        console.warn('檢測到舊的 glcl URL，強制重新載入');
        window.location.reload(true);
      }
    }
    
    // 檢查是否有任何地方使用了錯誤的 URL
    if (window.location.href.includes('glcl')) {
      console.error('檢測到錯誤的 glcl URL，強制重新導向');
      window.location.href = window.location.href.replace('glcl', 'g1cl');
    }
  }
  
  return apiUrl;
};

export const API_URL = getApiUrl();

// 导出配置对象
export const config = {
  API_URL,
  SOCKET_URL: API_URL, // Socket.IO 使用相同的 URL
  UPLOAD_URL: `${API_URL}/api/upload`,
  DOWNLOAD_URL: `${API_URL}/api/download`,
}; 