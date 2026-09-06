# M15 release-workflow follow-up

Observed while publishing `v0.6.0-beta.8`:

- `tauri-apps/tauri-action@v0.5.24` reports that `generateReleaseNotes` is an
  unsupported input. Remove it or replace its behavior with currently supported
  action configuration after verifying the latest pinned action release.
- The pinned action still runs on Node 20. GitHub warns that Node 20 will be
  retired; upgrade the pinned action and confirm its runtime before the
  retirement date. Do not set the insecure Node-version override as a fix.

These warnings did not block the signed beta.8 build or indicate a runtime
defect in Attention Hub.
