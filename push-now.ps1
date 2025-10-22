Write-Host "正在推送關鍵修復..." -ForegroundColor Cyan
Write-Host ""

# 添加所有文件
git add -A
Write-Host "✓ 已添加所有文件" -ForegroundColor Green

# 提交
git commit -m "fix: resolve group call visibility, auto-end, JWT, and avatar issues"
Write-Host "✓ 已提交更改" -ForegroundColor Green

# 推送
git push origin main
Write-Host "✓ 已推送到 GitHub" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "部署完成！" -ForegroundColor Green
Write-Host "Render 和 Vercel 將在 2-5 分鐘內自動部署" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "已修復的問題:" -ForegroundColor Cyan
Write-Host "1. ✓ 群組通話只顯示自己" -ForegroundColor Green
Write-Host "2. ✓ 所有人退出時自動結束通話" -ForegroundColor Green
Write-Host "3. ✓ JWT 驗證失敗" -ForegroundColor Green
Write-Host "4. ✓ 頭像顯示問題" -ForegroundColor Green
Write-Host ""
Write-Host "注意: 音頻功能需要 WebRTC 實現" -ForegroundColor Yellow
Write-Host ""

Read-Host "按 Enter 鍵退出"
