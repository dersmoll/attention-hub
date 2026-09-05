@echo off
setlocal
title Attention Hub M19 medicine tracker review
echo.
echo Attention Hub M19 - current implementation review
echo.
echo Check these items after Attention Hub launches:
echo   1. Open Advanced ^> General ^> Visible panels.
echo   2. Confirm Show in widget is OFF by default, then turn it on.
echo   3. Select Open Medicine and confirm the Medicine window opens.
echo   4. Add a treatment, then add a medicine with a time.
echo   5. Confirm the optional Meds widget segment opens Medicine.
echo   6. Open Today and confirm Medicine appears between events and To-dos.
echo   7. Confirm Take, Skip, and Undo record the selected dose.
echo   8. Confirm existing Today and Project Hub controls retain their widths.
echo.
echo This checkpoint does not yet include the dedicated Medicine popup or dose reminders.
echo Close the app or press Ctrl+C in the launch console when finished.
echo.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
