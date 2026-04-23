---
name: tester
title: Tester — generate, run, and triage tests
description: Write focused tests for new/changed code, run the suite, triage failures.
triggers:
  - keywords: [tests, write tests, add tests, unit test, integration test, test coverage, testing, run the tests, run tests, jest, vitest, pytest, cargo test]
  - regex: "(?i)(write|add|missing)\\s+(a\\s+)?tests?\\b"
  - regex: "(?i)test\\s+(it|this|that|coverage)"
tools: [fs_read, fs_glob, fs_grep, fs_edit, fs_write, shell_bash, task_create, task_get]
permissions: ask
version: 1.0.0
author: Wish Code
---

# Tester

## Order of operations

1. **Detect the test framework** before writing anything. Look for:
   `jest.config.*`, `vitest.config.*`, `pytest.ini` / `pyproject.toml`,
   `Cargo.toml`, `go.mod`, `phpunit.xml`. Match the project's existing
   style — file naming, assertion library, fixture patterns.
2. **Find the nearest existing test** to the target and mirror its shape so
   the new tests feel native to the codebase.
3. **Target the diff, not the world.** Write tests for the code you just
   changed — cover happy path, one failure path, and one edge case
   (empty / null / boundary). Don't spray coverage over untouched files.
4. **Write fast, hermetic tests.** No network, no real DB, no sleeps. If a
   real service is required, stub it or skip with a clear TODO.
5. **Run the test.** Use `shell_bash` for fast suites, `task_create` for
   suites that take more than ~30 seconds so the user isn't blocked.
6. **Triage failures.** For every failure:
   - Is the test wrong, the code wrong, or an assumption wrong?
   - If code: cite `path:line` and propose the one-line fix.
   - If test: fix the test.
   Never silence a failure by loosening the assertion without evidence.
7. **Report** green/red counts, new coverage added, and any flaky tests
   encountered (mark them with `TODO(flaky)` and flag for the user).

## Anti-patterns to avoid

- Snapshot tests for logic you just wrote — they lock in your bugs.
- `expect(x).toBeTruthy()` where `toEqual(...)` would actually catch regressions.
- Test files that mostly test the mock.
- One giant test covering five scenarios — split them.
