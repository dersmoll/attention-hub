@echo off
setlocal
cd /d "%~dp0"
echo Attention Hub M24 - notes-first to-do review
echo.
echo 1. Open a project's To-dos popup. Check compact aligned rows.
echo 2. Click a task title: notes should expand without entering edit mode.
echo 3. Follow its saved link, then return and complete the correct task.
echo 4. Check All To-dos and a project's To-dos tab in Project Hub.
echo    Titles expand notes; links are accessible; scheduling is secondary.
echo 5. Edit a task. Notes should be above the scheduling fields.
echo    Cancel a draft and confirm the saved task has not changed.
echo 6. Check a narrow window and your preferred light/dark/custom theme.
echo    Hover and keyboard focus should stay readable on every control.
echo 7. Reopen Today, Medicine and Settings to check popup reliability.
echo.
echo This starts the development app from this folder. Keep the console open.
echo It may stop an earlier Attention Hub run. Ctrl+C stops the test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
