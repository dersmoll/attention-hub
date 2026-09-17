# M23 day plan browser

Approved scope: extend the Today popup with Yesterday / Today / Tomorrow navigation.
The popup opens on Today. An explicitly chosen date survives background refreshes;
Today follows midnight. Dates outside the adjacent-day range clamp to its boundary.

All sections share one local civil date; actual current time remains independent.
Today retains recording actions and existing task/dose selection. Adjacent days
are previews; task details and associated event materials remain accessible.
Tomorrow shows scheduled tasks separately from actionable work still open today.
Yesterday uses retained task dates/completion records and medicine dose records,
including finished courses. It is not a historical snapshot: edits/deletions and
calendar feed retention affect available records. No history database is added.

Calendar previews use a date-specific native query and existing ICS parsing and
workspace associations, independently of the live current/next attention state.
Responses are date checked; obsolete requests cannot replace the selected day.
An unreadable calendar is not presented as an empty day. Local civil date arithmetic
handles DST boundaries without assuming every day lasts 24 hours.

Manual acceptance: run REVIEW-M23-DAY-PLAN.cmd from this checkout. Check all three
sections, quick date switching, keyboard/scroll behavior, refresh and midnight.
Model tests cover task/dose semantics and local date boundaries. Native tests cover
calendar selection and isolation. Automated checks do not establish visual acceptance.
Build, commit, push and release remain separate gates.

Implementation verification: TypeScript no-emit check passed; workspace/day-plan,
medicine (all six suites), work-calendar, school-day, widget-layout and
meeting-workspace checks passed. Rust library tests: 128 passed, 1 ignored;
formatting passed. No production build, live feed or WebView visual acceptance
performed. Existing untracked artifacts and the Cargo.toml metadata-only marker
were preserved.
