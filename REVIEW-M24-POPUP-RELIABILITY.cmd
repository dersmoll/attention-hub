@echo off
setlocal
cd /d "%~dp0"
echo Attention Hub M24 - popup reliability review
echo.
echo This launcher builds and runs the development app from this folder.
echo It may stop an earlier local development run. Keep its console open.
echo Ctrl+C stops the development test run.
echo.
echo Acceptance checks:
echo 1. Open and close Today, Medicine, and Settings at least 20 times each.
echo 2. Click the same popup button rapidly. Check for duplicate or stuck windows.
echo 3. Check Project Hub, event settings, project details, and Sticky note.
echo 4. From Today and Medicine, open the Medicine manager and return.
echo    A failed handoff must keep the originating popup open with a message.
echo 5. Leave the app running, then repeat these checks after normal PC use.
echo    Include sleep/wake if you normally use it.
echo 6. If a popup fails, confirm a useful notice appears instead of silence.
echo.
echo The Evergreen runtime-update case needs a separate long-running test
echo when Windows naturally installs a WebView2 update. Do not force an update.
echo This development test does not verify an installed release or updater.
echo.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
