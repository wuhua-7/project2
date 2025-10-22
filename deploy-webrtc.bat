@echo off
echo ========================================
echo 部署 WebRTC 群組通話功能
echo ========================================
echo.
echo 新功能:
echo ✓ WebRTC Mesh 架構
echo ✓ 真實的音視頻傳輸
echo ✓ P2P 連接（低延遲）
echo ✓ 支持 2-8 人群組通話
echo.
echo 架構: 類似 Discord 早期版本
echo.
pause

git add -A
git commit -m "feat: implement WebRTC for group audio/video calls"
git push origin main

echo.
echo ========================================
echo 完成！等待自動部署（2-5分鐘）
echo ========================================
echo.
echo 測試步驟:
echo 1. 用戶A 發起通話
echo 2. 用戶B 加入
echo 3. 檢查是否能聽到/看到對方
echo 4. 用戶C 加入測試多人
echo.
pause
