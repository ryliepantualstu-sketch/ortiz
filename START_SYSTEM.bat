@echo off
REM Ortiz Optical System - Startup Script
REM This script starts both the backend API and opens the frontend in the browser

cls
echo.
echo ================================================
echo   ORTIZ OPTICAL SYSTEM STARTUP
echo ================================================
echo.

REM Kill any existing Node processes
echo [1/4] Cleaning up existing processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Start the backend server
echo [2/4] Starting backend API server...
cd /d "%~dp0backend"
start "Ortiz Optical Backend" cmd /k npm run dev
timeout /t 5 /nobreak >nul

REM Open the frontend in default browser
echo [3/4] Opening frontend in browser...
timeout /t 2 /nobreak >nul

cd /d "%~dp0"
start "" "%SYSTEMROOT%\explorer.exe" "file:///C:/Users/user/Documents/Ortiz Optical/frontend/public/index.html"

echo.
echo [4/4] System startup complete!
echo.
echo ================================================
echo   SYSTEM STATUS
echo ================================================
echo.
echo Backend API: http://localhost:3000
echo Frontend:    Opening in browser...
echo.
echo Keep this window open while using the system.
echo Press Ctrl+C to stop the backend server.
echo.
