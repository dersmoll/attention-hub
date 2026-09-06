@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 exit /b 1
title Attention Hub M20 daily polish review
echo.
echo Attention Hub M20 - daily reliability and navigation review
echo.
echo M20 changed four things. Everything else in Medicine, Today and the
echo widget should behave exactly as it did in beta.12; report anything that
echo does not, even if it is not listed below.
echo.
echo ---------------------------------------------------------------
echo A. Truthful Medicine loading and error states
echo ---------------------------------------------------------------
echo   1. Open the Meds popup. While it is loading, the footer must read
echo      "Loading today's medicine record...". It must never say
echo      "No doses scheduled today." before the data has arrived.
echo   2. With a treatment that has doses today, confirm the footer reads
echo      "Today's medicine record".
echo   3. With an active treatment that genuinely has no doses today,
echo      confirm the footer reads "No doses scheduled today." That
echo      sentence is now only allowed after a load that succeeded.
echo   4. Record a dose so it fails - unplug nothing, just report if you
echo      ever see a failure - and confirm the doses STAY on screen with a
echo      separate error line. A failed Take must never blank the list or
echo      make the popup claim nothing is scheduled. Data-unavailable
echo      states are covered by automated fault injection; do not alter
echo      your real medicine files to force one.
echo.
echo ---------------------------------------------------------------
echo B. Join link reliability
echo ---------------------------------------------------------------
echo   5. With a meeting that has a joining link showing in the widget,
echo      open Advanced and press Refresh several times - at least four,
echo      more than you think is reasonable. Leave the widget's Join
echo      button untouched throughout.
echo   6. Now press the widget's Join button. It MUST open the meeting.
echo      Before M20 the second Advanced refresh silently invalidated it
echo      and Join reported an expired link. This is the whole fix.
echo   7. Repeat while the meeting is current, then while it is upcoming.
echo   8. Change the saved calendar source in Advanced to a different
echo      published URL, or remove the source. The previous source's Join
echo      action must stop working immediately, not after a delay.
echo   9. Confirm Join and Return to Zoom still behave as they did: they
echo      are different actions and neither claims attendance.
echo.
echo ---------------------------------------------------------------
echo C. Which doses the Meds popup shows
echo ---------------------------------------------------------------
echo  10. Create FOUR active treatments with doses today. Record every
echo      dose in the first three, and leave a dose due or missed in the
echo      fourth. Open the Meds popup.
echo  11. The fourth treatment's unrecorded dose MUST be visible. Before
echo      M20 the first three treatments claimed every heading and it was
echo      unreachable no matter how urgent it was.
echo  12. Confirm the popup still shows at most three treatment headings
echo      and eight dose rows, and that the +N more count is exact.
echo  13. Confirm the treatments shown stay in their normal order - the
echo      panel must not reshuffle itself as you record doses.
echo  14. Press and HOLD a Take or Skip button for about a minute without
echo      releasing, so the 30-second clock tick lands mid-press. The rows
echo      must not move under your finger and the popup must not resize.
echo      Release and confirm the correct dose was recorded.
echo  15. Repeat step 14 with the keyboard: Tab to a dose button, hold
echo      Enter, wait for a tick, release.
echo  16. Repeat step 14 in TODAY's medicine list. Today re-renders every
echo      second, so hold a Take or Skip there for about half a minute
echo      and confirm the rows stay put until you release.
echo.
echo ---------------------------------------------------------------
echo D. Contextual overflow navigation
echo ---------------------------------------------------------------
echo  17. With more than eight doses today, open the Meds popup and select
echo      "+N more". Medicine must open ON the hidden dose's treatment,
echo      on its Today tab, with that dose scrolled into view and focused.
echo      It must no longer open on whatever was last selected.
echo  18. Do the same from Today's medicine "+N more".
echo  19. Repeat with Medicine ALREADY OPEN on a different treatment. It
echo      must move to the right one. Repeat with Medicine closed.
echo  20. Click "+N more" several times quickly. Nothing may open twice or
echo      leave both windows hidden.
echo  21. DRAFT SAFETY. In Medicine, start adding a medicine and leave the
echo      form open. Now select "+N more" from the popup. Medicine must
echo      NOT jump away and lose your form - it must explain what to
echo      finish, and the popup must stay open showing that reason.
echo  22. Repeat step 21 with: an open rename form, an open delete
echo      confirmation, and unsaved treatment notes. In every case the
echo      draft survives and the reason is readable.
echo  23. Finish or cancel the form, select "+N more" again, and confirm
echo      navigation now works and the popup closes.
echo      With two windows open on the same data, record the hidden dose in
echo      Medicine and THEN select "+N more" in the popup. Medicine must
echo      show the treatment and the popup must stay open explaining that
echo      the dose is no longer in today's list - it must not close as if
echo      it had taken you to something.
echo  24. Confirm "Manage medicines" in the popup header still opens the
echo      manager and closes the popup, as before.
echo.
echo ---------------------------------------------------------------
echo E. Carried over - not yet accepted
echo ---------------------------------------------------------------
echo  25. M19's own acceptance record remains authoritative and is still
echo      open. Its installed and visual checks live in
echo      REVIEW-M19-MEDICINE-TRACKER.cmd and have NOT been re-run here.
echo      Do not treat M20 as closing them.
echo.
echo ================================================================
echo RELEASE GATE - upgrade verification. Do NOT use this launcher.
echo ================================================================
echo.
echo These steps need real installers. The dev build cannot prove them:
echo it uses its own data directory and credential, which is exactly what
echo an upgrading user does not have.
echo.
echo NOTE: these are NOT M19's U-steps. M19 shipped Medicine as a new
echo feature, so its U8 expected Medicine to be EMPTY after upgrading.
echo Upgrading beta.12 to M20, that expectation is inverted: an empty
echo Medicine window now means DATA LOSS. Do not copy the M19 list.
echo.
echo  U1. BACK UP FIRST. Copy this whole folder somewhere safe:
echo        %APPDATA%\com.attentionhub.desktop
echo      Every step below writes to your real data. Restore from this
echo      copy if anything goes wrong.
echo  U2. Install beta.12, or confirm it is already the installed
echo      version. Its installer is in the repository root.
echo  U3. In that build create data you will recognise: a project named
echo      "Upgrade probe" with a to-do, a treatment named "Upgrade meds"
echo      with a medicine and at least one RECORDED dose, and confirm the
echo      Published ICS calendar is configured and showing events.
echo  U4. Note the file list in the folder from U1, including
echo      medicine.json.
echo  U5. Install the NEW build over the top. Do not uninstall first.
echo      Uninstalling and reinstalling does not test an auto-update.
echo  U6. Confirm the project, its to-do, and the calendar events are all
echo      still there, and that widget position, visible panels and accent
echo      colour are unchanged. The calendar surviving is what proves the
echo      Credential Manager entry was not disturbed.
echo  U7. The release build must write to the folder itself, never to the
echo      "dev" subfolder. A dev folder may already exist from running
echo      development builds, so check timestamps rather than presence:
echo      after using the new build, workspace.json in the folder root
echo      must have a newer modified time, and the copy inside "dev" must
echo      not. If only the dev copy changes, debug assertions reached the
echo      shipped build and every updating user would open an empty app.
echo  U8. PRESERVATION. Open Medicine. "Upgrade meds" and its medicine
echo      must still be there, and the dose you recorded in U3 must still
echo      read as recorded. An empty Medicine window is a FAILURE now,
echo      not the expected result. Confirm medicine.json in the folder
echo      root still holds your treatment.
echo  U9. ROLLBACK. Install beta.12 over the new one. Confirm projects,
echo      to-dos AND the medicine treatment with its recorded dose all
echo      still load, and that beta.12 reports no error reading the
echo      medicine file M20 last wrote.
echo U10. SINGLE INSTANCE. With the installed release running, launch it
echo      again from the Start menu. Confirm the existing window is
echo      raised and that Task Manager shows only one Attention Hub
echo      process. The dev build is exempt from this guard by design, so
echo      this is the only way to test it. This step is carried over from
echo      M19, where it was never run.
echo U11. JOIN AFTER UPGRADE. In the installed build, let the calendar
echo      refresh at least twice, then press Join on a meeting that has a
echo      link. Section B is a development-build check; this confirms it
echo      in the shipped one.
echo.
echo If U6, U7, U8 or U9 fails, do not publish. Those are data-loss
echo paths, not cosmetic defects.
echo.
echo.
echo Native regression tests and human observations are separate from
echo frontend checks. Do not change your Windows clock or timezone for
echo any step above.
echo Close the app or press Ctrl+C in the launch console when finished.
echo.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
endlocal
