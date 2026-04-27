/**
 * Cell-0 — Manifest schema tests.
 */

import { describe, expect, it } from 'vitest'
import {
  RESERVED_SHELL_SLOT_IDS,
  manifestDeclaresCapability,
  parseManifest,
  slotContributionsFor,
  type CellManifest,
} from '../index.js'

const SHA256_FIXTURE = 'a'.repeat(64)

function base(overrides: Record<string, unknown> = {}): unknown {
  return {
    manifestVersion: 1,
    id: 'wish.provider.anthropic',
    version: '0.1.0',
    class: 'provider',
    trustTier: 'sandboxed',
    title: 'Anthropic Provider',
    author: { name: 'Wish Code' },
    capabilities: ['provider.access', 'network.fetch'],
    slots: [],
    dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256_FIXTURE },
    ...overrides,
  }
}

describe('parseManifest — happy path', () => {
  it('accepts a minimal valid manifest', () => {
    const r = parseManifest(base())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.id).toBe('wish.provider.anthropic')
      expect(r.manifest.class).toBe('provider')
      expect(r.manifest.capabilities).toContain('network.fetch')
    }
  })

  it('applies defaults for capabilities/slots/dependencies', () => {
    const r = parseManifest(
      base({ capabilities: undefined, slots: undefined, dependencies: undefined }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.capabilities).toEqual([])
      expect(r.manifest.slots).toEqual([])
      expect(r.manifest.dependencies).toEqual([])
    }
  })

  it('accepts a UI Cell with slot contributions', () => {
    const r = parseManifest(
      base({
        class: 'ui',
        slots: [
          { slot: 'shell.leftNav', entry: 'NavItem', priority: 50 },
          { slot: 'chat.messageToolbar', entry: 'ToolbarBtn', title: 'Pin' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.slots).toHaveLength(2)
      expect(r.manifest.slots[0].priority).toBe(50)
      expect(r.manifest.slots[1].priority).toBe(100) // default
    }
  })
})

describe('parseManifest — id grammar', () => {
  it('rejects ids that are too short', () => {
    const r = parseManifest(base({ id: 'a' }))
    expect(r.ok).toBe(false)
  })

  it('rejects ids with uppercase', () => {
    const r = parseManifest(base({ id: 'Wish.Provider' }))
    expect(r.ok).toBe(false)
  })

  it('rejects ids missing dotted segments', () => {
    const r = parseManifest(base({ id: 'noseparator' }))
    expect(r.ok).toBe(false)
  })

  it('rejects ids exceeding 64 chars', () => {
    const r = parseManifest(base({ id: `a.${'b'.repeat(70)}` }))
    expect(r.ok).toBe(false)
  })
})

describe('parseManifest — version grammar', () => {
  it('rejects non-semver versions', () => {
    const r = parseManifest(base({ version: 'one.two.three' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some(e => e.path === 'version')).toBe(true)
    }
  })

  it('accepts pre-release + build metadata', () => {
    const r = parseManifest(base({ version: '1.2.3-alpha.1+build.2' }))
    expect(r.ok).toBe(true)
  })
})

describe('parseManifest — trust tier + signature', () => {
  it('requires a signature when trustTier is "trusted-signed"', () => {
    const r = parseManifest(base({ trustTier: 'trusted-signed' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some(e => e.path === 'signature')).toBe(true)
    }
  })

  it('accepts a valid signed manifest', () => {
    const r = parseManifest(
      base({
        trustTier: 'trusted-signed',
        signature: {
          algorithm: 'ed25519',
          publicKeyId: 'wishcode-cell-signing-2026',
          signature: 'b64-signature-stub',
          signedAt: '2026-04-25T00:00:00Z',
        },
      }),
    )
    expect(r.ok).toBe(true)
  })

  it('rejects a signature on a non-signed tier', () => {
    const r = parseManifest(
      base({
        trustTier: 'sandboxed',
        signature: {
          algorithm: 'ed25519',
          publicKeyId: 'k',
          signature: 's',
          signedAt: '2026-04-25T00:00:00Z',
        },
      }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some(e => e.message.includes('signature'))).toBe(true)
    }
  })
})

describe('parseManifest — capabilities + slots + deps', () => {
  it('rejects unknown capability kinds', () => {
    const r = parseManifest(base({ capabilities: ['nope.invent'] }))
    expect(r.ok).toBe(false)
  })

  it('rejects duplicate (slot, entry) pairs', () => {
    const r = parseManifest(
      base({
        slots: [
          { slot: 'shell.main', entry: 'A' },
          { slot: 'shell.main', entry: 'A' },
        ],
      }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some(e => e.message.includes('duplicate slot'))).toBe(true)
    }
  })

  it('accepts duplicate slot id with different entry names', () => {
    const r = parseManifest(
      base({
        slots: [
          { slot: 'shell.main', entry: 'A' },
          { slot: 'shell.main', entry: 'B' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
  })

  it('rejects duplicate dependency ids', () => {
    const r = parseManifest(
      base({
        dependencies: [
          { id: 'wish.policy.audit', versionRange: '^1' },
          { id: 'wish.policy.audit', versionRange: '^2' },
        ],
      }),
    )
    expect(r.ok).toBe(false)
  })
})

describe('parseManifest — storage + bundle hash', () => {
  it('requires a 64-hex bundleHash', () => {
    const r = parseManifest(
      base({ storage: { bundle: './bundle', bundleHash: 'short' } }),
    )
    expect(r.ok).toBe(false)
  })

  it('accepts a bundle path default of "./bundle"', () => {
    const r = parseManifest(
      base({ storage: { bundleHash: SHA256_FIXTURE } }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.storage.bundle).toBe('./bundle')
  })
})

describe('parseManifest — class enum', () => {
  it('rejects unknown class', () => {
    const r = parseManifest(base({ class: 'mystery' }))
    expect(r.ok).toBe(false)
  })

  it.each([
    ['ui'], ['business'], ['provider'], ['agent'],
    ['tool'], ['policy'], ['theme'], ['overlay'],
  ])('accepts class %s', (cls) => {
    const r = parseManifest(base({ class: cls }))
    expect(r.ok).toBe(true)
  })
})

describe('helpers', () => {
  it('manifestDeclaresCapability matches declared kinds only', () => {
    const r = parseManifest(base({ capabilities: ['filesystem.read', 'git.read'] }))
    expect(r.ok).toBe(true)
    const m = (r as { ok: true; manifest: CellManifest }).manifest
    expect(manifestDeclaresCapability(m, 'filesystem.read')).toBe(true)
    expect(manifestDeclaresCapability(m, 'process.spawn')).toBe(false)
  })

  it('slotContributionsFor returns priority-ordered contributions', () => {
    const r = parseManifest(
      base({
        slots: [
          { slot: 'shell.main', entry: 'late', priority: 200 },
          { slot: 'shell.main', entry: 'early', priority: 50 },
          { slot: 'shell.leftNav', entry: 'unrelated' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    const m = (r as { ok: true; manifest: CellManifest }).manifest
    const main = slotContributionsFor(m, 'shell.main')
    expect(main.map(s => s.entry)).toEqual(['early', 'late'])
  })

  it('RESERVED_SHELL_SLOT_IDS includes the canonical 13 slot ids', () => {
    expect(RESERVED_SHELL_SLOT_IDS.length).toBe(13)
    expect(RESERVED_SHELL_SLOT_IDS).toContain('shell.leftNav')
    expect(RESERVED_SHELL_SLOT_IDS).toContain('activity.timeline')
  })
})
