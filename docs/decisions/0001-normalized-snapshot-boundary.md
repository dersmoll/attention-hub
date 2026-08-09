# ADR 0001: Use a normalized snapshot boundary

- Status: Accepted for Milestone 0
- Date: 2026-08-09

## Context

Attention Hub needs current Windows notification state in React, but WinRT types are platform-specific and notification change events can be missed during reloads or lifecycle transitions.

## Decision

The Windows adapter converts WinRT objects immediately into application-owned Rust DTOs. Tauri commands expose a complete serializable snapshot. Native change events carry only an invalidation signal; React responds by requesting a fresh snapshot.

## Consequences

- React has no dependency on Windows or WinRT types.
- Frontend reload and missed-event recovery are straightforward.
- Snapshot reads may repeat, which is acceptable for the expected Milestone 0 volume and must be measured before optimization.
- The normalized contract needs explicit nullable fields and diagnostics because source payloads differ.
