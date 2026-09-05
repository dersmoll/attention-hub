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
echo   9. In Today, Skip a dose and then Undo it. Confirm it is unrecorded again.
echo  10. Take a dose and Undo it. Confirm both actions update the count.
echo  11. Keep Medicine open. Toggle Show in widget in Advanced and confirm
echo      the manager checkbox updates immediately. Repeat in the other direction.
echo  12. Rename a medicine and change its food timing. Confirm its dates and
echo      schedule remain unchanged after reopening the manager.
echo  13. Add a medicine with three dose times. Confirm each time appears as a
echo      removable chip and the live preview shows the expected dose count.
echo  14. With more than eight doses today, confirm eight dose rows plus the
echo      +N more control fit, and that any To-dos below remain visible.
echo  15. Confirm new treatment dates start on your current local day.
echo      Do not change your Windows clock or timezone for this review.
echo  16. In Medicine, confirm the 48 px header, compact sidebar, and tighter
echo      detail spacing feel consistent with Projects and To-dos.
echo  17. Confirm Add treatment and Add medicine are clear plus icons and reveal
echo      labeled forms only when requested. Check 940 x 640 and 820 x 520.
echo  18. Confirm treatment rows are about 40 px and medicine rows about 46 px,
echo      long names and dates do not clip, and Edit opens a two-column form.
echo  19. Use Tab and Escape through Add, Edit, and Rename. Confirm focus is visible,
echo      Escape closes the form, and focus returns to the button that opened it.
echo  20. Edit the three-time medicine. Confirm all times reopen, then remove one,
echo      add another, save, close Medicine, and confirm the schedule persists.
echo  21. Try Every N days and Selected weekdays. Confirm the preview changes and
echo      the saved row describes the selected pattern.
echo  22. Confirm a missing time, no selected weekdays, or an end date before the
echo      start date shows a clear preview error and disables Add/Save.
echo  23. Record one dose, then edit only the medicine name or strength. Confirm the
echo      recorded dose stays recorded and the remaining schedule is not retimed.
echo  24. Edit a future schedule. Confirm past and recorded rows remain unchanged,
echo      while untouched future rows follow the new times or day pattern.
echo  25. Confirm treatments are grouped as Active, Upcoming, Finished, and Archived,
echo      with a small course-progress bar and no visible Up/Down buttons.
echo  26. Confirm Schedule, Today, and Notes work as tabs. Use Left/Right Arrow on
echo      the tab buttons and confirm focus and the visible panel move together.
echo  27. In Today, confirm doses are time-ordered with textual Upcoming, Due,
echo      Missed, Taken, or Skipped states. Test Take, Skip, and same-day Undo.
echo  28. Confirm Recent shows at most 20 taken, skipped, or missed rows newest
echo      first, including missed rows from earlier days. Only today's records undo.
echo  29. Add treatment notes containing an HTTPS link. Wait for Saved locally,
echo      close and reopen Medicine, and confirm the exact text persists.
echo  30. Add medicine-specific notes in Edit, save, reopen Edit, and confirm they
echo      persist without changing the schedule.
echo  31. Complete, Reopen, Archive, and Restore a disposable treatment. Confirm it
echo      moves to the correct group while completion and archive remain independent.
echo  32. Press and hold a six-dot handle, drag it above or below another row,
echo      then release on the accent line. Confirm the new order persists and
echo      that treatments cannot be dragged into a different lifecycle group.
echo      Focus a handle and press Alt+Up/Down; confirm keyboard reorder also persists.
echo  33. Confirm toolbar, row, and dose actions use icons with useful tooltips and
echo      visible focus. Save, Cancel, conflict choices, and confirmations stay text.
echo  34. On a disposable medicine, select Delete and verify the confirmation names
echo      the medicine and dose-record count. Cancel once and confirm focus returns.
echo  35. Delete that disposable medicine. Then complete or archive its disposable
echo      treatment and delete it, confirming the cascade counts before deletion.
echo  36. In Today, confirm Upcoming, Due, Missed, Taken, and Skipped are named
echo      in text and remain distinguishable in Windows high-contrast mode.
echo  37. Leave one dose from yesterday missed. Confirm the Meds badge and attention
echo      tone ignore it, while today's due or missed dose applies the tone.
echo  38. Click Meds with an active treatment. Confirm the anchored Medicine panel
echo      shows course day progress, today rows, food timing, Take, Skip, and Undo.
echo  39. With more than three active treatments or eight doses today, confirm the
echo      panel shows at most three headings and eight dose rows plus one +N more row.
echo  40. Confirm +N more and Open manager open Medicine. With no active treatment,
echo      confirm clicking Meds opens the manager directly.
echo  41. Confirm the Meds badge shows a check when every dose today is recorded,
echo      and that popup updates and stays anchored after recording a dose.
echo  42. Open and close the Meds popup at least six times. Confirm every odd click
echo      opens it, every even click closes it, and all controls remain compact.
echo  43. In Notes, type a short change and immediately select another treatment,
echo      then return. Confirm the note was saved. Repeat after pressing Close.
echo  44. Give two treatments doses at different times. In Today, confirm all
echo      medicine rows are ordered by time across treatments, not by treatment.
echo  45. Delete a disposable medicine, create a replacement, then drag it between
echo      its siblings. Confirm the order changes and still persists after reopen.
echo  46. With the taskbar visible, open the Medicine and Today popups near the
echo      screen edge. Confirm neither extends behind the taskbar; long lists scroll.
echo  47. While the Medicine popup is open, record a dose and then focus another
echo      window. Confirm the popup updates without taking focus back.
echo  48. If Medicine data cannot load, the Meds badge must show an unavailable
echo      marker, never a completed check. This fault state is automated-only;
echo      do not alter your local files to force it during this review.
echo  49. Open Meds and confirm Manage medicines is always visible in the popup
echo      header, beside the close control. Select it and confirm the manager opens.
echo  50. Open Settings / Reminders and confirm a Medicine storage block appears
echo      below the workspace block, showing treatment, medicine and dose counts,
echo      the data file path, and the plaintext warning that medicine data is
echo      stored unencrypted and is excluded from the workspace export.
echo  51. Export the workspace from that same page. Open the exported JSON in a
echo      text editor and confirm it contains no treatment or medicine names.
echo  52. Enable "Show Windows notifications when a scheduled dose is due", then
echo      add a medicine with a dose time one or two minutes ahead. Wait for it.
echo      Confirm exactly one toast appears, that it names no medicine and reads
echo      "A scheduled dose is due.", and that no second toast follows for it.
echo  53. Set the grace window to its 15-minute minimum, then try 5 and 999 and
echo      confirm both clamp into the 15 to 240 range when the field loses focus.
echo  54. With reminders enabled, leave a dose unrecorded until it is past the
echo      grace window. Confirm it becomes Missed and raises no further toast.
echo  55. Close Attention Hub, let a scheduled dose time pass with the app closed,
echo      then reopen. Confirm the dose shows as Missed and no late toast appears.
echo  56. Turn the reminder setting off and confirm no further toasts appear while
echo      doses continue to become due.
echo  57. In Settings / Reminders, select "Delete all medicine data" on a
echo      disposable dataset. Confirm the confirmation names the treatment,
echo      medicine and dose-record counts before you approve it.
echo.
echo ================================================================
echo RELEASE GATE - upgrade verification. Do NOT use this launcher.
echo ================================================================
echo.
echo These steps need real installers and must pass before publishing.
echo The dev build cannot prove any of them: since M19 it uses its own
echo data directory and credential, which is exactly what an upgrading
echo user does not have.
echo.
echo  U1. BACK UP FIRST. Copy this whole folder somewhere safe:
echo        %APPDATA%\com.attentionhub.desktop
echo      Every step below writes to your real data. Restore from this
echo      copy if anything goes wrong.
echo  U2. Install the PREVIOUS release, or confirm it is already the
echo      installed version. Its installer is in the repository root.
echo  U3. In that build create data you will recognise: a project named
echo      "Upgrade probe", a to-do inside it, and confirm the Published
echo      ICS calendar is configured and showing events.
echo  U4. Note the file list in the folder from U1.
echo  U5. Install the NEW build over the top. Do not uninstall first.
echo      Uninstalling and reinstalling does not test an auto-update.
echo  U6. Confirm the project, its to-do, and the calendar events are
echo      all still there, and that widget position, visible panels and
echo      accent colour are unchanged. The calendar surviving is what
echo      proves the Credential Manager entry was not disturbed.
echo  U7. The release build must write to the folder itself, never to the
echo      "dev" subfolder. A dev folder may already exist from running
echo      development builds, so check timestamps rather than presence:
echo      after using the new build, workspace.json in the folder root
echo      must have a newer modified time, and the copy inside "dev" must
echo      not. If only the dev copy changes, debug assertions reached the
echo      shipped build and every updating user would open an empty app.
echo  U8. Open Medicine. It must be empty, because medicine.json is new
echo      in this release and upgrading users have none. Add a treatment
echo      and confirm it saves.
echo  U9. ROLLBACK. Install the previous release over the new one.
echo      Confirm projects and to-dos still load, and that the older
echo      build does not error on the medicine file it cannot read.
echo U10. SINGLE INSTANCE. With the installed release running, launch it
echo      again from the Start menu. Confirm the existing window is
echo      raised and that Task Manager shows only one Attention Hub
echo      process. The dev build is exempt from this guard by design, so
echo      this is the only way to test it.
echo.
echo If U6, U7 or U9 fails, do not publish. Those are data-loss paths,
echo not cosmetic defects.
echo.

echo.
echo Do not change your Windows clock or timezone for step 52; add a dose time a
echo couple of minutes ahead instead. Daylight-saving behaviour is covered by
echo automated fixtures, not by this review.
echo Native regression tests and human observations are separate from frontend checks.
echo Close the app or press Ctrl+C in the launch console when finished.
echo.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
