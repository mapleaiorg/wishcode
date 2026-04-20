# OpeniBank Desk

OpeniBank Desk is the native desktop workspace for OpeniBank's on-desk financial agent experience. The app ships a React/Vite renderer, an Electron main process, and in-process native services for chat, wallets, market data, skills, memory, and task orchestration.

This repository is private, proprietary software maintained by the OpeniBank Research Team. It is not open source and is not licensed for public redistribution.

## What This Repo Contains

- A native Electron desktop product for macOS, Windows, and Linux
- A renderer built with React 18 and Vite
- A typed preload bridge exposed as `window.ibank.*`
- Native modules for model routing, wallet management, market data, memory, tasks, and financial buddies
- Packaging assets for desktop releases, including macOS app naming and dock-icon patching for development mode

## Current Architecture

Unlike the older CLI-bridge desktop builds, `v0.3.1` runs product logic natively inside the Electron app.

```text
┌─────────────────────────────────────────────────────────────┐
│ OpeniBank Desk                                             │
│                                                             │
│  ┌────────────────────┐    IPC / event fanout             │
│  │ Renderer           │◄───────────────────────────────┐  │
│  │ React + Vite       │                                │  │
│  └────────────────────┘                                │  │
│                                                        │  │
│  ┌────────────────────┐                                │  │
│  │ Preload            │ typed bridge                   │  │
│  │ electron/preload   │                                │  │
│  └────────────────────┘                                │  │
│                                                        │  │
│  ┌──────────────────────────────────────────────────┐  │  │
│  │ Electron main + native services                 │──┘  │
│  │ auth, chat, wallet, market, memory, skills,          │
│  │ crypto buddies, financial buddies, harness           │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Repository Layout

- [`src/`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/src): renderer app, views, styling, hooks, components
- [`electron/`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/electron): Electron main process, preload bridge, native modules
- [`build/`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/build): tracked app icon assets required for packaging
- [`scripts/`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/scripts): development and repository maintenance helpers
- [`docs/GETTING_STARTED.md`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/docs/GETTING_STARTED.md): setup and first-run guide
- [`docs/REPOSITORY_HOUSEKEEPING.md`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/docs/REPOSITORY_HOUSEKEEPING.md): repo hygiene and GitHub automation notes

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

## Housekeeping And Validation

The repository includes a GitHub Actions workflow at [`.github/workflows/housekeeping.yml`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/.github/workflows/housekeeping.yml). It runs:

- repository housekeeping checks
- TypeScript validation
- renderer build
- Electron main-process build

Run the same repo-health check locally with:

```bash
npm run housekeeping:check
```

## Legal

- Brand: OpeniBank
- Copyright: OpeniBank Research Team
- License: Proprietary, all rights reserved

The formal repository notice is in [`LICENSE.md`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/LICENSE.md).
