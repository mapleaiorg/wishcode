# OpeniBank Educator — Developer Guide

The Educator is the learning product that ships inside OpeniBank Desk starting with `v0.4.0`. It is a Duolingo-style blockchain and crypto literacy module: short lessons, interactive drills, spaced review, an AI tutor (Sage), and progress/badges — all delivered inside the existing desktop shell.

For the phased plan and scope see [`../PLAN_V0.4.0_EDUCATOR.md`](../PLAN_V0.4.0_EDUCATOR.md).

## File Layout

```
src/features/educator/
├── types.ts                      World, Level, Lesson, Exercise, Badge, Progress types
├── content/
│   ├── worlds.ts                 Authored curriculum (Worlds 1–9, all shipped)
│   └── scenarios.ts              Practice drills (phishing / approval / network / …)
├── state/
│   └── progress.ts               localStorage-backed XP, streak, mastery, review queue
├── sound.ts                      Web Audio cue engine (correct / wrong / xp / badge / tap)
├── components/
│   ├── Character.tsx             Sage fintech-owl mascot (SVG + framer-motion)
│   ├── LessonPlayer.tsx          Hook → Explain → Exercise → Takeaway → XP
│   ├── LevelMap.tsx              Duolingo-style path with locked/unlocked states
│   ├── ScenarioPlayer.tsx        Single-drill player for PracticeTab
│   ├── WalletSimulator.tsx       Fake-chain rehearsal (send/approve/network drills)
│   ├── LearnGate.tsx             "Learn before you use" nudge for wallet surfaces
│   ├── CertificatePreview.tsx    Completion certificate + print / HTML download
│   └── BadgeWall.tsx             Earned/unearned badge grid
├── tabs/
│   ├── LearnTab.tsx
│   ├── PracticeTab.tsx           Drills ↔ simulator mode switcher
│   ├── ReviewTab.tsx
│   ├── TutorTab.tsx
│   └── ProgressTab.tsx           Stats, mastery table, certificate, settings
└── EducatorView.tsx              Tabbed shell (used by App.tsx when view === 'educator')
```

Styles live under the `.edu-*` prefix inside [`../src/styles/global.css`](../src/styles/global.css). Nothing collides with the existing `.ibn-*` app shell.

## Compliance Boundary (Non-Negotiable)

1. **Non-advice.** The tutor explains, illustrates, and quizzes. It never recommends tokens, allocations, or timing. See `EDUCATOR_SYSTEM_PROMPT` in `tabs/TutorTab.tsx`.
2. **Authored takeaways.** Every `Lesson.safetyTakeaway` is hand-written. Nothing in this module generates safety rules at runtime.
3. **Visible disclaimer.** `NON_ADVICE_LONG` is rendered above the tutor transcript at all times.
4. **No monetary primitives.** The Educator does not talk to `window.ibank.wallet.*`, `trading.*`, `swap.*`, or portfolio state. Scenarios are authored — they don't simulate real positions.

If you add a new lesson or scenario, **do not** remove these boundaries.

## Curriculum Authoring

A lesson is a plain TypeScript value:

```ts
{
  id: 'wN-slug.lM.lessonK',
  title: 'Short human title',
  hook: 'One sentence that hooks the learner.',
  explain: [
    'Paragraph 1 (2–4 sentences).',
    'Paragraph 2.',
  ],
  exercises: [
    { kind: 'mcq',   id: '…', prompt: '…', choices: [...] },
    { kind: 'tf',    id: '…', prompt: '…', answer: true },
    { kind: 'order', id: '…', prompt: '…', steps: ['correct', 'order'] },
    { kind: 'scenario', id: '…', prompt: '…', context: '…', choices: [...],
      correctChoiceId: '…' },
  ],
  safetyTakeaway: 'Authored one-line rule.',
  reviewTags: ['custody', 'phishing'],
  xp: 15,
}
```

Rules of thumb:

- Keep a lesson completable in **2–4 minutes** (one hook + 2–4 explain paragraphs + 1–2 exercises).
- Write takeaways as **operational rules** (“never share your seed phrase”), not platitudes.
- Every scenario choice gets an `outcome` of `safe | risky | catastrophic`. Pick them honestly — the UI colors them and the user will remember the framing.
- Use `reviewTags` so future spaced-review enhancements can bucket missed items by concept.

## State Model

Progress is persisted in `localStorage` under `ibn.v1.edu.progress`:

- `xp: number` — full value awarded on first completion, ~1/3 on re-plays
- `streakDays`, `streakLastDay` — local `YYYY-MM-DD` comparison, resets if a day is skipped
- `lessons[lessonId]` — `firstCompletedAt`, `lastCompletedAt`, `timesCompleted`, `mastery`, `missedExerciseIds`
- `earnedBadges` — recomputed after every `completeLesson(...)` by running each `Badge.earned(progress)` predicate
- `completedScenarios[id]` — counter, feeds Practice-tab badges and XP

Mastery ladder:

```
not-started → introduced → practicing → competent → mastered
```

Transitions happen in `state/progress.ts`:

- `markLessonIntroduced(id)` — first hook view
- `markLessonAttempted(id, missedIds)` — any exercise submitted
- `completeLesson({ lessonId, xp, missedIds })` — full lesson finish, updates XP, streak, mastery, badges
- `bumpScenario(id)` — scenario drill completion

## AI Tutor (`TutorTab`)

The tutor reuses the existing chat surface:

- `window.ibank.chat.send(sessionId, requestId, text)` with `sessionId = 'edu-tutor'` so it never pollutes the main Chat view
- On the first user turn per session, the message is prefixed with `EDUCATOR_SYSTEM_PROMPT`
- Delta streaming via `onDelta` / `onDone` / `onError`
- No tool-use hooks wired — the tutor is conversation-only

## Character (Sage)

`components/Character.tsx` is a state-driven SVG mascot — a **fintech owl** with a hex coin chest badge (the "i" monogram for iBank), red bowtie, graduation cap, and back wings that flap on correct/celebrate. Body gradient uses `var(--accent)` → `var(--accent-hi)` so the mascot inherits the theme. States: `idle | explain | correct | warn | celebrate`. Framer-motion drives body bounce, head tilt on explain, wing flap on correct/celebrate, sparkle burst on celebrate, blink loop on idle. The public API (`<Character state={…} size={…} label={…} />`) is intentionally minimal so the SVG implementation can be swapped for a Rive state machine later without changing callers.

## Wallet simulator (`components/WalletSimulator.tsx`)

A renderer-only, fake-chain rehearsal surface that lets the user step through the exact decision moments wallet UIs throw at them — without touching any real money primitive.

- **Drills:** `sim-send-wrong-network` (USDC on wrong chain), `sim-approve-unlimited` (approval scope), `sim-network-switch-impersonation` (chain-id vs. name).
- **Phases:** `idle → review → decide → outcome`. Each drill exposes a labelled `review` block (`label / value / flag: ok | warn | err`), a set of `choices`, and a picked-choice `outcome` of `safe | risky | catastrophic`.
- **State integration:** on `safe` outcomes, calls `bumpScenario(drill.id)` so the Progress tab and badges credit the rehearsal.
- **Sound:** calls `playCorrect / playWrong / playXp` from `sound.ts`.
- Does not import any wallet / trading / portfolio code. The drills are authored.

## Learn-before-use gate (`components/LearnGate.tsx`)

Phase 3 "nudge, not block" used by wallet surfaces (Swap, Send, Approve, network switch, seed export, bridge). Shows the authored micro-lesson chip and two buttons: **Learn first** and **Proceed**. Never hard-blocks — the compliance boundary says the gate may educate but must not stop legitimate wallet action.

```tsx
<LearnGate
  topic="approval"
  lessonId="w3-wallet-security.l5.lesson1"
  onOpenLesson={(id) => navigate(`/educator?lesson=${id}`)}
  onProceed={continueApproval}
/>
```

`topic` ∈ `'approval' | 'send' | 'network-switch' | 'seed-phrase' | 'swap' | 'bridge'`. Per-topic copy is authored in the `DEFAULTS` map inside `LearnGate.tsx` and can be overridden via `title` / `body` props. If the linked lesson is already completed the component renders the softer `.edu-gate-cleared` variant (green icon, "Refresh" eyebrow, "Proceed" instead of "Proceed anyway").

## Completion certificate (`components/CertificatePreview.tsx`)

Rendered in the Progress tab. While the learner hasn't cleared all nine worlds, shows a locked placeholder with `completed / totalLessons` and a gentle nudge. Once all lessons are cleared, renders the full certificate:

- Eyebrow + `Award` icon title
- Learner name (from the `ibn.v1.edu.learnerName` input in the Progress tab, falling back to *Self-Custody Learner*)
- Stats row (Lessons / Mastered / Badges / XP)
- Compliance footer — attests to *educational completion only*; explicitly not a financial licence, professional qualification, or investment advice
- **Print / Save PDF** via `window.print()` (paired with `@media print` rules that show only `#edu-cert-printable`)
- **Download HTML** via a `Blob` + synthetic anchor click — produces a self-contained HTML file, no dependency, safe in Electron

No new IPC surface is introduced. A signed-PDF credential remains a future enhancement.

## Sound

`sound.ts` uses the browser's `AudioContext` directly — no npm audio dependency. Cues: `playCorrect / playWrong / playXp / playBadge / playTap`. Mute preference persists under `ibn.v1.edu.muted` and is toggled from the Progress tab.

## Phased Rollout

| Phase | Scope | Status |
|------:|-------|--------|
| **1** | Worlds 1–3 authored, 5 tabs, LessonPlayer, LevelMap, ScenarioPlayer, Sage mascot, AI tutor, Web Audio cues, renderer-only | **Shipped in v0.4.0** |
| **2** | `WalletSimulator` fake-chain drills (send / approve / network switch), Worlds 4–6 (Transactions, Token Literacy, Risk Control), fintech-owl Sage redesign | **Shipped in v0.4.0** |
| **3** | Worlds 7–9 (DeFi Safety, Advanced Ops, OpeniBank Mastery), `LearnGate` "learn before use" nudge, `CertificatePreview` completion credential with `window.print` + HTML download | **Shipped in v0.4.0** |
| Future | Rive state-machine character, Howler audio pack, account-linked progress sync via a new `edu.*` IPC surface, signed-PDF certificate, enterprise / classroom mode | Deferred |

## Common Tasks

### Add a new lesson to an existing level

Open `content/worlds.ts`, find the level, append a lesson object. IDs must follow `${levelId}.lessonN`. That's it — the LevelMap and LearnTab pick it up automatically.

### Add a new practice drill

Append to `SCENARIOS` in `content/scenarios.ts`. Use one of the existing `ScenarioTopic` values or extend the union in `types.ts`.

### Add a new badge

Append to `BADGES` in `content/worlds.ts` with an `earned(progress)` predicate. Also extend the `BadgeId` union in `types.ts`. Badges are recomputed on every `completeLesson` and `bumpScenario` call — no migration needed.

### Reset progress locally

Progress tab → Settings → **Reset** (clears `ibn.v1.edu.progress` and `ibn.v1.edu.tutor.turns`). Useful while iterating on content.

## Validation

After touching anything under `src/features/educator/` run:

```bash
npm run typecheck
```

The module is renderer-only, so a full Electron build is not required for content-only changes — but the standard pre-push checklist still applies.
