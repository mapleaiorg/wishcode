# iBank Desktop v0.3.1 — Design Document

> "Make iBank the most advanced and powerful crypto banking AI agent in
> the world, dominating the future financial and crypto market."

This is the **design & plan** document. No implementation until you
sign off. It maps every feature of the v0.2.5 CLI into a native v0.2.6
module, explains what it does, why it matters, and how the UI surfaces
it. Nothing is a stub — each item has a concrete implementation path.

---

## 1. Product pillars

iBank v0.2.6 is four products in one, unified by a single AI companion:

| Pillar                  | What the user gets                                      |
|-------------------------|---------------------------------------------------------|
| **AI Chat + Buddy**     | Claude/OpenAI/Gemini/Ollama companion with memory,      |
|                         | skills, tools. Plan mode, swarm mode, thinking blocks.  |
| **Non-custodial Wallet**| Local HD keystore (EVM/BTC/SOL/TRON), balances,         |
|                         | signed transactions, policy limits, device-key encrypt. |
| **Trading Desk**        | Binance/DEX price feeds, charts, bots, risk gates,      |
|                         | simulate + execute with human-in-the-loop approval.     |
| **Market Intelligence** | Skills: market-analyst, portfolio-rebalancer,           |
|                         | tax-reporter, whale-watcher, news-digest, DeFi-scout.   |

Everything runs **locally** in the Electron main process. The only
outbound traffic is:
- LLM provider APIs (Anthropic / OpenAI / xAI / Gemini / Ollama)
- Blockchain RPCs (configurable, defaults to public)
- Market data (Binance public API, CoinGecko)
- Optional: OpeniBank server (for pooled quota & cross-device sync)

No telemetry. All keys never leave the device unencrypted.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  Renderer (React + TypeScript)                   │
│  ┌───────────┬───────────────────┬──────────────────────────┐    │
│  │  Sidebar  │    ChatView       │     ViewsPanel           │    │
│  │           │                   │                          │    │
│  │ ▸ collapse│ pill input bar    │ Preview · Diff · Terminal│    │
│  │ ▸ chats   │ canvas messages   │ Tasks · Plan · Inspect   │    │
│  │ ▸ wallet  │ code blocks       │                          │    │
│  │ ▸ trading │ tool cards        │ (toggle from titlebar)   │    │
│  │ ▸ skills  │ plan cards        │                          │    │
│  │ ▸ buddy   │ thinking blocks   │                          │    │
│  └───────────┴───────────────────┴──────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │  contextBridge IPC
┌────────────────────────────────┴─────────────────────────────────┐
│                    Electron Preload (typed bridge)               │
│    window.ibank.{ auth, chat, model, wallet, trading,            │
│                   memory, buddy, skills, commands,               │
│                   tools, tasks, config, swarm, app }             │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
┌────────────────────────────────┴─────────────────────────────────┐
│                      Electron Main (Node 20)                     │
│                                                                  │
│  electron/native/                                                │
│  ├── core/                                                       │
│  │   ├── config.ts          ~/.ibank/.ibank.json I/O             │
│  │   ├── version.ts         VERSION, attribution prefix          │
│  │   ├── logger.ts          structured log ring                  │
│  │   ├── events.ts          EventEmitter for notify fan-out      │
│  │   └── ipc.ts             IPC channel registrar                │
│  │                                                               │
│  ├── auth/                                                       │
│  │   ├── oauth.ts           Claude OAuth 2.0 + PKCE              │
│  │   ├── auth.ts            multi-provider status/login/logout   │
│  │   └── openibank.ts       device-auth (optional server)        │
│  │                                                               │
│  ├── llm/                                                        │
│  │   ├── chat.ts            streaming dispatch (top-level)       │
│  │   ├── anthropic.ts       w/ Claude Code attribution headers   │
│  │   ├── openai.ts          OpenAI / xAI Grok                    │
│  │   ├── gemini.ts          Google Generative API                │
│  │   ├── ollama.ts          local models                         │
│  │   ├── model.ts           list/select/default                  │
│  │   └── prompts.ts         system prompt assembly               │
│  │                                                               │
│  ├── wallet/                                                     │
│  │   ├── keystore.ts        BIP-39 seed, AES-GCM + device key    │
│  │   ├── derivation.ts      BIP-44 paths for EVM/BTC/SOL/TRON    │
│  │   ├── chains.ts          chain registry (mainnet/testnet)     │
│  │   ├── rpc.ts             provider registry + fallback         │
│  │   ├── balance.ts         native + ERC-20/SPL/TRC-20 balance   │
│  │   ├── tokens.ts          token registry (top 100 per chain)   │
│  │   ├── transactions.ts    build / sign / broadcast             │
│  │   ├── history.ts         indexer queries (Etherscan-compat)   │
│  │   └── policy.ts          daily cap, large-tx gate, allowlist  │
│  │                                                               │
│  ├── trading/                                                    │
│  │   ├── binance.ts         public REST (prices, candles)        │
│  │   ├── engine.ts          strategy runner + paper trading      │
│  │   ├── bots.ts            DCA / grid / momentum bots           │
│  │   ├── risk.ts            position sizing, stop-loss gates     │
│  │   └── storage.ts         trade log persistence                │
│  │                                                               │
│  ├── memory/                                                     │
│  │   ├── memdir.ts          ~/.ibank/memory/*.md projects        │
│  │   ├── sessionMemory.ts   per-session rolling summary          │
│  │   ├── findRelevant.ts    retrieval by tag + recency           │
│  │   └── index.ts           memory index (meta.json)             │
│  │                                                               │
│  ├── buddy/                                                      │
│  │   ├── companion.ts       long-lived state machine             │
│  │   ├── prompt.ts          buddy system-prompt assembly         │
│  │   ├── notifications.ts   alerts (price moves, tx events)      │
│  │   └── sprites.ts         animated buddy icons (renderer)      │
│  │                                                               │
│  ├── commands/                                                   │
│  │   ├── registry.ts        /command dispatch                    │
│  │   ├── help.ts            /help, /status, /version             │
│  │   ├── login.ts           /login claude / /logout              │
│  │   ├── model.ts           /model list / set                    │
│  │   ├── wallet.ts          /wallet list / create / send / …     │
│  │   ├── trade.ts           /trade prices / chart / buy / sell   │
│  │   ├── memory.ts          /memory add / list / clear           │
│  │   ├── plan.ts            /plan mode / /exit-plan              │
│  │   ├── compact.ts         /compact conversation                │
│  │   ├── export.ts          /export conversation → md            │
│  │   ├── skills.ts          /skills list / run                   │
│  │   ├── tasks.ts           /tasks list / show / stop            │
│  │   ├── config.ts          /config get / set                    │
│  │   ├── session.ts         /session save / load / fork          │
│  │   └── … 25 more (see §5)                                      │
│  │                                                               │
│  ├── skills/                                                     │
│  │   ├── registry.ts        load + invoke skills                 │
│  │   ├── builtin/           bundled skills (18 of them)          │
│  │   │   ├── marketAnalyst.ts                                    │
│  │   │   ├── portfolioRebalancer.ts                              │
│  │   │   ├── taxReporter.ts                                      │
│  │   │   ├── whaleWatcher.ts                                     │
│  │   │   ├── defiScout.ts                                        │
│  │   │   ├── newsDigest.ts                                       │
│  │   │   ├── tradeAdvisor.ts                                     │
│  │   │   ├── walletAdvisor.ts                                    │
│  │   │   ├── bankAgent.ts                                        │
│  │   │   ├── creditchain.ts                                      │
│  │   │   ├── remember.ts                                         │
│  │   │   ├── simplify.ts                                         │
│  │   │   ├── verify.ts                                           │
│  │   │   ├── debug.ts                                            │
│  │   │   ├── loop.ts                                             │
│  │   │   ├── swarm.ts                                            │
│  │   │   ├── scheduleRemoteAgents.ts                             │
│  │   │   └── stuck.ts                                            │
│  │   └── user/              user-installed skills                │
│  │                                                               │
│  ├── tools/                                                      │
│  │   ├── registry.ts        tool schema + dispatch               │
│  │   ├── fileRead.ts        Read (with safety)                   │
│  │   ├── fileWrite.ts       Write                                │
│  │   ├── fileEdit.ts        Edit (exact-match replace)           │
│  │   ├── glob.ts            Glob                                 │
│  │   ├── grep.ts            Grep (ripgrep via child proc)        │
│  │   ├── bash.ts            sandboxed shell (permission-gated)   │
│  │   ├── webFetch.ts        WebFetch                             │
│  │   ├── webSearch.ts       (Brave / DuckDuckGo)                 │
│  │   ├── webBrowser.ts      headless chromium via playwright     │
│  │   ├── agent.ts           sub-agent spawn (swarm)              │
│  │   ├── planMode.ts        enter/exit plan mode                 │
│  │   ├── askUser.ts         pause + prompt user                  │
│  │   ├── wallet.ts          wallet tool (LLM-facing)             │
│  │   ├── trade.ts           trade tool (LLM-facing)              │
│  │   ├── chain.ts           on-chain query tool                  │
│  │   ├── skillDispatch.ts   invoke a registered skill            │
│  │   ├── todoWrite.ts       TodoWrite                            │
│  │   ├── taskCreate.ts      TaskCreate (background tasks)        │
│  │   └── … 15 more                                               │
│  │                                                               │
│  ├── tasks/                                                      │
│  │   ├── manager.ts         background task lifecycle            │
│  │   ├── scheduler.ts       cron-like scheduling                 │
│  │   └── storage.ts         ~/.ibank/tasks/                      │
│  │                                                               │
│  ├── swarm/                                                      │
│  │   ├── orchestrator.ts    9-role coordinator                   │
│  │   ├── roles.ts           Researcher, Analyst, Trader,         │
│  │   │                      Verifier, Risk, Writer, …            │
│  │   └── queue.ts           inter-agent message bus              │
│  │                                                               │
│  ├── plan/                                                       │
│  │   └── planMode.ts        plan-then-execute workflow           │
│  │                                                               │
│  ├── session/                                                    │
│  │   ├── transcript.ts      append-only JSONL per session        │
│  │   ├── compact.ts         summarize when token-near-limit      │
│  │   └── export.ts          → markdown / JSON                    │
│  │                                                               │
│  └── query/                                                      │
│      ├── engine.ts          main-loop orchestrator               │
│      ├── toolLoop.ts        tool-use round iteration             │
│      └── streaming.ts       SSE chunk → renderer notifications   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Data model (on-disk)

```
~/.ibank/
├── .ibank.json             # config (current)
├── memory/                 # long-term memories (markdown + front-matter)
│   ├── MEMORY.md           # index
│   ├── projects/
│   │   └── *.md
│   └── people/
│       └── *.md
├── sessions/               # conversation transcripts
│   └── 2026-04-16-HHMMSS-<uuid>.jsonl
├── tasks/                  # background tasks (cron / long-running)
│   ├── active/*.json
│   └── completed/*.json
├── wallet/                 # wallet state
│   ├── keystore.json       # AES-GCM encrypted seed
│   ├── accounts.json       # public addresses per chain
│   └── txhistory/*.jsonl   # per-account tx log
├── trading/                # trade logs
│   ├── orders.jsonl
│   ├── positions.json
│   └── bots/*.json
├── skills/                 # user-installed skills
│   └── <name>/SKILL.md
├── buddy/                  # buddy state
│   └── state.json
└── logs/                   # rolling log files
    └── ibank-YYYY-MM-DD.log
```

All files outside `memory/` are JSON/JSONL with `0o600` perms. `wallet/keystore.json` is encrypted at rest with a key derived from:

```
device_key = PBKDF2(sha256, os.hostname() + os.userInfo().username, salt, 100_000, 32)
master_key = HKDF(device_key, user_passphrase_or_empty, "ibank-keystore-v1", 32)
```

If the user sets a passphrase, it's required on every unlock. Without, only the device key protects the seed — acceptable for small-amount hot wallets, warned clearly in UI.

---

## 4. IPC surface (preload → main)

Exposed on `window.ibank` in the renderer:

```ts
interface IBankAPI {
  // App meta
  app: {
    info(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
    onMenuCommand(cb: (cmd: string, arg?: string) => void): Unsub
  }

  // Chat (streaming)
  chat: {
    send(msg: {
      sessionId: string
      model: string
      messages: ChatMessage[]
      systemPrompt?: string
      tools?: ToolSchema[]
      stream: boolean
    }): Promise<{ requestId: string }>
    abort(requestId: string): Promise<void>
    onDelta(cb: (requestId, delta) => void): Unsub
    onToolUse(cb: (requestId, toolUse) => void): Unsub
    onDone(cb: (requestId, usage) => void): Unsub
    onError(cb: (requestId, error) => void): Unsub
  }

  // Auth
  auth: {
    status(): Promise<AuthStatus>
    login(provider: Provider, creds: any): Promise<LoginResult>
    logout(provider: Provider): Promise<void>
    oauthStart(): Promise<{ manualUrl: string; automaticUrl: string }>
    oauthCode(code: string, state?: string): Promise<void>
    onOAuthComplete(cb: (result) => void): Unsub
  }

  // Model
  model: {
    list(): Promise<{ current: string; available: ModelInfo[] }>
    set(model: string, provider?: Provider): Promise<void>
  }

  // Config
  config: {
    get(key?: string): Promise<any>
    set(key: string, value: any): Promise<void>
  }

  // Wallet
  wallet: {
    unlock(passphrase?: string): Promise<void>
    lock(): Promise<void>
    status(): Promise<{ unlocked: boolean; hasKeystore: boolean }>
    create(args: { passphrase?: string; mnemonic?: string }): Promise<{
      mnemonic: string; addresses: Record<Chain, string>
    }>
    import(mnemonic: string, passphrase?: string): Promise<void>
    list(): Promise<WalletAccount[]>
    balance(account: string, chain: Chain): Promise<Balance[]>
    receive(chain: Chain): Promise<{ address: string; qr: string }>
    send(args: SendArgs): Promise<{ txHash: string }>  // policy-gated
    history(account: string, chain: Chain): Promise<Tx[]>
    backup(): Promise<{ mnemonic: string }>  // requires unlock
    policy: {
      get(): Promise<Policy>
      set(p: Partial<Policy>): Promise<void>
    }
  }

  // Trading
  trading: {
    prices(symbols: string[]): Promise<Price[]>
    candles(symbol: string, interval: string, limit: number): Promise<Candle[]>
    orderbook(symbol: string, depth: number): Promise<Orderbook>
    // Paper trading
    simulate(order: Order): Promise<SimResult>
    // Bots
    bots: {
      list(): Promise<Bot[]>
      create(cfg: BotConfig): Promise<Bot>
      start(id: string): Promise<void>
      stop(id: string): Promise<void>
      remove(id: string): Promise<void>
    }
  }

  // Memory
  memory: {
    add(content: string, tags?: string[]): Promise<{ id: string }>
    list(query?: string): Promise<MemoryEntry[]>
    find(query: string, limit?: number): Promise<MemoryEntry[]>
    remove(id: string): Promise<void>
  }

  // Buddy
  buddy: {
    state(): Promise<BuddyState>
    mood(): Promise<string>  // idle / thinking / alert / celebrating
    notifications(): Promise<Notification[]>
    dismiss(id: string): Promise<void>
    onUpdate(cb: (state) => void): Unsub
  }

  // Commands (slash commands)
  commands: {
    list(): Promise<CommandInfo[]>
    run(line: string): Promise<CommandResult>  // "/wallet list"
  }

  // Skills
  skills: {
    list(): Promise<SkillInfo[]>
    run(name: string, args?: any): Promise<any>
    install(source: string): Promise<void>  // path or URL
    uninstall(name: string): Promise<void>
  }

  // Tools (for LLM tool-use)
  tools: {
    available(): Promise<ToolSchema[]>
    // Direct invocation (rarely needed from UI; usually LLM invokes)
    invoke(name: string, args: any): Promise<any>
  }

  // Background tasks
  tasks: {
    list(): Promise<Task[]>
    get(id: string): Promise<Task>
    stop(id: string): Promise<void>
    output(id: string, from?: number): Promise<string[]>
    onUpdate(cb: (id, task) => void): Unsub
  }

  // Swarm
  swarm: {
    start(goal: string, opts?: SwarmOpts): Promise<{ runId: string }>
    status(runId: string): Promise<SwarmRun>
    stop(runId: string): Promise<void>
    onEvent(cb: (runId, event) => void): Unsub
  }

  // Session
  session: {
    current(): Promise<SessionInfo>
    list(): Promise<SessionInfo[]>
    load(id: string): Promise<ChatMessage[]>
    fork(id: string): Promise<string>
    export(id: string, format: 'md' | 'json'): Promise<string>
    compact(id: string): Promise<void>
  }
}
```

Every method has a typed Promise return. Streaming channels (`chat:delta`, `tasks:update`, `buddy:update`, `swarm:event`) fan out through the preload's `onX` subscription pattern.

---

## 5. Commands (slash-command registry)

**Essential (Phase 1)** — 16 commands:

| Command                  | What it does                                          |
|--------------------------|-------------------------------------------------------|
| `/help`                  | List commands + brief descriptions                    |
| `/status`                | Show model, provider, wallet lock state, buddy        |
| `/version`               | Print version                                         |
| `/login <provider>`      | Provider-specific login (OAuth for claude)            |
| `/logout [provider]`     | Log out one or all providers                          |
| `/model list`            | Show available models                                 |
| `/model set <name>`      | Switch model                                          |
| `/clear`                 | Clear current chat                                    |
| `/compact`               | Summarize + shrink context                            |
| `/export [format]`       | Export session (md default, json)                     |
| `/memory add <text>`     | Add persistent memory                                 |
| `/memory list`           | List memories                                         |
| `/wallet ...`            | Full wallet subtree (list/create/send/balance/…)      |
| `/trade ...`             | Full trading subtree (prices/chart/buy/sell/bots/…)   |
| `/config get/set`        | Read/write config                                     |
| `/plan`                  | Enter plan mode (read-only; propose changes)          |

**Advanced (Phase 2)** — 22 more:

`/tasks`, `/skills`, `/session`, `/fork`, `/share`, `/resume`,
`/rewind`, `/theme`, `/keybindings`, `/effort`, `/stats`, `/cost`,
`/doctor`, `/rag`, `/review`, `/ultraplan`, `/voice`, `/ide`,
`/mcp`, `/permissions`, `/sandbox-toggle`, `/feedback`.

---

## 6. Tools (LLM tool-use)

**Essential (Phase 1)** — 11 tools the assistant can invoke to get work done:

| Tool             | Purpose                                       | Permission |
|------------------|-----------------------------------------------|------------|
| `Read`           | Read a file                                   | auto       |
| `Write`          | Create/overwrite a file                       | ask        |
| `Edit`           | Exact-match replace in a file                 | ask        |
| `Glob`           | File-pattern search                           | auto       |
| `Grep`           | Content search (ripgrep)                      | auto       |
| `Bash`           | Run shell command (sandboxed)                 | ask        |
| `WebFetch`       | HTTP GET → markdown-extracted content         | auto       |
| `WebSearch`      | Web search (Brave API)                        | auto       |
| `TodoWrite`      | Create/update todos                           | auto       |
| `Wallet`         | Query wallet state (read-only)                | auto       |
| `Trade`          | Query market data (read-only)                 | auto       |

**Advanced (Phase 2)** — 18 more: `WebBrowser` (Playwright), `Agent`
(spawn sub-agent), `TaskCreate`/`TaskGet`/`TaskStop`, `EnterPlanMode`,
`ExitPlanMode`, `AskUserQuestion`, `SkillDispatch`, `Chain` (on-chain
read), `TradeExecute` (policy-gated write), `WalletSign`, `REPL`,
`NotebookEdit`, `ScheduleCron`, `SendMessage` (inter-agent), `MCPTool`
(MCP proxy), `LSP`, `SnipTool`.

All tools follow the **permission model**:
- `auto` — runs without asking
- `ask` — pause & prompt user (UI modal)
- `plan` — read-only in plan mode; `ask` outside
- `bypass` — never asks (only for trusted internal skills)

---

## 7. Skills (bundled knowledge packages)

A skill is a markdown file with YAML front-matter + optional helper
scripts. The LLM auto-discovers them via the `DiscoverSkills` tool and
invokes via `SkillDispatch`.

**Phase 1 — 8 financial/crypto skills:**

| Skill                    | Triggers when                                        |
|--------------------------|------------------------------------------------------|
| `market-analyst`         | user asks about market conditions, price analysis    |
| `portfolio-rebalancer`   | user asks to rebalance, allocation, target weights   |
| `tax-reporter`           | user asks about tax, cost basis, capital gains       |
| `whale-watcher`          | user asks about large transactions, whale moves      |
| `defi-scout`             | user asks about yield, staking, LP opportunities     |
| `news-digest`            | user asks "what's happening", market news            |
| `trade-advisor`          | user asks for trade ideas, entry/exit                |
| `wallet-advisor`         | user asks about wallet hygiene, safety, gas          |

**Phase 2 — 10 meta skills** (ported from bundled/):
`bankAgent`, `creditchain`, `remember`, `simplify`, `verify`, `debug`,
`loop`, `swarm`, `scheduleRemoteAgents`, `stuck`.

Each skill ships as `electron/native/skills/builtin/<name>.ts` with:
- `name`, `description`, `triggers` (regex or keywords)
- `systemPromptAddition` (prepended when active)
- `tools` (subset of tools this skill unlocks)
- `run(args)` optional code handler

Users can install extra skills to `~/.ibank/skills/<name>/SKILL.md`.

---

## 8. Buddy

The **buddy** is a persistent companion that:
1. Watches for events (price moves, tx confirmations, task completion).
2. Surfaces gentle proactive notifications in a corner bubble.
3. Carries "mood" (idle / thinking / alert / celebrating) that
   drives a small animated sprite.
4. Tracks ongoing goals ("remind me to check BTC at $90k").
5. Threads conversation continuity across sessions ("yesterday you
   were asking about …").

Buddy state lives in `~/.ibank/buddy/state.json` with fields:
```json
{
  "mood": "idle",
  "goals": [{ "id": "...", "text": "...", "check": "...", "expires": 0 }],
  "notifications": [],
  "lastSessionSummary": "...",
  "recentTopics": []
}
```

Driven by the main-process `buddy/companion.ts` event loop:
- subscribes to `wallet:tx-confirmed`, `trading:price-alert`, `task:done`, `chat:done`
- pushes notifications through `buddy:update` stream
- every session start, opens with "Hey — yesterday you X; still interested?"

Renderer: floating bottom-right sprite + notification drawer. Clicking
opens buddy panel in ViewsPanel (right sidebar).

---

## 9. Memory

Three tiers:

1. **Working memory** — current conversation, full fidelity.
2. **Session summary** — rolling summary built as context fills
   (ported from `services/SessionMemory/`).
3. **Long-term memory** — markdown files in `~/.ibank/memory/`,
   chunked and indexed by tag. Ported from `memdir/`.

Retrieval: before each user turn, `memory.findRelevant(userMsg)`
returns the top-5 matching memories, which are added to system prompt
as a "Relevant memories" block. Scoring: BM25 over title+tags + recency
decay. No embeddings in Phase 1 (keep zero-dep; add Phase 3 via local
ONNX MiniLM).

UI: sidebar "Memory" section lists recent + pinned memories; clicking
opens editor modal.

---

## 10. Swarm (multi-agent)

Ported from `services/swarm/orchestrator.ts`. A swarm run takes a goal:
"find me a low-fee stablecoin yield opportunity under 5% risk" and
dispatches 9 roles:

1. **Planner** — decomposes goal into subgoals
2. **Researcher** — fetches web / on-chain data
3. **Analyst** — crunches numbers, compares
4. **Risk** — red-teams proposals
5. **Verifier** — sanity-checks with counter-sources
6. **Trader** — proposes execution plan (read-only by default)
7. **Writer** — summarizes results
8. **Critic** — reviews writer's output
9. **Orchestrator** — routes messages, decides when done

Each role runs as a sub-agent with its own system prompt and tool
subset. Messages flow through `swarm/queue.ts`. UI: ViewsPanel "Swarm"
tab shows agent cards with live transcripts + final summary.

---

## 11. Plan mode

When user types `/plan` or assistant enters plan mode via tool:
- All write-tools (`Write`, `Edit`, `Bash`, `WalletSign`,
  `TradeExecute`) become **disabled**.
- Read tools remain.
- Assistant drafts a plan in `plan/planMode.ts`-managed state.
- User sees plan card in chat + "Approve" / "Edit" / "Cancel" buttons.
- On approve, plan becomes a TaskList and assistant executes step by step.

Critical for wallet/trade safety — user always sees the plan before
any signed transaction or trade executes.

---

## 12. Background tasks

Some operations are long-running (e.g., "run this DCA bot for 30 days",
"poll for mempool events"). These run as background tasks in the main
process, persisted to `~/.ibank/tasks/active/*.json`, survive app
restart. UI: ViewsPanel "Tasks" tab shows task cards with live output,
stop button, progress bar.

Scheduler uses a simple interval-based dispatcher in Phase 1; cron-like
scheduling added in Phase 2.

---

## 13. UI / UX design

### 13.1 Visual system

- **Palette** (dark primary, light opt-in):
  - Background: `#0F1115` (deep charcoal) / `#FAFBFC` (light)
  - Surface: `#16191F` / `#FFFFFF`
  - Border: `#262B35` / `#E6E8EC`
  - Primary accent: `#D97757` (Anthropic terra cotta)
  - Success: `#2EB872` (emerald)
  - Danger: `#E5484D`
  - Warning: `#F5A524`
  - Text primary: `#E6E8EC` / `#1A1D23`
  - Text muted: `#8A92A3` / `#6F7787`

- **Typography**:
  - UI: Inter, -apple-system, "SF Pro", system-ui; 14/20
  - Code: "JetBrains Mono", Menlo, ui-monospace; 13/22
  - Display (chat canvas): "Söhne", Inter; 16/26

- **Radii**: 4 (chips), 8 (cards), 12 (panels), 999 (pill input)

- **Shadows**: layered, subtle — `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.08)` for modals.

### 13.2 Layout

```
┌────────────────────────────────────────────────────────────────┐
│ ●●●    [  iBank — claude sonnet 4.6 ▾  ]  …   Views ▸    ⚙   │  ← titlebar (draggable)
├──────┬─────────────────────────────────────────┬───────────────┤
│      │                                         │               │
│  ┃   │                                         │               │
│  ◐ C │  (chat canvas — scroll-to-bottom)       │  Views panel  │
│  ◐ W │                                         │  (collapsible)│
│  ◐ T │  ╭─ Assistant ────────────────────╮     │               │
│  ◐ S │  │ Response rendered directly     │     │  ┌───────┐    │
│  ◐ B │  │ to the canvas — content-       │     │  │Preview│    │
│      │  │ sensitive typography, no       │     │  │ Diff  │    │
│  ──  │  │ bubble frame.                  │     │  │  Term │    │
│  …   │  │                                │     │  │ Tasks │    │
│      │  │   ╭─ code ───────────╮         │     │  │ Plan  │    │
│      │  │   │ syntax-highlight │         │     │  └───────┘    │
│      │  │   │  monospace       │         │     │               │
│      │  │   ╰──────────────────╯         │     │               │
│      │  ╰────────────────────────────────╯     │               │
│      │                                         │               │
│      │  ╭──────────────────────────────╮       │               │
│      │  │ pill input · 1-line · ↵      │       │               │
│      │  ╰──────────────────────────────╯       │               │
├──────┴─────────────────────────────────────────┴───────────────┤
│ 🧭 Buddy: "BTC just crossed $95k — still want to review?"    × │  ← buddy bubble (toast-like)
└────────────────────────────────────────────────────────────────┘
```

### 13.3 Sidebar (left)

- **Width**: 260px expanded, 48px collapsed (icon rail).
- **Collapse toggle**: Claude Code-style — tiny chevron icon on the
  right edge of the sidebar. Hotkey: ⌘⇧[ .
- **Sections** (each with folder chevron):
  1. Chats — recent sessions, pinned at top
  2. Wallet — quick balances, receive, send, backup
  3. Trading — watchlist, orders, bots
  4. Skills — installed skills, run history
  5. Memory — pinned + recent
  6. Buddy — goals, notifications
- **Bottom strip**: user identity + settings gear.

### 13.4 ChatView

- **No bubbles** — assistant responses render directly onto the
  canvas with content-sensitive typography (like Claude Code):
  - Plain text: display font, 16/26, wide paragraphs
  - Code blocks: bordered, monospace, syntax-highlighted (Shiki),
    language chip top-left, copy button top-right
  - Lists: proper bullets with comfortable line-height
  - Tables: clean, bordered, zebra-striped
  - Quotes: left-border accent
  - Links: accent underline on hover
- **Tool-use cards**: compact card that expands to show input/output.
  Live status dot during execution.
- **Plan cards**: numbered steps, each with checkbox + status icon.
- **Thinking blocks**: collapsed by default, "Thinking for Xs" label;
  expandable to show full reasoning.
- **User messages**: lightly-tinted surface, rounded, right-weighted.
- **Pill input**: 1-line by default, grows to 8 lines max, rounded-full,
  attach button (📎) and send button (⏎) as 32px circles. Model selector
  embedded at left as a subtle chip. Press ⏎ to send, ⇧⏎ for newline.

### 13.5 ViewsPanel (right)

Toggled from titlebar. 340px default, draggable resize handle. Tabs:

- **Preview** — renders HTML/Markdown/SVG from the latest assistant
  output; live-updates as new messages stream. Toggle "follow latest"
  or pin a specific message.
- **Diff** — shows file changes the assistant has staged via Edit/Write
  tools; per-hunk accept/reject.
- **Terminal** — sandboxed persistent shell. Shares session with
  assistant's Bash tool (same cwd).
- **Tasks** — live list of background tasks with output streams.
- **Plan** — plan mode state; expand/collapse steps.
- **Inspect** — LLM request/response inspector: model, tokens,
  latency, cost, raw messages.

### 13.6 Command palette

⌘K opens a spotlight-style palette. Searches across:
- Slash commands (`/wallet list`)
- Skills (`market-analyst`)
- Sessions (fuzzy-matches recent chats)
- Wallet accounts
- Trading pairs
- Settings

### 13.7 Buddy

Floating bottom-right 56x56 sprite. Idle → gentle breathing animation.
Thinking → spinning halo. Alert → color flash + haptic. Click → opens
notification drawer above it. Long-press → mute for 1h.

---

## 14. Security model

- **Context isolation**: strict, `nodeIntegration: false`,
  `sandbox: true` (tightened from current `false`).
- **CSP** on renderer: deny inline scripts, only load from `self`.
- **Preload** exposes a narrow, typed `window.ibank` — no raw
  `ipcRenderer` access.
- **IPC allowlist**: every channel has a whitelist + shape validation.
- **Wallet**: seed never leaves main process; sign happens in main;
  renderer only sees addresses + unsigned tx details.
- **Bash/Write/Edit tools**: permission modal on every invocation
  (unless session-pinned allow).
- **Trade execute**: always goes through policy gate (max per-tx,
  max-per-day, symbol allowlist).
- **OAuth tokens**: stored in `~/.ibank/.ibank.json`, file mode 0o600,
  directory mode 0o700.

---

## 15. Implementation phases

### Phase 1 — Foundation + chat + wallet essentials (THIS PR)

**Goal:** Chat works end-to-end against all 5 LLM providers. Wallet
can create/import a seed, show balances, and receive. No CLI dep.

**Files to create (31):**

```
electron/native/
├── core/{config,version,logger,events,ipc}.ts     (5)
├── auth/{oauth,auth,openibank}.ts                 (3)
├── llm/{chat,anthropic,openai,gemini,ollama,model,prompts}.ts  (7)
├── wallet/{keystore,derivation,chains,rpc,balance,tokens,
│         transactions,history,policy}.ts           (9)
├── memory/{memdir,sessionMemory,findRelevant,index}.ts  (4)
├── commands/{registry,core,wallet,model,memory}.ts (5)
├── session/{transcript,export}.ts                  (2)
└── index.ts                                        (1)
```

Plus: rewrite `electron/main.ts`, update `electron/preload.ts`,
update `src/types.ts`, update 3 renderer components for new IPC.

**Renderer UI:** basic working chat + new pill input + code
highlighting. Sidebar collapse. ViewsPanel stub (Preview tab only).

**Acceptance criteria:**
- `npm run electron:dev` launches without CLI.
- Claude OAuth flow completes; chat streams tokens.
- API-key login for OpenAI/xAI/Gemini/Ollama works.
- `/help`, `/model`, `/login`, `/wallet create` all work.
- Wallet keystore round-trips (create → lock → unlock).
- Memory add/list works.
- `tsc -p electron/tsconfig.json` and `vite build` both pass.

### Phase 2 — Buddy, skills, tools, commands, plan mode

**Files (21):**
- `buddy/{companion,prompt,notifications}.ts` (3)
- `skills/registry.ts` + 8 bundled skills (9)
- `tools/{registry,fileRead,fileWrite,fileEdit,glob,grep,bash,webFetch,webSearch,todoWrite,wallet,trade}.ts` (12 tools) + `registry` (1)
- `commands/*` (12 more commands)
- `plan/planMode.ts` (1)
- `query/{engine,toolLoop,streaming}.ts` (3)

**Renderer UI:** ViewsPanel full tabset (Preview/Diff/Terminal/Tasks/Plan/Inspect). Buddy sprite + notifications. Tool-use cards. Plan cards. Command palette (⌘K).

**Acceptance criteria:**
- Assistant can Read/Write/Edit/Grep files with permission gates.
- All 8 Phase-1 skills trigger on keywords.
- `/plan` enters and exits plan mode; writes disabled.
- Buddy fires a notification when a tx confirms.

### Phase 3 — Trading, swarm, tasks, advanced tools

**Files (14):**
- `trading/{binance,engine,bots,risk,storage}.ts` (5)
- `swarm/{orchestrator,roles,queue}.ts` (3)
- `tasks/{manager,scheduler,storage}.ts` (3)
- Additional tools: WebBrowser, Agent, TaskCreate/Get/Stop (3)

**Renderer UI:** Trading panel overhaul (chart with TradingView
lightweight-charts, orderbook, DOM). Bots manager. Swarm panel in
ViewsPanel.

### Phase 4 — Polish, plug-ins, mobile

- MCP integration
- Plug-in marketplace
- Local-only inference (Ollama) fallback
- Mobile via React Native port

---

## 16. What I'm asking you to approve

Please confirm or adjust:

1. **Phase 1 scope** — 31 native files + renderer UI refresh is one
   milestone. OK to ship as a single PR, or do you want it broken
   into smaller slices (e.g., "native chat only" first, then
   "native wallet", then "UI refresh")?

2. **Wallet security** — is passphrase-optional (device-key-only)
   acceptable for Phase 1, or must it always require a user
   passphrase before creating a keystore?

3. **Sandbox tightening** — I want to flip `webPreferences.sandbox`
   to `true` (from current `false`). This hardens the renderer but
   might break something I haven't audited; OK to proceed?

4. **Buddy sprite style** — options:
   (a) Pure CSS shape (current v0.2.5 approach)
   (b) Rive animation (small, vector-like, expressive)
   (c) Lottie JSON (AfterEffects-exported, heavier)
   (d) Animated SVG with Framer Motion
   Pick one.

5. **Skill system format** — stay with TypeScript modules (current
   CLI approach) or move to markdown-with-frontmatter (Claude Code
   style)? Markdown is user-friendlier and enables plug-in
   marketplace later.

6. **Priority order for Phase 1** — if we have to ship partial:
   (a) Chat first → wallet later
   (b) Chat + wallet-readonly first → signing later
   (c) Everything, but only Anthropic provider first → others later
   Pick one (default: a).

7. **Memory retrieval** — Phase 1 uses BM25 (zero-dep). OK to defer
   semantic search (embeddings) to Phase 3?

8. **UI library** — I'm planning to keep it vanilla React + CSS
   modules (no component lib). OK, or do you want Radix / shadcn?

Once you tell me which of the 8 you want tweaked, I start implementing
Phase 1 in order — files listed in §15 exactly as enumerated, no
stubs, real code.

---

## 17. DECISIONS (locked 2026-04-16)

| # | Question                        | Decision                                    |
|---|---------------------------------|---------------------------------------------|
| 1 | Phase 1 shipping                | **Single PR** — ship all 31+ files at once  |
| 2 | Wallet passphrase               | **Required** — no passphrase-optional mode  |
| 3 | Sandbox tightening              | **Yes** — flip to `sandbox: true`           |
| 4 | Buddy sprite                    | **Animated SVG + Framer Motion**            |
| 5 | Skill format                    | **Markdown + YAML frontmatter** (user-editable) |
| 6 | Provider priority               | **Anthropic first**, but ship all 5 wired   |
| 7 | Memory retrieval                | **BM25 Phase 1**, embeddings Phase 3        |
| 8 | UI library                      | **Radix primitives + Framer Motion + CSS modules** |

Additional requirement from user:
> "Main chat output needs to be in good format depending on the content."

Satisfied by: content-sensitive renderer (§13.4) using `react-markdown` +
`remark-gfm` + Shiki for code, custom renderers for tables, quotes,
lists, task lists, thinking blocks, and tool-use cards.

---

## 18. QueryEngine — the central brain

Adopted from the CLI's `QueryEngine.ts` (the 46K-line "self-healing
query loop" — ours is smaller but same pattern):

```
┌──────────────────── QueryEngine.run() ────────────────────┐
│                                                           │
│  1. processUserInput(msg)                                 │
│     ├─ slash-command? → commands/registry → result; skip  │
│     ├─ attachments? → inline into message                 │
│     └─ plain? → pass through                              │
│                                                           │
│  2. assembleSystemPrompt()                                │
│     ├─ base prefix (CLAUDE_CODE_SYSTEM_PREFIX if OAuth)   │
│     ├─ user systemPrompt                                  │
│     ├─ skills: find matching, prepend their addendum      │
│     ├─ memory: findRelevant(msg) top-5                    │
│     ├─ wallet/trade context (balances, selected account)  │
│     └─ tool schemas                                       │
│                                                           │
│  3. turn loop:                                            │
│     while (!done && turns < maxTurns):                    │
│       ├─ stream = llm.chat.stream(messages)               │
│       ├─ for each delta: notify('chat:delta', …)          │
│       ├─ if tool_use:                                     │
│       │    ├─ canUseTool(name, input) → permission gate   │
│       │    ├─ tool.run(input) → result                    │
│       │    ├─ notify('chat:toolUse', {name, input, out})  │
│       │    └─ append tool_result, continue loop           │
│       ├─ if stop_reason === 'end_turn': done              │
│       └─ accumulate usage                                 │
│                                                           │
│  4. compact check:                                        │
│     if tokensUsed > 0.85 * ctxWindow:                     │
│       → sessionMemory.summarize(oldMessages)              │
│       → replace old messages with summary block           │
│                                                           │
│  5. persist to ~/.ibank/sessions/<id>.jsonl               │
│  6. notify('chat:done', {usage, finalMessage})            │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**AppState** (per-session, held in memory + mirrored to disk):

```ts
interface AppState {
  sessionId: string
  cwd: string
  messages: Message[]
  planMode: boolean
  permissionMode: 'default' | 'ask' | 'accept-edits' | 'plan' | 'bypass'
  permissionsGranted: Set<string>  // e.g. "Bash:npm install"
  fileStateCache: Map<string, FileSnapshot>
  openTasks: Task[]
  wallet: { unlocked: boolean; selectedAccount?: string }
  tradingContext: { watchlist: string[]; lastPrices: Record<string, number> }
  buddyState: BuddyState
  usage: Usage
  budget: { maxTurns: number; usedTurns: number }
}
```

**Tool registry** mirrors the CLI's `Tool.ts` interface:

```ts
interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema  // Zod → JSONSchema
  permission: 'auto' | 'ask' | 'plan' | 'bypass'
  run(input: any, ctx: ToolUseContext): Promise<ToolResult>
}
```

---

## 19. Tech stack (locked)

**Main process (Node 20 + Electron 32):**
- `ethers` v6 — EVM chains (multi-chain RPC, signing, balance)
- `bitcoinjs-lib` + `tiny-secp256k1` — BTC
- `@solana/web3.js` — Solana
- `tronweb` — TRON
- `bip39` + `bip32` — seed + derivation
- `@noble/hashes` — keccak256, sha256 (zero-dep)
- `@noble/ciphers` — AES-GCM for keystore encryption
- Built-in `fetch`, `crypto` — no axios

**Renderer:**
- React 18
- `@radix-ui/react-*` — dialog, tooltip, popover, tabs, dropdown-menu,
  context-menu, scroll-area, separator (accessible primitives)
- `framer-motion` — buddy sprite, panel transitions, message fade-ins
- `react-markdown` + `remark-gfm` + `remark-math` — content-sensitive
  rendering (tables, task lists, fenced code, footnotes, math)
- `shiki` — syntax highlighting (GitHub Dark/Light themes, loaded once)
- `lucide-react` — icon system
- CSS Modules + CSS custom properties — theming

No Tailwind, no styled-components, no UI kit — just Radix's unstyled
primitives we skin ourselves with CSS modules. Keeps bundle light and
gives us full control over the Claude-Code aesthetic.

---

## 20. Implementation order (executing now)

Phase 1 files in dependency order (25 files of real code, no stubs):

```
 1. package.json                             (update deps)
 2. electron/native/core/version.ts
 3. electron/native/core/config.ts
 4. electron/native/core/logger.ts
 5. electron/native/core/events.ts           (event bus for notifications)
 6. electron/native/auth/oauth.ts            (Claude OAuth + PKCE + listener)
 7. electron/native/auth/auth.ts             (multi-provider)
 8. electron/native/llm/model.ts
 9. electron/native/llm/chat.ts              (all 5 streaming providers)
10. electron/native/memory/memdir.ts         (markdown + BM25)
11. electron/native/session/transcript.ts
12. electron/native/wallet/chains.ts
13. electron/native/wallet/derivation.ts
14. electron/native/wallet/keystore.ts       (passphrase-required)
15. electron/native/wallet/rpc.ts
16. electron/native/wallet/balance.ts
17. electron/native/wallet/policy.ts
18. electron/native/skills/registry.ts       (markdown + frontmatter)
19. electron/native/skills/builtin/*.md      (8 skills shipped as md)
20. electron/native/commands/registry.ts     (slash-command dispatch)
21. electron/native/commands/builtins.ts     (16 core commands)
22. electron/native/query/engine.ts          (turn loop + tool-use)
23. electron/native/index.ts                 (barrel export)
24. electron/main.ts                         (rewritten — no CLI)
25. electron/preload.ts                      (typed window.ibank)
26. src/types.ts                             (API types)
27. src/styles/global.css                    (design tokens)
28. src/components/ChatView.tsx              (pill input + canvas)
29. src/components/MessageRenderer.tsx       (markdown + shiki)
30. src/components/Sidebar.tsx               (Claude-Code collapse)
31. src/components/ChatTitleBar.tsx          (Views toggle)
32. src/components/ViewsPanel.tsx            (Preview/Diff/Terminal/Tasks/Plan)
33. src/components/Buddy.tsx                 (animated SVG + Framer)
34. src/App.tsx                              (wire new pieces)
```

Implementation begins now.

