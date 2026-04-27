# Cell-2 — Cell Runtime (lifecycle + capability enforcement)

Date: 2026-04-26

## What landed

`electron/native/cells/runtime.ts` (~180 LoC) — `CellRuntime` owns the
`inactive → activating → active → unloading → unloaded` lifecycle FSM
for every Cell registered in Cell-1.

Activation pipeline: registry lookup → `installed` status guard →
required-dep resolution → broker pre-grant of every declared
capability under subject `cell:<id>@<version>` → handler hook →
teardown captured for `deactivate()`. Failures revoke grants and emit
`cell.activate.failed`.

Per-class handlers via `runtime.registerClassHandler('provider', h)`
let Cell-2.1 plug a sandbox host (UI iframe, agent worker, etc.)
without changing the runtime.

## Tests (14)

- Activation: success, missing, non-installed rejection, capability
  pre-grant, missing required dep, optional dep tolerance,
  class-handler routing, error capture + grant revocation (8)
- Deactivation: teardown runs, thrown teardown still revokes grants
  + emits warn, no-op on unknown (3)
- Telemetry: started+succeeded events, failed event (2)
- list() snapshot of active + errored cells (1)

## Pending

- **Cell-2.1** sandbox host (worker / iframe) plugged via
  `defaultHandler`.
- **Cell-2.2** capability enforcement at INVOCATION time — currently
  the runtime only pre-grants; Cell-3 SDK threads the broker into
  every privileged Cell call.
