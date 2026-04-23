---
name: security-review
title: Security review
description: Audit code for common vulnerabilities before a change ships.
triggers:
  - keywords: [security review, security audit, vulnerability, vulnerabilities, secrets, cve]
  - regex: "(audit|check).{0,10}security"
tools: [fs_read, fs_glob, fs_grep, shell_bash]
permissions: auto
version: 1.0.0
author: WishCode
---

Run through this checklist against the changed files:

- **Secrets.** Any hard-coded token, password, private key, or API URL with embedded creds?
  Use `fs_grep` for `AKIA`, `ghp_`, `-----BEGIN`, `api_key =`, `password =`.
- **Injection.** Unsafe SQL (string-concatenated queries), shell (unquoted `${}` in bash,
  `os.system` with user input), template (unsanitized HTML in JSX `dangerouslySetInnerHTML`),
  XXE, path traversal (`../` in user-controlled paths).
- **AuthN/AuthZ.** Missing auth check on a route, role-based checks that can be bypassed by
  header manipulation, IDOR (does the handler verify the caller owns the object they're
  acting on?).
- **Crypto.** Non-constant-time comparison of secrets, weak KDF/hash for passwords (MD5,
  SHA-1, unsalted), home-grown encryption, `Math.random()` for security tokens.
- **SSRF / URL fetching.** Fetching a user-supplied URL without allowlist. Check redirects.
- **Resource exhaustion.** Unbounded loops, unbounded regex (catastrophic backtracking),
  missing timeouts on outbound fetches, unpaginated DB queries.
- **Deserialization.** `pickle.loads`, `yaml.load` (not `safe_load`), Node `vm` with untrusted
  input.
- **Logging.** Does any log line contain a secret or full token?

Report each finding as: **severity** `file_path:line` — problem → fix. Prioritize high/critical.
If nothing's found, say so and list what you checked.
