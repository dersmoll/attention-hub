# Attention Hub — planning audit and opinion (Kimi)

## Status

Audit performed 2026-08-09 against `docs/vision.md`, `docs/architecture.md`, `docs/milestones/milestone-0-notification-spike.md`, ADRs 0001–0002, the peer audits (`ahub-plan-claude.md`, `ahub-plan-gemini.md`), and the scaffold under `src/` and `src-tauri/`.

State verified directly in this audit (not taken from doc claims):

- `git log`: no commits; everything untracked on `main`. Confirmed.
- `rustc` / `cargo`: not installed. Confirmed — Phase 0 is a real blocker, not a formality.
- `pnpm build`: passes today (tsc + vite, 29 modules). Confirmed.
- Scaffold contents match the docs: placeholder `App.tsx`, empty Tauri builder in `lib.rs`, minimal `capabilities/default.json` (`core:default` only), no `windows` crate dependency yet.

## Executive summary

Three independent audits (Claude, Gemini, this one) now converge on the same conclusions: the plan is sound, the milestone ordering is right, and the dominant risk is Windows package identity. **That convergence is itself the finding: the marginal value of further planning is now approximately zero.** The repo currently contains five planning documents and zero lines of domain code. Every open question that matters — identity, permission threading, payload quality — can only be answered by running Phase 0/1, not by another document. The bottleneck has moved from analysis to execution.

## Where I agree with the peer audits (triangulated, high confidence)

- ADR 0001's normalized-snapshot boundary is correct and should survive even a technology pivot.
- Phase 1 is the real go/no-go gate for the whole project; everything after it is comparatively mechanical.
- The DTO mapping layer is the one unit-testable component and should get tests written alongside it, not after.
- An initial git commit must precede Phase 0 so the spike produces a diffable evidence trail.
- Toast presence ≠ unread state; this must stay an explicit open product question.

## Where I diverge from the peer audits

1. **Gemini's M1–M4 roadmap is premature and partially contradicts the vision.** Milestone 1's "app-specific payload formatters" and "noise filter engine" presuppose Phase 4 evidence that does not exist yet, and sit in tension with the architecture doc's ban on generalized provider abstractions and the vision's "add capability only after real daily use demonstrates value." Recording a speculative four-milestone roadmap before the spike's exit gate risks becoming a commitment device. Keep the roadmap to one milestone ahead, re-derived from evidence.

2. **"Pivot to calendar" is not an escape hatch from the packaging problem.** Both peer plans suggest calendar awareness as a fallback or parallel track if notification access fails on identity grounds. But WinRT `AppointmentStore` access requires its own capability declaration (`appointmentsSystem`, which is a *restricted* capability — a higher bar than `userNotificationListener`) and explicit user consent. A calendar pivot trades one identity/capability problem for a harder one. If Phase 1 fails on packaging, the honest fallback set is: (a) accept MSIX/sparse-identity overhead as a one-time cost, (b) drop to fragile surface signals (UIA/taskbar observation) that violate the "official APIs" principle, or (c) stop. Calendar belongs in none of those three.

3. **The identity decision should be made once, at Phase 1, and then treated as sunk.** Claude's open question — "is MSIX overhead acceptable?" — is right, but frame it as a single binary decision with a recorded answer, not a recurring cost assessment. Identity overhead is paid once (manifest + registration script + dev cert); it is not a per-milestone tax. If the answer is "acceptable," no future milestone should re-litigate it.

## Gaps none of the three documents (or peers) cover

1. **No quantitative pass/fail thresholds.** Every exit gate is qualitative ("sufficient evidence," "reliably"), which makes the Phase 5 decision vulnerable to momentum. Before Phase 4 starts, write down thresholds, e.g.: snapshot correctness in ≥ 90% of manual cases per app; removal-event convergence latency measured and under a stated bound; zero crashes across the full P1–E2 matrix. Numbers chosen in advance are what make a "stop" outcome executable.

2. **No deterministic test stimulus.** Cases E1 (malformed/missing payload) and R4 (notification replacement) depend on waiting for Teams/Outlook/Telegram to misbehave on cue. Windows lets you generate toasts to yourself with arbitrary XML payloads via PowerShell (the BurntToast module, or raw `Windows.UI.Notifications` from a script). A `scripts/send-test-toast.ps1` harness turns E1/E2/R4 from opportunistic observations into repeatable, controllable cases — including payloads with missing text elements that real apps rarely produce.

3. **No evidence-capture convention.** The milestone demands timestamped observations but defines no artifact format. Add a debug-UI "export snapshot as JSON" button (trivial given the snapshot command already exists) and a convention like `docs/milestones/evidence/m0/<case-id>.json` + notes, with the existing redaction rule applied. Phase 4 then produces structured, re-analyzable artifacts instead of prose recollections.

4. **Invalidation coalescing location should be pre-decided: Rust, not React.** The architecture doc defers debouncing "only if real behavior shows it is needed" but not where it would live. Case R3 (clear-all) implies event bursts; coalescing in the adapter before emitting the Tauri event is strictly simpler than React-side debounce (no effect-cleanup races, no per-subscriber timers) and keeps the frontend contract at "on event, fetch snapshot." Decide the location now even if the mechanism stays unimplemented.

5. **`"csp": null` in `tauri.conf.json` disables the default CSP.** Harmless for a local debug shell, but the architecture doc's own security section says no remote content is needed — so a restrictive CSP costs nothing and removes a class of accident. One line, worth folding into Phase 0.

6. **No dogfood gate between Milestone 0 and Milestone 1.** The vision's core principle — capability follows demonstrated daily-use value — has no milestone enforcing it. The debug UI after M0 is already usable as a daily driver. Propose an explicit gate: run the plain debug build as your actual attention panel for ~1–2 weeks before writing any Milestone 1 plan. This is also the cheapest possible test of the real product hypothesis (see below).

## Opinion on the vision and the product premise

The vision is strong for the reasons the peers cite. My sharpening of the core risk: **notifications are not the product — they are the first sensor.** The product is really an *attention-state estimator*; the toast stream is just the cheapest observable signal of that state. This framing matters because it tells you what to measure in the spike: not "did I get the notifications" (engineering) but "did the panel's state correlate with what I actually needed to act on" (product). Phase 4's app matrix already collects the raw material for the second question; the dogfood gate above is what would actually answer it.

Consequently, the "notification ≠ unread" risk is worse for some apps and better for others in ways worth predicting now: Teams clears toasts when the message is read elsewhere (good correlation); Outlook toasts often persist past reading on another device (poor correlation); Telegram toasts may never reach Windows if the phone client consumed them first (missing signal). Expecting these asymmetries in advance turns Phase 4 surprises into confirmations or clean falsifications.

## Recommended action order

1. **Initial git commit** of docs + scaffold (both peer audits agree; do it first).
2. **Bounded doc fold-back** (one editing pass, then stop): add the threading risk row and quantitative thresholds to the milestone doc; add the one-sentence fallback framing to `vision.md` with the corrected fallback set above; note the CSP line; create `scripts/send-test-toast.ps1` as a Phase 2 deliverable.
3. **Phase 0 + Phase 1, time-boxed** to a few focused sessions, with Phase 1's exit gate treated as the project's real decision point. Record the identity acceptability decision once, in writing.
4. **Phases 2–4 as written**, with mapping-layer unit tests alongside the adapter, the toast harness for deterministic cases, and JSON evidence exports per case.
5. **Phase 5 honesty check + dogfood gate**: complete the findings section (including a real "stop" if warranted), then use the debug UI daily before any Milestone 1 planning begins.

## Open questions for the product owner

- Is the identity/packaging overhead acceptable *as a fixed one-time cost*? Answering this now removes the only recurring strategic uncertainty.
- Will you actually use the ugly debug UI as your daily panel for the dogfood gate? If not, the "daily use demonstrates value" principle has no enforcement mechanism and Milestone 1 scope will be guesswork.
- If Phase 1 fails on identity grounds, is the honest answer "accept MSIX complexity" or "stop"? Pre-committing to one of these prevents the worst outcome: quietly absorbing complexity the vision never signed up for.
