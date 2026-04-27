/**
 * Cell-6 — TrustVerifier + InMemorySignatureVerifier tests.
 */

import { describe, expect, it } from 'vitest'
import { InMemorySignatureVerifier, TrustVerifier } from '../index.js'
import type { CellManifest } from '../index.js'

const SHA256 = 'a'.repeat(64)

function manifest(overrides: Partial<CellManifest> = {}): CellManifest {
  return {
    manifestVersion: 1,
    id: 'wish.tool.alpha',
    version: '1.0.0',
    class: 'tool',
    trustTier: 'sandboxed',
    title: 'Alpha',
    author: { name: 'test' },
    capabilities: [],
    slots: [],
    dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256 },
    ...overrides,
  } as CellManifest
}

async function bytesWithHash(targetHash: string): Promise<Uint8Array> {
  // We don't reverse SHA-256; instead we use the hashBundle override
  // in tests where we want a passing hash.
  return new TextEncoder().encode('test')
}

describe('TrustVerifier — declarative tier', () => {
  it('always passes regardless of bundle bytes', async () => {
    const v = new TrustVerifier()
    const r = await v.verify(manifest({ trustTier: 'declarative' }))
    expect(r.ok).toBe(true)
    expect(r.reason).toBe('declarative')
  })
})

describe('TrustVerifier — sandboxed tier', () => {
  it('passes when bundle hash matches manifest.storage.bundleHash', async () => {
    const v = new TrustVerifier({ hashBundle: async () => SHA256 })
    const r = await v.verify(manifest())
    expect(r.ok).toBe(true)
    expect(r.reason).toBe('sandboxed')
  })

  it('fails when computed hash differs', async () => {
    const v = new TrustVerifier({ hashBundle: async () => 'b'.repeat(64) })
    const r = await v.verify(manifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('bundle_hash_mismatch')
    expect(r.detail).toContain(SHA256)
  })

  it('fails when no bundle bytes + no override supplied', async () => {
    const v = new TrustVerifier()
    const r = await v.verify(manifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('bundle_unreadable')
  })

  it('hashes bundleBytes via WebCrypto when no override', async () => {
    const bytes = new TextEncoder().encode('hello')
    const expected = await sha256Hex(bytes)
    const v = new TrustVerifier()
    const r = await v.verify(manifest({ storage: { bundle: './b', bundleHash: expected } }), bytes)
    expect(r.ok).toBe(true)
  })
})

describe('TrustVerifier — trusted-signed tier', () => {
  function signedManifest(overrides: Partial<CellManifest['signature']> = {}): CellManifest {
    return manifest({
      trustTier: 'trusted-signed',
      signature: {
        algorithm: 'ed25519',
        publicKeyId: 'wish-signing-2026',
        signature: 'sig-abc',
        signedAt: '2026-04-26T00:00:00Z',
        ...overrides,
      },
    })
  }

  it('rejects when signature is missing', async () => {
    const v = new TrustVerifier({
      hashBundle: async () => SHA256,
      signatures: new InMemorySignatureVerifier(),
    })
    const r = await v.verify(manifest({ trustTier: 'trusted-signed' }))
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('trusted-signed.missing_signature')
  })

  it('rejects when no SignatureVerifier is configured', async () => {
    const v = new TrustVerifier({ hashBundle: async () => SHA256 })
    const r = await v.verify(signedManifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('trusted-signed.signature_invalid')
    expect(r.detail).toContain('no SignatureVerifier')
  })

  it('rejects unknown publicKeyId', async () => {
    const sv = new InMemorySignatureVerifier()
    const v = new TrustVerifier({ hashBundle: async () => SHA256, signatures: sv })
    const r = await v.verify(signedManifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('trusted-signed.unknown_key')
  })

  it('rejects invalid signature on a known key', async () => {
    const sv = new InMemorySignatureVerifier()
    sv.trust('wish-signing-2026', 'a-different-signature')
    const v = new TrustVerifier({ hashBundle: async () => SHA256, signatures: sv })
    const r = await v.verify(signedManifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('trusted-signed.signature_invalid')
  })

  it('passes a known key + matching signature + matching bundleHash', async () => {
    const sv = new InMemorySignatureVerifier()
    sv.trust('wish-signing-2026', 'sig-abc')
    const v = new TrustVerifier({ hashBundle: async () => SHA256, signatures: sv })
    const r = await v.verify(signedManifest())
    expect(r.ok).toBe(true)
    expect(r.reason).toBe('trusted-signed.ok')
  })

  it('still fails on bundle hash mismatch even with a valid signature', async () => {
    const sv = new InMemorySignatureVerifier()
    sv.trust('wish-signing-2026', 'sig-abc')
    const v = new TrustVerifier({ hashBundle: async () => 'b'.repeat(64), signatures: sv })
    const r = await v.verify(signedManifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('bundle_hash_mismatch')
  })
})

describe('InMemorySignatureVerifier', () => {
  it('returns invalid when manifest has no signature', async () => {
    const sv = new InMemorySignatureVerifier()
    const r = await sv.verify(manifest())
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('invalid')
  })

  it('trusts multiple signatures per key', async () => {
    const sv = new InMemorySignatureVerifier()
    sv.trust('k1', 's1')
    sv.trust('k1', 's2')
    expect(
      (await sv.verify(manifest({
        trustTier: 'trusted-signed',
        signature: { algorithm: 'ed25519', publicKeyId: 'k1', signature: 's1', signedAt: 'now' },
      }))).ok,
    ).toBe(true)
    expect(
      (await sv.verify(manifest({
        trustTier: 'trusted-signed',
        signature: { algorithm: 'ed25519', publicKeyId: 'k1', signature: 's2', signedAt: 'now' },
      }))).ok,
    ).toBe(true)
  })
})

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', ab)
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
