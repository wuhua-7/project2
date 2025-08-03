// API 配置 - 強制使用雲端後端
const getApiUrl = () => {
  // 強制使用雲端後端，忽略環境變量
  return 'https://project2-g1cl.onrender.com';
};

export const API_URL = getApiUrl();

// 导出配置对象
export const config = {
  API_URL,
  SOCKET_URL: API_URL, // Socket.IO 使用相同的 URL
  UPLOAD_URL: `${API_URL}/api/upload`,
  DOWNLOAD_URL: `${API_URL}/api/download`,
}; 