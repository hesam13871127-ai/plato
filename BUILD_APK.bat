@echo off
setlocal enableextensions
title Plato Build APK

echo.
echo  ================================================
echo    PLATO APK BUILD  -  just wait, it is automatic
echo  ================================================
echo.

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "BRANCH=arena/01a08bf1-plato"
set "WORK=%TEMP%\plato-apk-build"
set "APK_OUT=%SCRIPT_DIR%\Plato-Wave7.apk"

echo  [1/6] Locating Flutter...
set "FLUTTER="
where flutter >nul 2>&1 && set "FLUTTER=flutter"
if not defined FLUTTER if exist "C:\flutter\bin\flutter.bat" set "FLUTTER=C:\flutter\bin\flutter.bat"
if not defined FLUTTER if exist "%LOCALAPPDATA%\flutter\bin\flutter.bat" set "FLUTTER=%LOCALAPPDATA%\flutter\bin\flutter.bat"
if not defined FLUTTER if exist "C:\src\flutter\bin\flutter.bat" set "FLUTTER=C:\src\flutter\bin\flutter.bat"
if not defined FLUTTER (
    echo.
    echo  [FAILED] Flutter was not found on this computer.
    echo           Install it once (https://docs.flutter.dev/get-started/install/windows),
    echo           restart this window, then run this file again.
    pause
    exit /b 1
)
echo           found: %FLUTTER%

echo  [2/6] Downloading the latest code (branch %BRANCH%)...
if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%"
curl -L -o "%TEMP%\plato-apk-src.zip" https://codeload.github.com/hesam13871127-ai/plato/zip/refs/heads/%BRANCH%
if not exist "%TEMP%\plato-apk-src.zip" (
    echo.
    echo  [FAILED] Download did not work. Check your internet, then run this file again.
    pause
    exit /b 1
)

echo  [3/6] Unzipping...
powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\plato-apk-src.zip' '%WORK%'"
for /d %%d in ("%WORK%\plato-*") do set "SRC=%%d"
if not exist "%SRC%\mobile" (
    echo.
    echo  [FAILED] The download looks broken (no mobile folder). Run this file again.
    pause
    exit /b 1
)

echo  [4/6] Fetching app dependencies...
pushd "%SRC%\mobile"
call %FLUTTER% pub get
popd

echo  [5/6] Building the release APK (this can take 5-15 minutes)...
pushd "%SRC%\mobile"
call %FLUTTER% build apk --release
set "BUILD_RC=%ERRORLEVEL%"
popd
if not "%BUILD_RC%"=="0" (
    echo.
    echo  [FAILED] The build reported an error. Send me a photo of this window.
    pause
    exit /b 1
)

echo  [6/6] Copying the finished APK next to this file...
copy /Y "%SRC%\mobile\build\app\outputs\flutter-apk\app-release.apk" "%APK_OUT%"
del "%TEMP%\plato-apk-src.zip" >nul 2>&1

echo.
echo  ================================================
echo    DONE  -  your new app is ready
echo  ================================================
echo.
echo    File:  %APK_OUT%
echo.
echo    Install it on your phone, then check this checklist:
echo      1. The games screen shows a small line  "32 games - Wave 7"
echo      2. Tic-Tac-Toe and 2048 Duel are in the list (new games)
echo      3. Opening Werewolf offers seats 5, 6, 7, 8  (not 2, 3, 4)
echo      4. Every game you open shows its full 3D table
echo.
pause
