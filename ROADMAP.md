# iBank Desktop v0.2.6 — Native Migration Roadmap

> Mission: make iBank the most advanced and powerful crypto banking AI agent
> in the world — a first-class native desktop product that dominates the
> future financial and crypto market.

This document tracks the migration from **CLI-bridge Electron shell**
(v0.2.5) to **fully native Electron product** (v0.2.6+).

The v0.2.5 desktop was a thin shell over the `ibank-v0.2.5` CLI — it
spawned the CLI as a child process and tunnelled JSON-RPC over stdio.
That gave us fast iteration but four hard problems:

1. Bundling the CLI's source tree as `extraResources` inflated the installer
   to hundreds of MB and required a runtime (`bun` / `node`) on the user's
   machine.
2. Every IPC hop added latency; streaming tokens went Renderer → Preload →
   Main → Child stdin → CLI → stdout → Main → Renderer.
3. Errors surfaced as opaque `[-32000] unknown` codes because the CLI was a
   black box.
4. The desktop couldn't progress past whatever the CLI exposed over JSON-RPC,
   so skills, tools, and new flows required CLI edits we didn't control.

v0.2.6 removes the CLI dependency entirely. Every command, tool, skill,
LLM provider, wallet, and trading flow is re-implemented natively inside
the Electron main process or the renderer.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Renderer (React)                      │
│   — Sidebar, ChatView, WalletView, TradingPanel,         │
│     ViewsPanel (Preview/Diff/Terminal/Tasks/Plan)        │
└──────────────────────────┬───────────────────────────────┘
                           │ IPC (contextIsolation)
┌──────────────────────────┴───────────────────────────────┐
│                 Electron Preload (bridge)                │
│   — window.ibank.chat / auth / wallet / model / etc.     │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│                    Electron Main (Node)                  │
│  electron/native/                                        │
│    config.ts   — ~/.ibank/.ibank.json I/O                │
│    oauth.ts    — PKCE + loopback listener + token refresh│
│    auth.ts     — multi-provider status/login/logout      │
│    chat.ts     — streaming: Anthropic (w/ CC attribution)│
│                  OpenAI, xAI, Gemini, Ollama             │
│    model.ts    — model list + selection                  │
│    wallet.ts   — local keystore, balances, tx history    │
│    skills.ts   — bundled skills registry (Phase 2)       │
│    commands.ts — slash-command registry (Phase 2)        │
│    swarm.ts    — multi-agent orchestrator (Phase 3)      │
└──────────────────────────────────────────────────────────┘
                           │ fetch()
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Anthropic     OpenAI/xAI    Gemini/Ollama
```

No child process. No bundled CLI. Pure Node + fetch + Electron.

---

## Phase 1 — Core foundation (this milestone)

- [x] ROADMAP
- [x] `electron/native/config.ts` — `~/.ibank/.ibank.json` I/O, dot-path
      get/set, atomic writes, `0o700`/`0o600` perms.
- [x] `electron/native/oauth.ts` — Claude OAuth 2.0 + PKCE:
      - `CLIENT_ID`, authorize/token URLs, all scopes
      - `OAuthService` with local `http.Server` loopback listener
      - `startOAuthFlow()` returns `{ manualUrl, automaticUrl }`
      - `handleManualAuthCodeInput({ code })`
      - `refreshOAuthToken()` + `getValidAnthropicOAuthToken()`
- [x] `electron/native/auth.ts` — multi-provider `authStatus`, `authLogin`,
      `authLogout` (Anthropic, OpenAI, xAI, Gemini, Ollama, OpeniBank).
- [x] `electron/native/model.ts` — `modelList`, `modelSet`,
      `inferProviderFromModel`, `defaultModelFor`.
- [x] `electron/native/chat.ts` — streaming dispatch:
      - `streamAnthropic` with the **Claude Code attribution stack**:
        - `x-app: cli`
        - `user-agent: claude-cli/VERSION (external, cli)`
        - `x-anthropic-billing-header: cc_version=...; cc_entrypoint=cli;`
        - System-prompt prefix `"You are Claude Code, Anthropic's official CLI for Claude."`
        - `anthropic-beta: oauth-2025-04-20`
      - `streamOpenAIStyle` (OpenAI / xAI Grok)
      - `streamGemini`
      - `streamOllama` (newline-delimited JSON, not SSE)
      - Abort support, token refresh on 401, helpful 429 message.
- [x] `electron/native/wallet.ts` — stub returning "not-yet-migrated"
      (full implementation in Phase 2).
- [x] `electron/main.ts` — rewritten: no `IBankCLIBridge` spawn, every IPC
      handler invokes native modules directly; `preload.ts` IPC surface
      unchanged so the React renderer continues to work.
- [x] Keeps v0.2.5 wire-compatibility: `cli:*` IPC channels, `chat:*`,
      `auth:*`, `model:*`, `wallet:*`, `cli:notify` stream fan-out.

## Phase 2 — Skills, commands, swarm (next)

- [ ] Port CLI's slash-command registry (`/wallet`, `/trade`, `/login`,
      `/model`, `/compact`, `/plan`, `/help`, …) into
      `electron/native/commands.ts`.
- [ ] Port bundled skills system from `ibank-v0.2.5/src/skills/` into
      `electron/native/skills/` (35 skills: market-analyst, tax-reporter,
      portfolio-rebalancer, …).
- [ ] Port `ibankCoreBridge` / swarm orchestrator
      (`services/swarm`) so the 9-role agent architecture runs locally.
- [ ] Port `tools/` tree — file-edit, bash, search, web-fetch —
      with proper permission gating (ask / accept_edits / plan / bypass).
- [ ] Port wallet service: HD keystore, multi-chain balance queries,
      transaction history, policy limits, device-key encryption.

## Phase 3 — UI overhaul to match Claude Code

- [ ] **Sidebar** — Claude Code-style collapse toggle + rail.
- [ ] **ChatView** — one-line small corner-rounded pill input; LLM
      response renders directly to canvas with content-sensitive typography;
      code blocks styled like Claude Code (monospace, syntax highlighting,
      copy button, language chips).
- [ ] **ChatTitleBar** — right-side "Views" toggle button.
- [ ] **ViewsPanel** (new) — right-hand sidebar hosting advanced views:
      Preview (live HTML/Markdown), Diff (file changes in-flight),
      Terminal (sandboxed shell), Tasks (multi-step plan progress),
      Plan (plan-mode output).
- [ ] **MessageBubble** — canvas-style rendering, streaming thinking blocks,
      tool-use cards, plan cards, sub-agent cards.

## Phase 4 — Market dominance

- [ ] Local inference fallback (Ollama) for privacy-sensitive flows.
- [ ] Trading engine: live market feed, orderbook UI, execute/simulate.
- [ ] Portfolio analytics: P&L, tax lots, cost basis, on-chain activity.
- [ ] Cross-device sync via encrypted blob (user-held key).
- [ ] Plug-in marketplace for 3rd-party skills.
- [ ] Mobile (iOS/Android) via React Native port of the same renderer.

---

## File layout (end of Phase 1)

```
electron/
  main.ts            — app lifecycle, BrowserWindow, IPC registration
  preload.ts         — contextBridge API surface (unchanged)
  native/
    config.ts        — ~/.ibank/.ibank.json
    oauth.ts         — Claude OAuth 2.0 + PKCE
    auth.ts          — multi-provider credentials
    chat.ts          — streaming LLM dispatch
    model.ts         — model list/select
    wallet.ts        — stub (Phase 2)
    version.ts       — CLI-attribution version string
  tsconfig.json
src/                 — React renderer (unchanged in Phase 1)
```

## Migration guarantees

1. **Zero renderer changes in Phase 1** — `preload.ts` exposes the same
   `window.ibank.*` surface. The React app cannot tell the main process
   stopped spawning a CLI.
2. **Wire compatibility** — every IPC channel the v0.2.5 renderer used
   still exists in v0.2.6, with identical request/response shapes.
3. **Config compatibility** — reads and writes the same
   `~/.ibank/.ibank.json` file as the CLI, so users transitioning from
   v0.2.5 keep their OAuth tokens, API keys, and preferences.
4. **OAuth compatibility** — same Claude Code `CLIENT_ID`, same scopes,
   same `cc_version` / `cc_entrypoint=cli` attribution — so existing
   Claude Pro/Max tokens continue to work, and new tokens land in the
   same subscription quota pool the CLI used.

---

Last updated: 2026-04-16
