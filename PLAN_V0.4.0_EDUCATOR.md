# OpeniBank Educator — v0.4.0 Implementation Plan

Design source: `/Users/wenyan/Project2026/ibank/OpeniBank Educator Design.docx`

This plan adds a **Duolingo-style AI-driven Blockchain & Crypto Education
platform** inside the existing OpeniBank desktop app. The product is
explicitly **educational, non-advisory**: it teaches wallet operation,
scam recognition, and crypto literacy — it never recommends tokens or
allocations.

---

## 1. North star

> **OpeniBank Educator = the onboarding and trust engine for the
> self-custody era.**

A user goes from zero knowledge to competent, safety-aware wallet operator
through short lessons, drills, a wallet simulator, and an AI tutor — all
inside the same OpeniBank desktop that already ships chat, wallet, and
portfolio intelligence.

## 2. Invariants

1. **Non-advice boundary.** The tutor explains, illustrates, and quizzes.
   It never recommends tokens, allocations, or timing.
2. **Local-first.** Curriculum, progress, streaks, XP, and mastery state
   all live on the user's machine. Cloud sync is a Phase 3 concern.
3. **Renderer-only in this PR.** No new Electron IPC is required. The
   Educator reuses the existing `window.ibank.chat.*` surface for the AI
   tutor, which keeps changes lean and testable today.
4. **Framer Motion for motion, Web Audio for sound.** Framer Motion is
   already in `package.json`. We use the browser's `AudioContext` for
   correct/wrong/badge cues — zero new npm deps required for MVP.
5. **SVG character, not Rive.** Phase 1 ships a framer-motion-animated
   SVG mascot ("Sage"). Rive can replace the mesh later without touching
   callers, because the character API is already state-driven.

## 3. Phased rollout

> **Status (v0.4.0 release):** Phases 1, 2, and 3 have all landed in the
> v0.4.0 shipping build. What's deferred to a future release is listed at
> the bottom of this section.

### Phase 1 — Educator MVP  ✅ shipped

- Worlds 1–3 fully authored (Digital Money Basics, Wallet Basics, Wallet
  Security) — 15 lessons total.
- `EducatorView` with 5 internal tabs: **Learn · Practice · Review · Tutor · Progress**.
- **Lesson player** with Hook → Explain → Exercise → Safety Takeaway →
  XP award, all animated with framer-motion.
- **Level map** (Duolingo path) with locked/unlocked states and mastery
  badges per lesson.
- **Wallet-safety scenario drills** (Practice tab): seed-phrase phishing,
  fake support request, approval spotter.
- **Spaced-review queue** (Review tab) fed by recently-missed questions.
- **AI Tutor chat** (Tutor tab) routed through `window.ibank.chat.send`
  with a scoped sessionId (`edu-tutor`) and an educator framing prompt.
- **Progress tab**: XP pill, daily streak, level ring, mastery table,
  badge wall.
- **Sage mascot**: SVG character with `idle / explain / correct / warn /
  celebrate` states, placed in the lesson player & tutor tab.
- **Non-advice disclaimer** on every surface that uses the AI tutor.
- Sidebar entry with `GraduationCap` icon.

### Phase 2 — Deep simulator + advanced worlds  ✅ shipped

- [x] **Wallet simulator** (`components/WalletSimulator.tsx`) — fake-chain
  decision drills for send-on-wrong-network, unlimited approval, and
  network-switch impersonation. Labelled review block, tone-coded log,
  `idle → review → decide → outcome` phases, `bumpScenario` credit on
  safe outcomes, `playCorrect/playWrong/playXp` cues.
- [x] **Worlds 4–6** authored: *Transactions & Networks*, *Token
  Literacy*, *Risk Control*.
- [x] **Fintech-owl Sage redesign** (SVG + framer-motion) replacing the
  blob — hex coin chest badge, bowtie, grad cap, wing flap, theme-aware
  gradient. Same `CharacterState` API.
- [x] **PracticeTab** drills/simulator mode switcher.
- [x] **Learn-tab layout fix** — active lesson wrapper switched to
  `edu-lesson-wrap` so the player no longer renders in the narrow 1 fr
  column.
- Deferred to a future release: `@rive-app/react-canvas` character
  swap, Howler.js themed audio pack, confetti springs on badge unlock.

### Phase 3 — OpeniBank wallet integration  ✅ shipped (in-app scope)

- [x] **Worlds 7–9** authored: *DeFi Safety*, *Advanced Wallet
  Operations*, *OpeniBank Mastery*.
- [x] **`LearnGate`** — non-blocking "learn before use" nudge with
  topic-specific copy for `approval / send / network-switch /
  seed-phrase / swap / bridge`. Always offers **Proceed**; renders a
  softer `.edu-gate-cleared` variant when the lesson is already
  completed.
- [x] **`CertificatePreview`** — local completion certificate
  (locked placeholder → full cert once all nine worlds clear), with
  `window.print()` (paired with `@media print` rules) and a
  self-contained HTML download via `Blob` + synthetic anchor click.
  Name persisted under `ibn.v1.edu.learnerName`.
- [x] **Two new badges**: `gas-explorer` (W4), `defi-cautious-explorer`
  (W7). `ibank-wallet-ready` predicate now requires all nine worlds.
- Deferred to a future release: account-linked progress sync via a new
  `edu.*` IPC surface, server-signed PDF credential, enterprise /
  classroom dashboards.

## 4. File plan (Phase 1)

```
src/features/educator/
├── types.ts                      # World, Level, Lesson, Exercise, Badge, Progress
├── content/
│   ├── worlds.ts                 # 3 worlds × 5 levels × ~3 lessons
│   └── scenarios.ts              # Phishing + approval + network drills
├── state/
│   └── progress.ts               # localStorage-backed XP / streak / mastery
├── sound.ts                      # Web Audio cue engine
├── components/
│   ├── Character.tsx             # Sage SVG mascot, state-driven
│   ├── LessonPlayer.tsx          # Hook → Explain → Exercise → Takeaway → XP
│   ├── LevelMap.tsx              # Duolingo-like vertical path
│   ├── ScenarioPlayer.tsx        # Practice scenarios
│   └── BadgeWall.tsx             # Progress badges
├── tabs/
│   ├── LearnTab.tsx
│   ├── PracticeTab.tsx
│   ├── ReviewTab.tsx
│   ├── TutorTab.tsx
│   └── ProgressTab.tsx
└── EducatorView.tsx              # Tabbed shell

src/App.tsx                       # +educator view
src/components/Sidebar.tsx        # +Educator entry
src/styles/global.css             # +educator styles
PLAN_V0.4.0_EDUCATOR.md           # (this file)
```

## 5. Curriculum matrix (shipped in v0.4.0)

| World | Title | Levels / themes |
|-------|-------|------------------|
| 1 | Digital Money Basics | Money & digital ownership · What is blockchain · Public/private keys · What is a wallet · Networks & tokens |
| 2 | Wallet Basics | Wallet types · Addresses & accounts · Sending & receiving · Seed phrase basics · Wallet setup |
| 3 | Wallet Security | Golden rules · Seed phrase safety · Scam recognition · Transaction verification · Approval safety |
| 4 | Transactions & Networks | Mempool lifecycle · Gas & stuck transactions · USDC cross-chain / network-mismatch |
| 5 | Token Literacy | ETH vs ERC-20 · Stablecoin backing · Fake tokens (contract address > ticker) |
| 6 | Risk Control | Irreversibility · Hot vs cold compartments · Urgency as an adversary's tool |
| 7 | DeFi Safety | AMMs & slippage · "Audited ≠ safe" · Rug-pull pattern recognition |
| 8 | Advanced Wallet Ops | Hardware-wallet isolation · Recovery drills · Personal security policy |
| 9 | OpeniBank Mastery | Safe-by-default tour · Useful alerts · CSV export hygiene |

Each lesson = 1 hook + 1 explanation + 1–2 exercises + 1 safety
takeaway + AI tutor follow-up.

## 6. Compliance guardrails (enforced in code)

- Every AI tutor request includes `EDUCATOR_SYSTEM_PROMPT` as framing,
  injected in the first user turn (no silent system overrides).
- Tutor tab renders `NON_ADVICE_LONG` disclaimer at the top.
- Lesson safety takeaways are authored, not AI-generated.
- No "suggested trade" / "recommended token" / "best time to buy" copy
  anywhere — reviewed during Phase 1 content pass.

## 7. Out of scope for v0.4.0

Still deferred after Phases 1–3 landed:

- Real on-chain interaction from Educator lessons.
- Cloud / account-linked progress sync.
- Rive state-machine character (Sage is SVG + framer-motion — owl redesign
  shipped).
- Howler.js audio pack (Web Audio beeps only).
- Enterprise / classroom dashboards.
- Native `edu.*` Electron IPC surface (localStorage remains fine at MVP
  scale; the in-app certificate needs no IPC).
- Server-signed PDF certificate (we ship local-print + self-contained HTML
  download instead).
