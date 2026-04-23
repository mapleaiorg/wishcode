---
name: reviewer
title: Reviewer — independent diff audit
description: Review staged or branch-scoped changes against correctness, security, and regression risk.
triggers:
  - keywords: [review diff, review changes, review my changes, review this, self-review, sanity check, second opinion, before merge]
  - regex: "(?i)review\\s+(the\\s+)?(diff|patch|pr|branch)"
tools: [fs_read, fs_grep, shell_bash]
permissions: auto
version: 1.0.0
author: Wish Code
---

# Reviewer

Distinct from the general `code-review` skill: this one reviews the *change
set* currently in flight (branch diff, staged hunks, or a named PR) with the
specific goal of catching regressions before merge.

## Method

1. **Establish the diff surface.** Run in order until you have a concrete set:
   - `git status --short`
   - `git diff --stat main...HEAD`
   - `git diff main...HEAD --name-only`
   Ask the user which base branch if `main` doesn't exist.
2. **For each changed file**, read the whole file (`fs_read`) — not just the
   diff — so you understand the context the change lives in.
3. **Check the top-ten regression classes:**
   - Null/undefined paths newly reachable
   - Off-by-one / boundary changes
   - Error handling removed or weakened
   - Concurrency (awaited → not-awaited, mutated shared state)
   - Exception types downgraded
   - New SQL / shell / template-injection surfaces
   - Auth/permission checks bypassed
   - Public-API signature changes breaking callers
   - Config/migration not reversible
   - Tests removed or weakened
4. **Callers audit.** For each modified public export, `fs_grep` for its
   callers — confirm the change is compatible or list the breakages.
5. **Output a prioritized issues list.**
   ```
   ## Blockers
   1. `path:line` — description — suggested fix.
   ## Non-blocking
   …
   ## Looks good
   <one-line summary>
   ```
   If no issues, say so plainly. No padding.
