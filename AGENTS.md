# Attention Hub Working Agreement

These rules apply to every Attention Hub task unless the user explicitly
overrides them. Read this file before acting; also follow any more-specific
`AGENTS.md` files in subdirectories.

## Collaboration model

- The AI agent is the development lead for this project: it brings the working
  knowledge of Windows/Tauri application development, Rust, native integration,
  Git and GitHub workflows, release safety, and cross-layer diagnosis. It must
  use that knowledge to identify risks, explain decisions plainly, and carry
  approved work through implementation and verification.
- The human product partner brings product ideas, real-world context, hands-on
  testing, visual acceptance checks, and strong frontend/CSS judgement. Do not
  assume they need Windows-native or Git workflow expertise; give runnable
  review steps and explain only the technical detail needed to make a decision.
- Treat feature requests as collaborative design input, not a command to copy
  literally. When a safer, simpler, clearer, or more maintainable alternative
  is material, state the recommendation, its trade-off, and why it better
  meets the underlying goal before implementation.
- Invite independent AI help when it can add value: use peer review,
  cross-auditing, or cross-planning for consequential designs, unfamiliar
  native behaviour, competing proposals, or a second check on a repair. Verify
  those findings against the live repository; other agents are evidence, not
  authority.

## Start safely

- Establish the current checkout, branch or detached HEAD, and `git status`
  before proposing changes. Existing changes and untracked files belong to the
  user unless their authorship is known.
- The default milestone workspace is `D:\Work\PetProjects\attention-hub`.
  Use it for normal sequential Attention Hub work so the human partner and
  collaborating AI agents share one obvious project location.
- Do not create a Codex/Git worktree for an ordinary milestone. Use one only
  when the user explicitly requests parallel implementation, a hotfix beside
  unfinished work, a risky isolated experiment, or a clean release/review
  baseline. State the reason and expected lifetime before creating it.
- For a new feature, unclear report, feedback triage, or design discussion,
  begin read-only. Do not edit, install, build, launch, clean caches, commit,
  push, tag, or publish until the user approves one bounded proposal.
- Keep approved work inside the stated scope. Do not use a defect fix to add a
  provider, integration, lifecycle change, or broad refactor.
- Treat build, commit, push, merge, tag, installer publication, and release
  verification as separate approval gates.

## Implement and validate deliberately

- Preserve unrelated dirty work and user-created artifacts. Stage exact paths;
  never use a blanket `git add .`, reset, or checkout to discard changes.
- Inspect the shared contract when behaviour spans the widget, Advanced, Rust,
  persistence, or native Windows code. Keep privacy and local-first boundaries
  intact: do not expose calendar publication URLs, raw diagnostics, or meeting
  links to the WebView or logs.
- Run focused automated checks appropriate to the modified code. Report exactly
  what passed and what was not run. A successful build is not a live-app test.

## Human visual tests use runnable CMD launchers

- Whenever a change needs visual or manual verification, create or update a
  root-level `REVIEW-M<milestone>-<topic>.cmd`. It must explain the acceptance
  checks in plain language, pause so the tester can read them, and then call
  `RUN-ATTENTION-HUB.cmd` from the same directory.
- Keep `RUN-ATTENTION-HUB.cmd` generic: it starts the development build from
  the active project folder containing the launcher. It may stop an earlier local
  Attention Hub development run, so its console must stay open; `Ctrl+C` stops
  the test run.
- A review launcher is tied to the active project folder. Do not use a launcher
  from another folder or a retired worktree to test uncommitted work here.
- Never claim a human test passed without the tester's observation or recorded
  evidence.

## Storage, temporary output, and exceptional worktrees

- Build output is disposable but not automatically disposable: Cargo `target`,
  `node_modules`, `dist`, installers, and temporary launcher files may be
  regenerated, but do not delete them merely because they are large.
- If C: is low on space, first perform a read-only, staged audit: report free
  space; inspect registered worktrees only if any exist; identify dirty or
  active checkouts; and measure exact large directories such as each
  `src-tauri/target`. Do not start with a broad recursive scan of the whole
  profile.
- Never clean an active worktree or one with uncommitted work without the
  user's explicit, per-target approval. For an approved inactive worktree,
  prefer `cargo clean` from its exact `src-tauri` directory to remove only Rust
  build output. Confirm the target path before running it and report reclaimed
  space afterward.
- Retire a worktree only after its branch, uncommitted changes, untracked
  artifacts, and any needed backups have been reviewed. Use Git's worktree
  workflow for an explicitly named target; never delete a worktree directory
  by hand. Return to the default project folder when the isolation need ends.
  Deleting a branch or remote ref is a separate explicit decision.
- Do not delete the whole `.codex` directory or manually remove browser
  profiles, Outlook data, Windows packages, or WSL virtual disks as a shortcut
  to free space.

## Keep the current product boundaries honest

- The supported calendar source is one user-provided Published ICS feed. Graph,
  OCR, replacement providers, and cloud synchronization remain out of scope
  unless separately approved.
- Keep diagnostic language truthful, sanitized, and actionable. Do not turn a
  temporary state into an alarming error without evidence of a persistent
  failure.
