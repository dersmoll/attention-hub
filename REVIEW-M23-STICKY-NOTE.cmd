@echo off
setlocal EnableExtensions
title Attention Hub - M23 Sticky Note review
cd /d "%~dp0"
if errorlevel 1 exit /b 1
echo.
echo M23: Sticky note
echo.
echo 1. Click the note icon in Recommended, Compact, and Time Focus layouts.
echo    It should open one small note window; another click should focus the
echo    same window rather than create a duplicate.
echo 2. Type several lines, then immediately click Close. Reopen the note and
echo    confirm the final characters are present. Restart the app and confirm
echo    the text is still present.
echo 3. Move and resize the note, close it, then reopen it. Its size and position
echo    should be restored and the window should remain above other apps.
echo 4. Paste an https:// link. A compact link button should appear at the
echo    bottom and open the default browser. Edit the URL and confirm the button
echo    follows the currently saved text.
echo 5. Check light, dark, custom, keyboard focus, forced colours, and scaling.
echo    The editor, save state, close button, links, and resize edges must remain
echo    readable and usable at the 240 by 160 minimum size.
echo.
echo This starts a development run and may stop an earlier local dev run.
echo Keep the console open. Ctrl+C stops the test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
exit /b %ERRORLEVEL%
