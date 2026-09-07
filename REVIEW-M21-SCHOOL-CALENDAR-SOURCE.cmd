@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 exit /b 1
title Attention Hub M21 school calendar review
echo.
echo Attention Hub M21 - school calendar source and school-day reading
echo.
echo M21 added Google Calendar support, a School reading of the calendar,
echo and safer handling when the saved calendar link changes. Everything
echo else in the widget, Today, Medicine and Work mode should behave
echo exactly as it did before; report anything that does not, even if it
echo is not listed below.
echo.
echo Use a THROWAWAY Google calendar for anything that involves replacing
echo or removing a source. Never paste a real secret calendar address into
echo a note, a screenshot or a bug report.
echo.
echo ---------------------------------------------------------------
echo A. Google calendar as a source
echo ---------------------------------------------------------------
echo   1. Advanced - Calendar. Paste a Google SECRET iCal address
echo      (.../basic.ics) and save. It must verify and save.
echo   2. Confirm the widget shows a lesson or the next lesson from that
echo      calendar.
echo   3. Paste the calendar's PUBLIC address instead. It must also be
echo      accepted - both shapes are supported.
echo   4. Paste the ordinary browser link to the calendar (the one that
echo      opens it in a web page). It must be REFUSED, and the message
echo      must tell you to use the iCal/ICS address instead.
echo.
echo ---------------------------------------------------------------
echo B. A calendar with no upcoming lessons
echo ---------------------------------------------------------------
echo   5. Make a throwaway calendar with NO events at all, and save its
echo      secret address. It must be ACCEPTED. Before M21 this was
echo      refused, which meant a school calendar could not be connected
echo      during a holiday.
echo   6. With that empty calendar saved, open Today. It must say there
echo      are no lessons today - not that they could not be read.
echo.
echo ---------------------------------------------------------------
echo C. Replacing the saved calendar - warn BEFORE it applies
echo ---------------------------------------------------------------
echo   7. With calendar A saved, paste calendar B's address and save.
echo      A warning must appear saying the link replaces a different
echo      calendar and has NOT been saved yet.
echo   8. Confirm the pasted link is still in the field, and that
echo      Advanced still reports calendar A as the saved source. Nothing
echo      may have changed yet.
echo   9. Press "Different calendar - replace only". B becomes the saved
echo      source. Any subject or homework links you had stay in the app.
echo  10. Now go back to A the same way, and this time press
echo      "Same calendar - replace and carry across". Confirm the app
echo      reports how many associations were carried, including when the
echo      answer is zero. Zero must be reported as zero, never as
echo      success.
echo  11. Re-paste the SAME address that is already saved. No warning may
echo      appear - re-pasting an identical link changes nothing.
echo  12. Save A, then REMOVE the saved calendar, then save C. No stale
echo      warning from the earlier A-to-B step may appear, and nothing may
echo      be carried across from a calendar that is no longer saved.
echo.
echo ---------------------------------------------------------------
echo D. School mode reading
echo ---------------------------------------------------------------
echo  13. Advanced - Calendar - "Read this calendar as a school
echo      timetable". Turn it ON.
echo  14. THE LAYOUT MUST NOT CHANGE. Compare the widget against School
echo      mode off. Only wording differs - no row moves, nothing is
echo      added, nothing is clipped. Report any movement at all.
echo  15. During a lesson, the small status pill reads the lesson's
echo      position, like "2 of 8". Between lessons it reads "Break".
echo      Before the first it reads "Day starts". After the last it reads
echo      "Day ended". With nothing scheduled it reads "No lessons".
echo  16. Turn School mode OFF and confirm the wording returns to
echo      meetings and calls everywhere, including the Today popup.
echo.
echo ---------------------------------------------------------------
echo E. The states that must never lie
echo ---------------------------------------------------------------
echo  17. Disconnect from the network and let the calendar refresh fail a
echo      few times. The widget must NOT say "Day ended" or
echo      "No lessons" - it must keep the existing calendar-unavailable
echo      or retry wording, which says why.
echo  18. Still disconnected, open Today. It must say the lessons could
echo      not be read. It must NOT say there are no lessons today. This
echo      is the single most important check on this page.
echo  19. Reconnect and confirm both surfaces recover on their own.
echo  20. Cancel one lesson in the calendar (delete a single occurrence).
echo      Confirm it stops being offered as the current lesson, and that
echo      the "of N" total goes DOWN by one. A cancelled lesson is not a
echo      lesson the child sits through.
echo  21. Add an all-day entry to the calendar, such as a holiday marker.
echo      Confirm it does NOT change the "of N" total either.
echo.
echo ---------------------------------------------------------------
echo F. Work mode must not regress
echo ---------------------------------------------------------------
echo  22. With School mode OFF and an Outlook source saved, confirm the
echo      calendar band, Join, Today and the day panel behave as before.
echo  23. Confirm Medicine, Projects and the Today to-dos are untouched.
echo.
echo ---------------------------------------------------------------
echo U. Upgrade gate - installed build only
echo ---------------------------------------------------------------
echo  U1. Install over the previous release without uninstalling first.
echo  U2. Confirm the saved calendar still works and needs no re-entry.
echo  U3. Confirm School mode is OFF after upgrading. An existing work
echo      calendar must never start being narrated as a school day
echo      because the app updated.
echo  U4. Confirm Medicine, Projects and to-dos are all still present.
echo      An empty Medicine window after upgrading means data loss.
echo  U5. SINGLE INSTANCE. With the installed release running, launch it
echo      again from the Start menu. Confirm the existing window is
echo      raised and Task Manager shows one process. The dev build is
echo      exempt by design, so this is the only way to test it. Carried
echo      forward from M19 and M20, where it has still never been run.
echo.
echo If step 12, 18, U2 or U4 fails, do not publish. Those are data-loss
echo or untruthful-state paths, not cosmetic defects.
echo.
echo Do not change your Windows clock or timezone for any step above.
echo The midnight and clock-rollback cases are covered by automated
echo tests; changing your real clock is not a supported check.
echo Close the app or press Ctrl+C in the launch console when finished.
echo.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
