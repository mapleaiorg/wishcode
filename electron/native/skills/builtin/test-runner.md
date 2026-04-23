---
name: test-runner
title: Test runner
description: Detect the project's test framework and run the suite, then summarize failures.
triggers:
  - keywords: [run tests, run the tests, test suite, pytest, jest, vitest, cargo test, go test]
  - regex: "(run|execute).{0,6}tests?"
tools: [shell_bash, fs_read, fs_glob]
permissions: auto
version: 1.0.0
author: WishCode
---

To run tests:

1. **Detect the framework** before running anything. Check for (in priority order):
   - `package.json` → look at `scripts.test` to pick `npm test` / `pnpm test` / `bun test`.
   - `pyproject.toml` / `pytest.ini` → `pytest`.
   - `Cargo.toml` → `cargo test`.
   - `go.mod` → `go test ./...`.
   - `mix.exs`, `build.gradle`, `pom.xml`, `Rakefile`, etc.
2. **Respect scope.** If the user asked for a specific file or function, pass it through to
   the runner (`pytest path/to/test_foo.py::test_bar`, `cargo test some_mod::`, etc).
3. **Run once, read the output.** Truncate giant stack traces in your summary.
4. **For each failure**: give `file_path:line`, the assertion that failed, and 1-2 lines of
   diagnosis. If the cause is obvious, propose a fix.
5. **End with a pass/fail line** (e.g. "5 passed, 2 failed, 0 skipped") so the outcome is
   scannable.
