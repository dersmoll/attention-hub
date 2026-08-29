@echo off
setlocal EnableExtensions
title Attention Hub - M15 Panel Surface Test Launcher
cd /d "%~dp0"
if errorlevel 1 goto :wrong_folder

set "CODEX_NODE_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
set "NODE_EXE=%CODEX_NODE_ROOT%\bin\node.exe"
if not exist "%NODE_EXE%" goto :node_missing

echo Checking TypeScript...
"%NODE_EXE%" ".\node_modules\typescript\bin\tsc" --noEmit
if errorlevel 1 goto :failed

echo Building the production web bundle...
"%NODE_EXE%" ".\node_modules\vite\bin\vite.js" build
if errorlevel 1 goto :failed

echo.
echo Panel-surface build check passed. Starting Attention Hub for visual review...
echo Keep this window open while testing. Press Ctrl+C to stop the app.
echo.
call "%~dp0RUN-ATTENTION-HUB.cmd"
if errorlevel 1 goto :failed
goto :eof

:wrong_folder
echo Could not open the repository folder beside this launcher.
echo.
pause
exit /b 1

:node_missing
echo The bundled Node runtime could not be found. Ask Codex to repair the development setup.
echo.
pause
exit /b 1

:failed
echo.
echo Attention Hub did not start successfully.
echo.
pause
exit /b 1
