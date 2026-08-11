# Attention Hub vision

## Product statement

Attention Hub is a small, movable Windows desktop widget that answers:

> What currently needs my attention?

It is an observer, not a container. Microsoft Teams, Microsoft Outlook,
Telegram, and other applications continue to run independently. Attention Hub
composes a compact user-positioned widget from source-owned operating-system
state, local clocks, and an approved passive calendar source.

The intended widget has three stable zones:

1. live communication application icons and badges on the left;
2. large local and configurable secondary-zone clocks in the center;
3. the active or next work-calendar event on the right.

Detailed source health, settings, and evidence belong in an on-demand Advanced
window rather than in the primary at-a-glance surface.

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

Windows-owned and application-exposed desktop state can provide a useful approximation of which applications currently need attention without requiring account credentials or producing more interruptions. Current notification state was the first sensor tested; taskbar/tray/window accessibility state is the next bounded sensor because the desired signal is persistent unread/activity state rather than a mirror of Notification Center.

Notification presence is not equivalent to unread state or an obligation to act. Milestone 0 must measure how well current Windows notification state correlates with the user's real attention needs; until that evidence exists, the product must describe the signal as current or active notifications rather than unread work.

Preliminary Milestone 0 evidence confirms the distinction: Telegram Desktop displayed nonzero unread/taskbar badges while `UserNotificationListener` returned no Telegram toast. Windows app-notification state and badge/application-owned unread state are separate signals. Attention Hub must not relabel one as the other or assume the notification listener can recover unread counts.

Attention Hub must not require users to enable or retain extra Windows toasts merely to feed the panel. Notification listening may remain a useful optional signal, but it is not the primary architecture if application-owned attention state can be observed reliably and read-only.

The first milestone is intentionally a technical spike. It must prove that useful state can be obtained reliably before visual design or product expansion begins.

Milestone 0 supports continuing with constraints: Tauri and a small Windows boundary are viable, but there is no universal cross-application unread-count contract. The next product priority is calendar awareness—especially upcoming Outlook/Teams meetings—because time-bound commitments are more actionable than further reverse-engineering of one application's badge. The first calendar hypothesis remains local-first and credential-free through Windows' appointment store; Microsoft Graph requires a separate product-policy decision.

Calendar investigation subsequently established that Windows' appointment data
is stale legacy residue and that the Microsoft 365 Calendar companion exposes
useful event structure only while its flyout is visible. Attention Hub's own
Graph work remains paused before registration or consent because it requires an
organization-owned policy decision. Milestone 3B therefore validates the actual
widget form factor and native visual composition with the already-proven Teams
and Telegram taskbar surfaces. It retains the structured source panel as
Advanced view and shows a truthful calendar-unavailable state. Calendar remains
essential to the end product, but provider approval is independent from proving
the widget shell.

## Success direction

Attention Hub should eventually be useful at a glance, remain quiet when nothing needs attention, and require no duplicate account configuration. Milestone 0 succeeds more narrowly when it produces enough evidence to decide whether source-owned Windows desktop state, optional notification state, and Tauri are a viable foundation.

## Non-goals for the current milestone

Milestone 3B does not add Slack or Viber observation, a calendar provider,
semantic Teams counts, OCR, image recognition, pixel readback, application
input, a final design system, autostart, installation/update work, analytics, or
telemetry.
