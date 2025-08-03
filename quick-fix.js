#!/usr/bin/env node

/**
 * 快速修复 API URL 问题
 * 使用方法: node quick-fix.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 开始修复 API URL 配置...\n');

// 检查当前环境
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

console.log(`环境检测:`);
console.log(`- 生产环境: ${isProduction}`);
console.log(`- Vercel 部署: ${isVercel}`);
console.log(`- 当前 API URL: ${process.env.REACT_APP_API_URL || '未设置'}\n`);

// 检查配置文件
const webConfigPath = path.join(__dirname, 'apps/web-pure/config.js');
const mobileConfigPath = path.join(__dirname, 'apps/mobile/config.js');

console.log('📁 检查配置文件...');

if (fs.existsSync(webConfigPath)) {
  console.log('✅ web-pure/config.js 存在');
} else {
  console.log('❌ web-pure/config.js 不存在');
}

if (fs.existsSync(mobileConfigPath)) {
  console.log('✅ mobile/config.js 存在');
} else {
  console.log('❌ mobile/config.js 不存在');
}

console.log('\n🔍 检查环境变量...');

// 检查环境变量
const envVars = {
  'REACT_APP_API_URL': process.env.REACT_APP_API_URL,
  'EXPO_PUBLIC_API_URL': process.env.EXPO_PUBLIC_API_URL,
  'MONGODB_URI': process.env.MONGODB_URI ? '已设置' : '未设置',
  'JWT_SECRET': process.env.JWT_SECRET ? '已设置' : '未设置'
};

Object.entries(envVars).forEach(([key, value]) => {
  console.log(`${key}: ${value || '未设置'}`);
});

console.log('\n📋 修复建议:');

if (!process.env.REACT_APP_API_URL) {
  console.log('1. 在 Vercel 中设置环境变量 REACT_APP_API_URL');
  console.log('   值应该是您的 Render 后端 URL，例如: https://your-app.onrender.com');
}

if (!process.env.EXPO_PUBLIC_API_URL) {
  console.log('2. 在移动端应用中设置环境变量 EXPO_PUBLIC_API_URL');
}

console.log('\n3. 确保后端 CORS 配置包含您的前端域名');
console.log('4. 检查 MongoDB 连接是否正常');

console.log('\n🚀 立即修复步骤:');
console.log('1. 登录 Vercel 控制台');
console.log('2. 进入您的项目设置');
console.log('3. 在环境变量中添加:');
console.log('   REACT_APP_API_URL = https://your-backend-app.onrender.com');
console.log('4. 重新部署应用');

console.log('\n📞 如果问题仍然存在，请检查:');
console.log('- 后端服务是否正常运行');
console.log('- 网络连接是否正常');
console.log('- 浏览器控制台错误信息');

console.log('\n✅ 修复脚本执行完成！'); 