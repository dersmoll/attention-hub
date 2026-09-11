# Meeting-start sound

`meeting-start.wav` is the bundled meeting notification sound, converted by the project owner from the original ElevenLabs-generated `meeting-start.mp3`.

- Duration: approximately 1 second
- WAV bit rate: 705 kbps
- WAV SHA-256: `02DB023F9BFB2970B73F9782FBD6AF2367897F7AD715886968D71E38892FDFC2`
- Original MP3 SHA-256: `C361224F0113BC6ADB3A33D3FA709ACF516E2B70ABA2163F993980CB6BDAAAE6`
- Runtime: only the WAV is bundled, then played locally through the native Windows `PlaySoundW` API

The project owner supplied this generated sound and approved bundling it in the
public beta. It was generated on the ElevenLabs free plan, is restricted to
non-commercial use with attribution to `elevenlabs.io`, and is not covered by
the repository's MIT licence. See `THIRD_PARTY_NOTICES.md` before redistribution.

## Selectable reminder sounds

The six WAV files under `new/` were converted by the project owner from Pixabay
MP3 downloads retained outside the bundled release. The application bundles
only the WAV files and maps stable preference IDs to fixed resource paths in
Rust. The original download titles, creators, asset IDs, and applicable Pixabay
Content License are recorded in `THIRD_PARTY_NOTICES.md`.
