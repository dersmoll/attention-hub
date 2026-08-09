# Attention Hub — planning audit and forward plan

## Status

Audit performed 2026-08-09 against the repository's pre-implementation state: `docs/vision.md`, `docs/architecture.md`, `docs/milestones/milestone-0-notification-spike.md`, `docs/decisions/0001-*.md`, `docs/decisions/0002-*.md`, and the `create-tauri-app` scaffold under `src/` and `src-tauri/`. No notification code exists yet. No git commit exists yet.

## Purpose of this document

Record an independent audit of the plan as written, name gaps the existing docs do not cover, and propose a concrete near-term action order. This document does not replace `vision.md` or the milestone doc; where it disagrees or adds risk, that should be folded back into those documents rather than treated as a second source of truth.

## Audit summary

### Vision (`docs/vision.md`)

Sound and unusually well-bounded for a pre-code document. The product statement is a single sentence, the principles are concrete enough to reject scope creep by inspection ("no third-party account aggregation," "no telemetry unless explicitly proposed"), and the non-goals list for the current milestone is explicit rather than implied. The vision correctly treats Milestone 0 as a feasibility spike, not a v1.

One real product risk is already named inside the milestone doc's risk table but not in the vision itself: *a notification is not necessarily equivalent to unread/needs-attention state*. That is a claim about the product's core premise, not an implementation detail, and belongs in `vision.md` as an acknowledged open question, not buried in a spike risk table.

### Architecture (`docs/architecture.md`)

The normalized-snapshot boundary (ADR 0001) is the correct shape: WinRT objects never cross the Tauri IPC boundary, React never models platform types, and native change events are demoted to invalidation signals rather than a state feed. This buys reload/crash/missed-event recovery for free and is worth keeping even if the notification source changes later.

Two things are underspecified relative to the risk they carry:

- **Threading/runtime integration.** The doc says `RequestAccessAsync` "must be called from a UI thread" but does not address how a WinRT `IAsyncOperation` and a COM event subscription (`NotificationChanged`) integrate with Tauri's async runtime (Tokio) and event loop. This is a plausible source of hangs or missed events, independent of the permission/packaging question, and deserves its own line in the risk table.
- **No test boundary is named.** The DTO mapping from WinRT results to the normalized `NotificationSnapshot`/`AttentionNotification` shape is pure data transformation and is unit-testable without a live listener or real notifications. The doc's dependency policy is otherwise strict about not adding things without cause; it should be equally explicit that this mapping layer gets tests, since it is the one part of the adapter that is testable at all.

### Milestone 0 plan (`docs/milestones/milestone-0-notification-spike.md`)

This is the strongest artifact in the repo. The phase structure front-loads the highest-uncertainty item (packaging/permission feasibility, Phase 1) before any UI or normalization work, with an explicit exit gate that allows the milestone to stop early on a reproducible blocker. The manual test matrix (P1–E2) is thorough enough to actually produce a go/no-go decision instead of vibes. The risk table already names most of the real risks (package identity, UI-thread requirement, notification-vs-unread mismatch, ID stability, missed/bursty events).

Gaps:

- No time-box. Five phases each with their own exit gate is good structure but has no stated ceiling, and a spike with no ceiling tends to quietly become the whole project. Suggest treating Phase 0+1 as strictly time-boxed (e.g., a few focused sessions) since that is where the binary kill/continue decision actually lives; Phases 2–4 are lower-risk, more mechanical follow-through once Phase 1 passes.
- No stated fallback if Phase 1 fails outright. See "No official fallback API" below — this should be a documented default outcome, not something decided ad hoc after a bad result.
- Rust/WinRT async-thread integration is missing from the risk table, as noted above.

### ADRs

Both ADRs are appropriately scoped ("Accepted for Milestone 0" / "Accepted for investigation" rather than permanent decisions) and correctly identify that packaging feasibility is a go/no-go input, not a deployment afterthought. No changes suggested.

### Scaffold

Matches what the docs claim: an unmodified `create-tauri-app` React+TS template reduced to a placeholder screen, no notification code, `pnpm build` presumed to pass (not re-verified in this audit). Dependency set is minimal and matches the architecture doc's dependency policy. Nothing here is ahead of or behind what the docs describe.

## Additional risks not currently written down

| Risk | Why it matters | Suggested response |
| --- | --- | --- |
| WinRT async operations and COM event subscriptions must coexist with Tauri's Tokio runtime and window event loop. | Wrong integration can hang the UI thread on `RequestAccessAsync`, or silently drop `NotificationChanged` events if the apartment/message pump isn't alive when they fire. | Add as an explicit Phase 1/3 spike question. Prove the threading model with a trivial synchronous call before wiring it into a real command. |
| There is no other official Windows API that answers "what needs attention across arbitrary apps" if `UserNotificationListener` is blocked by packaging requirements. | A negative Phase 1 result is closer to "the notification-observer concept is not viable as scoped" than "pick a different implementation." Silently downgrading ambition after a bad result is worse than deciding the fallback in advance. | Add one sentence to `vision.md`: if notification observation is not viable, calendar awareness (already named as a later hypothesis) becomes the primary signal instead of a secondary one, and the product statement narrows accordingly. |
| No commit exists yet. | The project's own principle is to treat inconvenient platform behavior as evidence; an unversioned spike produces no diffable trail of what was tried and when. | Make an initial commit of the current docs+scaffold before starting Phase 0, then commit at each phase exit gate. |
| No test strategy is named anywhere. | The normalization/mapping code (WinRT result -> `AttentionNotification`) is the one layer of the adapter that is testable without live notifications, and it is exactly the code most likely to have edge-case bugs (missing text elements, null source identity, malformed timestamps). | Add unit tests for the mapping layer as part of Phase 2, using constructed/fake input shapes rather than live WinRT calls. |

## Recommendation

Proceed with Milestone 0 as scoped. It is asking the right question in the right order. Before writing notification code:

1. Make an initial git commit of the current state (docs + scaffold) so the spike has a clean starting point to diff against.
2. Add the two missing risk-table rows (threading integration; no fallback API) to the milestone doc's risk table, and add the one-sentence fallback framing to `vision.md`.
3. Execute Phase 0 and Phase 1 as a time-boxed unit and treat Phase 1's exit gate as the real decision point for the whole project, not a formality — do not start Phase 2 normalization/UI work until access status reliably reaches `Allowed` (or a reproducible blocker is fully documented).
4. Only after Phase 1 passes: implement the mapping layer with unit tests alongside it (not after), then proceed through Phases 2–4 as written.
5. Complete the Milestone 0 findings section honestly, including a real "stop" outcome if warranted — the milestone doc already asks for this; the risk is skipping it under momentum once some code compiles.

## Open questions for the product owner

These are decisions only the user can make; nothing above should be read as pre-deciding them.

- If Phase 1 shows notification access requires a full MSIX identity with signing/registration overhead, is that overhead acceptable for a personal tool, or is that itself a "stop" condition regardless of whether the API technically works?
- Is Windows-only, single-user, unpackaged-first still the right target, or is a packaged/MSIX-first approach preferable given that packaging is likely required anyway?
- Should the calendar-awareness hypothesis mentioned in the vision be pulled forward as a parallel, lower-risk track, given that it does not depend on the Phase 1 outcome at all?
