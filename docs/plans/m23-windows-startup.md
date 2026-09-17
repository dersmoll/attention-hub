# M23 Windows startup setting

Approved scope: let the user opt in to launching the installed Attention Hub
widget after signing in to Windows. The setting lives in Advanced → General and
is off until the user enables it.

The WebView receives only an availability flag and enabled state. Two narrow
native commands perform the change and immediately read back the registration
state. They do not expose the autostart plugin directly to every application
window. Failures use generic Windows messages and retain the last confirmed
state.

Only a Windows release build registers the autostart plugin. Development builds
and other platforms report that the control is unavailable, so a target/debug
executable can never become the user's Windows sign-in entry. The normal main
widget opens after sign-in; no tray process, hidden-background startup, or
closed-app reminder service is added.

Manual acceptance: run `REVIEW-M23-WINDOWS-STARTUP.cmd`. The development run
must show a disabled installed-build notice. In an installed release build,
enable the setting, verify it appears in Windows Startup apps, then disable it
and verify the registration is removed. Windows may apply its own Startup apps
policy separately from the app registration.

Automated verification should include TypeScript no-emit, Rust formatting and
library tests. A build proves the native integration compiles; it does not prove
Windows will launch the installed binary after a real sign-in.
