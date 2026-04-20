# Repository Housekeeping

This repository is private and proprietary. The goal of housekeeping is to keep the GitHub repo limited to source, tracked product assets, and the minimum documentation needed to build and maintain OpeniBank Desk.

## What Should Be In Git

- application source under `src/` and `electron/`
- tracked icon assets in `build/`
- repository documentation (`README.md`, `docs/`, plan and design markdown at the repo root)
- maintenance scripts under `scripts/`
- package manifests and lockfile

## What Should Stay Out Of Git

- `node_modules/`
- `dist/`, `dist-electron/`, `release/`, `out/`, and other generated build output
- local environment files and secrets
- local logs and caches
- temporary packaging output (`*.dmg`, `*.exe`, `*.AppImage`, `*.blockmap`, `*.tgz`, …)
- redirected local OpeniBank state such as `.ibank/`
- editor-local folders (`.vscode/`, `.idea/`, `.history/`, `.claude/`, `.cursor/`)
- OS junk (`.DS_Store`, `._*`, `Thumbs.db`)

The ignore policy is enforced by [`../.gitignore`](../.gitignore).

## Local Pre-Push Checklist

Run these from the repo root:

```bash
npm run typecheck
npm run build
npm run build:electron
```

Earlier revisions shipped a `npm run housekeeping:check` script and a scheduled GitHub Actions workflow at `.github/workflows/housekeeping.yml`. Both were retired during `v0.4.0` housekeeping — the three commands above are now the full pre-push gate. If automation is reintroduced later, the workflow file belongs under `.github/workflows/` and the script back under `scripts/`.

## Adding New Feature Directories

When you add a new feature directory under `src/features/<name>/`, do a quick pass for:

- no committed `localStorage` dumps, fixture secrets, or private keys
- no absolute filesystem paths in docs or source (use repo-relative links)
- a short header comment at the top of each new file describing its responsibility — the existing codebase leans on these heavily

For the Educator feature specifically, see [`EDUCATOR.md`](./EDUCATOR.md).

## Protected Metadata

The repository should consistently present:

- brand: OpeniBank
- copyright owner: OpeniBank Research Team
- license: Proprietary

If README, package metadata, or legal text drift from those values, update them before pushing.
