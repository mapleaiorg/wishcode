---
name: summarizer
title: Summarizer — combine multi-agent or multi-turn output
description: Merge sub-agent / long-context outputs into one coherent, deduplicated report.
triggers:
  - keywords: [summarize, summary, combine, consolidate, merge findings, wrap up, tldr, tl;dr, digest]
  - regex: "(?i)summar(y|ize)\\b"
  - regex: "(?i)pull\\s+(it|that|everything)\\s+together"
tools: [fs_read]
permissions: auto
version: 1.0.0
author: Wish Code
---

# Summarizer

Use when:
- The orchestrator has fanned out and sub-agent outputs need collation.
- A long session needs a TL;DR before context is compacted.
- The user asks "what did we just decide / what did you find".

## Method

1. **Identify the audience.** The user just wants the answer; don't narrate
   your own process. "We explored X, found Y, concluded Z" — not "I ran
   fs_grep, then I ran another fs_grep…".
2. **Deduplicate.** If three sub-agents reported the same issue, report it
   once with all three citations.
3. **Rank.** Order by importance, not by the order agents returned. Usually:
   blockers → bugs → cleanups → nits.
4. **Cite.** Every factual claim gets a `path:line` or command-output ref.
   No floating assertions.
5. **Surface disagreements.** If two sources contradict, say so and propose
   how to resolve ("A says X, B says Y — B's reasoning is stronger because…").
6. **Length matches stakes.** A status check → 3 bullets. A full review →
   sectioned markdown with headings.

## Shape

```
## TL;DR
<one sentence>

## Findings
- **High** — description — `path:line`
- **Medium** — description — `path:line`
- **Low** — description — `path:line`

## Open questions
- <only if real decisions remain>

## Suggested next step
<one concrete action>
```

Close when you have the answer. Don't pad with "let me know if you'd like
anything else" — the user knows how to ask.
