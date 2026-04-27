# M-0 — Wishcode Repo Inspection Map

Date: 2026-04-24
Inspector: Claude Code
Repo snapshot: pre-v4 baseline

## 1. Summary

Wish Code (v0.1.0) is a flat TypeScript Electron desktop application (no monorepo) using Vite for the renderer, npm with package-lock, and React 18 with Radix UI + Tailwind utilities. The main process (Electron 32 + Node 22) hosts a multi-LLM chat loop (Claude OAuth, OpenAI, xAI Grok, Google Gemini, Ollama, Hermon) with unified streaming via `streamChat()`, built-in markdown skills, BM25 memory, MCP server integration (stdio-based), background task manager, and a swarm agent executor. Context isolation and process sandbox are hardened (nodeIntegration: false, contextIsolation: true, sandbox: true). Build targets macOS (dmg/zip, arm64/x64), Windows (zip, x64), and Linux (AppImage, x64/arm64). No CI workflows are present. The renderer is a three-zone layout (sidebar, titlebar, content) using React hooks state without a dedicated state library; routing is manual via a `ViewKey` enum. TypeScript strict mode enabled. Test infrastructure is absent.

## 2. Root metadata

- **name:** `wishcode`
- **productName:** `Wish Code`
- **version:** `0.1.0`
- **main:** `dist-electron/main.js`
- **type:** `"module"` (ESM in package; main process tsconfig uses CommonJS)
- **license:** Proprietary
- **engines:** Not specified; runtime Node v22 in use
- **Scripts:** `dev`, `build`, `build:electron`, `start`, `electron:dev`, `typecheck`, `package:mac/win/linux`, `postinstall`
- **dependencies:** React 18.3.1, react-dom, Radix UI primitives, lucide-react, framer-motion, react-markdown + remark-gfm + remark-breaks + rehype-raw, shiki
- **devDependencies:** @types/node, @types/react, Electron 32.0.0, electron-builder 25.0.0, TypeScript 5.4.5, Vite 5.4.0, @vitejs/plugin-react
- **Build config:** appId `ai.hermon.wishcode.desktop`; macOS dmg+zip universal (unsigned: identity null, hardenedRuntime false); Windows zip x64; Linux AppImage x64+arm64
- **No monorepo file** (no pnpm-workspace.yaml, lerna.json, nx.json, turbo.json)
- **tsconfig.json (renderer):** ES2022, ESNext module, strict, jsx react-jsx, skipLibCheck true
- **electron/tsconfig.json:** ES2022, CommonJS module, outDir `../dist-electron`, strict, types: ["node"]
- **README.md:** absent at root
- **LICENSE:** absent
- **.gitignore:** standard (node_modules, dist, dist-electron, release, .env, logs, editor noise, .claude, .cursor, .aider, .ibank)
- **CI:** no `.github/workflows/`

## 3. Top-level structure

```
.
|-- WISH.md
|-- assets
|   |-- icon.png
|   `-- logo.svg
|-- electron
|   |-- dist-package.json
|   |-- main.ts
|   |-- native
|   |-- preload.ts
|   `-- tsconfig.json
|-- package-lock.json
|-- package.json
|-- scripts
|   |-- build-icns.sh
|   |-- build-icon.mjs
|   `-- patch-dev-name.js
|-- src
|   |-- App.tsx
|   |-- components
|   |-- features
|   |-- hooks
|   |-- i18n
|   |-- index.html
|   |-- main.tsx
|   |-- styles
|   `-- types.ts
|-- tsconfig.json
`-- vite.config.ts
```

- No `src-tauri/`, no `Cargo.toml`, no Rust artifacts.
- Renderer in `src/`, main in `electron/main.ts`, native subsystem in `electron/native/`, preload in `electron/preload.ts`.
- `electron/native/` has 21 subdirectories: auth, blackboard, buddy, commands, core, cron, hooks, llm, mcp, memory, modelFetch, personas, session, skills, swarm, tasks, tools, plus three more.

## 4. Electron main

**Entry:** `electron/main.ts` (~324 lines)

**BrowserWindow:** single window, 1440×900 (min 960×640), dark background `#0b0d12`, preload `electron/preload.js`, webPreferences `{ sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: true }`. window-open handler allows https only; navigate handler restricts to localhost/file://.

**Lifecycle:** `app.whenReady()` initializes event fanout, installs IPC handlers, creates window. `activate` recreates window. `window-all-closed` quits on non-macOS.

**Wrapper:** all `ipcMain.handle()` calls go through a `handle(channel, handler)` helper that returns `{ ok: true, value }` or `{ ok: false, error }`.

**Channel table** (60 handlers):

| channel | handler file | input | output | side effects |
|---|---|---|---|---|
| wish:app:version | main.ts | none | `{ version }` | — |
| wish:app:paths | native/core/config.js | none | `Record<string,string>` | reads config dir |
| wish:app:quit | main.ts | none | void | quits app |
| wish:app:openExternal | main.ts | url | void | opens URL |
| wish:app:logs | native/core/logger.js | limit? | log entries | reads logs |
| wish:config:get | native/core/config.js | key? | config | reads `~/.wishcode/config.json` |
| wish:config:set | native/core/config.js | key, value | true | merges into config |
| wish:auth:status | native/auth/auth.js | none | auth entries | checks credentials |
| wish:auth:login | native/auth/auth.js | provider, creds? | auth result | stores credentials |
| wish:auth:logout | native/auth/auth.js | provider | void | removes credentials |
| wish:auth:oauthStart | native/auth/oauth.js | none | `{ manualUrl, automaticUrl }` | starts OAuth |
| wish:auth:oauthSubmitCode | native/auth/oauth.js | code | void | exchanges code |
| wish:auth:oauthCancel | native/auth/oauth.js | none | void | cancels OAuth |
| wish:model:list | native/llm/model.js | none | models per provider | queries Ollama |
| wish:model:set | native/llm/model.js | provider, name | `{ model, provider }` | emits model.changed |
| wish:model:current | native/llm/model.js | none | `{ model, provider }` | reads config |
| wish:memory:add | native/memory/memdir.js | `{ body, tags?, pinned? }` | entry | writes `~/.wishcode/memory/` |
| wish:memory:list | native/memory/memdir.js | none | entries | reads disk |
| wish:memory:remove | native/memory/memdir.js | id | bool | deletes file |
| wish:memory:update | native/memory/memdir.js | id, patch | entry | modifies file |
| wish:memory:recall | native/memory/memdir.js | query, limit? | matches | BM25 search |
| wish:skills:list | native/skills/registry.js | none | skills | loads builtin + user |
| wish:skills:reload | native/skills/registry.js | none | skills | clears + reloads |
| wish:skills:install | native/skills/registry.js | name, markdown | result | writes `~/.wishcode/skills/` |
| wish:skills:uninstall | native/skills/registry.js | name | bool | deletes from `~/.wishcode/skills/` |
| wish:commands:list | native/commands/registry.js | none | commands | returns slash commands |
| wish:commands:run | native/commands/registry.js | sessionId, input | result | executes slash command |
| wish:chat:send | native/modelFetch/modelFetch.js | sessionId, requestId, text, permission? | result | streams; AbortController per requestId |
| wish:chat:abort | main.ts | requestId | bool | aborts by id |
| wish:session:read | native/session/transcript.js | sessionId | messages | reads session JSON |
| wish:session:clear | native/session/transcript.js | sessionId | void | truncates session |
| wish:session:compact | native/session/transcript.js | sessionId, keepRecent? | `{ droppedTurns, summaryChars }` | compacts old turns |
| wish:session:export | native/session/transcript.js | sessionId, fmt | string | exports markdown/json |
| wish:tasks:list | native/tasks/manager.js | none | tasks | reads tasks.json |
| wish:tasks:cancel | native/tasks/manager.js | id | bool | sets cancelled |
| wish:tasks:remove | native/tasks/manager.js | id | bool | deletes task |
| wish:tasks:clearCompleted | native/tasks/manager.js | none | n | removes completed |
| wish:swarm:run | native/swarm/swarm.js | brief | result | spawns swarm |
| wish:buddy:get | native/buddy/state.js | none | view | returns state |
| wish:buddy:dismiss | native/buddy/state.js | id | void | dismisses |
| wish:tools:list | native/tools/registry.js | none | tool meta | returns tools+schemas |
| wish:askUser:answer | main.ts (requires ask-user.js) | requestId, answer | result | resolves ask_user_question |
| wish:workspace:get | native/core/config.js | none | string | workspace root |
| wish:workspace:set | native/core/config.js | dir | string | sets workspace |
| wish:todos:get | main.ts (requires todo-write.js) | sessionId | todos | reads session todos |
| wish:mcp:servers | native/mcp/manager.js | none | servers | lists MCP |
| wish:mcp:tools | native/mcp/manager.js | none | tools | collects MCP tools |
| wish:mcp:resources | native/mcp/manager.js | none | resources | collects resources |
| wish:mcp:callTool | native/mcp/manager.js | server, tool, args? | result | invokes |
| wish:mcp:readResource | native/mcp/manager.js | server, uri | result | reads |
| wish:mcp:shutdown | native/mcp/manager.js | none | void | closes connections |
| wish:cron:list | native/cron/scheduler.js | none | schedules | reads cron.json |
| wish:cron:create | native/cron/scheduler.js | `{ name, expression, prompt }` | result | creates entry |
| wish:cron:update | native/cron/scheduler.js | id, patch | result | modifies |
| wish:cron:delete | native/cron/scheduler.js | id | bool | removes |
| wish:cron:runNow | native/cron/scheduler.js | id | `{ taskId }` | fires schedule |
| wish:hooks:read | main.ts | none | `{ file, content }` | reads `~/.wishcode/hooks.json` |
| wish:hooks:write | main.ts | content | `{ file }` | validates+writes atomically |

**Event fanout:** `onAny()` listener on native event bus emits to all renderer windows as `wish:event:<channel>`; renderer subscribes via `ipcRenderer.on()`.

**Abort handling:** `abortByRequest` Map keyed per request for `wish:chat:send`.

## 5. Preload

**File:** `electron/preload.ts` (~171 lines)

**Security posture:**
- `contextBridge.exposeInMainWorld('wish', api)` — single window global
- contextIsolation: true; nodeIntegration: false
- No raw `ipcRenderer` exposed; all calls wrapped via `invoke<T>()` helper
- Typed API exported as `WishApi`

**Exposed namespaces under `window.wish`:** all typed: yes, raw ipcRenderer leaks: no
- `app` — version, paths, quit, openExternal, logs, onLog
- `config` — get, set
- `auth` — status, login, logout, oauthStart, oauthSubmitCode, oauthCancel, onOAuthComplete
- `model` — list, set, current, onChanged
- `memory` — add, list, remove, update, recall, onChanged
- `skills` — list, reload, install, uninstall
- `commands` — list, run
- `chat` — send, abort, onDelta, onThinking, onToolUse, onToolResult, onDone, onError, onStatus
- `session` — read, clear, compact, export
- `tasks` — list, cancel, remove, clearCompleted, onUpdate, onChanged
- `swarm` — run
- `buddy` — get, dismiss, onUpdate
- `tools` — list
- `askUser` — onQuestion, answer
- `workspace` — get, set
- `todos` — get
- `mcp` — servers, tools, resources, callTool, readResource, shutdown
- `cron` — list, create, update, delete, runNow
- `hooks` — read, write

Type wrapping: invoke uses `IpcResult<T>` and throws on `{ ok: false }`; subscriptions return unsubscribe functions.

## 6. Renderer

**Entry:** `src/main.tsx` → `App.tsx`.

- **Routing:** manual enum-based: `ViewKey = 'home' | 'chat' | 'history'`, `Overlay = 'none' | 'settings' | 'login'` (App.tsx). Not React Router or TanStack Router.
- **State:** React hooks only (useState, useCallback, useEffect, useRef). No Zustand/Redux/Jotai/Context.
- **Styling:** single `src/styles/global.css` (~174 KB) + Tailwind utility usage; no CSS Modules or styled-components.
- **UI library:** Radix UI primitives + lucide-react icons + custom components.
- **Shell/layout:** defined in `App.tsx` as a three-zone layout (resizable sidebar 200–480px persisted in localStorage `wsh.sidebarWidth`, titlebar with drag region/model picker/login/settings, content area).
- **Top-level views:** home (HomeView.tsx), chat (ChatView.tsx), history (HistoryView.tsx) — three views.
- **Components:** `src/components/` (~27 files) — Sidebar, ChatView, SettingsView, LoginView, ModelPicker, AskUserModel, MessageRenderer, MemoryPanel, McpPanel, CronPanel, SkillsPanel, TasksPanel, TodosPane, LogsPanel, ToolsPalette, Buddy.
- **Features:** `src/features/home/` and `src/features/history/`.
- **Hooks:** `src/hooks/` — useTheme, useI18n.
- **i18n:** `src/i18n/messages.ts`.

## 7. AI / providers

**SDK imports in package.json:** none (no @anthropic-ai/sdk, openai, @google/generative-ai, ollama). All providers via manual fetch + hand-rolled streaming.

**Provider detection:** `inferProvider(model)` in `native/llm/model.ts`:
- `/` or `:` → ollama
- `claude-*` → anthropic
- `gpt-*`, `o1-*`, `o3-*` → openai
- `grok-*` → xai
- `gemini-*` → gemini
- llama/mistral/qwen/gemma/deepseek/phi → ollama
- default fallback: anthropic

**Unified streaming:** `streamChat()` in `native/llm/chat.ts` exposes callbacks `onDelta`, `onThinking` (Anthropic-only), `onToolUse`, `onToolResult`. Internally branches per provider.

**Provider implementations** (manual fetch):
- **Anthropic:** Bearer OAuth token, `x-app: cli`, claude-CLI User-Agent, anthropic-beta header; native content-block arrays (text/tool_use/tool_result/thinking); billing attribution injected into system prompt.
- **OpenAI:** `https://api.openai.com/v1`; messages flattened to OpenAI shape (tool_calls on assistant, tool messages separate); function args as JSON strings.
- **xAI:** `https://api.x.ai/v1` (OpenAI shape).
- **Gemini:** API key in query string; messages adapted to Gemini content structure.
- **Ollama:** `http://localhost:11434` (configurable); function args as objects; tool-call ids optional.

**Provider leak map:**

| non-provider file | leaked shapes |
|---|---|
| native/llm/capability.ts | provider enum + family classification |
| native/modelFetch/modelFetch.ts | provider inference + capability tiers |
| native/core/version.ts | ANTHROPIC_API_VERSION, CLAUDE_CLI_USER_AGENT, OAUTH_BETA_HEADER, buildBillingAttribution() (Anthropic-specific) |
| native/auth/oauth.ts | Anthropic OAuth-specific token mgmt |
| src/types.ts | provider union (anthropic/openai/xai/gemini/ollama/hermon) in message metadata |
| src/components/ModelPicker.tsx | per-provider model lists |
| src/features/home/HomeView.tsx | displays current provider |

**Canonical types:** `ChatMessage` in `native/llm/chat.ts` with role + content (string or Anthropic-native array). Non-Anthropic providers flatten arrays via `flattenContent()`. Tool dispatch routed through single `toolByName()`.

**Streaming normalization:** events are provider-shaped at the wire, normalized post-hoc inside the turn loop in modelFetch.ts.

## 8. Skills and MCP

**Skills:**
- Source: `electron/native/skills/builtin/` (11 builtins — code-review, debugging, evaluator, orchestrator, planner, refactor, reviewer, security-review, summarizer, test-runner, tester) + `~/.wishcode/skills/` (user wins on name conflict).
- Format: Markdown + YAML frontmatter (`name`, `title`, `description`, `triggers`, `tools`, `permissions`, `version`, `author`).
- Invocation: prompt-injection — `matchSkills()` in modelFetch.ts auto-prepends matched skill bodies into a "skills block" of the system prompt. No explicit invocation channel.
- UI: `SkillsPanel.tsx` for list/install/uninstall.

**MCP:**
- Config: `~/.wishcode/mcp.json` (Claude-Code-compatible shape: `{ servers: { id: { command, args, env? } } }`).
- Manager: `native/mcp/manager.ts` + `client.ts` maintain stdio connections; lazy on first tool call; persist for session.
- Tool dispatch: MCP tools listed via `wish:mcp:tools`, invoked via `wish:mcp:callTool`. Included in turn-loop tool registry.
- UI: `McpPanel.tsx` reads/displays only; users edit `mcp.json` manually.

**Relationship:** Skills are prompt-injection triggers; MCP tools are dynamic invocations. Orthogonal subsystems converging at the turn loop.

## 9. Long-running tasks

Task model: present and structured.

- **Manager:** `native/tasks/manager.ts`.
- **Registry:** `Map<string, Task>` in memory; persisted to `~/.wishcode/tasks/tasks.json` (mode 0o600).
- **Shape:** `{ id, title, status, createdAt, startedAt?, finishedAt?, progress?, output?, error?, meta? }`.
- **Statuses:** `queued | running | done | failed | cancelled`.
- **Flow:** `spawnTask(title, runner)` → runner reports progress via `setProgress(id, v)` / `setOutput(id, text)` → emits `tasks.update` on every mutation → renderer subscribes via `wish:tasks:onUpdate`.
- **Cancellation:** AbortController keyed per task; runner observes `signal.aborted`.
- **Persistence:** disk write on each mutation. On restart: tasks reload but status is NOT advanced (tasks left in `running` if interrupted).
- **Swarm:** `native/swarm/swarm.ts` spawns multi-turn agent as a task.

## 10. Build and packaging

- **Renderer build:** `vite build` → `dist/` (index.html 0.83 KB; assets/index-*.css 131.84 KB; assets/index-*.js 570.39 KB pre-min, 168.49 KB gzip). Chunk size warning >500 KB.
- **Main build:** `tsc -p electron/tsconfig.json` → `dist-electron/`. Copies `dist-package.json` to `dist-electron/package.json`. Copies builtin skills to `dist-electron/native/skills/builtin/`.
- **Build state:** working; `typecheck` passes (strict).
- **electron-builder:** appId `ai.hermon.wishcode.desktop`; output `release/`; files `dist/**`, `dist-electron/**`, `assets/**`, `package.json`. macOS dmg+zip universal (unsigned). Windows zip x64. Linux AppImage x64+arm64.
- **Icon pipeline:** `scripts/build-icon.mjs` + `scripts/build-icns.sh`.
- **Code signing:** not configured (identity null, hardenedRuntime false).
- **Release flow:** none (manual `npm run package:*`).
- **Native modules:** none declared.

## 11. Testing

- Test runner: none (no vitest/jest/playwright config).
- Test files: zero.
- CI: none (no `.github/workflows/`).
- Build verification: only `npm run typecheck` (`tsc --noEmit` × 2). Passes.

## 12. Observations (raw facts)

- Sandboxed renderer: contextIsolation true, nodeIntegration false, sandbox true; preload uses contextBridge.
- Pure Electron — no Tauri/Rust.
- 60 IPC channels, all under the `wish:` namespace; all wrapped via uniform `IpcResult<T>` envelope.
- No external provider SDKs. All five providers via manual fetch + hand-rolled streaming.
- Five-provider streamChat() with a single callback API but provider-shaped wire events.
- Anthropic OAuth is wired with billing attribution injected into system prompt and `oauth-2025-04-20` beta header.
- Skills are auto-triggered by keyword/regex matching; bodies prepended to system prompt.
- MCP is stdio-based, lazy, persistent per session; no UI editor for `mcp.json`.
- Tasks persist to `~/.wishcode/tasks/tasks.json`; not auto-resumed on restart.
- Memory is BM25 over per-entry JSON files in `~/.wishcode/memory/`.
- Single 174 KB `global.css`; Tailwind utility classes.
- Manual routing via `ViewKey` enum; three top-level views.
- React useState everywhere; no global state library.
- Renderer bundle 570 KB pre-min (chunk size warning).
- No tests, no CI.
- macOS build unsigned (identity null).
- Electron 32, React 18.3, Vite 5.4, TypeScript 5.4.
- Node version unspecified in package; v22 in use.
- Main process is CommonJS at the tsconfig level despite `"type": "module"` at package level.
- Cron scheduler exists with full CRUD over `cron.json`.
- Hooks editor exists (`wish:hooks:read/write`) operating on `~/.wishcode/hooks.json`.

## 13. Pointers for M-1 gap analysis

- IPC namespace is already `wish:*`, but channels are not Zod-validated nor versioned (D-0/D-1 contract).
- No canonical AI types — provider shapes leak across files (A-0 target).
- No Cell Manifest, Cell Runtime, Cell Registry — entire C/Cell/F/O streams are greenfield in this repo.
- No multi-scope memory (Mem-0): memdir is single-bag BM25.
- No Knowledge/Retrieval/Provenance subsystem (K-0..3).
- No formal Task vs Job distinction (T-0); current Tasks are local jobs only with no resumable graph.
- No Telemetry envelope; events go directly through IPC fanout (Tel-0 target).
- No `wishd` integration; all privileged ops in TS main process (W-9 merge target).
- No Hermon client; provider auth is local-only (H-13 target).
- No Native Chat / Native Code separation; `ChatView` is the only chat surface (S-1, S-2 targets).
- Shell (App.tsx + Sidebar) couples routing, layout, and content rendering — refactor target for S-0.
- No MCP UI editor; SettingsView would host one (D-5 target may align).
- No tests / CI — every later prompt's "≥20–25 cases" floor will create test infrastructure.
- Task supervisor lacks a `Job` graph layer; current statuses are simple flat states.
- Anthropic-specific constants live in shared modules (`native/core/version.ts`) — A-3 will move them into the Anthropic provider Cell.
- No code signing or release workflow; W-8 / H-12 will care about distribution.
