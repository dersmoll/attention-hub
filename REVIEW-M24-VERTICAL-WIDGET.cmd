@echo off
setlocal
cd /d "%~dp0"
echo Attention Hub M24 - 58 px vertical widget review
echo.
echo 1. Right-click the widget, Size preset, Vertical rail ^(58 px^).
echo    Check stacked app icons, clocks, calendar, shortcuts and bottom controls.
echo    Calendar card should show status, wrapped title, start date/time and countdown.
echo    Click it to open Today; check delayed refresh and no-event states too.
echo 2. Open Today, Medicine, To-dos, Sticky note and Settings repeatedly.
echo    Today and Medicine should open beside the rail and remain reachable.
echo 3. Drag the grip near both screen edges and try the popups again.
echo 4. Change enabled panels, apps and clocks. Height should adapt.
echo    On a short screen, use the mouse wheel to reach the bottom controls.
echo 5. Click a clock and check conversion plus return to live clocks.
echo 6. Switch back to Recommended and Compact single-line.
echo    Check their original appearance and calendar edge resizing.
echo 7. Reopen the app: the selected preset should be remembered.
echo    Check keyboard focus and your preferred light/dark/custom theme.
echo.
echo This starts the development app in this folder. Keep the console open.
echo It may stop an earlier development run. Ctrl+C stops this test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
