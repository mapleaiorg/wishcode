# Mem-0 — Multi-scope Memory Storage

Date: 2026-04-26
Phase: Mem-0 (Memory — storage primitives)

## Decision

Memory is scope-aware from the storage layer up. Six scopes (`personal`,
`session`, `workspace`, `team`, `task`, `agent`) each carry binding
ids that storage validates at insert time. Pre-Mem-0, wishcode used a
single-bag BM25 directory (`~/.wishcode/memory/`) where every entry
was global; that conflated personal preferences with per-session
scratch and made retrieval unsafe across workspaces.

## Layout

```
electron/native/memory/
├─ types.ts              # MemoryScope, MemoryEntry, MemoryBindings, MemoryStore
├─ in-memory-store.ts    # Reference impl used by tests + agent scope
├─ index.ts              # Public barrel
└─ __tests__/
   └─ in-memory-store.test.ts   # 19 tests
```

## Required bindings per scope

| Scope | Required binding |
|---|---|
| personal | none (cross-workspace) |
| session | sessionId |
| workspace | workspaceId |
| team | teamId |
| task | taskId |
| agent | agentId |

`InMemoryMemoryStore.put()` raises a structured `Error` if the required
binding is missing. `update()` refuses scope changes — callers must
remove + re-put if a memory needs to graduate (e.g. session note → personal).

## Tests (19)

- Round-trip + body-required + per-scope binding requirement (5)
- Unknown-scope rejection (1)
- list filters: scope, tags, bindings, body substring, pinnedOnly (5)
- list limit + newest-first ordering with insert-order tie-break (1)
- update: body / tags / pinned / updatedAt mutation (1)
- update: scope-change rejection (1)
- update: missing-id error (1)
- remove: idempotent (returns true once, false thereafter) (1)
- prune: drops entries by scope + binding tuple (1)
- MEMORY_SCOPES vocabulary (1)
- get returns a deep copy (caller mutation isolation) (1)

## Wow moment

`prune('session', { sessionId: 'A' })` returns the count of dropped
entries — a one-call lifecycle hook for D-3's session-end cleanup.

## Pending

- **Mem-0.1** filesystem-backed store at `~/.wishcode/memory/<scope>/<id>.json`,
  matching the same `MemoryStore` contract.
- **Mem-1** context-assembly engine (BM25 + scope-aware filters + budget).
- **Mem-2** per-surface adapters (chat/code/agent) that bind the store
  to a stable context layout.

## Handoff

Mem-1 reads this ADR + the `MemoryStore` contract and builds the
context-assembly engine on top. K-2 (retrieval) consumes the same
contract for knowledge-side surface area. T-1 (job graph) uses the
`task` scope as the GC unit — pruning a finished task drops its scratch.
