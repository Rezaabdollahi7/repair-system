@echo off
cd /d "%~dp0"
start http://192.168.1.150:5173
echo.
echo ============================================
echo   Server running on http://192.168.1.150:5173
echo   Press Ctrl+C to stop
echo ============================================
echo.
node server.js
pause