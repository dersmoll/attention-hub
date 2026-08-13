# Attention Hub clean-machine checklist

This checklist distinguishes current-profile evidence from a disposable Windows
environment. A successful installed run on the developer profile is not a
clean-machine result.

## Candidate

- Version: `0.4.0-beta.1`
- Installer: `Attention Hub_0.4.0-beta.1_x64-setup.exe`
- SHA-256: `E6AAA2E69DB19A37309C07718A736528A2E010402B2BC271A3C4EEFD1E5AE444`
- Signature: unsigned
- Required architecture: x64

## Disposable-environment prerequisites

- [ ] Fresh supported Windows x64 environment with no prior Attention Hub data
- [ ] Standard non-administrator test user
- [ ] Network available only if WebView2 bootstrap or saved calendar setup is
      explicitly being tested
- [ ] Screen recording and shared clipboard disabled unless specifically needed
- [ ] Installer transferred by a hash-verifiable mapped/read-only folder
- [ ] No real calendar URL, account value, source label, or screenshot captured

## Execution matrix

- [ ] Record Windows edition, display version, build/UBR, architecture, display
      topology, and effective DPI
- [ ] Record whether Evergreen WebView2 already exists and its version
- [ ] Launch the unsigned installer and record the exact SmartScreen path
- [ ] Complete standard-user per-user installation
- [ ] Confirm one uninstall entry and embedded `0.4.0-beta.1` version
- [ ] Confirm first run creates a 960 by 80 widget without a development server
- [ ] Confirm no saved calendar and default v1 preferences are invented as user
      data
- [ ] Confirm stopped source buttons do not launch applications
- [ ] Restart Attention Hub and Windows once
- [ ] Uninstall and record application-directory, shortcut, WebView storage, and
      Credential Manager target outcomes
- [ ] If testing upgrade separately, restore the disposable environment, install
      `0.3.0-beta.1`, set only synthetic preferences, then upgrade in place
- [ ] Destroy or reset the disposable environment after exporting sanitized
      metadata only

## Current host availability

- Host registry build: display version 25H2, build 26220.9022, AMD64.
- Evergreen WebView2 runtime: `152.0.4191.19`.
- Current-profile install, uninstall retention, and `0.3.0-beta.1` to
  `0.4.0-beta.1` upgrade passed separately; they do not satisfy this checklist.
- Hyper-V is enabled but has no registered VM.
- Windows Sandbox (`Containers-DisposableClientVM`) is disabled.

Enabling Windows Sandbox requires an administrator-level Windows feature change
and normally a host restart. Creating a Hyper-V clean machine requires a Windows
installation image, guest storage, and licensing/activation decisions. Neither
is inferred from approval to test the application, so clean-machine execution
remains blocked pending one explicit environment choice.
