@echo off
setlocal EnableExtensions
title Attention Hub - M23 Windows startup review
cd /d "%~dp0"
if errorlevel 1 exit /b 1
echo.
echo M23: Windows startup setting
echo.
echo 1. This development run must show Advanced ^> General ^> Windows startup
echo    as unavailable, with the installed-build notice. Do not expect it to
echo    create a Windows Startup entry.
echo 2. In an installed release build, open Advanced ^> General and enable
echo    Start Attention Hub when I sign in to Windows. Reopen General: the
echo    checked state must be read from Windows, not local widget preferences.
echo 3. Confirm Attention Hub appears in Windows Settings ^> Apps ^> Startup
echo    or Task Manager ^> Startup apps. Then disable the setting and confirm
echo    its registration disappears.
echo 4. Sign out and back in, or reboot, only after enabling it in the installed
echo    build. The normal widget should open once. The setting does not add a
echo    tray app, background service, or closed-app reminders.
echo.
echo This starts a development run and may stop an earlier local dev run.
echo Keep the console open. Ctrl+C stops the test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
exit /b %ERRORLEVEL%
