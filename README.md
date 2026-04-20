# OpeniBank Desk

OpeniBank Desk is the native desktop workspace for OpeniBank's on-desk financial agent experience. The app ships a React/Vite renderer, an Electron main process, and in-process native services for chat, wallets, market data, skills, memory, task orchestration — and, starting with `v0.4.0`, a Duolingo-style blockchain and crypto education module.

This repository is private, proprietary software maintained by the OpeniBank Research Team. It is not open source and is not licensed for public redistribution.

## What This Repo Contains

- A native Electron desktop product for macOS, Windows, and Linux
- A renderer built with React 18, Vite, and Framer Motion
- A typed preload bridge exposed as `window.ibank.*`
- Native modules for model routing, wallet management, market data, memory, tasks, and financial buddies
- The OpeniBank Educator: worlds / levels / lessons, a spaced-review queue, an AI tutor, and a mascot (Sage)
- Packaging assets for desktop releases, including macOS app naming and dock-icon patching for development mode

## Current Architecture

Product logic runs natively inside the Electron app (no external CLI bridge).

```text
┌─────────────────────────────────────────────────────────────┐
│ OpeniBank Desk                                              │
│                                                             │
│  ┌────────────────────┐    IPC / event fanout               │
│  │ Renderer           │◄────────────────────────────────┐   │
│  │ React + Vite       │                                 │   │
│  │ + Framer Motion    │                                 │   │
│  └────────────────────┘                                 │   │
│                                                         │   │
│  ┌────────────────────┐                                 │   │
│  │ Preload            │ typed bridge                    │   │
│  │ electron/preload   │                                 │   │
│  └────────────────────┘                                 │   │
│                                                         │   │
│  ┌───────────────────────────────────────────────────┐  │   │
│  │ Electron main + native services                   │──┘   │
│  │ auth, chat, wallet, market, memory, skills,       │      │
│  │ crypto buddies, financial buddies, harness        │      │
│  └───────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

The Educator in `v0.4.0` is renderer-only: it reuses `window.ibank.chat.*` for the AI tutor and stores XP / streaks / mastery in `localStorage`. No new native service or IPC surface was required for the MVP.

## Repository Layout

- [`src/`](./src) — renderer app, views, styling, hooks, components
  - [`src/features/educator/`](./src/features/educator) — Educator feature (curriculum, state, components, tabs)
- [`electron/`](./electron) — Electron main process, preload bridge, native modules
- [`build/`](./build) — tracked app icon assets required for packaging
- [`scripts/`](./scripts) — development and repository maintenance helpers
- [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md) — setup and first-run guide
- [`docs/EDUCATOR.md`](./docs/EDUCATOR.md) — Educator developer guide (content authoring, compliance)
- [`docs/REPOSITORY_HOUSEKEEPING.md`](./docs/REPOSITORY_HOUSEKEEPING.md) — repo hygiene notes
- [`PLAN_V0.4.0_EDUCATOR.md`](./PLAN_V0.4.0_EDUCATOR.md) — phased rollout plan for the Educator
- [`PLAN_V0.3.1.md`](./PLAN_V0.3.1.md), [`DESIGN.md`](./DESIGN.md), [`ROADMAP.md`](./ROADMAP.md) — product planning
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes

## Quick Start

1. Install Node.js 20 or newer.
2. Install dependencies with `npm ci`.
3. In one terminal, start the Vite dev server with `npm run dev`.
4. In a second terminal, launch Electron against that dev server:

```bash
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron:dev
```

For a production-style local run:

```bash
npm start
```

For packaging:

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

## Validation

The pre-push checklist:

```bash
npm run typecheck
npm run build
npm run build:electron
```

A previous `npm run housekeeping:check` script and a scheduled GitHub Actions workflow existed in earlier revisions but have been retired; the checks above are sufficient for `v0.4.0`.

## Legal

- Brand: OpeniBank
- Copyright: OpeniBank Research Team
- License: Proprietary, all rights reserved

The formal repository notice is in [`LICENSE.md`](./LICENSE.md).
