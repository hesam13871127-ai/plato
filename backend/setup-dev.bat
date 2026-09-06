@echo off
REM ─────────────────────────────────────────────────────────────
REM  VibeTable backend - one-click local dev setup (Windows)
REM  - Creates .env automatically (no MySQL needed: in-memory SQLite)
REM  - Asks for the phone/email that should become ADMIN
REM  - Installs dependencies and starts the API
REM
REM  NOTE: SQLite mode keeps data in memory; it is wiped whenever the
REM  server stops. For persistent data install MySQL 8 and set
REM  DB_TYPE=mysql in .env (credentials at the bottom of this file).
REM ─────────────────────────────────────────────────────────────
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================
echo   VibeTable backend - local dev setup
echo ============================================
echo.

if not exist ".env" (
    echo [1/3] Creating .env with local development defaults...
    (
      echo NODE_ENV=development
      echo PORT=3000
      echo API_PREFIX=api
      echo CORS_ORIGINS=*
      echo.
      echo # Zero-setup database: in-memory SQLite, no MySQL required.
      echo DB_TYPE=sqlite
      echo DB_SYNCHRONIZE=true
      echo DB_RUN_MIGRATIONS=false
      echo.
      echo JWT_ACCESS_SECRET=dev-access-secret-change-me-please-32chars-long
      echo JWT_REFRESH_SECRET=dev-refresh-secret-change-me-please-32chars-long
      echo JWT_ACCESS_TTL=900s
      echo JWT_REFRESH_TTL=30d
      echo JWT_ISSUER=vibetable
      echo.
      echo # OTP codes are printed in THIS terminal window.
      echo SMS_PROVIDER=development
      echo OTP_RATE_LIMIT_SECONDS=1
      echo OTP_MAX_ATTEMPTS=20
      echo.
      echo # Staff bootstrap - filled in by this script:
      echo MODERATION_ADMIN_PHONES=
      echo MODERATION_ADMIN_EMAILS=
      echo MODERATION_MODERATOR_EMAILS=
    ) > .env
    echo       .env created.
) else (
    echo [1/3] .env already exists - keeping it.
)

echo.
echo [2/3] Who should be ADMIN?
echo   Enter the phone number you will log in with, INCLUDING country code
echo   (example: +491701234567). Or press ENTER to skip and edit .env later.
set "ADMIN_PHONE="
set /p "ADMIN_PHONE=Admin phone: "

set "ADMIN_EMAIL="
set /p "ADMIN_EMAIL=Admin email (optional, press ENTER to skip): "

if defined ADMIN_PHONE (
    powershell -NoProfile -Command "(Get-Content .env) -replace '^MODERATION_ADMIN_PHONES=.*', 'MODERATION_ADMIN_PHONES=%ADMIN_PHONE%' | Set-Content .env"
    echo       MODERATION_ADMIN_PHONES=%ADMIN_PHONE%
)
if defined ADMIN_EMAIL (
    powershell -NoProfile -Command "(Get-Content .env) -replace '^MODERATION_ADMIN_EMAILS=.*', 'MODERATION_ADMIN_EMAILS=%ADMIN_EMAIL%' | Set-Content .env"
    echo       MODERATION_ADMIN_EMAILS=%ADMIN_EMAIL%
)

echo.
echo [3/3] Installing dependencies (first run only, takes a minute)...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo.
    echo  ERROR: npm install failed. Make sure Node.js 20+ is installed:
    echo         https://nodejs.org/
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Starting API on http://localhost:3000
echo.
echo   * In the app, log in with the admin phone above.
echo   * The OTP login code is printed in this window.
echo   * Then open Profile -^> "Admin panel".
echo   * Stop the server with Ctrl+C.
echo ============================================
echo.
call npm run start:dev
