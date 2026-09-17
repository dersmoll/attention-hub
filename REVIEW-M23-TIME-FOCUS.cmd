@echo off
setlocal EnableExtensions
title Attention Hub - M23 Time Focus review
cd /d "%~dp0"
if errorlevel 1 exit /b 1
echo.
echo M23: Time Focus clock and task timer
echo.
echo 1. Select Clock layout ^> Time Focus. The wall clock should be about three
echo    times larger than before and remain fully visible, including seconds.
echo 2. The stopwatch beneath it must be clearly smaller. Start it, wait, pause,
echo    resume, and reset it. Buttons must work by mouse and keyboard.
echo 3. Start the timer, switch to another clock layout, then return. Elapsed
echo    time must continue. Close and reopen the app: a running timer continues.
echo 4. Switch between Recommended and Compact before entering Time Focus. The
echo    focus canvas is the same large height in both; leaving restores the
echo    selected normal height.
echo 5. Check light, dark and custom surfaces, Windows scaling, forced colours,
echo    and reduced motion. Text and focus rings must remain readable.
echo.
echo This starts a development run and may stop an earlier local dev run.
echo Keep the console open. Ctrl+C stops the test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
exit /b %ERRORLEVEL%
