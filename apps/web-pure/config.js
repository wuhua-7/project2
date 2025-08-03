// API 配置
const getApiUrl = () => {
  // 优先使用环境变量
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // 检查是否在开发环境
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001';
  }
  
  // 生产环境强制使用 Render 后端
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