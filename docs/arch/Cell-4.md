# Cell-4 — UI Slot Host (logic layer)

Date: 2026-04-27

## What landed

`electron/native/cells/slot-host.ts` (~110 LoC) — `SlotHost` is the
pure-logic registry of `(slot id) → ordered contributions`. The
renderer-side shell consumes `host.contributionsFor(slotId)` and
mounts React components; Cell-3's SDK calls `host.register(...)` via
its `registerSlot` shim.

Pure logic = no DOM, no React. Same code runs in node tests and in
both Electron + browser-only renderer hosts.

## Surface

- `register(cellId, contribution)` — returns a disposer
- `unregister(id)` / `unregisterCell(cellId)` — drop one or all
- `contributionsFor(slot)` — priority-ordered (lower first), insert-seq
  tiebreak; returns deep copies
- `slots()` — every slot id with at least one contribution
- `isReservedShellSlot(slot)` — checks the 13 CONVENTIONS § 7 ids
- Telemetry: `slot.contribution.{registered,unregistered}`

`strictReservedShellSlots: true` rejects unknown `shell.*` slot ids
at register time; off by default so Cells may still create their own.

## Tests (15)

- register + contributionsFor; priority order; insertion tiebreak (3)
- disposer unregisters one; `unregisterCell` drops all from a cell (2)
- last-contribution-removed drops slot from `slots()` (1)
- reserved slot id detection; strict mode reject; strict permits user-defined (3)
- non-strict permits any (1)
- telemetry: registered + unregistered events (2)
- deep-copy isolation; size; stale unregister returns false (3)

## Pending

- **Cell-4.1** React mount layer at the renderer (S-1+) that reads
  `contributionsFor` and instantiates the React component referenced
  by `entry`.
- **Cell-4.2** slot capacity hints (max contributions per slot id)
  for the host to enforce.
