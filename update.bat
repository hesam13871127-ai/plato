@echo off
REM ============================================================
REM  update.bat - one-click update + database-fix verification
REM  Run it from the repo root (double-clicking also works).
REM ============================================================
cd /d "%~dp0"

echo === [1/3] Fetching latest code ============================
git fetch origin
if errorlevel 1 echo [!] git fetch FAILED - check your internet / GitHub login.

echo.
echo === [2/3] Switching to branch arena/01a08515-plato =======
git checkout arena/01a08515-plato
git pull
if errorlevel 1 echo [!] git pull FAILED - send me the message above.

echo.
echo === [3/3] Verification ====================================
git log --oneline -3
echo.
if exist "backend\src\database\snake-naming.strategy.ts" (
    echo [OK] The database fix is present. Now run:
    echo        cd backend
    echo        npm run start:dev
) else (
    echo [MISSING] The database fix is NOT present - the update did not work.
    echo Send me the FULL output of this window.
)
echo.
pause
