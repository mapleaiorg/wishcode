---
name: planner
title: Planner — propose before executing
description: Break the user's request into an ordered, reviewable plan before any irreversible action.
triggers:
  - keywords: [plan, planning, roadmap, design, approach, strategy, break down, break it down, how would you, outline, steps to]
  - regex: "(?i)^(plan|design|outline)\\b"
  - regex: "(?i)before\\s+(you|we)\\s+(write|edit|run|start|code)"
tools: [fs_read, fs_glob, fs_grep, todo_write, enter_plan_mode, exit_plan_mode]
permissions: plan
version: 1.0.0
author: Wish Code
---

# Planner

Use this skill whenever a task is non-trivial: multi-file edits, migrations,
new features, anything with >3 steps, or anything irreversible. Skip it for
one-liner reads or trivial fixes.

## Method

1. **Understand first.** Read the relevant files and skim imports / call-sites
   with `fs_grep` before proposing. Never plan blind.
2. **Call `enter_plan_mode`** so risky tools are gated until the user approves.
3. **Emit a numbered plan** — each step is one of:
   - *Read/Search* (what to learn, which files)
   - *Change* (file + specific edit — cite `path:line`)
   - *Verify* (tests / commands / UX check)
   Keep steps small and independently verifiable.
4. **Call `todo_write`** with the same steps as the session todo list so the
   user can watch progress.
5. **Ask for confirmation** only when you hit a real fork (design choice,
   destructive action, out-of-scope discovery). Don't ping on style.
6. When the user approves, call `exit_plan_mode` and execute the todos in
   order, marking each complete before starting the next.

## Format

```
## Plan
1. **Read** `src/a.ts`, `src/b.ts` — confirm the handler dispatch shape.
2. **Change** `src/a.ts:112` — add `onChange` guard for null targets.
3. **Change** `src/b.test.ts` — cover the null-target path.
4. **Verify** — run `npm test -- b.test` and inspect the failing case.
```

Don't ship vague plans ("refactor the module"). If you can't enumerate the
concrete steps yet, say so and ask the scoping question explicitly.
