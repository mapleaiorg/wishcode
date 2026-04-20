# Changelog

All notable changes to OpeniBank Desk are recorded here. Dates are in UTC. This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not yet follow strict semver — versions match the `package.json` `version` field.

## [0.4.0] — OpeniBank Educator

### Added
- **OpeniBank Educator** — Duolingo-style blockchain and crypto education module, sidebar entry with a graduation-cap icon. See [`docs/EDUCATOR.md`](./docs/EDUCATOR.md) and [`PLAN_V0.4.0_EDUCATOR.md`](./PLAN_V0.4.0_EDUCATOR.md).
  - **Full nine-world curriculum** authored in-app — Worlds 1–9 shipped:
    1. *Digital Money Basics*
    2. *Wallet Basics*
    3. *Wallet Security*
    4. *Transactions & Networks* (mempool lifecycle, gas & stuck tx, USDC network-mismatch)
    5. *Token Literacy* (ETH vs ERC-20, stablecoin backing, fake-token / contract-address hygiene)
    6. *Risk Control* (irreversibility, hot/cold compartments, urgency-as-adversary)
    7. *DeFi Safety* (AMM & slippage, "audited ≠ safe", rug-pull pattern recognition)
    8. *Advanced Wallet Operations* (hardware-wallet isolation, recovery drills, personal security policy)
    9. *OpeniBank Mastery* (safe-by-default tour, useful alerts, CSV export hygiene)
  - Five tabs: **Learn · Practice · Review · Tutor · Progress**.
  - `LessonPlayer` flow: Hook → Explain → Exercise → Safety Takeaway → XP, animated with Framer Motion.
  - `LevelMap` Duolingo-style vertical path with locked/unlocked states and per-lesson mastery rings.
  - `ScenarioPlayer` for wallet-safety drills (phishing, approval, network mismatch, seed backup, fake airdrop).
  - `WalletSimulator` — fake-chain rehearsal surface in the Practice tab with three decision drills (send-on-wrong-network, unlimited-approval, network-switch-impersonation). Tone-coded log, outcome panel, `bumpScenario` on safe outcomes.
  - `LearnGate` — non-blocking "learn before use" nudge (topics: `approval`, `send`, `network-switch`, `seed-phrase`, `swap`, `bridge`). Surfaces the authored lesson; distinguishes an `alreadyCompleted` refresh state; always offers **Proceed**, never blocks.
  - `CertificatePreview` — Phase 3 local completion certificate. Locked placeholder until all nine worlds clear, then renders name + stats + `window.print()` and a self-contained HTML download. Compliance-safe: attests to *completion*, never to suitability or advice.
  - Spaced-review queue fed by missed exercises.
  - AI Tutor (**Sage**) routed through the existing `window.ibank.chat.*` surface with a scoped `edu-tutor` session and an educator framing prompt. Persistent non-advice disclaimer above the transcript.
  - **Sage fintech-owl mascot** — SVG + framer-motion redesign replacing the blob: rounded-square head, ear tufts, pear-shaped torso, back wings with a flap animation, hex coin chest badge with an "i" monogram, red bowtie, graduation cap with tassel. Theme-aware (`var(--accent)` / `var(--edu-gold)`). Preserves the `idle / explain / correct / warn / celebrate` public API.
  - Web Audio cue engine (`correct / wrong / xp / badge / tap`) — zero new npm deps.
  - XP, streak, badges, mastery table, certificate section (with `ibn.v1.edu.learnerName` input), and a reset control in the Progress tab.
  - Two new badges: **Gas Explorer** (W4 complete) and **DeFi Cautious Explorer** (W7 complete); `ibank-wallet-ready` now requires all nine worlds.
  - Desktop-fit responsive CSS: widens to 1360 px on large monitors, collapses mascot column below 900 px, straightens the zig-zag level trail below 780 px.
- `docs/EDUCATOR.md` — developer-facing guide for the Educator module (authoring, state, compliance, rollout).
- `CHANGELOG.md` — this file.

### Changed (in-module)
- `LearnTab` active-lesson wrapper switched from `edu-tab edu-learn-tab` (a 280 px / 1 fr grid) to `edu-tab edu-lesson-wrap` (block, max-width 1280 px) so the lesson player no longer renders in a narrow column. Review tab aligned to the same wrapper for layout parity.
- `PracticeTab` now has a **drills / simulator** mode switcher and embeds `WalletSimulator` under the simulator tab; removed the Phase-2 placeholder card.
- `ProgressTab` now includes the certificate section with a name input persisted to `ibn.v1.edu.learnerName`.

### Changed
- `README.md` rewritten: bumped to `v0.4.0`, fixed stale absolute filesystem links, added the Educator to the feature list and repo layout, pointed the pre-push checklist at `typecheck` / `build` / `build:electron`.
- `docs/REPOSITORY_HOUSEKEEPING.md` updated to match the retired GitHub Actions workflow and current pre-push gate.
- `docs/GETTING_STARTED.md` — removed the retired `housekeeping:check` step and added an Educator section.
- `.gitignore` — added `.claude/`, `.cursor/`, `.history/`, vim swap files, macOS resource forks (`._*`), npm pack artifacts (`*.tgz`).

### Removed
- `.github/workflows/housekeeping.yml` and `scripts/check-housekeeping.mjs` were retired. The pre-push gate is now the three `npm run ...` commands documented in the README.

### Compliance
- No new native IPC surface introduced. The Educator is renderer-only and stores all progress in `localStorage` under the `ibn.v1.edu.*` namespace.
- All lesson safety takeaways are authored, never AI-generated.
- Tutor prompt explicitly forbids buy/sell/allocation recommendations.

## [0.3.1] and earlier

See [`PLAN_V0.3.1.md`](./PLAN_V0.3.1.md), [`DESIGN.md`](./DESIGN.md), and [`ROADMAP.md`](./ROADMAP.md) for the pre-`v0.4.0` history. A structured changelog starts with this release.
