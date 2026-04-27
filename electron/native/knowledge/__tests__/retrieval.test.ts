/**
 * K-2 — Retriever tests.
 */

import { describe, expect, it } from 'vitest'
import { BM25Indexer, InMemoryKnowledgeStore, Retriever } from '../index.js'

async function setup() {
  const store = new InMemoryKnowledgeStore()
  const idx = new BM25Indexer(store, { chunkChars: 200, overlapChars: 30 })
  const r = new Retriever(store, idx)

  const a = await store.registerSource({
    slug: 'docs/auth', kind: 'fs.file', uri: '/auth', title: 'Auth',
    scope: { workspaceId: 'ws-1' },
  })
  await idx.index(a, 'argon2id hashes passwords; jwt tokens; refresh rotation prevents replay')

  const b = await store.registerSource({
    slug: 'docs/build', kind: 'fs.file', uri: '/build', title: 'Build',
    scope: { workspaceId: 'ws-1' },
  })
  await idx.index(b, 'use pnpm in this repo; vitest for tests; tonic for grpc')

  const c = await store.registerSource({
    slug: 'docs/private', kind: 'fs.file', uri: '/p', title: 'Private',
    scope: { personal: true },
  })
  await idx.index(c, 'argon2id is mentioned here too in personal notes')

  return { store, idx, r, a, b, c }
}

describe('Retriever.retrieve', () => {
  it('returns ranked hits matching the query', async () => {
    const { r } = await setup()
    const out = await r.retrieve({ query: 'argon2id' })
    expect(out.hits.length).toBeGreaterThan(0)
    expect(out.hits[0].chunk.text.toLowerCase()).toContain('argon2id')
  })

  it('filters eligible sources by scope', async () => {
    const { r, a } = await setup()
    const ws1 = await r.retrieve({
      query: 'argon2id',
      scope: { workspaceId: 'ws-1' },
    })
    expect(ws1.hits.every(h => h.chunk.sourceId === a.id)).toBe(true)
  })

  it('honors slug allow-list', async () => {
    const { r } = await setup()
    const only = await r.retrieve({
      query: 'argon2id',
      slugAllowList: ['docs/private'],
    })
    expect(only.hits.length).toBeGreaterThan(0)
    for (const h of only.hits) {
      expect(h.chunk.sourceId).toMatch(/src_/)
    }
  })

  it('honors slug deny-list', async () => {
    const { r, a } = await setup()
    const out = await r.retrieve({
      query: 'argon2id',
      slugDenyList: ['docs/auth'],
    })
    expect(out.hits.every(h => h.chunk.sourceId !== a.id)).toBe(true)
  })

  it('honors sourceIdAllowList', async () => {
    const { r, a } = await setup()
    const only = await r.retrieve({
      query: 'argon2id',
      sourceIdAllowList: [a.id],
    })
    expect(only.hits.every(h => h.chunk.sourceId === a.id)).toBe(true)
  })

  it('respects minScore floor', async () => {
    const { r } = await setup()
    const high = await r.retrieve({ query: 'argon2id', minScore: 100 })
    expect(high.hits).toEqual([])
    expect(high.stats.droppedByScore).toBeGreaterThan(0)
  })

  it('respects limit', async () => {
    const { r } = await setup()
    const out = await r.retrieve({ query: 'argon2id', limit: 1 })
    expect(out.hits).toHaveLength(1)
  })

  it('reports stats: totalIndexedSources / eligibleSources / droppedByPolicy', async () => {
    const { r } = await setup()
    const out = await r.retrieve({
      query: 'argon2id',
      slugDenyList: ['docs/auth'],
    })
    expect(out.stats.totalIndexedSources).toBe(3)
    expect(out.stats.eligibleSources).toBe(2)
    expect(out.stats.droppedByPolicy).toBe(1)
  })

  it('skips unindexed sources by default', async () => {
    const { store, idx, r } = await setup()
    const fresh = await store.registerSource({
      slug: 'docs/new', kind: 'fs.file', uri: '/n', title: 'New',
    })
    // never indexed → status remains "unindexed"
    const out = await r.retrieve({ query: 'anything' })
    expect(out.hits.every((h: { chunk: { sourceId: string } }) => h.chunk.sourceId !== fresh.id)).toBe(true)
    expect(idx.size()).toBeGreaterThan(0)
  })

  it('empty query returns no hits', async () => {
    const { r } = await setup()
    const out = await r.retrieve({ query: '' })
    expect(out.hits).toEqual([])
  })

  it('every hit carries a ProvenanceRef ready to cite', async () => {
    const { r } = await setup()
    const out = await r.retrieve({ query: 'argon2id' })
    for (const h of out.hits) {
      expect(h.ref.sourceId).toBe(h.chunk.sourceId)
      expect(h.ref.chunkId).toBe(h.chunk.id)
      expect(typeof h.ref.score).toBe('number')
    }
  })
})
