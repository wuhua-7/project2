#!/bin/bash

echo "🚀 開始構建項目..."

# 安裝後端依賴
echo "📦 安裝後端依賴..."
cd backend
npm install

# 返回根目錄
cd ..

echo "✅ 構建完成！"