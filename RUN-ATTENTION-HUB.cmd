@echo off
setlocal EnableExtensions
title Attention Hub - Milestone 10 Test Launcher

cd /d "%~dp0"
if errorlevel 1 goto :wrong_folder

set "ATTENTION_HUB_ROOT=%CD%"

echo.
echo Attention Hub Milestone 10 test launcher
echo Update: 0.6.0-beta.1 release candidate - Milestone 10
echo Repository: %ATTENTION_HUB_ROOT%
echo.
echo Closing any previous Attention Hub run...

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'SilentlyContinue';" ^
  "Get-Process -Name 'attention-hub' | Stop-Process -Force;" ^
  "Start-Sleep -Milliseconds 500;" ^
  "$root = [IO.Path]::GetFullPath($env:ATTENTION_HUB_ROOT);" ^
  "$listener = Get-NetTCPConnection -LocalPort 1420 -State Listen | Select-Object -First 1;" ^
  "if ($listener) {" ^
  "  $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess);" ^
  "  if ($process -and $process.CommandLine -and $process.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) {" ^
  "    Stop-Process -Id $listener.OwningProcess -Force;" ^
  "    Start-Sleep -Milliseconds 500;" ^
  "  } else {" ^
  "    Write-Host ('Port 1420 is already used by another program (PID ' + $listener.OwningProcess + ').') -ForegroundColor Red;" ^
  "    exit 42;" ^
  "  }" ^
  "}"

if errorlevel 42 goto :port_busy

set "CODEX_NODE_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
set "NODE_EXE=%CODEX_NODE_ROOT%\bin\node.exe"
set "PNPM_MJS=%CODEX_NODE_ROOT%\node_modules\pnpm\bin\pnpm.mjs"
if not exist "%NODE_EXE%" goto :node_missing
set "PATH=%CODEX_NODE_ROOT%\bin;%PATH%"

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo.exe >nul 2>nul
if errorlevel 1 goto :rust_missing

set "VSDEVCMD="
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat" set "VSDEVCMD=%ProgramFiles(x86)%\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat"
if not defined VSDEVCMD if exist "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" set "VSDEVCMD=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if not defined VSDEVCMD if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" set "VSDEVCMD=%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
if not defined VSDEVCMD goto :build_tools_missing

call "%VSDEVCMD%" -no_logo -arch=x64 -host_arch=x64
if errorlevel 1 goto :build_tools_failed

if not exist "node_modules\.bin\tauri.cmd" (
  echo Installing the project dependencies for the first run...
  call "%NODE_EXE%" "%PNPM_MJS%" install --frozen-lockfile --ignore-scripts
  if errorlevel 1 goto :failed
)

if not exist "node_modules\@tauri-apps\cli\tauri.js" goto :dependencies_missing
if not exist "node_modules\vite\bin\vite.js" goto :dependencies_missing

del /q "%TEMP%\attention-hub-dev-launch.json" >nul 2>nul
set "TAURI_LAUNCH_CONFIG=%TEMP%\attention-hub-dev-launch.json"
>"%TAURI_LAUNCH_CONFIG%" echo {"build":{"beforeDevCommand":"node node_modules/vite/bin/vite.js"}}

echo Starting the current Attention Hub development build...
echo Keep this window open while testing. Press Ctrl+C to stop the app.
echo.

call "%NODE_EXE%" "node_modules\@tauri-apps\cli\tauri.js" dev --config "%TAURI_LAUNCH_CONFIG%"
set "LAUNCH_EXIT=%ERRORLEVEL%"
del /q "%TAURI_LAUNCH_CONFIG%" >nul 2>nul
if not "%LAUNCH_EXIT%"=="0" goto :failed
goto :eof

:wrong_folder
echo Could not open the repository folder beside this launcher.
goto :failed_pause

:node_missing
echo The bundled Node runtime could not be found. Ask Codex to repair the development setup.
goto :failed_pause

:rust_missing
echo Rust could not be found in %USERPROFILE%\.cargo\bin.
goto :failed_pause

:build_tools_missing
echo Microsoft Visual Studio C++ Build Tools could not be found.
goto :failed_pause

:build_tools_failed
echo Microsoft Visual Studio C++ Build Tools could not be initialized.
goto :failed_pause

:dependencies_missing
echo The local Tauri or Vite dependency is incomplete. Ask Codex to repair the development setup.
goto :failed_pause

:port_busy
echo Close the program using port 1420, then run this launcher again.
goto :failed_pause

:failed
echo.
echo Attention Hub did not start successfully.

:failed_pause
echo.
pause
exit /b 1
