@echo off
setlocal
cd /d "%~dp0"

echo.
echo === [1/4] Downloading the fixed code straight from GitHub (no git) ===
set "ZIP=%TEMP%\plato-fixed.zip"
set "SRC=%TEMP%\plato-fixed\plato-arena-01a08515-plato"
curl -L -o "%ZIP%" https://codeload.github.com/hesam13871127-ai/plato/zip/refs/heads/arena/01a08515-plato
if not exist "%ZIP%" (
    echo [!] Download failed. Download this in your browser, put it in Downloads,
    echo     then tell me and I will give you the next command:
    echo     https://github.com/hesam13871127-ai/plato/archive/refs/heads/arena/01a08515-plato.zip
    pause
    exit /b 1
)

echo.
echo === [2/4] Extracting ==================================================
if exist "%TEMP%\plato-fixed" rmdir /s /q "%TEMP%\plato-fixed"
powershell -NoProfile -Command "Expand-Archive -Force '$env:TEMP\plato-fixed.zip' '$env:TEMP\plato-fixed'"
if not exist "%SRC%" (
    echo [!] Extract failed - send me a screenshot of this window.
    pause
    exit /b 1
)

echo.
echo === [3/4] Overwriting this folder with the fixed code =================
rem /E copies the full source tree over this folder.
rem node_modules, .git, dist and .env are skipped, so nothing of yours breaks.
robocopy "%SRC%" . /E /XD node_modules .git dist /XF .env /NFL /NDL /NJH /NJS >nul

echo.
echo === [4/4] Verification =================================================
findstr /C:"SnakeNamingStrategy" backend\src\database\database.module.ts >nul 2>&1
if %errorlevel%==0 (
    echo [OK] The fixed code is now in this folder.
) else (
    echo [MISSING] Something went wrong - send me a screenshot of this window.
    pause
    exit /b 1
)

echo.
echo Starting the backend. First log lines must show:
echo    [DatabaseModule] driver: mysql ^(...^) ^| column naming: snake_case [ok]
echo.
cd backend
call npm run start:dev
pause
