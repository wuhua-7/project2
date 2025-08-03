// 生產環境 API 配置 - 強制使用雲端後端
export const API_URL = 'https://project2-g1cl.onrender.com';

// 导出配置对象
export const config = {
  API_URL,
  SOCKET_URL: API_URL, // Socket.IO 使用相同的 URL
  UPLOAD_URL: `${API_URL}/api/upload`,
  DOWNLOAD_URL: `${API_URL}/api/download`,
}; 