// API 配置
const getApiUrl = () => {
  // 优先使用环境变量
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // 检查是否在开发环境
  if (__DEV__) {
    return 'http://localhost:3001';
  }
  
  // 生产环境默认使用 Render 后端
  // 请根据您的实际 Render 后端 URL 修改
  return 'https://project2-glcl.onrender.com';
};

export const API_URL = getApiUrl();

// 导出配置对象
export const config = {
  API_URL,
  SOCKET_URL: API_URL, // Socket.IO 使用相同的 URL
  UPLOAD_URL: `${API_URL}/api/upload`,
  DOWNLOAD_URL: `${API_URL}/api/download`,
}; 