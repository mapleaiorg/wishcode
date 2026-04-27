/**
 * Cell-6 — Trust tiers + signature verification (host-side).
 *
 * Three trust tiers (CONVENTIONS § 5):
 *   - declarative   : config-only Cells (no JS bundle to load)
 *   - sandboxed     : runs in a sandbox host (Cell-2.1)
 *   - trusted-signed: ed25519-signed, signature verified at load
 *
 * The verifier checks:
 *   1. The bundle's actual SHA-256 matches `manifest.storage.bundleHash`
 *      (computed via WebCrypto when available).
 *   2. For `trusted-signed`, the manifest's signature verifies against
 *      a registered public key keyed by `signature.publicKeyId`.
 *
 * The actual ed25519 verification is delegated to W-7 (`wishd-cell-verify`)
 * once the wishd bridge is wired (W-9). Cell-6 ships the host-side
 * trust policy + the bundle-hash check + a pluggable
 * `SignatureVerifier` so tests can inject a stub.
 */

import type { CellManifest, TrustTier } from './manifest.js'

export type TrustReason =
  | 'declarative'
  | 'sandboxed'
  | 'trusted-signed.ok'
  | 'trusted-signed.missing_signature'
  | 'trusted-signed.unknown_key'
  | 'trusted-signed.signature_invalid'
  | 'bundle_hash_mismatch'
  | 'bundle_unreadable'

export interface TrustVerdict {
  ok: boolean
  tier: TrustTier
  reason: TrustReason
  /** When `ok=false`, a short human-readable detail. */
  detail?: string
}

export interface SignatureVerifier {
  /**
   * Verify a manifest's signature. Implementations may delegate to
   * W-7 (wishd-cell-verify) over gRPC; the test stub uses an
   * in-memory key registry.
   */
  verify(manifest: CellManifest): Promise<{ ok: boolean; reason?: 'unknown_key' | 'invalid' }>
}

export interface TrustVerifierOptions {
  /** Signature verifier used for `trusted-signed` Cells. */
  signatures?: SignatureVerifier
  /**
   * Override the bundle-hash hasher. Defaults to a SHA-256 over the
   * canonical bytes; tests pass their own to avoid filesystem reads.
   */
  hashBundle?: (manifest: CellManifest) => Promise<string>
}

export class TrustVerifier {
  constructor(private readonly opts: TrustVerifierOptions = {}) {}

  /**
   * Run the trust policy against a manifest + (optionally) bundle
   * bytes. The host (Cell-1.1 fs-backed registry / Cell-7 sync) is
   * responsible for sourcing the bundle.
   */
  async verify(
    manifest: CellManifest,
    bundleBytes?: Uint8Array,
  ): Promise<TrustVerdict> {
    if (manifest.trustTier === 'declarative') {
      return { ok: true, tier: 'declarative', reason: 'declarative' }
    }

    // Bundle-hash check applies to sandboxed + trusted-signed.
    const computed = bundleBytes
      ? await sha256Hex(bundleBytes)
      : this.opts.hashBundle
        ? await this.opts.hashBundle(manifest)
        : null

    if (computed === null) {
      return {
        ok: false,
        tier: manifest.trustTier,
        reason: 'bundle_unreadable',
        detail: 'no bundle bytes supplied and no hashBundle override',
      }
    }
    if (computed.toLowerCase() !== manifest.storage.bundleHash.toLowerCase()) {
      return {
        ok: false,
        tier: manifest.trustTier,
        reason: 'bundle_hash_mismatch',
        detail: `expected ${manifest.storage.bundleHash} got ${computed}`,
      }
    }

    if (manifest.trustTier === 'sandboxed') {
      return { ok: true, tier: 'sandboxed', reason: 'sandboxed' }
    }

    // trusted-signed
    if (!manifest.signature) {
      return {
        ok: false,
        tier: 'trusted-signed',
        reason: 'trusted-signed.missing_signature',
      }
    }
    if (!this.opts.signatures) {
      return {
        ok: false,
        tier: 'trusted-signed',
        reason: 'trusted-signed.signature_invalid',
        detail: 'no SignatureVerifier configured',
      }
    }
    const r = await this.opts.signatures.verify(manifest)
    if (r.ok) return { ok: true, tier: 'trusted-signed', reason: 'trusted-signed.ok' }
    if (r.reason === 'unknown_key') {
      return { ok: false, tier: 'trusted-signed', reason: 'trusted-signed.unknown_key' }
    }
    return { ok: false, tier: 'trusted-signed', reason: 'trusted-signed.signature_invalid' }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    const digest = await crypto.subtle.digest('SHA-256', ab)
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback (test envs without WebCrypto) — non-crypto FNV-1a 64.
  let h1 = 0xdeadbeef ^ 0
  let h2 = 0x41c6ce57 ^ 0
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761)
    h2 = Math.imul(h2 ^ bytes[i], 1597334677)
  }
  return [h1 >>> 0, h2 >>> 0].map(n => n.toString(16).padStart(8, '0')).join('').padEnd(64, '0')
}

/**
 * In-memory signature verifier used by tests + the local Cell Forge
 * (Cell-8) flow. Production hosts wire `WishdSignatureVerifier`
 * (W-7 / W-9) into the same slot.
 */
export class InMemorySignatureVerifier implements SignatureVerifier {
  private readonly trustedSignatures = new Map<string, Set<string>>()

  /** `(publicKeyId, signature)` is recognised as valid. */
  trust(publicKeyId: string, signature: string): void {
    let sigs = this.trustedSignatures.get(publicKeyId)
    if (!sigs) {
      sigs = new Set()
      this.trustedSignatures.set(publicKeyId, sigs)
    }
    sigs.add(signature)
  }

  async verify(
    manifest: CellManifest,
  ): Promise<{ ok: boolean; reason?: 'unknown_key' | 'invalid' }> {
    const sig = manifest.signature
    if (!sig) return { ok: false, reason: 'invalid' }
    const sigs = this.trustedSignatures.get(sig.publicKeyId)
    if (!sigs) return { ok: false, reason: 'unknown_key' }
    if (!sigs.has(sig.signature)) return { ok: false, reason: 'invalid' }
    return { ok: true }
  }
}
