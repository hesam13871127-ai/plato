@echo off
setlocal enableextensions
title Plato Repair
echo.
echo  ================================================
echo    PLATO REPAIR  -  just wait, it is automatic
echo  ================================================
echo.

echo  [1/6] Closing anything running on port 3000...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

echo  [2/6] Downloading the fixed code from GitHub...
curl -L -o "%TEMP%\plato-fixed.zip" https://codeload.github.com/hesam13871127-ai/plato/zip/refs/heads/arena/01a08515-plato
if not exist "%TEMP%\plato-fixed.zip" (
    echo.
    echo  [FAILED] Download did not work. Check your internet, then run this file again.
    echo           If it fails again, send me a photo of this window.
    pause
    exit /b 1
)

echo  [3/6] Extracting...
powershell -NoProfile -Command "if (Test-Path $env:TEMP\plato-fixed) { Remove-Item -Recurse -Force $env:TEMP\plato-fixed }; Expand-Archive -Force $env:TEMP\plato-fixed.zip $env:TEMP\plato-fixed"
if not exist "%TEMP%\plato-fixed\plato-arena-01a08515-plato\backend\package.json" (
    echo.
    echo  [FAILED] Extract did not work. Send me a photo of this window.
    pause
    exit /b 1
)

echo  [4/6] Copying the fixed code into your plato folder
echo        ^(your .env and settings are kept - nothing of yours is deleted^)...
robocopy "%TEMP%\plato-fixed\plato-arena-01a08515-plato" "C:\Users\Hesam\Documents\GitHub\plato" /E /XD node_modules .git dist /NFL /NDL /NJH /NJS >nul

echo  [5/6] Checking that the fix arrived...
findstr /C:"SnakeNamingStrategy" "C:\Users\Hesam\Documents\GitHub\plato\backend\src\database\database.module.ts" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [FAILED] The fix did not arrive. Send me a photo of this whole window.
    pause
    exit /b 1
)
echo        OK - the fix is in place!

echo  [6/6] Installing and starting the server
echo        ^(first time can take a few minutes - do not close this window^)...
cd /d "C:\Users\Hesam\Documents\GitHub\plato\backend"
call npm install

echo.
echo  ==========================================================
echo    SUCCESS LOOKS LIKE THIS - watch for these two lines:
echo      [DatabaseModule] driver: mysql ^(...^) ^| column naming: snake_case [ok]
echo      Nest application successfully started
echo    (3 lines of WARN ModerationAdminSeeder are NORMAL)
echo  ==========================================================
echo.
call npm run start:dev
pause
