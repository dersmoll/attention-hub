@echo off
setlocal
cd /d "%~dp0"
echo Attention Hub M24 - To-dos popup review
echo.
echo 1. Click All To-dos in the widget. It should open a Medicine-style popup.
echo 2. Check project/list groups, task titles, notes previews and saved links.
echo    Click a title to expand notes; scheduling should stay secondary.
echo 3. Complete a task, then Undo in the same row. Check the widget count.
echo 4. Check a long list: task rows scroll, Manage to-dos stays visible.
echo 5. Click the widget shortcut again to close; reopen; Escape closes it too.
echo 6. Try horizontal and vertical presets near both screen edges.
echo 7. Manage to-dos opens Project Hub. If opening fails, the popup stays.
echo 8. Change a task in another window; check the popup updates without moving focus.
echo    Check loading/empty states and your preferred theme.
echo.
echo This starts the development app from this folder. Keep the console open.
echo It may stop an earlier local development run. Ctrl+C stops this test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
