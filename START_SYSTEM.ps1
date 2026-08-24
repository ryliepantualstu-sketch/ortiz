# Ortiz Optical System - PowerShell Startup Script
# This script starts both the backend API and opens the frontend in the browser

function Show-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  ORTIZ OPTICAL SYSTEM STARTUP" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Stop-ExistingProcesses {
    Write-Host "[1/4] Cleaning up existing processes..." -ForegroundColor Yellow
    Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

function Start-Backend {
    Write-Host "[2/4] Starting backend API server..." -ForegroundColor Yellow
    $backendPath = Join-Path $PSScriptRoot "backend"
    Set-Location $backendPath
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 5
}

function Open-Frontend {
    Write-Host "[3/4] Opening frontend in browser..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    $frontendPath = "file:///C:/Users/user/Documents/Ortiz Optical/frontend/public/index.html"
    Start-Process $frontendPath
}

function Show-Status {
    Write-Host ""
    Write-Host "[4/4] System startup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  SYSTEM STATUS" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Backend API: http://localhost:3000" -ForegroundColor Green
    Write-Host "Frontend:    Opening in browser..." -ForegroundColor Green
    Write-Host ""
    Write-Host "Keep the backend terminal window open while using the system." -ForegroundColor Yellow
    Write-Host "Close the backend window or press Ctrl+C to stop the server." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to continue..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Execute startup sequence
Show-Banner
Stop-ExistingProcesses
Start-Backend
Open-Frontend
Show-Status
