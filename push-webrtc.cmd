@echo off
cls
echo.
echo ========================================
echo   推送 WebRTC 實現
echo ========================================
echo.

git add -A
if errorlevel 1 goto error

git commit -m "feat: implement WebRTC for group audio/video calls with Mesh architecture"
if errorlevel 1 goto error

git push origin main
if errorlevel 1 goto error

echo.
echo ========================================
echo   成功！
echo ========================================
echo.
echo WebRTC 功能已推送到 GitHub
echo Render 和 Vercel 將在 2-5 分鐘內自動部署
echo.
echo 測試步驟:
echo 1. 用戶A 發起語音通話
echo 2. 用戶B 加入
echo 3. 檢查是否能聽到對方
echo.
goto end

:error
echo.
echo ========================================
echo   錯誤！
echo ========================================
echo.
echo 推送失敗，請檢查錯誤信息
echo.

:end
pause
