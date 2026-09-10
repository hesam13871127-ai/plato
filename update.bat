@echo off
REM ============================================================
REM  update.bat - FORCE-sync this folder to the fixed branch.
REM  Fixes any stale/old-branch state, then verifies the fix.
REM  Run from the repo root (double-clicking works too).
REM ============================================================
cd /d "%~dp0"

echo.
echo === [1/4] Fetching from GitHub ============================
git fetch origin
if errorlevel 1 (
    echo [!] git fetch FAILED - check internet / GitHub login.
    echo     Send me a screenshot of this window.
    pause
    exit /b 1
)

echo.
echo === [2/4] Force-switching to the fixed branch =============
git checkout -f arena/01a08515-plato
git reset --hard origin/arena/01a08515-plato
git clean -fd backend/src backend/scripts database mobile

echo.
echo === [3/4] Verification =====================================
git log --oneline -3
echo.
findstr /C:"SnakeNamingStrategy" backend\src\database\database.module.ts >nul 2>&1
if %errorlevel%==0 (
    echo [OK] The database fix is in place on this machine.
) else (
    echo [MISSING] The fix is NOT in this folder - something is wrong.
    echo           Send me a screenshot of this whole window.
)

echo.
echo === [4/4] Next step ========================================
echo   1. Close every old terminal that still runs the backend ^(Ctrl+C^).
echo   2. Then run:
echo        cd backend
echo        npm run start:dev
echo   3. In the first log lines you MUST see:
echo        [DatabaseModule] driver: mysql ^(...^) ^| column naming: snake_case [ok]
echo      If you do NOT see that line, an old build is running.
echo.
pause
