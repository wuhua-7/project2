// API 配置 - 支援環境變數
const getApiUrl = () => {
  // 優先使用環境變數，否則使用預設值
  const apiUrl = process.env.REACT_APP_API_URL || 'https://project2-g1cl.onrender.com';
  console.log('使用雲端後端 URL:', apiUrl);
  
  // 終極緩存清除
  if (typeof window !== 'undefined') {
    // 清除所有可能的 API URL 緩存
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.toLowerCase().includes('api') || key.toLowerCase().includes('localhost'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => window.localStorage.removeItem(key));
    
    // 清除 sessionStorage
    window.sessionStorage.clear();
    
    // 強制清除任何可能的 localhost 引用
    if (window.location.href.includes('localhost')) {
      console.warn('檢測到 localhost URL，強制重定向到雲端');
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