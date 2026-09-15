@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..") do set "QIANSI_ROOT=%%~fI\"
cd /d "%QIANSI_ROOT%"
title Qiansi-Canvas Development Mode

call :activatePortableNode

where node >nul 2>nul
if errorlevel 1 goto :nodeMissing

if not exist "node_modules\.bin\tsc.cmd" goto :dependenciesMissing
if not exist "node_modules\vite\bin\vite.js" goto :dependenciesMissing

echo ============================================================
echo   Qiansi-Canvas Development Mode
echo ============================================================
if not defined QIANSI_CANVAS_LAN set "QIANSI_CANVAS_LAN=1"
if not defined QIANSI_CANVAS_TRUSTED_LAN set "QIANSI_CANVAS_TRUSTED_LAN=1"
echo Frontend component and style changes use hot reload.
echo Local bridge changes automatically restart the bridge.
echo Development page: http://127.0.0.1:2895
echo Local bridge:      http://127.0.0.1:2896
if /I "%QIANSI_CANVAS_LAN%"=="1" (
  if /I "%QIANSI_CANVAS_TRUSTED_LAN%"=="1" (
    echo LAN access: trusted direct mode; open server-ip:2895 without pairing.
  ) else (
    echo LAN access: enabled with pairing protection; use the URL printed below after startup.
  )
)
echo.
echo Close the normal Qiansi-Canvas terminal if port 2895 is busy.
echo Press Ctrl+C to stop development mode.
echo.

call npm.cmd run dev:canvas
set "DEV_EXIT_CODE=%errorlevel%"

echo.
if not "%DEV_EXIT_CODE%"=="0" goto :developmentFailed
echo Qiansi-Canvas Development Mode stopped.
pause
exit /b 0

:nodeMissing
echo [ERROR] Node.js was not found. Run the installer batch file first.
pause
exit /b 1

:dependenciesMissing
echo [ERROR] Project dependencies are missing or incomplete.
echo Run the installer batch file in this folder, then try again.
pause
exit /b 1

:developmentFailed
echo [ERROR] Development Mode stopped with exit code %DEV_EXIT_CODE%.
pause
exit /b %DEV_EXIT_CODE%

:activatePortableNode
if exist "%QIANSI_ROOT%tools\runtime\node\windows\node.exe" (
  set "PATH=%QIANSI_ROOT%tools\runtime\node\windows;%PATH%"
  exit /b 0
)
if exist "%QIANSI_ROOT%data\runtime\node\node.exe" set "PATH=%QIANSI_ROOT%data\runtime\node;%PATH%"
exit /b 0
