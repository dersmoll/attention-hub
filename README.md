# Attention Hub

Attention Hub is a local-first Windows desktop application that persistently answers: “What currently needs my attention?” It observes other applications through operating-system APIs; it does not embed or replace them.

The repository currently contains the Milestone 0 scaffold and planning documentation. Windows notification integration is intentionally not implemented yet.

## Source of truth

- [Product vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Milestone 0 notification spike](docs/milestones/milestone-0-notification-spike.md)
- [Architecture decisions](docs/decisions/)

## Development

Prerequisites are Node.js, pnpm, Rust with the MSVC target, Microsoft C++ Build Tools with the Desktop development with C++ workload, and WebView2.

```powershell
pnpm install
pnpm build
pnpm tauri dev
```

`pnpm build` validates the frontend scaffold. `pnpm tauri dev` also requires the complete Windows/Rust toolchain.
