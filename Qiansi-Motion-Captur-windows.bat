@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Qiansi Motion Captur

set "QIANSI_MOTION_LAUNCHER=%~dp0data\plugins\qiansi-motion-capture\启动 Qiansi Motion Captur.bat"
if not exist "%QIANSI_MOTION_LAUNCHER%" (
  echo Qiansi Motion Captur standalone files are missing.
  echo Expected: data\plugins\qiansi-motion-capture\启动 Qiansi Motion Captur.bat
  echo Reinstall the complete Motion Captur plugin directory and try again.
  pause
  exit /b 1
)

call "%QIANSI_MOTION_LAUNCHER%"
set "QIANSI_MOTION_EXIT_CODE=%errorlevel%"
exit /b %QIANSI_MOTION_EXIT_CODE%
