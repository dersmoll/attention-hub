# M23 Time Focus clock and timer

Approved scope: enlarge the Time Focus clock to three times its previous type
size and add an optional, secondary stopwatch beneath it.

Time Focus uses a fixed 190px widget height and a 560px clock segment in either
widget density. Leaving Time Focus restores the selected normal density and its
38px or 48px height. Existing app shortcuts and utility controls remain present.

The stopwatch is idle by default. Start, Pause/Resume, and Reset are available
directly beneath the clock. Its elapsed value uses smaller tabular figures and
does not compete with the wall clock. The timer state stores accumulated elapsed
milliseconds plus an optional wall-clock start timestamp, so it continues while
the layout changes or the app is closed and reopens accurately. No task naming,
countdown, notification, project association, or background service is added.

Manual acceptance: run `REVIEW-M23-TIME-FOCUS.cmd`. Automated model checks cover
start, pause, resume, reset, formatting, corrupted storage, and clock rollback.
Layout checks cover the dedicated Time Focus dimensions and source/CSS contract.
