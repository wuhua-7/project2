@echo off
cls
echo.
echo ========================================
echo   修復頭像顯示問題
echo ========================================
echo.
echo 修復內容:
echo 1. 訊息發送者頭像顯示
echo 2. 已讀頭像顯示
echo 3. 後端返回完整用戶信息
echo.

git add -A
git commit -m "fix: resolve avatar display issues for messages and read receipts"
git push origin main

echo.
echo ========================================
echo   完成！
echo ========================================
echo.
echo 修復說明:
echo - 後端 API 現在返回 senderInfo (包含頭像)
echo - 前端 getUserAvatar 支持 senderInfo
echo - 已讀頭像使用 readBy 用戶的頭像信息
echo - 添加錯誤處理和調試日誌
echo.
pause
