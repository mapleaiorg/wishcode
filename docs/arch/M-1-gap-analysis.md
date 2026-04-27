# M-1 — Wishcode Gap Analysis and Target Roadmap

Date: 2026-04-24
Inspector: Claude Code
Inputs: `docs/arch/M-0-inspection.md`, `wish-design/prompts-0423/PROMPT-INDEX-v4-FINAL.md`, `CONVENTIONS.md`, Architecture Suite v4.

## 1. Executive summary

Wishcode is in much better shape than the generic prompt suite assumes: the renderer is sandboxed (contextIsolation true, nodeIntegration false, no raw ipcRenderer leaks), the IPC namespace is already `wish:*` with a uniform `IpcResult<T>` envelope, and 60 channels span the major subsystems (auth, model, memory, skills, MCP, chat, sessions, tasks, swarm, cron, hooks). What is missing is everything Wish Code v4 layers on top: a Cell Manifest/Runtime/Registry, canonical AI types with provider Cells, a multi-scope memory model, a Knowledge/Retrieval/Provenance subsystem, a formal Task vs Job graph, a typed-and-versioned IPC surface, a Telemetry envelope, integration with the Rust `wishd` trusted runtime (greenfield), and integration with Hermon (greenfield). No Tauri residue. No security red flags. The base is sound for refactor-in-place.

Total estimated effort across the 51 wishcode prompts: medium-to-high in S/D/A (refactor of existing code with tests added), high in Cell/Mem/K/T/Tel (greenfield subsystems on solid foundations), and high in C/F/O (depends on Hermon + wishd merges).

## 2. Current state summary (condensed from M-0)

- Flat TypeScript Electron 32 + Vite 5.4 + React 18.3.1 + Radix UI + Tailwind utilities + lucide.
- Main: `electron/main.ts` (~324 LoC) wires 60 IPC handlers under `wish:*` with a uniform `IpcResult<T>` envelope.
- Preload: `electron/preload.ts` (~171 LoC) exposes a typed `window.wish` object across 19 namespaces; no raw `ipcRenderer` leaks.
- Renderer shell: `src/App.tsx` with manual `ViewKey` routing, three views (home/chat/history), single 174 KB `global.css`, React useState only.
- Native subsystem: `electron/native/` with 21 modules (auth, blackboard, buddy, commands, core, cron, hooks, llm, mcp, memory, modelFetch, personas, session, skills, swarm, tasks, tools, …).
- Multi-LLM streaming via manual fetch + hand-rolled streaming for Claude/OpenAI/xAI/Gemini/Ollama; Hermon listed in metadata but not yet wired.
- Skills: prompt-injection from `electron/native/skills/builtin/` + `~/.wishcode/skills/`.
- MCP: stdio-based, lazy, persistent per session.
- Tasks: in-memory + `~/.wishcode/tasks/tasks.json`; not auto-resumed on restart.
- Memory: per-entry JSON + BM25 ranking under `~/.wishcode/memory/`.
- No tests, no CI, no code signing, single-CSS, no monorepo tooling.

## 3. Target architecture summary (condensed)

Per PROMPT-INDEX-v4-FINAL § 3 layer model + § 4 invariants:

- **A. Shell** — Electron app, design tokens, navigation, settings, branding.
- **B. Native Chat + Native Code** — shell-level features (NOT Cells).
- **C. Cell Runtime** — manifest, registry, sandbox, slot host, groups, trust tiers, signing, sync, Cell Forge local lifecycle.
- **D. Shared AI & Agent Runtime** — canonical AI types, providers, agent loop.
- **D2. Memory / Knowledge / Task / Job / Telemetry** — persisted in stable schemas.
- **E. wishd** — Rust trusted runtime (greenfield) over gRPC/Unix-socket.
- **F. Hermon.ai** — Rust control plane (greenfield) over HTTPS+SSE.

Hard invariants (must not be relaxed in any prompt): Electron stays; wishd is real; Native Chat/Code are NOT Cells; CoAgent IS a Cell Family; canonical AI types are provider-neutral; renderer never privileged; IPC typed and versioned; Cells only import `@wish/cell-sdk`; every Cell declares capabilities; persisted formats are canonical; provenance on every material action; memory is scope-aware; knowledge is policy-aware; telemetry is redacted; Cell Manifest is the contract; capability-first; no retries in core paths; single-binary wishd & hermon-server; org-scoped data; trust tiers gate everything privileged.

## 4. Gap catalog

### 4.1 Shell gaps (feeds Phase S)

- **Gap S.1 — App.tsx couples shell, routing, layout, and view switching.**
  - Current: `src/App.tsx` ~350 LoC mixing layout, sidebar resize logic, ViewKey/Overlay state, settings overlay, login overlay.
  - Target: shell extracted under `src/shell/` (chrome + layout + navigation), views become route-mounted modules.
  - Affected: `src/App.tsx`, `src/components/Sidebar.tsx`, `src/main.tsx`, all view files under `src/features/*` and `src/components/*View.tsx`.
  - Prompt: **S-0**.
  - Risk: medium — view boundaries already exist, but localStorage keys and overlay state move.

- **Gap S.2 — `ChatView.tsx` is the only chat surface; not framed as Native Chat.**
  - Current: `src/components/ChatView.tsx` directly wires `wish.chat.send` callbacks.
  - Target: Native Chat is a first-class shell feature, not a Cell, with a stable surface API and slot points for Cells to contribute.
  - Affected: `src/components/ChatView.tsx`, `src/components/MessageRenderer.tsx`, `src/components/AskUserModel.tsx`, `src/components/ToolsPalette.tsx`, agent runtime entry.
  - Prompt: **S-1**.
  - Risk: medium — message-rendering is intricate (markdown + tool blocks + thinking + askUser).

- **Gap S.3 — No Native Code surface.**
  - Current: code rendering happens inline in markdown via shiki; no editor surface, no file/diff view.
  - Target: Native Code is a first-class shell feature with editor, diff, file tree, build-output, all in shell.
  - Affected: greenfield under `src/shell/code/`.
  - Prompt: **S-2**.
  - Risk: high — large surface, drives design tokens and shell layout decisions.

- **Gap S.4 — Branding/theming inconsistent; design tokens absent.**
  - Current: single `global.css` (~174 KB) with Tailwind utilities; no design token layer; mixed direct hex values; one favicon.
  - Target: design tokens (colors, spacing, typography, motion) defined once, themable, exported to renderer + Cells via SDK.
  - Affected: `src/styles/`, `assets/`, all components using hardcoded colors.
  - Prompt: **S-3**.
  - Risk: medium — visual regressions possible.

### 4.2 Desktop/IPC/capability gaps (feeds Phase D)

- **Gap D.1 — IPC channels typed but not Zod-validated nor versioned.**
  - Current: 60 channels with TypeScript interface types in `preload.ts`; no Zod schema, no protocol version exchange.
  - Target: typed-and-versioned `wish.*` namespace with Zod-validated request/response per channel and a `wish:proto:version` channel.
  - Affected: new `electron/shared/ipc/` package; `electron/main.ts`, `electron/preload.ts`.
  - Prompt: **D-0**.
  - Risk: medium — touches every channel; a regression breaks the renderer.

- **Gap D.2 — Preload is OK but pre-D-0 (untyped at the wire).**
  - Current: `preload.ts` exposes typed methods but values cross the bridge as raw JSON.
  - Target: preload uses the D-0 schemas and surfaces a fully typed `window.wish` consumed by the shell + Cells (via SDK).
  - Affected: `electron/preload.ts`, `src/types.ts` (delete or reduce after migration), all renderer call sites.
  - Prompt: **D-1**.
  - Risk: medium — call-site coverage must be exhaustive.

- **Gap D.3 — Main-process services live as flat modules with implicit boundaries.**
  - Current: `electron/native/*` modules export functions; main.ts wires them into IPC handlers.
  - Target: domain services with explicit constructors, lifecycle, dependency injection, and graceful shutdown.
  - Affected: every `electron/native/*` module; `electron/main.ts` (assembly root).
  - Prompt: **D-2**.
  - Risk: medium — must keep all IPC channels working through the migration.

- **Gap D.4 — Task supervisor is local-only and not graph-aware.**
  - Current: `electron/native/tasks/manager.ts` flat `Map` + JSON file; AbortController per task; no DAG.
  - Target: task supervisor that owns Task and Job lifecycle, persists graphs, recovers on restart, mirrors to Hermon when configured.
  - Affected: `electron/native/tasks/`, swarm runner, modelFetch.
  - Prompt: **D-3** (then **T-0/T-1** turn this into Task vs Job and Job graph).
  - Risk: medium — swarm runner depends on task semantics.

- **Gap D.5 — Skills are auto-injected via prompt; no explicit dispatcher.**
  - Current: `matchSkills()` in modelFetch.ts; no centralized "tools" view.
  - Target: skills + tools dispatcher with explicit registration, capability-checked invocation, and a unified "tool" abstraction (skills, MCP tools, builtin tools all unified).
  - Affected: `electron/native/skills/`, `electron/native/tools/`, modelFetch.
  - Prompt: **D-4**.
  - Risk: low.

- **Gap D.6 — MCP works but lacks UI editor, capability binding, redaction.**
  - Current: `electron/native/mcp/` works; `~/.wishcode/mcp.json` edited manually.
  - Target: MCP service with capability declarations, redaction policy, and a `SettingsView` editor.
  - Affected: `electron/native/mcp/`, `src/components/McpPanel.tsx`, settings overlay.
  - Prompt: **D-5**.
  - Risk: low.

- **Gap D.7 — No capability gate; every call to a privileged surface is implicit.**
  - Current: chat send goes straight through; tools execute without a broker.
  - Target: capability broker mediates every privileged action; defense-in-depth in `wishd-capability` and renderer gate.
  - Affected: `electron/native/tools/`, `electron/main.ts`, new `electron/main/capability/`.
  - Prompt: **D-6** (mirrored at W-6).
  - Risk: medium — must not break existing tool calls.

### 4.3 AI/provider/agent gaps (feeds Phase A)

- **Gap A.1 — No canonical AI types.**
  - Current: provider shapes (OpenAI tool_calls vs Anthropic content blocks vs Gemini parts) leak into modelFetch.ts and types.ts; provider enum appears in non-provider files.
  - Target: provider-neutral canonical types (`Message`, `ToolUse`, `ToolResult`, `Thinking`, `StreamEvent`) in `electron/shared/ai/`. Adapters live in provider Cells.
  - Affected: `electron/native/llm/`, `electron/native/modelFetch/`, `src/types.ts`, all UI sites that pattern-match on provider.
  - Prompt: **A-0**.
  - Risk: high — every provider path touched; round-trip tests required.

- **Gap A.2 — No provider runtime separation.**
  - Current: each provider is a branch in `chat.ts` / `modelFetch.ts`.
  - Target: provider runtime that loads provider Cells, normalizes events, mediates auth.
  - Affected: `electron/native/llm/`, new provider Cell scaffolding.
  - Prompt: **A-1**.
  - Risk: high — touches the chat path.

- **Gap A.3 — No formal agent runtime.**
  - Current: turn loop is implicit in modelFetch.ts; swarm.ts is its own ad-hoc loop.
  - Target: agent runtime with a clear loop, tool registry, memory adapter, telemetry hooks, graph-aware.
  - Affected: `electron/native/modelFetch/`, `electron/native/swarm/`, new `electron/native/agent/`.
  - Prompt: **A-2**.
  - Risk: high — chat correctness depends on this.

- **Gap A.4 — Provider-specific code lives in shared modules.**
  - Current: `electron/native/core/version.ts` carries Anthropic constants; OAuth tokens are wired in `electron/native/auth/oauth.ts`.
  - Target: Anthropic provider Cell owns these; auth still in shell but provider-specific extras move to provider Cells.
  - Affected: `core/version.ts`, `auth/oauth.ts`, all five provider paths.
  - Prompt: **A-3**.
  - Risk: medium — OAuth is delicate.

### 4.4 Memory / Knowledge / Task / Telemetry / Cell gaps (feeds Mem, K, T, Tel, Cell)

- **Gap Mem.1 — Single-bag BM25 memory.**
  - Current: `~/.wishcode/memory/` flat per-entry JSON + BM25.
  - Target: multi-scope memory (personal/session/workspace/team/task/agent) with structured schema + assembly engine + adapters.
  - Affected: `electron/native/memory/`.
  - Prompt: **Mem-0..2**.

- **Gap K.1 — No knowledge/retrieval subsystem.**
  - Greenfield. Add `electron/native/knowledge/` plus indexer (BM25 + vector via `wishd-index`) and provenance layer.
  - Prompt: **K-0..3**.

- **Gap T.1 — No Task vs Job distinction; no Job graph.**
  - Current: flat `Task` in `electron/native/tasks/`.
  - Target: `Task` (user-visible intent) vs `Job` (executable graph node) with persisted DAG, resumable.
  - Prompt: **T-0..2**.

- **Gap Tel.1 — No telemetry envelope.**
  - Current: `tasks.update`/`memory.changed` etc. fan out via IPC; no taxonomy, no sinks.
  - Target: event taxonomy + transport + domain sinks (analytics + governance) + dev observability.
  - Prompt: **Tel-0..3**.

- **Gap Cell.1 — No Cell subsystem at all.**
  - Greenfield: Cell Manifest, Registry, Runtime, SDK, UI Slot Host, Cell Groups, Trust Tiers, Sync Hooks, Cell Forge local lifecycle.
  - Prompt: **Cell-0..8**.

### 4.5 wishd integration gaps (feeds Phase W and W-9 merge)

- **Gap W.1 — Every privileged op runs in TS main process.**
  - Current: file read/write, git, terminal, process spawn, indexing — all in TS via `child_process`/`fs`/`node-pty` patterns.
  - Target: privileged ops cross gRPC (Unix socket / named pipe) into the Rust `wishd-server` binary.
  - Affected: greenfield under `/Users/wenyan/ClaudeProjects/wishd/`; merge at **W-9** rewires `electron/native/*` services to call wishd.
  - Prompts: **W-0..9**.
  - Risk: high — major rewire; W-9 must keep tree green.

### 4.6 Hermon integration gaps (feeds Phase H and H-13 merge)

- **Gap H.1 — No remote control plane.**
  - Current: provider auth is local; no orgs/teams/policies/Cell catalog/CoAgent backend.
  - Target: greenfield Rust binary `hermon-server` + Postgres + Helm + TS client `@wish/hermon-client`.
  - Affected: greenfield under `/Users/wenyan/ClaudeProjects/hermon/`; client consumed by Cell-7, Tel-1, A-3, C-*.
  - Prompts: **H-0..13**.
  - Risk: high — large surface; org-scoped data discipline must be enforced from H-0.

### 4.7 CoAgent gaps (feeds Phase C)

- **Gap C.1 — No CoAgent Cell Family.**
  - Greenfield. Depends on Cell-* + H-10 + H-13.
  - Prompts: **C-0..7**.

### 4.8 Cell Forge advanced gaps (feeds Phase F)

- **Gap F.1 — No pattern detection / AI cell generation / evaluation gates / publication pipeline.**
  - Greenfield. Depends on Cell-8, Tel-3, A-2, H-6, H-8.
  - Prompts: **F-0..3**.

### 4.9 Overlay gaps (feeds Phase O)

- **Gap O.1 — No overlay system; product is monolithic Wish Code.**
  - Greenfield. Depends on Cell-7, F-3.
  - Prompts: **O-0..1**.

## 5. Cross-cutting concerns

### 5.1 Tauri residue
None. M-0 confirmed no `src-tauri/`, `Cargo.toml`, or Rust artifacts in wishcode.

### 5.2 Security/sandbox gaps
None at the renderer boundary — sandbox: true, contextIsolation: true, nodeIntegration: false, no raw `ipcRenderer`. Capability broker + trust tiers are net-new (D-6, Cell-6, W-6).

### 5.3 Build/packaging risks
- macOS unsigned (`identity: null`, `hardenedRuntime: false`). Acceptable until release. W-8 ships a wishd binary inside the app bundle — packaging will need to embed the Rust binary with platform-correct rpath.
- Renderer bundle 570 KB pre-min — expect to grow with Cell SDK + slot host. Plan code-splitting in S-0/S-2.
- No CI; the suite's "≥ 20–25 tests per prompt" floor will introduce vitest config in S-0.

### 5.4 Test coverage gaps
- Zero tests today. Floor introduced incrementally; D-0 lands first wave (IPC schema round-trip), A-0 lands canonical AI type round-trip (TS↔Rust).

### 5.5 Branding/naming residue
- Product name `Wish Code` already correct.
- appId `ai.hermon.wishcode.desktop` already aligned with Hermon ecosystem.
- No legacy "Hermon" UI surfacing inside Wish Code yet.

## 6. Recommended phase-order adjustments

The default order in PROMPT-INDEX-v4 § 9 stands. Specific notes for THIS repo:

- **D-0 should come BEFORE A-0.** Reason: A-0 round-trip tests use the IPC schema package created in D-0; without it, A-0 either invents a duplicate or skips the round-trip.
- **S-0 may run in parallel with D-0.** Reason: shell extraction touches `src/`; D-0 introduces `electron/shared/ipc/`. Disjoint trees.
- **Cell-* may begin before A-3 finishes.** Reason: Cell Runtime + SDK + Manifest are independent of provider Cell extraction; A-3 will move provider code INTO the Cell scaffolding once both exist.
- **wishd W-0 and Hermon H-0 start now (parallel).** They have no dependency on wishcode prompts until the W-9 / H-13 merge points. Greenfield, blocking nothing.
- **Tel-0 should come early (paired with D-0).** Reason: every later prompt benefits from the envelope existing; landing it once cuts noise across S/D/A/Mem/K.

## 7. Per-prompt pre-flight checklists

### Prompt S-0 — Shell extraction
- **Will touch:** `src/App.tsx`, `src/main.tsx`, `src/components/Sidebar.tsx`, `src/components/SettingsView.tsx`, `src/components/LoginView.tsx`, all view roots under `src/components/*View.tsx` and `src/features/*`.
- **Will preserve:** every existing view's behavior; localStorage keys (`wsh.sidebarWidth`, `wsh.sidebarCollapsed`); resize/collapse UX; existing IPC subscriptions.
- **Will replace:** the monolithic App.tsx with `src/shell/` (chrome, layout, navigation, settings, branding) + view modules mounted by the shell.
- **Will defer:** Native Chat / Native Code surfaces (S-1, S-2); design tokens beyond the migration minimum (S-3).
- **Estimated diff size:** medium.
- **Risk hotspots:** sidebar resize logic; overlay (settings/login) z-index and focus trapping.

### Prompt S-1 — Native Chat surface
- **Will touch:** `src/components/ChatView.tsx`, `src/components/MessageRenderer.tsx`, `src/components/AskUserModel.tsx`, `src/components/ToolsPalette.tsx`, agent runtime entry, slot host (depends on Cell-4 if it lands first; otherwise temporary slot points).
- **Will preserve:** five-provider streaming; tool blocks; thinking blocks; askUser flow; Markdown + shiki rendering.
- **Will replace:** ad-hoc chat container with a stable Native Chat surface that exposes slots for Cells.
- **Will defer:** Cell contributions to chat (lands when Cell-4 + Cell-5 are in).
- **Estimated diff size:** medium-large.
- **Risk hotspots:** message rendering (every block type), abort behavior across providers, ask-user request/response correlation.

### Prompt S-2 — Native Code surface
- **Will touch:** greenfield `src/shell/code/`; integrates with file/git/terminal IPC (initially TS, later wishd).
- **Will preserve:** N/A (new surface).
- **Will replace:** N/A.
- **Will defer:** advanced editor features (multi-cursor, LSP); these become later prompts or Cells.
- **Estimated diff size:** large.
- **Risk hotspots:** editor lifecycle, virtualized file tree, diff rendering performance.

### Prompt S-3 — Branding/theme/design tokens
- **Will touch:** `src/styles/global.css` (split), `assets/`, every component using hardcoded colors, `electron-builder` config (icons, productName).
- **Will preserve:** current dark default, Radix/Tailwind classes; existing icon assets.
- **Will replace:** ad-hoc colors with token references; single CSS file with tokenized layer + per-component CSS where useful.
- **Will defer:** light theme polish, system theme follow.
- **Estimated diff size:** medium.
- **Risk hotspots:** visual regression in components with hand-rolled hex codes.

### Prompt D-0 — IPC protocol
- **Will touch:** new `electron/shared/ipc/` package; `electron/main.ts`; `electron/preload.ts` (D-1 finishes the consumer side).
- **Will preserve:** all 60 channel names; the `IpcResult<T>` envelope shape.
- **Will replace:** ad-hoc TS interface types with Zod schemas + protocol version.
- **Will defer:** preload migration (D-1).
- **Estimated diff size:** medium.
- **Risk hotspots:** channels with discriminated payloads (chat send permission, mcp callTool args).

### Prompt D-1 — Preload bridge
- **Will touch:** `electron/preload.ts`, `src/types.ts` (subset to delete), every renderer site that uses `window.wish.*`.
- **Will preserve:** the 19 namespaces, public method signatures (modulo runtime validation).
- **Will replace:** raw invoke calls with schema-validated invokes; subscription helpers with typed event payloads.
- **Will defer:** capability gate (D-6).
- **Estimated diff size:** medium.
- **Risk hotspots:** silent breakages on call sites that pass extra fields.

### Prompt D-2 — Main domain services
- **Will touch:** every `electron/native/*` module; `electron/main.ts` (becomes assembly root).
- **Will preserve:** all behavior across all 60 channels.
- **Will replace:** flat module exports with constructor-based services with explicit lifecycle.
- **Will defer:** wishd migration (W-9); capability gate (D-6).
- **Estimated diff size:** large.
- **Risk hotspots:** race conditions during shutdown; preserving event fanout semantics.

### Prompt D-3 — Task supervisor
- **Will touch:** `electron/native/tasks/`, swarm runner, model fetch entry.
- **Will preserve:** per-task abort, persistence, status semantics, UI panel.
- **Will replace:** flat manager with supervisor that distinguishes Tasks vs Jobs (T-0/T-1 deepen this), recovers on restart.
- **Will defer:** Hermon mirror (C-1).
- **Estimated diff size:** medium.
- **Risk hotspots:** swarm runner (uses tasks heavily).

### Prompt D-4 — Skills + tool dispatcher
- **Will touch:** `electron/native/skills/`, `electron/native/tools/`, modelFetch turn loop.
- **Will preserve:** all 11 builtin skills, user skill loading, MCP tool invocation, all builtin tools.
- **Will replace:** auto-prompt-injection with explicit dispatch; unified tool registry.
- **Will defer:** Cell-supplied tools (Cell-3 SDK).
- **Estimated diff size:** medium.
- **Risk hotspots:** triggering correctness — old keyword/regex match must remain effective.

### Prompt D-5 — MCP service
- **Will touch:** `electron/native/mcp/`, `src/components/McpPanel.tsx`, settings overlay.
- **Will preserve:** stdio transport, lazy connection, tool/resource enumeration.
- **Will replace:** manual mcp.json editing with UI editor; no behavior change at the wire.
- **Will defer:** redaction policy (D-6, H-7).
- **Estimated diff size:** small-medium.
- **Risk hotspots:** none significant.

### Prompt D-6 — Capability gate
- **Will touch:** new `electron/main/capability/`; every privileged service entry.
- **Will preserve:** every working flow.
- **Will replace:** implicit privilege with broker calls.
- **Will defer:** wishd-side defense-in-depth (W-6); org policies (H-7).
- **Estimated diff size:** medium.
- **Risk hotspots:** chat send (most common privileged path); any breakage stops the product.

## 8. Migration map

| Current | Target | First prompt that makes the rename |
|---|---|---|
| `src/App.tsx` | `src/shell/App.tsx` | S-0 |
| `src/components/Sidebar.tsx` | `src/shell/chrome/Sidebar.tsx` | S-0 |
| `src/components/SettingsView.tsx` | `src/shell/settings/SettingsView.tsx` | S-0 |
| `src/components/LoginView.tsx` | `src/shell/login/LoginView.tsx` | S-0 |
| `src/components/ChatView.tsx` | `src/shell/chat/ChatSurface.tsx` | S-1 |
| `src/components/MessageRenderer.tsx` | `src/shell/chat/MessageRenderer.tsx` | S-1 |
| `src/components/AskUserModel.tsx` | `src/shell/chat/AskUserModal.tsx` | S-1 |
| `src/components/HistoryView.tsx` (under features) | `src/shell/history/HistorySurface.tsx` | S-0 |
| `src/features/home/HomeView.tsx` | `src/shell/home/HomeSurface.tsx` | S-0 |
| `src/types.ts` (subset) | `electron/shared/ipc/types/*` and `electron/shared/ai/*` | D-0 / A-0 |
| `electron/native/core/version.ts` (Anthropic constants) | `cells/provider-anthropic/runtime.ts` | A-3 |
| `electron/native/auth/oauth.ts` (Anthropic OAuth specifics) | `cells/provider-anthropic/auth.ts` | A-3 |
| `electron/native/llm/chat.ts` per-provider branches | per-provider Cells under `cells/provider-*/` | A-3 |
| `electron/native/memory/memdir.ts` | multi-scope memory under `electron/native/memory/{personal,session,workspace,team,task,agent}/` | Mem-0 |
| `electron/native/tasks/manager.ts` | `electron/native/tasks/supervisor.ts` (D-3) → `electron/native/jobs/graph.ts` (T-1) | D-3 / T-1 |
| `electron/main.ts` ad-hoc handler wiring | `electron/main/services/*` services + `electron/main/index.ts` assembly root | D-2 |
| Renderer fs/git/terminal direct calls | gRPC calls to `wishd` via `electron/main/wishd-bridge/` | W-9 |

## 9. ADR index going forward

Expected ADR list (one per prompt):
- `docs/arch/M-0-inspection.md` ✓
- `docs/arch/M-1-gap-analysis.md` ✓ (this doc)
- `docs/arch/S-0..3.md`
- `docs/arch/D-0..6.md`
- `docs/arch/A-0..3.md`
- `docs/arch/Mem-0..2.md`
- `docs/arch/K-0..3.md`
- `docs/arch/T-0..2.md`
- `docs/arch/Tel-0..3.md`
- `docs/arch/Cell-0..8.md`
- `docs/arch/C-0..7.md`
- `docs/arch/F-0..3.md`
- `docs/arch/O-0..1.md`

Plus in `wishd`: `W-0..9` ADRs. In `hermon`: `H-0..13` ADRs.

## 10. Open questions

1. **Single CSS vs CSS-in-JS at S-3.** Tokens with PostCSS layers vs vanilla-extract vs Panda CSS. Defer to S-3 unless the user has a preference.
2. **Cell sandbox technology.** iframe + postMessage vs Web Worker vs VM2-like sandbox. Cell-2 will pick; pre-flight assumption: iframe with `sandbox` attribute + postMessage SDK shim.
3. **wishd transport on macOS.** Unix socket OK; on Windows named pipe — confirm same protobuf wire format on both. W-0 locks this.
4. **Hermon org bootstrap.** First-run flow: anonymous local mode vs forced enrollment. H-2 pre-flight assumption: anonymous local org with promotion path to Hermon enrollment.
5. **Provider Cell distribution.** First-party Cells signed and bundled vs downloaded from Hermon catalog at first run. A-3 pre-flight assumption: bundled signed; Hermon catalog updates lands in H-6.
