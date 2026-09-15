@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Qiansi-Canvas Launch Center

set "QIANSI_NODE=%~dp0tools\runtime\node\windows\node.exe"
if exist "%QIANSI_NODE%" goto :runtimeReady

if exist "%~dp0portable-release.json" (
  echo The portable runtime is missing or incomplete.
  echo Please obtain a complete Qiansi-Canvas package for this computer.
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in this source directory.
  echo Developers should run "tools\launchers\安装Qiansi-Canvas.bat" once.
  pause
  exit /b 1
)
set "QIANSI_NODE=node.exe"

:runtimeReady
"%QIANSI_NODE%" -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)"
if errorlevel 1 (
  echo Qiansi-Canvas requires Node.js 22.12.0 or later.
  pause
  exit /b 1
)

if not exist "%~dp0qiansi-launcher.mjs" (
  echo The Qiansi-Canvas launch center is missing.
  pause
  exit /b 1
)

"%QIANSI_NODE%" "%~dp0qiansi-launcher.mjs"
set "QIANSI_EXIT_CODE=%errorlevel%"
if not "%QIANSI_EXIT_CODE%"=="0" (
  echo.
  echo Qiansi-Canvas stopped with exit code %QIANSI_EXIT_CODE%.
  pause
)
exit /b %QIANSI_EXIT_CODE%

