@echo off
setlocal EnableExtensions
title Attention Hub - M18 Calendar Reliability Review

cd /d "%~dp0"
if errorlevel 1 exit /b 1

echo.
echo Attention Hub M18 calendar reliability review
echo.
echo After Attention Hub opens:
echo   1. Keep an active or upcoming saved-calendar event visible through a
echo      normal refresh. It should remain In progress, Meeting started, or
echo      Up next rather than showing Calendar retrying after one brief miss.
echo   2. Open the event workspace and save a small Project Hub change while
echo      the event remains visible. The calendar refresh must stay single-filed.
echo   3. If a check is slow, it should say Calendar checking and keep the
echo      current event and Join action available until the native result arrives.
echo   4. If two real refreshes fail in a row, confirm the state says Calendar
echo      sync delayed with a safe reason and last-successful-refresh age.
echo      It must never show the published calendar URL or raw diagnostics.
echo   5. If the state returns to normal, confirm the delayed-sync message clears.
echo.
echo Keep this window open while testing. Press Ctrl+C to stop Attention Hub.
echo.
pause

call "%~dp0RUN-ATTENTION-HUB.cmd"
exit /b %ERRORLEVEL%
