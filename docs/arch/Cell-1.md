# Cell-1 — Cell Registry

Date: 2026-04-26

## What landed

`electron/native/cells/registry.ts` (~210 LoC) — `CellRegistry`
contract + `InMemoryCellRegistry` reference implementation + a
semver-lite parser/range-matcher (`*` / `1.2.3` / `^1.2.3` / `~1.2.3`).

Records are keyed by `(id, version)`, statused (`draft` /
`installed` / `disabled`), and resolved by range to the highest
satisfying version. `resolveDependencies(manifest)` returns
`{ satisfied, missing }` so Cell-2 can fail-fast on unresolved
required deps without throwing on optional ones.

`addFromRaw(registry, raw)` parses a raw manifest object via
`parseManifest` and forwards structured parse errors to the caller.

## Tests (16)

- semver-lite: parse each range kind, exact / any / caret / tilde /
  prerelease ordering (5)
- add + duplicate rejection (1)
- resolve picks highest satisfying version (1)
- resolve respects status filter (1)
- resolve null on miss (1)
- list sort by id then version desc (1)
- setStatus mutation (1)
- remove idempotent (1)
- resolveDependencies satisfied/missing split (1)
- addFromRaw forwards parse errors (1)
- addFromRaw on valid manifest (1)
- prerelease ordering rejected by `^` range (covered above) (1)

## Pending

- **Cell-1.1** fs-backed store under `~/.wishcode/cells/{installed,draft}/`
  with `cell.manifest.json` walks + bundleHash recomputation.
- Real semver via `semver` package once the runtime grows beyond the
  3 declared range kinds.
