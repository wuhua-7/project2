@echo off
chcp 65001

REM 關閉已存在的 node、npm、expo 相關進程（排除 PID 0）
for /f "tokens=2" %%a in ('tasklist ^| findstr /I "node.exe"') do (
  if not "%%a"=="0" (
    taskkill /F /PID %%a
  )
)
for /f "tokens=2" %%a in ('tasklist ^| findstr /I "npm.exe"') do (
  if not "%%a"=="0" (
    taskkill /F /PID %%a
  )
)
for /f "tokens=2" %%a in ('tasklist ^| findstr /I "expo.exe"') do (
  if not "%%a"=="0" (
    taskkill /F /PID %%a
  )
)

REM 釋放常用端口（只 kill 非 0 的 PID）
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8081') do if not "%%a"=="0" taskkill /PID %%a /F
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do if not "%%a"=="0" taskkill /PID %%a /F
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :19006') do if not "%%a"=="0" taskkill /PID %%a /F
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :19007') do if not "%%a"=="0" taskkill /PID %%a /F

REM 啟動本地 MongoDB 服務（如果已啟動會自動略過）
net start MongoDB

REM 啟動 Backend
start "Backend" cmd /k "cd /d %~dp0backend && npm run dev & pause"

REM 啟動 Mobile (Expo) 使用 19007 端口
start "Mobile" cmd /k "cd /d %~dp0apps\mobile && npx expo start -- --port 19007 & pause"

REM 啟動 web-pure 前端 Web LAN 服務（用 npx expo --lan，手機可在同一 WiFi 下訪問）
start "Web LAN" cmd /k "cd /d %~dp0apps\web-pure && npx expo start --web --lan"

REM 打開 http://192.168.1.121:8081
start http://192.168.1.121:8081

echo.
echo 所有服務已啟動於獨立視窗！
pause 