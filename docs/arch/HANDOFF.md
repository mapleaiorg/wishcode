# HANDOFF — pick-up state for the next session

Last updated: 2026-04-27 (after wave 11)

## Tree state (all green)

| Repo | Tests | Build |
|---|---:|---|
| wishcode | **358/358** in 25 files | `npm run typecheck` clean |
| wishd | **138/138** | `cargo test --workspace` clean (stable, 2 ignored) |
| hermon | **128/128** | `cargo test --workspace` clean (stable, 1 ignored) |

**Cumulative: 624 passing tests across 3 repos.**

## Done (waves 1–11)

- **Master:** M-0, M-1
- **Wishcode shell:** S-0
- **Wishcode domain:** D-0, D-1, D-6
- **Wishcode AI:** A-0, A-1, A-2
- **Memory:** Mem-0, Mem-1, Mem-2 (complete subsystem)
- **Knowledge:** K-0, K-1, K-2, K-3 (complete subsystem)
- **Tasks:** T-0, T-1, T-2 (complete subsystem)
- **Telemetry:** Tel-0
- **Cells:** Cell-0, Cell-1, Cell-2, Cell-3, Cell-4, Cell-5, Cell-6
- **CoAgent:** C-0, C-1
- **wishd:** W-0, W-1, W-1.1, W-1.2, W-2 + Tooling-0
- **hermon:** H-0, H-1, H-1.1, H-1.2, H-1.3 + Tooling-0

Each has an ADR at `docs/arch/<id>.md` and a CHANGELOG entry.

## Pending (priority order)

Everything below is greenfield + disjoint trees — pick any combination.

### High leverage — finishes a subsystem or unblocks a wave

1. **C-2** CoAgent deliverables — `electron/native/coagent/deliverables.ts`. Mirrors C-1 pattern. Joins family as `deliverable`. Versioned `Deliverable` records, `publish()` / `revise()` outbound events, opt-in `applyPeerEvents`.
2. **C-7** CoAgent agent orchestration — `electron/native/coagent/agent-orchestration.ts`. Takes A-2 `AgentRuntime` + a `Task`, runs the agent inside the task's lifecycle, publishes `agent.run.started/finished` to the bus.
3. **Cell-7** Sync hooks — `electron/native/cells/sync.ts`. Wraps Cell-1 registry with a Hermon-mirror sink. Two-way sync queue + conflict resolution.
4. **Cell-8** Cell Forge local lifecycle — `electron/native/cells/forge.ts`. State machine `pattern → draft → candidate → approved → published`. Builds on Cell-1 + Cell-6.
5. **A-3** Provider Cells (Anthropic) — `electron/native/ai/providers/anthropic-cell.ts`. Ports the existing manual-fetch path (`electron/native/llm/chat.ts`) into a Cell that registers with the Cell-2 runtime + supplies an A-1 `ProviderAdapter`.

### Independent streams (Rust)

6. **W-3** wishd-process — `wishd/crates/wishd-process/`. Mirrors `wishd-fs` + `wishd-git` pattern: proto already exists; needs `path` + `ops` + `service.rs`. Sandboxed `child_process` spawn with capability allowlist.
7. **H-2** Orgs/Users/Teams — `hermon/crates/hermon-org/`. New crate; consumes `hermon-types::ids`, `hermon-auth::password`, `hermon-db`. SQL backed by `migrations/0001_users_orgs.sql` (already landed).

### Bigger refactors (defer)

8. **D-2** main-process IPC migration — touches `electron/main.ts` + every `electron/native/*` handler to consume D-0 schemas + capability gate. Mechanical but ~60 channels — bigger budget needed.
9. **D-3** task supervisor — adapts the legacy `electron/native/tasks/manager.ts` IPC channels onto T-0/T-1.

## Token-saving rules learned (apply next session)

1. **Do NOT spawn subagents** for prompts that build on already-loaded context. They burn 50K+ tokens on cold reads. Write inline.
2. **Pre-amend barrels in the original Write.** When adding a new module, write the new file AND the updated `index.ts` barrel together — don't Edit afterwards.
3. **Read barrel files in parallel up front** when amending several at once.
4. **Keep ADRs ≤50 lines** — structured tables, no narrative bloat.
5. **No `replace_all: true`** for repeated lambdas — triggers "must be unique" failures.
6. **Pure-backend changes are NOT observable in browser preview** — skip `<verification_workflow>` per `<when_to_verify>`. Note: the PostToolUse hook will keep reminding; that's fine, just don't act on it.
7. **TS gotcha:** Tel-0 emit attributes type is `Record<string, AttributeValue>` (string|number|boolean|null|primitive arrays). Don't use `Record<string, unknown>` for telemetry attrs — typecheck breaks.
8. **TS gotcha:** Cell manifest id grammar is `[a-z][a-z0-9_]*(\.[a-z][a-z0-9_-]*){1,4}` — at least 2 dotted segments, ≥3 chars. "a", "app", "wish" all reject. Tests must use `wish.tool.x` style.
9. **TS gotcha:** Memory bindings filter is "lenient" since Mem-2 — only filters when the entry has the binding. Cross-scope queries work because of this.
10. **Test-only async timing:** bus.publish is sync but handlers are async; tests need `await Promise.resolve(); await Promise.resolve()` after publish before checking state.

## Files to read first in the next session (minimal context)

To pick up efficiently:
- This file (`docs/arch/HANDOFF.md`)
- `CHANGELOG.md` (one-line summary per prompt landed)
- The specific ADR for the prompt this session is replacing/extending (e.g. `docs/arch/C-1.md` if doing C-2)

That's typically <2K tokens of context vs. the 50K+ a fresh subagent would burn.

## Cumulative scoreboard

- 358 vitest tests in wishcode across 25 files
- 138 cargo tests in wishd
- 128 cargo tests in hermon
- **34 ADRs** total (28 wishcode + 4 wishd + 4 hermon)
- ~25 of 78 v4 prompts done in their primary form (some `.1`/`.2` follow-ups remain)
