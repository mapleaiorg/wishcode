---
name: code-review
title: Code review
description: Review code for bugs, clarity, security issues, and missing edge cases.
triggers:
  - keywords: [review, code review, audit, lgtm, pr review]
  - regex: "(can you|please) review"
tools: [fs_read, fs_glob, fs_grep, shell_bash]
permissions: auto
version: 1.0.0
author: WishCode
---

When reviewing code:

1. **Scope first.** Ask what the user wants reviewed — a single file, a directory, a diff,
   or the whole branch. Run `shell_bash` with `git status` / `git diff --stat` if the scope
   is "my changes". Use `fs_glob` to find the recently-touched files otherwise.
2. **Read before judging.** Always `fs_read` the files you're going to comment on; don't
   guess from names.
3. **Find real bugs** before style. Look for: off-by-one, null/undefined, unhandled errors,
   resource leaks, incorrect concurrency, SQL injection / XSS / SSRF, unvalidated input,
   hard-coded secrets.
4. **Clarity** second: unclear names, long functions, duplicated logic, dead branches.
5. **Each finding is (severity, `path:line`, problem, fix)**. Keep the problem description
   short and specific — no filler, no "great job overall".
6. **Close with a prioritized fix list** — high severity first. If nothing is wrong, say so.
