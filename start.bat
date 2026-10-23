@echo off
echo ========================================================
echo Starting IGEMS DXF Studio Desktop Application
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ (LTS version recommended).
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] Installing project dependencies (Electron, electron-builder)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Launching Electron app...
call npm start
