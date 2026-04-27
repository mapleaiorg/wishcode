# Cell-6 — Trust Tiers + Signature Verification

Date: 2026-04-27

## What landed

`electron/native/cells/trust.ts` (~140 LoC) — `TrustVerifier`
enforces the trust policy at Cell load:

| Tier | Check |
|---|---|
| `declarative` | always passes (no JS to load) |
| `sandboxed` | bundle SHA-256 == `manifest.storage.bundleHash` |
| `trusted-signed` | bundle hash + ed25519 signature verifies under a registered public key id |

Returns a structured `TrustVerdict { ok, tier, reason, detail? }` so
Cell-1's `setStatus` and Cell-2's activation pipeline can produce
specific UI errors instead of "loading failed".

## Reasons

`declarative` / `sandboxed` / `trusted-signed.ok` (success) ;
`bundle_unreadable` / `bundle_hash_mismatch` /
`trusted-signed.missing_signature` /
`trusted-signed.unknown_key` /
`trusted-signed.signature_invalid` (failure).

## Pluggable verifier

`SignatureVerifier` interface; `InMemorySignatureVerifier` for tests
and the local Cell Forge (Cell-8) flow. Production hosts wire
`WishdSignatureVerifier` (delegates to `wishd-cell-verify`, W-7) into
the same slot once W-9 ships — no host code changes.

## Bundle hashing

Uses WebCrypto SHA-256 by default; tests inject a `hashBundle`
override to skip the I/O. FNV-1a fallback only fires in
WebCrypto-less envs (production hosts always have it).

## Tests (13)

- Declarative always passes (1)
- Sandboxed: hash match / mismatch / missing source / hashes
  bundleBytes via WebCrypto (4)
- Trusted-signed: missing signature / no verifier configured /
  unknown key / invalid signature on known key / valid pass / bundle
  hash still mismatches even with valid signature (6)
- InMemorySignatureVerifier: invalid when no signature; multiple
  signatures per key (2)

## Pending

- **Cell-6.1** `WishdSignatureVerifier` plugged through W-9 once the
  bridge is up.
- **Cell-6.2** signing key registry sync from Hermon (H-6) so org
  signing keys propagate to clients.
