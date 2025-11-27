@echo off
git add -A
git commit -m "fix: 修復Vercel構建錯誤 - 將React.memo改為function聲明 - 兼容Expo構建環境"
git push origin main
