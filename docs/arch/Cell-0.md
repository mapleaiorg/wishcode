# Cell-0 — Cell Manifest schema

Date: 2026-04-26
Phase: Cell-0 (Cell Subsystem — manifest contract)

## Decision

Every Cell ships a `cell.manifest.json` matching `CellManifestSchema`
(Zod). The schema is the contract — Cell-1 (registry), Cell-2
(runtime), Cell-6 (trust verifier), Cell-7 (sync), and Cell-8 (forge)
all read this exact shape. Per PROMPT-INDEX § 4 invariant 15: "Cell
Manifest is the contract."

## Layout

```
electron/native/cells/
├─ manifest.ts          # Zod schema + parseManifest + helpers
├─ index.ts             # Public barrel
└─ __tests__/manifest.test.ts   # 30 tests
```

## Schema highlights

| Field | Constraint |
|---|---|
| `manifestVersion` | literal `1` (bump on schema break) |
| `id` | reverse-DNS-ish lowercase dotted, `[a-z][a-z0-9_]*(\.[a-z][a-z0-9_-]*){1,4}`, 3–64 chars |
| `version` | semver with optional pre-release + build metadata |
| `class` | `ui` / `business` / `provider` / `agent` / `tool` / `policy` / `theme` / `overlay` |
| `trustTier` | `declarative` / `sandboxed` / `trusted-signed` |
| `capabilities` | array of CONVENTIONS § 6 capability kinds (Cell-2 enforces at activation, broker enforces at invocation) |
| `slots` | array of `{ slot, entry, priority?, title? }`; reserved shell slot ids known to Cell-4 |
| `dependencies` | array of `{ id, versionRange, optional? }`; same-task only check happens at Cell-1 |
| `storage` | `{ bundle, bundleHash }`; bundleHash is 64-hex sha256 verified by Cell-6 |
| `signature` | required iff `trustTier === 'trusted-signed'`; ed25519 + publicKeyId + base64url + signedAt |

Cross-field invariants:

1. `signature` required iff trust tier is `trusted-signed`; rejected
   on other tiers.
2. `(slot, entry)` pairs unique within a manifest.
3. Dependency ids unique within a manifest.

Per-class hooks (`provider`, `policy`, `overlay`) are intentionally
**open** (`passthrough`) so the schema does not need to bump every
time a class adds a hint. The class runtime validates its own extras.

## Helpers

- `parseManifest(raw): { ok: true; manifest } | { ok: false; errors }` —
  structured result so registries / forges can render errors without
  `try/catch` ceremony.
- `manifestDeclaresCapability(m, kind)` — used by Cell-2 / D-6 at
  activation.
- `slotContributionsFor(m, slot)` — priority-ordered list for a slot id.
- `RESERVED_SHELL_SLOT_IDS` — the 13 shell slot ids from CONVENTIONS § 7.

## Tests (30)

- Happy path: minimal manifest, defaults applied, UI Cell with slots (3)
- Id grammar: too short, uppercase, no dots, > 64 chars (4)
- Version grammar: rejects non-semver, accepts pre-release+build (2)
- Trust + signature: required-when-signed, valid signed manifest,
  rejected when present on non-signed tier (3)
- Capabilities: rejects unknown kind (1)
- Slots: rejects duplicate (slot, entry); accepts duplicate slot
  with different entry (2)
- Dependencies: rejects duplicate ids (1)
- Storage: requires 64-hex bundleHash; bundle defaults to `./bundle` (2)
- Class enum: rejects unknown; accepts each of the 8 (9 — 1 rejection +
  8 parameterized acceptances)
- `manifestDeclaresCapability` happy + miss (1)
- `slotContributionsFor` priority sort (1)
- `RESERVED_SHELL_SLOT_IDS` length + sample contents (1)

## Wow moment

A 100-line Zod schema rejects every shape Cell-2 / Cell-6 / Cell-8
would otherwise have to defensively re-validate. The forge can take
an AI-generated manifest, call `parseManifest`, and surface field-level
error paths to the user before any sandbox spins up.

## Pending

- **Cell-1** registry (in-memory + fs-backed) keyed by `(id, version)`
  with semver-range resolution.
- **Cell-2** runtime (sandbox + lifecycle + capability enforcement).
- **Cell-3** SDK (`@wish/cell-sdk`) — the only surface a Cell may import.
- **Cell-4** UI slot host that mounts contributions into reserved shell
  slot ids.
- **Cell-5** Cell Groups + internal bus.
- **Cell-6** trust tier + signature verification (with W-7 wishd-cell-verify).
- **Cell-7** sync hooks (Hermon agent + overlay adapter).
- **Cell-8** local Cell Forge lifecycle.

## Handoff

Cell-1 reads this ADR + parses every `cell.manifest.json` it finds
under `~/.wishcode/cells/installed/` and `~/.wishcode/cells/draft/`.
Cell-2 calls `manifestDeclaresCapability` before granting capability
broker checks. Cell-6 verifies `storage.bundleHash` against the actual
bundle and (when `trusted-signed`) verifies `signature` against the
signing key registry.
