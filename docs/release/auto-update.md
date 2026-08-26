# Attention Hub auto-update release contract

Attention Hub uses the Tauri v2 updater with one user-confirmed Windows update
channel. Update checks fetch only signed release metadata over HTTPS. They do
not upload local settings, calendar data, attention observations, or telemetry.

## Bootstrap boundary

`v0.6.0-beta.6` and earlier do not contain the updater public key. Users of
those versions must install the first updater-enabled release manually. After
that bootstrap installation, newer signed beta releases can be installed from
the in-app update dialog.

## Trust material

- The updater public key is embedded in `src-tauri/tauri.conf.json`.
- The matching private key is not part of the repository. The initial key was
  generated as a passphrase-protected key at
  `%USERPROFILE%\.tauri\attention-hub-updater.key`, with its public key beside
  it. The local passphrase recovery value is protected for the current Windows
  user with DPAPI in `attention-hub-updater.password.dpapi`.
- The `updater-release` GitHub environment must require manual approval and
  provide separate `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` environment secrets.
- Keep encrypted offline backups of the private key and passphrase in separate
  controlled locations. Losing either prevents future releases from updating
  already-installed clients.
- Tauri updater signatures are mandatory and are separate from Windows
  Authenticode signing. The latter remains a separate certificate-backed
  release decision.

## Publishing

The `Release Windows beta` workflow runs only for pushed `v*` tags and pauses
for approval in the `updater-release` environment. It:

1. Verifies the tag matches `package.json`, `Cargo.toml`, `Cargo.lock`, and
   `tauri.conf.json`.
2. Runs all frontend tests/builds and the Rust format, test, and Clippy gates.
3. Uses the pinned Tauri Action to build NSIS plus its updater signature and
   publish a GitHub prerelease with `latest.json`.
4. Validates that JSON contains the expected version and a signed Windows x64
   artifact.
5. Updates `latest-beta.json` on the dedicated `updater-feed` branch. Installed
   beta clients read that stable raw-GitHub URL.

Do not update the feed manually before the versioned release assets exist.
Never commit or print the private signing key.

## Application behavior

- The widget checks 15 seconds after startup and every four hours while open.
- Selecting **Later** suppresses the same version for 24 hours. A newer version
  is shown immediately on the next successful check.
- Advanced → Updates provides a manual check and retry path.
- Download and installation begin only after **Update now** is selected.
- Windows exits Attention Hub while the passive NSIS update is installed.
- A network, metadata, download, or signature failure leaves the installed
  version unchanged and exposes a retry action.

## Release acceptance

Before declaring the updater operational, verify an installed bootstrap build
against a later signed test release:

- automatic and manual detection;
- Later snoozing and newer-version override;
- progress and successful NSIS replacement;
- relaunch with preserved widget preferences and Published ICS credential;
- rejection of a modified artifact or incorrect signature;
- offline and interrupted-download recovery;
- DWM mirror/process cleanup across the Windows installer exit.
