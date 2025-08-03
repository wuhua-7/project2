# 部署指南 - Render + Vercel

## 问题描述
当使用 Render 部署后端和 Vercel 部署前端时，前端应用尝试连接到 `localhost:3001`，导致连接失败。

## 解决方案

### 1. 后端部署 (Render)

#### 1.1 创建 Render 应用
1. 登录 [Render](https://render.com)
2. 创建新的 Web Service
3. 连接您的 GitHub 仓库
4. 设置构建配置：
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm run dev`

#### 1.2 环境变量配置
在 Render 控制台中设置以下环境变量：

```
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/chat-app
JWT_SECRET=your-secret-key-here
PORT=10000
```

#### 1.3 获取后端 URL
部署完成后，您会得到一个类似 `https://your-app-name.onrender.com` 的 URL。

### 2. 前端部署 (Vercel)

#### 2.1 创建 Vercel 应用
1. 登录 [Vercel](https://vercel.com)
2. 导入您的 GitHub 仓库
3. 设置构建配置：
   - **Framework Preset**: Expo
   - **Root Directory**: `apps/web-pure`

#### 2.2 环境变量配置
在 Vercel 控制台中设置以下环境变量：

```
REACT_APP_API_URL=https://your-app-name.onrender.com
```

**重要**: 将 `your-app-name.onrender.com` 替换为您实际的 Render 后端 URL。

### 3. 移动端配置

#### 3.1 本地开发
在 `apps/mobile` 目录下创建 `.env` 文件：

```
EXPO_PUBLIC_API_URL=http://localhost:3001
```

#### 3.2 生产环境
在 `apps/mobile` 目录下创建 `.env.production` 文件：

```
EXPO_PUBLIC_API_URL=https://your-app-name.onrender.com
```

### 4. 验证配置

#### 4.1 检查前端配置
确保 `apps/web-pure/config.js` 中的默认 URL 已更新：

```javascript
// 生产环境默认使用 Render 后端
return 'https://your-app-name.onrender.com';
```

#### 4.2 检查移动端配置
确保 `apps/mobile/config.js` 中的默认 URL 已更新：

```javascript
// 生产环境默认使用 Render 后端
return 'https://your-app-name.onrender.com';
```

### 5. 常见问题

#### 5.1 CORS 错误
如果遇到 CORS 错误，确保后端 `server.js` 中的 `allowedOrigins` 包含您的前端域名：

```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:19006',
  'http://localhost:8081',
  'http://192.168.1.121:8081',
  'https://your-frontend-app.vercel.app', // 添加您的前端域名
];
```

#### 5.2 MongoDB 连接问题
确保 MongoDB Atlas 集群的 IP 白名单包含 Render 的 IP 范围，或者设置为 `0.0.0.0/0`（允许所有 IP）。

#### 5.3 环境变量未生效
- 确保环境变量名称正确（`REACT_APP_` 前缀用于 React 应用）
- 重新部署应用以应用新的环境变量
- 检查 Vercel 和 Render 的环境变量设置

### 6. 测试部署

1. 访问您的前端应用 URL
2. 尝试登录/注册
3. 检查浏览器控制台是否有错误
4. 测试消息发送和接收功能

### 7. 监控和日志

- **Render**: 在控制台查看应用日志
- **Vercel**: 在控制台查看部署日志
- **浏览器**: 使用开发者工具检查网络请求

## 总结

通过正确配置环境变量，您的前端应用将能够连接到 Render 上部署的后端服务，解决 `localhost:3001` 连接失败的问题。 