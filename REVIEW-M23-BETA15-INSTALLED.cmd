@echo off
setlocal EnableExtensions
title Attention Hub - beta.15 installed candidate review
cd /d "%~dp0"
if errorlevel 1 exit /b 1

set "INSTALLER=%CD%\src-tauri\target\release\bundle\nsis\Attention Hub_0.6.0-beta.15_x64-setup.exe"
if not exist "%INSTALLER%" goto :missing_installer

echo.
echo Attention Hub 0.6.0-beta.15 installed-candidate review
echo.
echo The installer is locally built and intentionally Authenticode-unsigned.
echo Windows SmartScreen may therefore show a warning.
echo.
echo 1. Complete the installer when it opens, then launch Attention Hub.
echo 2. Open Settings ^> General. Windows startup must be available in this
echo    installed build. Enable Start Attention Hub when I sign in to Windows.
echo 3. Close Settings and exit Attention Hub. Return here and press a key.
echo    This launcher will inspect the current-user Windows startup entry only;
echo    it will not create, modify, or run that entry.
echo 4. If the entry is reported, reopen Attention Hub, disable the setting,
echo    exit again, and press a key so its removal can be checked.
echo.
pause
start "Attention Hub beta.15 installer" /wait "%INSTALLER%"

echo.
echo After enabling Windows startup and exiting Attention Hub, press a key.
pause >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue;" ^
  "$entry = $run.PSObject.Properties ^| Where-Object { $_.Name -like '*Attention*' -or [string]$_.Value -like '*attention-hub*' } ^| Select-Object -First 1;" ^
  "if ($entry) { Write-Host ('PASS: startup entry found: ' + $entry.Name) -ForegroundColor Green; Write-Host $entry.Value; exit 0 };" ^
  "Write-Host 'FAIL: no Attention Hub startup entry was found.' -ForegroundColor Red; exit 1"
if errorlevel 1 goto :failed

echo.
echo Reopen Attention Hub, disable Windows startup, exit it, then press a key.
pause >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue;" ^
  "$entry = $run.PSObject.Properties ^| Where-Object { $_.Name -like '*Attention*' -or [string]$_.Value -like '*attention-hub*' } ^| Select-Object -First 1;" ^
  "if (-not $entry) { Write-Host 'PASS: startup entry was removed.' -ForegroundColor Green; exit 0 };" ^
  "Write-Host ('FAIL: startup entry remains: ' + $entry.Name) -ForegroundColor Red; Write-Host $entry.Value; exit 1"
if errorlevel 1 goto :failed

echo.
echo Installed startup registration review passed.
pause
exit /b 0

:missing_installer
echo.
echo The beta.15 installer was not found:
echo %INSTALLER%
pause
exit /b 2

:failed
echo.
echo Installed startup registration review did not pass. Leave the current
echo state unchanged and report the output above.
pause
exit /b 1
