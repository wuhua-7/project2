@echo off
echo ========================================
echo 提交修復並部署
echo ========================================
echo.

git add -A
echo 已添加所有文件...
echo.

git commit -m "fix: resolve video black screen, invite format, and profile edit issues"
echo 已提交更改...
echo.

git push origin main
echo 已推送到GitHub...
echo.

echo ========================================
echo 完成！等待自動部署（2-5分鐘）
echo ========================================
pause
