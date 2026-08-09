# Attention Hub vision

## Product statement

Attention Hub is a small, persistent Windows information panel that answers:

> What currently needs my attention?

It is an observer, not a container. Microsoft Teams, Microsoft Outlook, Telegram, and other applications continue to run independently in their existing windows and positions. Attention Hub observes useful operating-system state and presents a compact, persistent summary controlled by the user.

## Problem

Important updates are easy to miss on a large multi-monitor setup. Traditional toast notifications are transient, while leaving every communication application visually prominent creates noise and consumes attention.

## Product principles

- Local-first, with no cloud backend.
- No telemetry unless explicitly proposed and approved later.
- No third-party account aggregation and no application credentials.
- Prefer official operating-system APIs over scraping or UI automation.
- Persistent information instead of interruptive popups.
- User-controlled size, position, prominence, and observed sources.
- Add capability only after real daily use demonstrates value.
- Preserve the observer boundary: do not host, embed, or replace source applications.
- Treat inconvenient platform behavior as evidence, not something to conceal.

## Initial product hypothesis

Windows notification state can provide a useful approximation of which applications currently need attention. If the hypothesis holds, a later product UI may summarize active notification state and subsequently add calendar awareness.

Notification presence is not equivalent to unread state or an obligation to act. Milestone 0 must measure how well current Windows notification state correlates with the user's real attention needs; until that evidence exists, the product must describe the signal as current or active notifications rather than unread work.

The first milestone is intentionally a technical spike. It must prove that useful state can be obtained reliably before visual design or product expansion begins.

## Success direction

Attention Hub should eventually be useful at a glance, remain quiet when nothing needs attention, and require no duplicate account configuration. Milestone 0 succeeds more narrowly when it produces enough evidence to decide whether Windows notification state and Tauri are a viable foundation.

## Non-goals for the current milestone

Milestone 0 does not include production UI, a design system, calendar integration, history storage, settings, themes, tray behavior, autostart, global shortcuts, application launching/focusing, filtering UI, privacy mode, production installation/update work, cloud functionality, analytics, or telemetry.
