@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo 正在添加 App.js 的更改...
echo ========================================
git add apps/web-pure/App.js

echo.
echo ========================================
echo 正在提交...
echo ========================================
git commit -m "fix: messageCache error and optimize chat height"

echo.
echo ========================================
echo 正在推送...
echo ========================================
git push origin main

echo.
echo ========================================
echo 完成！
echo ========================================
pause
