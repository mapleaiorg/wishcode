# Mem-2 — Per-surface Context Adapters

Date: 2026-04-26

## What landed

`electron/native/memory/adapters.ts` — three thin wrappers on
`assembleContext` (Mem-1) with surface-specific defaults:

| Adapter | Scopes | Default budget | Notes |
|---|---|---:|---|
| `assembleChatContext` | personal + (workspace) + session | 4000 | session bound; workspace optional |
| `assembleCodeContext` | workspace + personal | 6000 | workspace required; no session |
| `assembleAgentContext` | personal + workspace + (task) + agent | 8000 | task scope only when taskId is bound; maxEntries 16 |

## Behavior shift in Mem-0

`bindingsMatch` is now **lenient**: a binding key only filters when
the entry actually carries that binding. Before, querying with
`{ sessionId: 'A' }` rejected every personal entry (which has no
sessionId); now those queries return personal + sessionA-bound
entries together. The tighter "scope: ['session']" filter still
narrows correctly because both candidate entries carry sessionId.

## Tests (9)

- Chat: personal+session for the bound session; workspace inclusion
  when workspaceId set; task/agent/team excluded by default (3)
- Code: workspace+personal; other-workspace entries excluded; default
  6000-char budget (3)
- Agent: full pull when task+workspace bound; task scope dropped
  without taskId; maxEntries cap (3)

## Wow moment

A chat surface picks up a personal "always cite sources" rule, the
session's "investigating CI flake" scratch, and a workspace-bound
"use pnpm in this repo" note in a single call — never seeing entries
from a different session, workspace, agent, or task.
