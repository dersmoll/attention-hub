@echo off
setlocal EnableExtensions
title Attention Hub - M23 day plan review
cd /d "%~dp0"
if errorlevel 1 exit /b 1
echo.
echo M23: Yesterday, Today and Tomorrow
echo.
echo 1. Open Today. The centered date switcher must be the first element in the
echo    popup, using an 18px row. Its chevrons align vertically, use the themed
echo    transparent hover treatment, and remain centered when Today is visible.
echo    The Close icon belongs in the popup's top-right corner, above the summary.
echo 2. Change day. The plan content should softly fade and rise into place;
echo    the date switcher remains steady. With Windows reduced motion enabled,
echo    the content must change without animation.
echo 3. Press Next day. All three sections must describe tomorrow.
echo    Tasks scheduled tomorrow and Still open from today must be separate.
echo 4. Browse Yesterday. Retained completed tasks and medicine records appear.
echo    The notice explains that this is not an exact historical snapshot.
echo 5. Adjacent days must have no Skip, Take, Complete or Not today actions.
echo    Opening task details and event materials should still work.
echo 6. Switch dates quickly while the calendar loads. Old results must never
echo    appear under the wrong date. A failed read must not say no events.
echo 7. Return to Today. Normal recording actions must work again.
echo 8. Leave Tomorrow open through a calendar refresh. The date stays selected.
echo    Close and reopen the popup. It opens Today.
echo 9. Check keyboard navigation, small screens and long lists: all content
echo    must remain reachable by scrolling and Escape closes the popup.
echo 10. If testing across midnight, Today follows the new day; an explicitly
echo    selected date stays pinned while within the three-day range.
echo.
echo This starts a development run and may stop an earlier local dev run.
echo Keep the console open. Ctrl+C stops the test run.
pause
call "%~dp0RUN-ATTENTION-HUB.cmd"
exit /b %ERRORLEVEL%
