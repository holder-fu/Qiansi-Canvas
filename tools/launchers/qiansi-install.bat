@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "QIANSI_REPAIR_MODE="
if /I "%~1"=="--repair" set "QIANSI_REPAIR_MODE=1"
for %%I in ("%~dp0..\..") do set "QIANSI_ROOT=%%~fI\"
cd /d "%QIANSI_ROOT%"
title Qiansi-Canvas Installer

call :ensureNodeRuntime
if errorlevel 1 goto :failed

if /I "%~1"=="--cli" goto :cliMenu
if /I "%~1"=="--arkcli" goto :installVolcengine
if /I "%~1"=="--volcengine" goto :installVolcengine
if /I "%~1"=="--codex" goto :installCodex
if /I "%~1"=="--gemini" goto :installGemini
if /I "%~1"=="--jimeng" goto :installDreamina
if /I "%~1"=="--workbuddy" goto :installWorkBuddy
if /I "%~1"=="--bailian" goto :installBailian

call :ensureCanvasStopped
set "STOP_CHECK_EXIT_CODE=%errorlevel%"
if not "%STOP_CHECK_EXIT_CODE%"=="0" goto :failed

echo ============================================================
echo   Qiansi-Canvas Installer
echo ============================================================
echo.
set "npm_config_cache=%QIANSI_ROOT%tools\cache\npm"
if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"
echo [1/2] Installing project dependencies...
call npm.cmd ci --ignore-scripts --no-audit --no-fund --prefer-offline
set "DEPENDENCY_EXIT_CODE=%errorlevel%"
if not "%DEPENDENCY_EXIT_CODE%"=="0" goto :dependencyInstallFailed

echo [2/2] Running build verification...
call npm.cmd run build
set "BUILD_EXIT_CODE=%errorlevel%"
if not "%BUILD_EXIT_CODE%"=="0" goto :buildFailed

echo.
echo Development dependencies are installed. Use Qiansi-Canvas-windows.bat to open the launch center.
if defined QIANSI_REPAIR_MODE goto :repairDone
choice /c YN /m "Install or update CLI tools now"
if errorlevel 2 goto :done

:cliMenu
cls
echo ============================================================
echo   Qiansi-Canvas CLI Tools
echo ============================================================
echo.
echo   [1] 山火 CLI（火山方舟官方 Ark CLI）
echo   [2] Install or update OpenAI Codex CLI
echo   [3] Download the Google Antigravity installer for manual verification
echo   [4] Install or update Gemini CLI
echo   [5] Download the Dreamina / Jimeng installer for manual verification
echo   [6] Install or update WorkBuddy CLI
echo   [7] Install or update Alibaba Model Studio / Bailian CLI
echo   [8] Install verifiable CLIs and download installers that require manual review
echo   [0] Exit
echo.
choice /c 123456780 /n /m "Select an option"
if errorlevel 9 goto :done
if errorlevel 8 goto :installAll
if errorlevel 7 goto :installBailian
if errorlevel 6 goto :installWorkBuddy
if errorlevel 5 goto :installDreamina
if errorlevel 4 goto :installGemini
if errorlevel 3 goto :installAntigravity
if errorlevel 2 goto :installCodex
if errorlevel 1 goto :installVolcengine

:installVolcengine
call :installVolcengineTool
if errorlevel 1 goto :failed
goto :afterCli

:installCodex
call npm.cmd install --global @openai/codex@latest
if errorlevel 1 goto :failed
call :verifyCodex
if errorlevel 1 goto :failed
choice /c YN /m "Sign in to Codex now"
if errorlevel 2 goto :afterCli
call "%APPDATA%\npm\codex.cmd" login
if errorlevel 1 goto :failed
goto :afterCli

:installGemini
call npm.cmd install --global @google/gemini-cli@latest
if errorlevel 1 goto :failed
call :verifyGemini
if errorlevel 1 goto :failed
echo Gemini installed. Run gemini in a new terminal to sign in.
goto :afterCli

:installAntigravity
call :installAntigravityTool
if errorlevel 1 goto :failed
goto :afterCli

:installDreamina
call :installDreaminaTool
if errorlevel 1 goto :failed
goto :afterCli

:installWorkBuddy
call npm.cmd install --global @tencent-ai/codebuddy-code@latest
if errorlevel 1 goto :failed
call :verifyWorkBuddy
if errorlevel 1 goto :failed
echo WorkBuddy CLI installed. Run codebuddy in a new terminal to sign in.
goto :afterCli

:installBailian
call npm.cmd install --global bailian-cli
if errorlevel 1 goto :failed
call :verifyBailian
if errorlevel 1 goto :failed
echo Bailian CLI installed. Run bl auth login --console in a new terminal to sign in.
goto :afterCli

:installAntigravityTool
where curl.exe >nul 2>nul
if errorlevel 1 (
  echo curl.exe was not found. Antigravity cannot be downloaded.
  exit /b 1
)
set "QIANSI_AGY_INSTALLER=%TEMP%\qiansi-canvas-antigravity-%RANDOM%.cmd"
curl.exe --fail --location --proto "=https" "https://antigravity.google/cli/install.cmd" -o "%QIANSI_AGY_INSTALLER%"
if errorlevel 1 exit /b 1
echo.
echo The official Antigravity installer was downloaded but NOT executed:
echo   %QIANSI_AGY_INSTALLER%
echo Review its contents and verify its publisher or official checksum first.
echo Then run it manually only if you trust the downloaded file.
echo Antigravity CLI has NOT been installed.
exit /b 0

:installDreaminaTool
where curl.exe >nul 2>nul
if errorlevel 1 (
  echo curl.exe was not found. Dreamina cannot be downloaded.
  exit /b 1
)
set "QIANSI_DREAMINA_INSTALLER=%TEMP%\qiansi-canvas-dreamina-%RANDOM%.sh"
curl.exe --fail --location --proto "=https" "https://jimeng.jianying.com/cli" -o "%QIANSI_DREAMINA_INSTALLER%"
if errorlevel 1 exit /b 1
echo.
echo The official Dreamina installer was downloaded but NOT executed:
echo   %QIANSI_DREAMINA_INSTALLER%
echo No publisher checksum is bundled with Qiansi-Canvas. Review the script and
echo compare its SHA-256 with an official value before running it manually in Git Bash.
echo This installer deliberately refuses to pipe a remote response into a shell.
echo Dreamina / Jimeng CLI has NOT been installed.
exit /b 0

:installVolcengineTool
echo.
echo Installing the official Volcengine Ark CLI npm package.
echo Qiansi-Canvas does not mirror or maintain the Ark CLI package.
call npm.cmd install --global @volcengine/ark-cli@latest
if errorlevel 1 exit /b 1
call :verifyVolcengine
if errorlevel 1 exit /b 1
echo Shanhuo CLI ^(official Volcengine Ark CLI^) installed successfully.
echo Sign in: arkcli auth login volc-sso
echo Verify credentials: arkcli auth status
echo Login is separate from installation and is not required for the version check to pass.
exit /b 0

:installAll
call :installVolcengineTool
if errorlevel 1 goto :failed
call npm.cmd install --global @openai/codex@latest
if errorlevel 1 goto :failed
call :verifyCodex
if errorlevel 1 goto :failed
call npm.cmd install --global @google/gemini-cli@latest
if errorlevel 1 goto :failed
call :verifyGemini
if errorlevel 1 goto :failed
call :installAntigravityTool
if errorlevel 1 goto :failed
call :installDreaminaTool
if errorlevel 1 goto :failed
call npm.cmd install --global @tencent-ai/codebuddy-code@latest
if errorlevel 1 goto :failed
call :verifyWorkBuddy
if errorlevel 1 goto :failed
call npm.cmd install --global bailian-cli
if errorlevel 1 goto :failed
call :verifyBailian
if errorlevel 1 goto :failed
goto :afterCli

:afterCli
echo.
echo Start Qiansi-Canvas with Qiansi-Canvas-windows.bat before checking CLIs in API settings.
echo For Shanhuo CLI, run arkcli auth login volc-sso in a new terminal.
echo Then verify credentials with arkcli auth status.
echo If Codex was not signed in, run "%APPDATA%\npm\codex.cmd" login.
echo If WorkBuddy was not signed in, run "%APPDATA%\npm\codebuddy.cmd".
echo If Bailian was not signed in, run "%APPDATA%\npm\bl.cmd" auth login --console.
goto :done

:verifyVolcengine
call :resolveVolcengineCommand
if not defined QIANSI_VOLCENGINE_CMD (
  echo Ark CLI installation completed but arkcli.cmd or arkcli.exe was not found on PATH or under the npm global prefix.
  exit /b 1
)
call "%QIANSI_VOLCENGINE_CMD%" --version
if errorlevel 1 (
  echo Ark CLI was installed but arkcli --version could not run.
  exit /b 1
)
exit /b 0

:resolveVolcengineCommand
set "QIANSI_VOLCENGINE_CMD="
for /f "delims=" %%I in ('where.exe arkcli.cmd 2^>nul') do if not defined QIANSI_VOLCENGINE_CMD set "QIANSI_VOLCENGINE_CMD=%%~fI"
if defined QIANSI_VOLCENGINE_CMD exit /b 0
for /f "delims=" %%I in ('where.exe arkcli.exe 2^>nul') do if not defined QIANSI_VOLCENGINE_CMD set "QIANSI_VOLCENGINE_CMD=%%~fI"
if defined QIANSI_VOLCENGINE_CMD exit /b 0
set "QIANSI_NPM_GLOBAL_PREFIX="
for /f "delims=" %%I in ('npm.cmd prefix --global 2^>nul') do if not defined QIANSI_NPM_GLOBAL_PREFIX set "QIANSI_NPM_GLOBAL_PREFIX=%%~fI"
if defined QIANSI_NPM_GLOBAL_PREFIX if exist "%QIANSI_NPM_GLOBAL_PREFIX%\arkcli.cmd" set "QIANSI_VOLCENGINE_CMD=%QIANSI_NPM_GLOBAL_PREFIX%\arkcli.cmd"
if defined QIANSI_NPM_GLOBAL_PREFIX if not defined QIANSI_VOLCENGINE_CMD if exist "%QIANSI_NPM_GLOBAL_PREFIX%\arkcli.exe" set "QIANSI_VOLCENGINE_CMD=%QIANSI_NPM_GLOBAL_PREFIX%\arkcli.exe"
exit /b 0

:verifyGemini
set "QIANSI_GEMINI_CMD="
for /f "delims=" %%I in ('where.exe gemini.cmd 2^>nul') do if not defined QIANSI_GEMINI_CMD set "QIANSI_GEMINI_CMD=%%~fI"
if defined QIANSI_GEMINI_CMD goto :runGeminiVersion
for /f "delims=" %%I in ('where.exe gemini.exe 2^>nul') do if not defined QIANSI_GEMINI_CMD set "QIANSI_GEMINI_CMD=%%~fI"
if defined QIANSI_GEMINI_CMD goto :runGeminiVersion
set "QIANSI_NPM_GLOBAL_PREFIX="
for /f "delims=" %%I in ('npm.cmd prefix --global 2^>nul') do if not defined QIANSI_NPM_GLOBAL_PREFIX set "QIANSI_NPM_GLOBAL_PREFIX=%%~fI"
if defined QIANSI_NPM_GLOBAL_PREFIX if exist "%QIANSI_NPM_GLOBAL_PREFIX%\gemini.cmd" set "QIANSI_GEMINI_CMD=%QIANSI_NPM_GLOBAL_PREFIX%\gemini.cmd"
if defined QIANSI_NPM_GLOBAL_PREFIX if not defined QIANSI_GEMINI_CMD if exist "%QIANSI_NPM_GLOBAL_PREFIX%\gemini.exe" set "QIANSI_GEMINI_CMD=%QIANSI_NPM_GLOBAL_PREFIX%\gemini.exe"
if not defined QIANSI_GEMINI_CMD (
  echo Gemini installation completed but gemini.cmd or gemini.exe was not found on PATH or under the npm global prefix.
  exit /b 1
)
:runGeminiVersion
call "%QIANSI_GEMINI_CMD%" --version
if errorlevel 1 (
  echo Gemini was installed but gemini --version could not run.
  exit /b 1
)
exit /b 0

:verifyCodex
if not exist "%APPDATA%\npm\codex.cmd" (
  echo Codex installation completed but codex.cmd was not found in the npm global directory.
  exit /b 1
)
call "%APPDATA%\npm\codex.cmd" --version
if errorlevel 1 (
  echo Codex was installed but could not start.
  exit /b 1
)
exit /b 0

:verifyWorkBuddy
if not exist "%APPDATA%\npm\codebuddy.cmd" (
  if not exist "%APPDATA%\npm\cbc.cmd" (
    echo WorkBuddy installation completed but codebuddy.cmd or cbc.cmd was not found.
    exit /b 1
  )
  call "%APPDATA%\npm\cbc.cmd" --version
) else (
  call "%APPDATA%\npm\codebuddy.cmd" --version
)
if errorlevel 1 (
  echo WorkBuddy was installed but could not start.
  exit /b 1
)
exit /b 0

:verifyBailian
if not exist "%APPDATA%\npm\bl.cmd" (
  if not exist "%APPDATA%\npm\bailian.cmd" (
    echo Bailian installation completed but bl.cmd or bailian.cmd was not found.
    exit /b 1
  )
  call "%APPDATA%\npm\bailian.cmd" --version
) else (
  call "%APPDATA%\npm\bl.cmd" --version
)
if errorlevel 1 (
  echo Bailian CLI was installed but could not start.
  exit /b 1
)
exit /b 0

:ensureNodeRuntime
call :activateToolsNode
call :nodeRuntimeReady
if not errorlevel 1 exit /b 0

echo Node.js 22.12.0+ and npm were not found. Installing a verified project-local runtime...
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell was not found, so Node.js cannot be installed automatically.
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%QIANSI_ROOT%scripts\install-portable-node.ps1" -ProjectRoot "%QIANSI_ROOT%"
if errorlevel 1 (
  echo The official Node.js runtime could not be downloaded, verified, or extracted.
  exit /b 1
)
call :activateToolsNode
call :nodeRuntimeReady
if errorlevel 1 (
  echo The project-local Node.js runtime was installed but could not start.
  exit /b 1
)
for /f "delims=" %%v in ('node -p "process.versions.node"') do set "QIANSI_NODE_VERSION=%%v"
echo Node.js %QIANSI_NODE_VERSION% is ready in the Qiansi-Canvas project directory.
exit /b 0

:activateToolsNode
if exist "%QIANSI_ROOT%tools\runtime\node\windows\node.exe" set "PATH=%QIANSI_ROOT%tools\runtime\node\windows;%PATH%"
exit /b 0

:nodeRuntimeReady
where node >nul 2>nul
if errorlevel 1 exit /b 1
where npm.cmd >nul 2>nul
if errorlevel 1 exit /b 1
node -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit(major>22||(major===22&&minor>=12)?0:1)"
exit /b %errorlevel%

:ensureCanvasStopped
netstat -ano | findstr /R /C:":2895 .*LISTENING" /C:":2896 .*LISTENING" >nul
if errorlevel 1 exit /b 0
echo.
echo Qiansi-Canvas or its development service is still running on port 2895 or 2896.
echo Close the existing canvas terminal before installing or updating dependencies.
echo This prevents Windows from locking native dependency files during npm installation.
exit /b 1

:dependencyInstallFailed
echo.
echo Project dependency installation failed with exit code %DEPENDENCY_EXIT_CODE%.
echo If npm reported EPERM or operation not permitted, a native dependency file is still in use.
echo Close every running Qiansi-Canvas, development terminal, and editor task using this folder.
echo Then run this installer again. The installer will restore the incomplete node_modules directory.
goto :failed

:buildFailed
echo.
echo Project build verification failed with exit code %BUILD_EXIT_CODE%.
goto :failed

:failed
echo.
echo Installation did not complete. Review the messages above and try again.
if defined QIANSI_REPAIR_MODE exit /b 1
pause
exit /b 1

:repairDone
echo Launch-center repair completed successfully.
exit /b 0

:done
echo.
pause
exit /b 0
