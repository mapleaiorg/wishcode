# Getting Started

This guide is the quickest path to running OpeniBank Desk locally for development or internal evaluation.

## Prerequisites

- macOS, Windows, or Linux
- Node.js 20 or newer
- npm 10 or newer recommended

## Install

From the repository root:

```bash
npm ci
```

## Run In Development

OpeniBank Desk uses a split dev loop:

1. Vite serves the renderer.
2. Electron runs the desktop shell and native services.

Start the renderer:

```bash
npm run dev
```

Start Electron in a second terminal:

```bash
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron:dev
```

Notes:

- The `patch-dev-name.js` helper rewrites the local Electron development bundle so the app appears as `OpeniBank` in macOS instead of `Electron`.
- The development bundle also receives the tracked app icon from `build/icon.icns`.

## Run A Local Production Build

```bash
npm start
```

This command builds the renderer, builds the Electron main/preload process, patches the local Electron app name on macOS, and launches the desktop app.

## Validate Before Pushing

```bash
npm run housekeeping:check
npm run typecheck
npm run build
npm run build:electron
```

## Package Desktop Builds

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

## Important Local Paths

OpeniBank runtime state is stored outside the repository by default, under the user's home directory:

- config: `~/.ibank/.ibank.json`
- sessions: `~/.ibank/sessions`
- memory: `~/.ibank/memory`
- wallet: `~/.ibank/wallet`

Do not copy local runtime state, tokens, or wallet materials into the repository.

## Branding And Legal

- Product brand: OpeniBank
- Repository owner: OpeniBank Research Team
- License status: Proprietary, internal use only

See [`LICENSE.md`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/LICENSE.md) for the repository notice.
