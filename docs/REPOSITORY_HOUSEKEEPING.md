# Repository Housekeeping

This repository is private and proprietary. The goal of housekeeping is to keep the GitHub repo limited to source, tracked product assets, and the minimum documentation needed to build and maintain OpeniBank Desk.

## What Should Be In Git

- application source under `src/` and `electron/`
- tracked icon assets in `build/`
- repository documentation
- maintenance scripts
- package manifests and lockfile

## What Should Stay Out Of Git

- `node_modules/`
- `dist/`, `dist-electron/`, `release/`, and other generated build output
- local environment files and secrets
- local logs and caches
- temporary packaging output
- redirected local OpeniBank state such as `.ibank/`

The ignore policy is enforced by [`.gitignore`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/.gitignore).

## GitHub Housekeeping Workflow

The scheduled and PR-time workflow lives at [`.github/workflows/housekeeping.yml`](/Users/wenyan/ClaudeProjects/ibank-desktop-v0.3.1/.github/workflows/housekeeping.yml).

It performs four checks:

1. Repository hygiene validation via `npm run housekeeping:check`
2. TypeScript validation
3. Renderer build
4. Electron build

## Local Pre-Push Checklist

Run these from the repo root:

```bash
npm run housekeeping:check
npm run typecheck
npm run build
npm run build:electron
```

## Protected Metadata

The repository should consistently present:

- brand: OpeniBank
- copyright owner: OpeniBank Research Team
- license: Proprietary

If README, package metadata, or legal text drift from those values, update them before pushing.
