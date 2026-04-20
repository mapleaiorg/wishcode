# iBank Desktop v0.4.0 — AI-native Self-custody Intelligence Wallet

> Source of truth: `/Users/wenyan/Project2026/ibank/AI-native self-custody
> intelligence wallet.docx`. This document is the upgrade plan anchored to
> the existing `ibank-desktop-v0.4.0` Electron + Vite repo.

---

## 1. North star

**iBank v1 = self-custodial crypto wallet + portfolio intelligence +
agentic research copilot, with strict non-advice boundaries.**

- User owns the keys.
- AI agent explains, summarizes, compares, prepares.
- AI agent never signs, never broadcasts, never recommends personalized
  allocations.
- All money movements show provider, route, fee, chain, slippage, and
  require explicit human approval before local signing.

---

## 2. Core invariants (written into architecture)

1. User owns the keys.
2. Private keys never leave local secure storage.
3. The AI agent never receives raw secret material.
4. The AI agent may summarize, compare, explain, prepare, and draft.
5. The AI agent may not sign or broadcast transactions.
6. Any money-moving action requires explicit user approval and local
   signing.
7. Research content is educational and general only.
8. Swap routing, provider, fees, and slippage must be disclosed before
   execution.

---

## 3. Baseline audit (as of 2026-04-19)

The repo is already substantial — here is what exists and what is missing.

### Already implemented (keep as-is)

- `electron/main.ts` — native Electron host, IPC registration, logger,
  event bus, OAuth listener.
- `electron/preload.ts` — typed `window.ibank.*` bridge (auth, chat,
  model, wallet, trading, skills, commands, tasks, swarm, memory,
  buddy, nft, cryptoBuddies, financialBuddies, harness).
- `electron/native/auth/*` — multi-provider auth, Claude OAuth + PKCE.
- `electron/native/llm/*` — streaming dispatch for Anthropic / OpenAI /
  xAI / Gemini / Ollama.
- `electron/native/wallet/*` — keystore (AES-GCM, passphrase-required),
  BIP-39 / BIP-44 derivation, chain registry, balance, history, policy,
  send (with preview), NFT registry.
- `electron/native/trading/market.ts` — Binance/CoinGecko dispatch,
  prices, OHLCV, live ticker.
- `electron/native/skills/*` — markdown skills registry with 14 bundled
  skills (market-analyst, tax-reporter, portfolio-rebalancer,
  whale-watcher, defi-scout, risk-stress, …).
- `electron/native/commands/*` — slash-command registry.
- `electron/native/tools/registry.ts`, `electron/native/memory/*`,
  `electron/native/harness/*`, `electron/native/swarm/*`,
  `electron/native/tasks/*`.
- `src/components/ChatView.tsx`, `WalletView.tsx`, `NftGallery.tsx`,
  `LoginView.tsx`, `SettingsView.tsx`, `ModelPicker.tsx`,
  `MessageRenderer.tsx`, `Buddy.tsx`, `Sidebar.tsx`.

### Missing vs the v1 spec

- **Home / Dashboard** — portfolio total, top holdings, alerts, activity,
  AI summary card. (Currently app opens on Chat.)
- **Portfolio view** — holdings table, allocation donut, concentration
  flags, chain exposure.
- **History view** — unified transaction list across chains, decoded
  detail, filters, export shortcuts.
- **Tokens view** — token information with chain, price, liquidity,
  volume, risk labels, educational explainer, official-source links.
- **Market view** — watchlists + live prices + OHLCV snapshot.
- **Alerts view** — local alert rules (price threshold, concentration,
  unusual movement).
- **Swap view** — quote input + route breakdown + **third-party provider
  disclosure** + unsigned-tx preview + explicit sign step.
- **Exports view** — CSV export for history with date-range + tax notice.
- **Address book view** — labelled contacts / recent counterparties.
- **Non-advice banner** — persistent disclaimer across AI-powered
  surfaces.
- **SigningReview** component — money-moving preview with provider /
  fee / chain / slippage disclosure used by Send and Swap.

---

## 4. Target screen map (v0.4.0)

Primary left-rail navigation, in order:

| # | View             | Purpose                                                        |
|---|------------------|----------------------------------------------------------------|
| 1 | **Home**         | Portfolio total + recent activity + alerts + AI summary        |
| 2 | **Chat**         | iBank Agent workspace (existing)                               |
| 3 | **Wallet**       | Create / import / receive / send (existing, extended)          |
| 4 | **Portfolio**    | Holdings + allocation + concentration                          |
| 5 | **History**      | Transactions + decode + filters                                |
| 6 | **Market**       | Watchlists + live prices + snapshots                           |
| 7 | **Tokens**       | Token information pages (non-advice)                           |
| 8 | **NFTs**         | Existing NFT gallery                                           |
| 9 | **Alerts**       | Local alert rules                                              |
|10 | **Swap**         | Quote + disclosed route + unsigned preview                     |
|11 | **Address Book** | Labels / contacts                                              |
|12 | **Exports**      | CSV range + tax-note                                           |
|13 | CryptoBuddies    | Existing                                                       |
|14 | FinancialBuddies | Existing                                                       |
|15 | Harness          | Existing                                                       |

---

## 5. Compliance-safe language rules

Use across all copy:

- Use: *research*, *education*, *token information*, *market
  intelligence*, *portfolio analytics*, *risk overview*, *transaction
  explanation*, *general comparison*.
- Avoid: *advice*, *best investment*, *recommended allocation*, *buy
  signal for you*, *personalized strategy*, *managed portfolio*.

Standard disclaimers shown on all AI / swap / tokens surfaces:

> Informational and educational use only. Not investment, legal, or tax
> advice. iBank is self-custodial — you hold the keys. Swap execution is
> routed through disclosed third-party providers. Blockchain transactions
> are irreversible.

---

## 6. File plan (what this PR adds)

### New shared libs
- `src/lib/disclosures.ts` — disclaimer text constants.
- `src/lib/localStore.ts` — localStorage-backed stores for watchlist,
  alerts, address-book, swap-provider preference. Namespaced under
  `ibn.v1.*`.

### New components
- `src/components/DisclaimerBanner.tsx` — non-advice banner shown on
  Chat, Tokens, Swap.
- `src/components/SigningReview.tsx` — money-moving preview card (fee /
  chain / route / provider / slippage + explicit "Sign & send" button).

### New feature views
- `src/features/home/HomeView.tsx` — portfolio total, top holdings,
  recent activity, alert digest, AI summary card.
- `src/features/portfolio/PortfolioView.tsx` — allocation table + bar
  chart + concentration indicator.
- `src/features/history/HistoryView.tsx` — transactions across chains,
  per-chain filter, address filter, CSV export shortcut, link to tx on
  explorer.
- `src/features/market/MarketView.tsx` — watchlist (local) + live prices
  + mini 24h change + add/remove symbols.
- `src/features/tokens/TokensView.tsx` — search symbol → profile card
  (price, 24h, volume, market cap, high/low) + risk disclosures + links.
- `src/features/alerts/AlertsView.tsx` — rule builder (price >, price <,
  concentration > %) + local rule list + evaluator.
- `src/features/swap/SwapView.tsx` — from/to selector, quote display,
  third-party provider disclosure, unsigned-tx preview, explicit sign.
- `src/features/exports/ExportsView.tsx` — date-range CSV export for
  transactions + jobs list.
- `src/features/addressBook/AddressBookView.tsx` — labelled contacts
  CRUD, shown inline in Send flow.

### Updates
- `src/App.tsx` — new `ViewKey` entries, default view = `home`.
- `src/components/Sidebar.tsx` — new nav entries with icons.
- `src/components/ChatView.tsx` — mount DisclaimerBanner at top.
- `src/components/WalletView.tsx` — add DisclaimerBanner on Send tab;
  replace inline send-confirm block with `SigningReview` component.
- `src/styles/global.css` — styles for v1 cards, pills, risk labels.

### Unchanged in this PR (out of scope for renderer-only upgrade)
- `electron/main.ts`, `electron/preload.ts` — no new IPC needed; all
  new views use existing bridge (wallet, trading, history).
- Native wallet, LLM, trading modules.

---

## 7. Implementation order

1. Docs — this plan committed.
2. `src/lib/disclosures.ts` + `src/lib/localStore.ts`.
3. `DisclaimerBanner` + `SigningReview` components.
4. `HomeView` (pulls wallet balances + trading prices + alerts from
   local store).
5. `PortfolioView`, `HistoryView`, `MarketView`, `TokensView`,
   `AlertsView`, `SwapView`, `ExportsView`, `AddressBookView`.
6. Wire into `Sidebar` + `App.tsx`.
7. Add styles.
8. `npm run typecheck`.

## 8. Out of scope (future PRs)

- Native swap router integration (1inch / Jupiter / Raydium). The
  current Swap view stops at quote + unsigned-tx disclosure; execution
  via routed provider requires a native service added later.
- Local inference sidecar (Ollama already wired via existing llm layer).
- Hardware wallet (Ledger / Trezor) integration.
- Plugin marketplace for user-installed skills.
- Mobile (Capacitor / RN) port.

---

Last updated: 2026-04-19.
