/**
 * Cell-1 — registry + semver-lite tests.
 */

import { describe, expect, it } from 'vitest'
import {
  InMemoryCellRegistry,
  addFromRaw,
  parseRange,
  rangeSatisfies,
  type CellManifest,
} from '../index.js'

const SHA256 = 'a'.repeat(64)

function makeManifest(
  id: string,
  version: string,
  overrides: Partial<CellManifest> = {},
): CellManifest {
  return {
    manifestVersion: 1,
    id,
    version,
    class: 'tool',
    trustTier: 'sandboxed',
    title: id,
    author: { name: 'test' },
    capabilities: [],
    slots: [],
    dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256 },
    ...overrides,
  } as CellManifest
}

describe('semver-lite', () => {
  it('parses each range kind', () => {
    expect(parseRange('*')?.kind).toBe('any')
    expect(parseRange('1.2.3')?.kind).toBe('exact')
    expect(parseRange('^1.2.3')?.kind).toBe('caret')
    expect(parseRange('~1.2.3')?.kind).toBe('tilde')
    expect(parseRange('garbage')).toBeNull()
  })

  it('rangeSatisfies — exact', () => {
    expect(rangeSatisfies('1.2.3', '1.2.3')).toBe(true)
    expect(rangeSatisfies('1.2.3', '1.2.4')).toBe(false)
  })

  it('rangeSatisfies — any', () => {
    expect(rangeSatisfies('*', '0.0.1')).toBe(true)
    expect(rangeSatisfies('*', '99.0.0')).toBe(true)
  })

  it('rangeSatisfies — caret stays in same major', () => {
    expect(rangeSatisfies('^1.2.3', '1.2.3')).toBe(true)
    expect(rangeSatisfies('^1.2.3', '1.5.0')).toBe(true)
    expect(rangeSatisfies('^1.2.3', '2.0.0')).toBe(false)
    expect(rangeSatisfies('^1.2.3', '1.2.2')).toBe(false)
  })

  it('rangeSatisfies — tilde stays in same minor', () => {
    expect(rangeSatisfies('~1.2.3', '1.2.3')).toBe(true)
    expect(rangeSatisfies('~1.2.3', '1.2.9')).toBe(true)
    expect(rangeSatisfies('~1.2.3', '1.3.0')).toBe(false)
    expect(rangeSatisfies('~1.2.3', '1.2.2')).toBe(false)
  })

  it('rangeSatisfies — prerelease ordered below release', () => {
    expect(rangeSatisfies('^1.0.0', '1.0.0-alpha')).toBe(false)
    expect(rangeSatisfies('^1.0.0', '1.0.0')).toBe(true)
  })
})

describe('InMemoryCellRegistry', () => {
  it('add + get + duplicate rejection', async () => {
    const r = new InMemoryCellRegistry()
    const m = makeManifest('wish.tool.x', '1.0.0')
    await r.add({ manifest: m })
    expect((await r.get(m.id, m.version))?.manifest.id).toBe(m.id)
    await expect(r.add({ manifest: m })).rejects.toThrow(/duplicate/)
  })

  it('resolve picks the highest version satisfying a range', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('a', '1.0.0') })
    await r.add({ manifest: makeManifest('a', '1.2.5') })
    await r.add({ manifest: makeManifest('a', '1.3.0') })
    await r.add({ manifest: makeManifest('a', '2.0.0') })
    expect((await r.resolve('a', '^1.0.0'))?.manifest.version).toBe('1.3.0')
    expect((await r.resolve('a', '~1.2.0'))?.manifest.version).toBe('1.2.5')
    expect((await r.resolve('a', '^2.0.0'))?.manifest.version).toBe('2.0.0')
  })

  it('resolve respects status filter (default: installed only)', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('a', '1.0.0'), status: 'draft' })
    await r.add({ manifest: makeManifest('a', '1.1.0'), status: 'installed' })
    expect((await r.resolve('a', '^1.0.0'))?.manifest.version).toBe('1.1.0')
    expect(
      (await r.resolve('a', '^1.0.0', { status: ['draft'] }))?.manifest.version,
    ).toBe('1.0.0')
  })

  it('resolve returns null on no match', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('a', '1.0.0') })
    expect(await r.resolve('a', '^2.0.0')).toBeNull()
    expect(await r.resolve('missing', '*')).toBeNull()
  })

  it('list sorts by id then version (descending) and filters status', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('b', '1.0.0') })
    await r.add({ manifest: makeManifest('a', '1.0.0') })
    await r.add({ manifest: makeManifest('a', '2.0.0') })
    const all = await r.list()
    expect(all.map(x => `${x.manifest.id}@${x.manifest.version}`)).toEqual([
      'a@2.0.0', 'a@1.0.0', 'b@1.0.0',
    ])
  })

  it('setStatus mutates a record in place', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('a', '1.0.0') })
    const next = await r.setStatus('a', '1.0.0', 'disabled')
    expect(next.status).toBe('disabled')
  })

  it('remove deletes one (id, version)', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('a', '1.0.0') })
    expect(await r.remove('a', '1.0.0')).toBe(true)
    expect(await r.remove('a', '1.0.0')).toBe(false)
  })

  it('resolveDependencies splits satisfied vs missing', async () => {
    const r = new InMemoryCellRegistry()
    await r.add({ manifest: makeManifest('wish.policy.audit', '1.5.0') })
    const m = makeManifest('app', '1.0.0', {
      dependencies: [
        { id: 'wish.policy.audit', versionRange: '^1.0.0', optional: false },
        { id: 'wish.tool.missing', versionRange: '*', optional: false },
        { id: 'wish.tool.opt', versionRange: '*', optional: true },
      ],
    })
    const c = await r.resolveDependencies(m)
    expect(c.satisfied).toHaveLength(1)
    expect(c.satisfied[0].resolved.manifest.id).toBe('wish.policy.audit')
    expect(c.missing.map(x => x.id)).toEqual(['wish.tool.missing', 'wish.tool.opt'])
    expect(c.missing.find(x => x.id === 'wish.tool.opt')?.optional).toBe(true)
  })

  it('addFromRaw forwards parse errors structurally', async () => {
    const r = new InMemoryCellRegistry()
    const result = await addFromRaw(r, { id: 'bad' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('addFromRaw on a valid manifest returns the record', async () => {
    const r = new InMemoryCellRegistry()
    const result = await addFromRaw(r, makeManifest('wish.tool.a', '1.0.0'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.record.manifest.id).toBe('wish.tool.a')
  })
})
