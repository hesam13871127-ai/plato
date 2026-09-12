@echo off
setlocal enableextensions
title Plato Repair
echo.
echo  ================================================
echo    PLATO REPAIR  -  just wait, it is automatic
echo  ================================================
echo.

:: This script lives in the repository root; the repaired project is the
:: folder it is in (no hard-coded user paths).
set "REPO_DIR=%~dp0"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

set "FIX_BRANCH=arena/01a08bf1-plato"
set "FIX_ZIP_NAME=plato-arena-01a08bf1-plato"

echo  [1/6] Closing anything running on port 3000...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

echo  [2/6] Downloading the fixed code from GitHub...
curl -L -o "%TEMP%\plato-fixed.zip" https://codeload.github.com/hesam13871127-ai/plato/zip/refs/heads/%FIX_BRANCH%
if not exist "%TEMP%\plato-fixed.zip" (
    echo.
    echo  [FAILED] Download did not work. Check your internet, then run this file again.
    echo           If it fails again, send me a photo of this window.
    pause
    exit /b 1
)

echo  [3/6] Extracting...
powershell -NoProfile -Command "if (Test-Path $env:TEMP\plato-fixed) { Remove-Item -Recurse -Force $env:TEMP\plato-fixed }; Expand-Archive -Force $env:TEMP\plato-fixed.zip $env:TEMP\plato-fixed"
if not exist "%TEMP%\plato-fixed\%FIX_ZIP_NAME%\backend\package.json" (
    echo.
    echo  [FAILED] Extract did not work. Send me a photo of this window.
    pause
    exit /b 1
)

echo  [4/6] Copying the fixed code into %REPO_DIR%
echo        ^(your .env, node_modules, .git and database are kept^)
echo        ^(files deleted from the project get cleaned up automatically^)
robocopy "%TEMP%\plato-fixed\%FIX_ZIP_NAME%" "%REPO_DIR%" /E /PURGE /XD node_modules .git dist .venv build coverage .dart_tool /NFL /NDL /NJH /NJS >nul

echo  [5/6] Checking that the fix arrived...
findstr /C:"SnakeNamingStrategy" "%REPO_DIR%\backend\src\database\database.module.ts" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [FAILED] The fix did not arrive. Send me a photo of this whole window.
    pause
    exit /b 1
)
echo        OK - the fix is in place!

echo  [6/6] Installing and starting the server
echo        ^(first time can take a few minutes - do not close this window^)
cd /d "%REPO_DIR%\backend"
call npm install

echo.
echo  ==========================================================
echo    SUCCESS LOOKS LIKE THIS - watch for these lines:
echo      [DatabaseModule] driver: mysql ^(...^) ^| column naming: snake_case [ok]
echo      [SchemaCheckRepair] ... (schema self-check, normal)
echo      [GameBootstrap] Game subsystem ready (N bots in pool).
echo      Nest application successfully started
echo    (a few lines of WARN ModerationAdminSeeder are NORMAL)
echo  ==========================================================
echo.
call npm run start:dev
pause
