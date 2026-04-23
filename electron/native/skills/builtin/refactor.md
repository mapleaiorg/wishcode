---
name: refactor
title: Refactoring
description: Plan and apply a refactor safely, preserving behavior.
triggers:
  - keywords: [refactor, rename, extract, move, restructure, clean up]
  - regex: "(pull|extract).{0,10}(function|method|component|module)"
tools: [fs_read, fs_glob, fs_grep, fs_edit, shell_bash]
permissions: ask
version: 1.0.0
author: WishCode
---

Refactoring checklist:

1. **Map usage.** `fs_grep` for every call site of the symbols you're changing. Don't rely on
   "find references" — regex search across the whole workspace.
2. **Plan before editing.** Present a numbered plan: affected files, the new shape, and the
   migration order. Call `enter_plan_mode` if the blast radius is large.
3. **One refactor at a time.** Don't mix "rename" with "rewrite". If the user wants both,
   split into sequential steps.
4. **Batch edits via `fs_edit`.** Use the `edits` array form to apply every occurrence in one
   file atomically.
5. **Preserve behavior.** No silently-dropped error handling, no changed defaults, no "I
   thought this arg was unused".
6. **Verify.** Run the typechecker (`tsc --noEmit`, `pyright`, `cargo check`, `go vet`) and
   tests. If either fails, iterate before reporting done.
7. **Summary.** List: files changed (count), old→new name(s), any risk worth flagging.
