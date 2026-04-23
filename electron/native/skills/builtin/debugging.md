---
name: debugging
title: Debugging
description: Reproduce a bug, narrow the root cause, and verify the fix.
triggers:
  - keywords: [debug, bug, crash, error, stack trace, traceback, not working, broken]
  - regex: "(why|what).{0,10}(not|isn't).{0,10}(working|running|starting)"
tools: [fs_read, fs_glob, fs_grep, shell_bash]
permissions: auto
version: 1.0.0
author: WishCode
---

Debugging loop:

1. **Reproduce.** Get the exact command, error, or broken input first. Don't guess.
2. **Read the actual code.** Follow the stack trace to each frame with `fs_read`; don't rely
   on the function name matching what it does.
3. **Bisect.** If the issue is recent, `shell_bash` `git log -p --since=...` the touched files,
   or `git bisect` if the bug is regression-style.
4. **Isolate.** Prefer a minimal repro over reading the whole codebase. Comment out or mock
   until the failure disappears, then re-enable one piece at a time.
5. **Hypothesis → test → revise.** State the current hypothesis in one sentence before making
   changes. After each change, re-run the repro.
6. **Fix, then verify twice.** Once with the repro, once with the full test suite.
7. **Summary.** Close with: root cause (one line), fix (one line), what tests cover it.
