@echo off
echo ========================================
echo 部署關鍵修復
echo ========================================
echo.
echo 修復內容:
echo 1. 群組通話只顯示自己 - 已修復
echo 2. 所有人退出時自動結束通話 - 已修復
echo 3. JWT 驗證失敗 - 已修復
echo 4. 頭像顯示問題 - 已修復
echo.
echo 注意: 音頻功能需要 WebRTC 實現
echo.
pause

git add -A
git commit -m "fix: resolve group call visibility, auto-end, JWT, and avatar issues"
git push origin main

echo.
echo ========================================
echo 完成！等待自動部署（2-5分鐘）
echo ========================================
pause
