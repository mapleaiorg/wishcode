# Mem-1 — Context Assembly

Date: 2026-04-26
Phase: Mem-1 (Memory — context assembly engine)

## Decision

`assembleContext(store, request)` walks a `MemoryStore` (Mem-0), scores
candidates, and returns a budgeted, scope-mixed context body the
agent runtime (A-2) can splice into a system prompt or surface as a
sidebar.

## Scoring

```
score(entry) =
    SCOPE_PRIORITY[scope]                     # 0.3 .. 1.0
  + (pinned ? 0.5 : 0)
  + (substring-match-of-query ? 0.6 : 0)
  + min(0.8, overlap(qTokens, bodyTokens) * 0.1)

tiebreak = recency (newer wins)
```

`SCOPE_PRIORITY = personal 1.0 / team 0.9 / workspace 0.7 / session 0.5
/ task 0.4 / agent 0.3`. Stop-words are a small fixed list; tokenizer
is deliberately simple — Mem-1.1 swaps in real BM25 once the indexer
crate exposes a JS surface.

## API

```typescript
assembleContext(store, {
  query?: string
  scopes?: MemoryScope[]
  bindings?: { workspaceId?, sessionId?, taskId?, agentId?, teamId? }
  tags?: string[]
  budgetChars?: number    // default 8000 (~2k tokens)
  maxEntries?: number     // default 32
  pinnedOnly?: boolean
}) → AssembledContext
```

`AssembledContext` carries:
- `entries[]` — `{ entry, score, reasons[] }` highest-score first
- `body` — concatenated render of each entry with `### memory:<scope>` headers
- `candidateCount` — total before budgeting
- `charCount` — body length
- `scopeMix` — count by scope of the accepted entries

## Budget guarantee

Always emits at least one entry — even if the top-scored entry alone
exceeds the budget. The cap is honored from the second entry on. This
keeps "always include the personal pin" semantics intact while still
preventing runaway prompt growth.

## Helpers

- `rankCandidates(entries, query)` — pure scoring; useful in tests +
  when the caller has already done the store query.
- `renderEntry(entry)` — `### memory:<scope>[ (pinned)][ <tags>]\n<body>\n`.

## Tests (18)

- Ranking: scope wins on a query miss; substring beats scope; token
  overlap lifts within same scope; reasons reported; recency tiebreak (5)
- Assembly: highest-score first, maxEntries cap, budgetChars cap,
  always-emit-at-least-one even when over-budget (4)
- Filters: by scope, by bindings, pinnedOnly (3)
- Diagnostics: candidateCount, scopeMix tallies, body header per entry,
  empty store (4)
- `renderEntry`: tags + pinned marker, omits empty tag list (2)

## Wow moment

A single call returns a deterministic, budgeted, scope-mixed context
body the agent runtime can drop into a system prompt — no provider-
shaped fields, no hidden retries, and the per-entry `reasons` are
inspectable in a `/context` sidebar so users can see why a memory
made the cut.

## Pending

- **Mem-1.1** real BM25 (delegating to wishd-index) + tokenizer.
- **Mem-2** per-surface adapters (`chat-context-adapter`,
  `code-context-adapter`, `agent-context-adapter`) that bind specific
  scope/binding policies to a stable layout.
- **K-2** retrieval shares the same shape — Mem-1's `AssembledContext`
  output and K-2's retrieval result will be merged at the agent
  boundary in A-2.1.

## Handoff

Mem-2 builds chat / code / agent adapters by composing
`assembleContext` with surface-specific defaults (chat sets
`scopes: ['personal','session','task']`; code sets `scopes:
['workspace','personal']`; agent sets all six but with stricter
`maxEntries`). A-2's `AgentRuntime` accepts an `assembleContext`
callback in its loop options once Mem-2 lands.
