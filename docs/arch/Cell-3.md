# Cell-3 — Cell SDK (`@wish/cell-sdk` shape)

Date: 2026-04-26

## What landed

`electron/native/cells/sdk.ts` (~210 LoC) — `createCellSDK(host)`
builds the only surface a Cell may import. The host (Cell-2 runtime)
hands a fresh SDK to each Cell at activation; the returned `dispose`
tears it down on deactivate.

## Surface

| Member | Notes |
|---|---|
| `manifest` | the Cell's own manifest, read-only |
| `capability(req)` / `requireCapability(req)` | scoped to the Cell's subject; rejects kinds the manifest didn't declare with `no_grant` (or throws "did not declare") |
| `memory.put` / `memory.list` | locked to `agent` scope + `agentId = cell:<id>@<version>` so Cell scratch never leaks |
| `memory.assembleChat / assembleCode / assembleAgent` | Mem-2 adapters, store pre-bound |
| `knowledge.list` / `knowledge.getBySlug` / `knowledge.cite(ref)` | read-only over K-0; `cite` emits `provenance.ref.attached` |
| `emit(event)` | Tel-0 with `source = "cell:<id>"`, attribute scrub for `password`/`token`/`secret`, primitives only |
| `registerSlot(c)` | returns a disposer; tracked for cleanup |
| `isDisposed()` | true after dispose; every method throws after dispose |

## Tests (12)

- Manifest read-only (1)
- Capability check denies undeclared kinds; allows declared (2)
- requireCapability throws on undeclared (1)
- Memory put scopes to agent + cell-bound agentId; list returns only cell-scoped entries (2)
- Knowledge list + getBySlug + cite emits telemetry (2)
- emit() stamps source + cellId + scrubs sensitive attrs (1)
- registerSlot returns a disposer; dispose drops all slots (2)
- After dispose: isDisposed true; every method throws (1)

## Pending

- **Cell-3.1** sandbox bridge — when Cell-2.1 lands worker / iframe
  hosts, the SDK proxies through postMessage; the surface stays the
  same, the implementation moves behind a `Comlink`-style transport.
- **Cell-3.2** Knowledge CRUD for privileged Cells (currently the
  SDK is read-only).
