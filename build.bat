@echo off
echo ========================================================
echo Building IGEMS DXF Studio into an Executable (.exe)
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
    echo [INFO] Installing project dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Packaging with electron-builder...
echo 1. Standalone Portable .exe
echo 2. Windows NSIS Installer (.exe)
echo.
call npm run dist

echo.
echo ========================================================
echo Build Finished! Check the 'dist' folder for your .exe files.
echo ========================================================
pause
