/**
 * K-0 — InMemoryKnowledgeStore tests.
 */

import { describe, expect, it } from 'vitest'
import { InMemoryKnowledgeStore } from '../index.js'

function fresh(): InMemoryKnowledgeStore {
  return new InMemoryKnowledgeStore()
}

describe('InMemoryKnowledgeStore', () => {
  it('registers a source with defaults + returns full record', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'docs/handbook',
      kind: 'fs.directory',
      uri: '/Users/test/docs',
      title: 'Handbook',
    })
    expect(src.id).toMatch(/^src_/)
    expect(src.slug).toBe('docs/handbook')
    expect(src.status).toBe('unindexed')
    expect(src.capabilities.bm25).toBe(true)
    expect(src.capabilities.vector).toBe(false)
    expect(src.scope).toEqual({ personal: true })
  })

  it('rejects empty title and uri', async () => {
    const s = fresh()
    await expect(
      s.registerSource({ slug: 'a', kind: 'fs.file', uri: '/x', title: '   ' }),
    ).rejects.toThrow(/title/)
    await expect(
      s.registerSource({ slug: 'a', kind: 'fs.file', uri: '', title: 'T' }),
    ).rejects.toThrow(/uri/)
  })

  it('validates slug format', async () => {
    const s = fresh()
    await expect(
      s.registerSource({ slug: 'Has Space', kind: 'fs.file', uri: '/x', title: 'T' }),
    ).rejects.toThrow(/slug/)
    await expect(
      s.registerSource({ slug: 'CapitalSlug', kind: 'fs.file', uri: '/x', title: 'T' }),
    ).rejects.toThrow(/slug/)
    await expect(
      s.registerSource({ slug: '-leading', kind: 'fs.file', uri: '/x', title: 'T' }),
    ).rejects.toThrow(/slug/)
  })

  it('rejects duplicate slugs', async () => {
    const s = fresh()
    await s.registerSource({ slug: 'a', kind: 'fs.file', uri: '/x', title: 'T' })
    await expect(
      s.registerSource({ slug: 'a', kind: 'fs.file', uri: '/y', title: 'U' }),
    ).rejects.toThrow(/duplicate/)
  })

  it('lookups: getSource by id and getBySlug', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/x', title: 'T',
    })
    expect((await s.getSource(src.id))?.slug).toBe('a')
    expect((await s.getBySlug('a'))?.id).toBe(src.id)
    expect(await s.getBySlug('missing')).toBeNull()
  })

  it('listSources filters by kind', async () => {
    const s = fresh()
    await s.registerSource({ slug: 'a', kind: 'fs.file', uri: '/a', title: 'A' })
    await s.registerSource({ slug: 'b', kind: 'git.ref', uri: 'main', title: 'B' })
    const fs = await s.listSources({ kinds: ['fs.file'] })
    expect(fs.map(x => x.slug)).toEqual(['a'])
  })

  it('listSources filters by status', async () => {
    const s = fresh()
    const a = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/a', title: 'A',
    })
    const b = await s.registerSource({
      slug: 'b', kind: 'fs.file', uri: '/b', title: 'B',
    })
    await s.markIndexed(a.id, { chunkCount: 5 })
    expect((await s.listSources({ status: ['indexed'] })).map(x => x.slug)).toEqual(['a'])
    expect((await s.listSources({ status: ['unindexed'] })).map(x => x.slug)).toEqual([
      b.slug,
    ])
  })

  it('listSources filters by scope', async () => {
    const s = fresh()
    await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/a', title: 'A',
      scope: { workspaceId: 'ws-1' },
    })
    await s.registerSource({
      slug: 'b', kind: 'fs.file', uri: '/b', title: 'B',
      scope: { workspaceId: 'ws-2' },
    })
    const ws1 = await s.listSources({ scope: { workspaceId: 'ws-1' } })
    expect(ws1.map(x => x.slug)).toEqual(['a'])
  })

  it('listSources filters by query (case-insensitive substring on slug + title)', async () => {
    const s = fresh()
    await s.registerSource({
      slug: 'docs/handbook', kind: 'fs.directory', uri: '/x', title: 'Handbook',
    })
    await s.registerSource({
      slug: 'docs/api', kind: 'fs.directory', uri: '/y', title: 'API Reference',
    })
    expect((await s.listSources({ query: 'HAND' })).map(x => x.slug)).toEqual([
      'docs/handbook',
    ])
    expect((await s.listSources({ query: 'reference' })).map(x => x.slug)).toEqual([
      'docs/api',
    ])
  })

  it('updateSource changes slug + maintains slugIndex', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/x', title: 'T',
    })
    await s.updateSource(src.id, { slug: 'a2' })
    expect(await s.getBySlug('a')).toBeNull()
    expect((await s.getBySlug('a2'))?.id).toBe(src.id)
  })

  it('updateSource refuses duplicate slug rename', async () => {
    const s = fresh()
    const a = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/x', title: 'A',
    })
    await s.registerSource({ slug: 'b', kind: 'fs.file', uri: '/y', title: 'B' })
    await expect(s.updateSource(a.id, { slug: 'b' })).rejects.toThrow(/duplicate/)
  })

  it('removeSource clears the slugIndex', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/x', title: 'T',
    })
    expect(await s.removeSource(src.id)).toBe(true)
    expect(await s.getBySlug('a')).toBeNull()
    expect(await s.removeSource(src.id)).toBe(false)
  })

  it('indexer lifecycle: unindexed → indexing → indexed', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.directory', uri: '/x', title: 'T',
    })
    expect((await s.markIndexing(src.id)).status).toBe('indexing')
    const done = await s.markIndexed(src.id, { chunkCount: 42, contentHash: 'h' })
    expect(done.status).toBe('indexed')
    expect(done.chunkCount).toBe(42)
    expect(done.contentHash).toBe('h')
    expect(done.lastIndexedAt).toBeDefined()
  })

  it('indexer lifecycle: errored carries the error structure', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.directory', uri: '/x', title: 'T',
    })
    const e = await s.markErrored(src.id, { code: 'fs.not_found', message: 'gone' })
    expect(e.status).toBe('errored')
    expect(e.error?.code).toBe('fs.not_found')
  })

  it('updateSource cannot mutate id or createdAt', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/x', title: 'T',
    })
    const patched = await s.updateSource(src.id, {
      // attempt to override these — must be ignored
      id: 'nope', createdAt: '1970-01-01T00:00:00Z',
    } as Partial<typeof src>)
    expect(patched.id).toBe(src.id)
    expect(patched.createdAt).toBe(src.createdAt)
  })

  it('returns deep copies on get/list (caller mutation isolation)', async () => {
    const s = fresh()
    const src = await s.registerSource({
      slug: 'a', kind: 'fs.file', uri: '/x', title: 'T',
    })
    const got = await s.getSource(src.id)
    if (got) got.title = 'mutated'
    const refresh = await s.getSource(src.id)
    expect(refresh?.title).toBe('T')
  })

  it('listSources sorts by slug + applies limit', async () => {
    const s = fresh()
    await s.registerSource({ slug: 'b', kind: 'fs.file', uri: '/b', title: 'B' })
    await s.registerSource({ slug: 'a', kind: 'fs.file', uri: '/a', title: 'A' })
    await s.registerSource({ slug: 'c', kind: 'fs.file', uri: '/c', title: 'C' })
    const all = await s.listSources({ limit: 2 })
    expect(all.map(x => x.slug)).toEqual(['a', 'b'])
  })
})
