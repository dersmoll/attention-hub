@echo off
setlocal EnableExtensions
title Attention Hub - M22 UI workflow polish review

cd /d "%~dp0"
if errorlevel 1 exit /b 1

echo.
echo Attention Hub M22 UI workflow polish review
echo.
echo After Attention Hub opens:
echo   1. Open Today, choose an event, and open Event settings.
echo   2. In Destination, verify Projects and Personal lists are separate groups.
echo      Lists under INT Meetings must appear beneath that category heading;
echo      INT Meetings itself must not be selectable.
echo   3. Assign the event to a personal list, save, reopen settings, and verify
echo      the list remains selected. Click the event to open that list in Hub.
echo   4. Expand New project and Custom link. Every field and action must remain
echo      reachable; the panel may grow and must scroll when the screen is short.
echo   5. Open a compact project panel. Hover Open in Project Hub and Close:
echo      neither control should flash a white background.
echo   6. In Project Hub, verify the sidebar uses compact 34px rows, category
echo      counts, and reveal-on-demand Add project/List/Category editors.
echo   7. Enable School mode and wait for an active lesson. It must enter the
echo      in-progress state automatically, show progress and Finish, and never
echo      require an I'm in click. Join remains an explicit action.
echo   8. Switch to Work mode and confirm active meetings still offer I'm in.
echo   9. In Advanced, switch among pages and verify Updates and Diagnostics
echo      still load when selected.
echo  10. In Today, press Skip on an active or upcoming meeting. Its row must
echo      read Skipped and be crossed out; the widget must advance past it and
echo      no meeting-start sound should play. Press Undo to restore it. A skip
echo      must affect only that occurrence, not the recurring series.
echo  11. In Medicine, edit an existing medicine and change a dose time directly
echo      in its time field. Save and confirm the updated future time appears.
echo  12. Complete a treatment whose old end date has passed, then extend one
echo      medicine's End date across today. The treatment must reopen. Today and
echo      Meds must immediately restore today's due/missed rows, including an
echo      extension saved before this build. A non-dosing weekday may instead
echo      say the course continues, even when another treatment has a dose.
echo  13. Choose Compact single-line mode. Clock times and timezone labels must
echo      sit closer together without clipping. A meeting happening today must
echo      prioritize its title: status and title on the left, countdown at the
echo      upper right, and time directly below it. Today and Online meeting must
echo      not appear in that metadata. The title must be vertically centered.
echo      The full compact rail must retain a visible left outer border.
echo  14. Hover Join and Skip: both must keep the same transparent hover style.
echo      Only the hovered event's actions should appear, without moving its
echo      title. Join, Skip, and open controls must stay grouped at the right.
echo  15. In the Today popup, every meeting must remain one compact row. Skip
echo      appears on row hover or keyboard focus; Undo remains visible after a
echo      skip. The title opens one Event settings panel, and an assigned event
echo      offers Open destination there instead of a second project icon. Hover
echo      and press that action: it must never flash a white background.
echo  16. The widget destination rail must show one consistent icon-only set:
echo      calendar, checkmark, and pill emoji, all equally sized and aligned.
echo      In Recommended mode all three segments must have equal compact widths.
echo      Their tooltips, actions, and badges must remain clear. Right-click the
echo      widget and verify Open Project Hub still works.
echo  17. In Recommended mode, shortcuts must hug their icons and sit vertically
echo      centered. Secondary clocks must end after minutes without reserving
echo      blank seconds space. The calendar must read as two clear columns:
echo      status/countdown, then title/time. Short titles must not leave a wide
echo      empty band. Right-side actions must sit compactly near the border and
echo      remain vertically centered whether one or two icons are visible.
echo  18. Inspect the widget element in Recommended mode: two clocks must use a
echo      135px clock rail and all three destinations must use 72px total. In
echo      Compact single-line mode, choose Reset width to automatic, then verify
echo      a short meeting no longer leaves a wide empty calendar band. Long
echo      names must still expand or truncate safely.
echo  19. In Advanced ^> Clocks, turn off Show secondary clock. The widget must
echo      keep only the primary clock and shrink its clock rail. Re-enable it:
echo      the previously selected secondary timezone must return unchanged.
echo  20. While a calendar refresh is running or delayed, event pills must keep
echo      their real state such as Up next. When a cached event remains usable,
echo      delayed sync must appear only as a thin amber line along the calendar
echo      segment's top edge. It must not cover or move the event title, countdown,
echo      time range, or right-side actions. Hover keeps the sanitized reason in
echo      the full calendar tooltip.
echo  21. Open Today from the narrowest calendar layout. The detached popup must
echo      remain at least 300px wide, stay on-screen, and keep row actions usable.
echo  22. During ordinary calendar refreshes or brief network failures, a usable
echo      event must remain clean and warning-free. Calendar sync delayed should
echo      appear only after a sustained outage, not after one or two misses. If
echo      no usable event exists then the delayed message may be centered in the
echo      empty calendar segment; it must never overlay real event content.
echo  23. After one successful calendar load, restart the installed app while the
echo      feed is unavailable. The cached event should appear without an error;
echo      Join and saved workspace actions stay unavailable until live refresh.
echo  24. Let an Up next meeting cross its start time without waiting for refresh.
echo      It must change to Meeting started, and Join must change it to In progress.
echo      Saved event icons must occupy a right column and never cover countdown.
echo  25. In Advanced ^> Calendar, refresh the Outlook Published ICS source that
echo      previously timed out after ten seconds. Allow up to 40 seconds. It should
echo      complete without a false client timeout. Automatic refresh uses the same
echo      30-second download allowance; never copy the private ICS URL into notes.
echo  26. In Advanced ^> Calendar, verify the attention pill reads Soon. Under
echo      Meeting start attention, choose each Reminder sound and press Test
echo      sound. Every choice must play its own sound. Leave one non-default
echo      choice selected, close and reopen Attention Hub, and verify both the
echo      selector and the next automatic meeting reminder retain that choice.
echo.
echo The shared launcher may stop an earlier local development run.
echo Ctrl+C in its console stops this review run.
echo.
pause

call "%~dp0RUN-ATTENTION-HUB.cmd"
exit /b %ERRORLEVEL%
