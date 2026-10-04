@echo off
setlocal
cd /d "%~dp0"
echo Backup and restore review
echo.
echo 1. Open Settings, then Backup ^& restore. All export/import controls live here.
echo 2. Export everything. Leave the calendar connection unchecked for a portable private backup.
echo 3. Check the JSON contains projects, notes, todos, Medicine and the sticky note.
echo 4. Restore the file: inspect counts, choose sections, then confirm replacement.
echo 5. Close popup and editing windows before restoring; save your drafts first.
echo 6. Verify selected data returned, unselected data stayed, and the focus timer is paused.
echo 7. Verify individual workspace and Medicine exports/imports still work.
echo 8. An invalid or changed backup must fail without changing current data.
echo 9. Including the calendar connection requires the explicit privacy checkbox.
echo.
echo This console stays open. Ctrl+C stops the development test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
