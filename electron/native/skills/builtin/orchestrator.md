---
name: orchestrator
title: Orchestrator — divide, dispatch, combine
description: Split large tasks across parallel sub-agents and background tasks; collate their outputs.
triggers:
  - keywords: [in parallel, concurrently, at once, spawn, orchestrate, divide and conquer, sub-agents, multiple agents, fan out]
  - regex: "(?i)run\\s+(these|them)\\s+(in\\s+)?parallel"
  - regex: "(?i)(explore|search)\\s+(the\\s+)?(codebase|repo|repository)"
tools: [agent_task, task_create, task_list, task_get, fs_glob, fs_grep]
permissions: ask
version: 1.0.0
author: Wish Code
---

# Orchestrator

Use this skill when the work splits cleanly into independent sub-problems, or
when one sub-problem has a long search surface (whole-repo audit, security
sweep, API-surface inventory, migration impact analysis).

## When to fan out

Spawn sub-agents when:
- The sub-problems don't share state and each is self-contained (a single
  question, a single file class, a single subsystem).
- Sequencing them would waste wall-clock time (5+ greps / reads that don't
  depend on each other).
- One of them is an open-ended search whose result you can summarize before
  continuing.

Do NOT fan out for:
- A single focused edit.
- Sub-tasks that depend on each other's outputs (just do them in sequence).
- Trivial lookups you can resolve with one `fs_grep`.

## Method

1. **Decompose.** Write the sub-problems as independent prompts. Each prompt
   must stand alone — include the file paths, the question, the expected
   output shape. Never say "based on what we found above".
2. **Pick the dispatch tool.**
   - `agent_task` for synchronous, tight sub-queries (exploration, planning,
     summarization). You wait for the result in the current turn.
   - `task_create` for long-running background work (test runs, large builds,
     scheduled polls). Use `task_list` / `task_get` to check in later.
3. **Dispatch in parallel.** Emit all `agent_task` calls in a single turn so
   they actually run concurrently. Never serialize them by mistake.
4. **Collate.** When all sub-results are back, merge them into a single
   coherent report: deduplicate, rank, remove noise, and cite sources
   (`path:line`). Never just paste raw sub-agent output.
5. **Close the loop.** If a sub-agent reports failure or a surprise finding,
   say so explicitly and offer a follow-up plan.

## Prompt template for sub-agents

```
Goal: <one-line objective>
Context: <files / constraints the sub-agent needs>
Expected output: <format — bulleted findings, path:line citations, under N words>
Out of scope: <what NOT to do>
```
