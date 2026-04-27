/**
 * K-1 — BM25 indexer + chunker tests.
 */

import { describe, expect, it } from 'vitest'
import {
  BM25Indexer,
  InMemoryKnowledgeStore,
  chunkText,
  tokenize,
} from '../index.js'

async function setup() {
  const store = new InMemoryKnowledgeStore()
  const idx = new BM25Indexer(store, { chunkChars: 80, overlapChars: 10 })
  return { store, idx }
}

async function ingest(
  store: InMemoryKnowledgeStore,
  idx: BM25Indexer,
  slug: string,
  body: string,
) {
  const src = await store.registerSource({
    slug, kind: 'fs.file', uri: '/x', title: slug,
  })
  await idx.index(src, body)
  return src
}

describe('tokenize + chunkText', () => {
  it('tokenize lowercases, strips punctuation, drops stop words', () => {
    expect(tokenize('The Quick, Brown Fox.')).toEqual(['quick', 'brown', 'fox'])
  })

  it('tokenize keeps alphanumerics', () => {
    expect(tokenize('argon2id is great')).toEqual(['argon2id', 'great'])
  })

  it('chunkText returns [] on empty', () => {
    expect(chunkText('', 100, 20)).toEqual([])
  })

  it('chunkText returns 1 chunk for short text', () => {
    expect(chunkText('hello world', 100, 20)).toEqual(['hello world'])
  })

  it('chunkText splits longer text into multiple pieces', () => {
    const body = 'a'.repeat(50) + ' ' + 'b'.repeat(50) + ' ' + 'c'.repeat(50)
    const out = chunkText(body, 60, 5)
    expect(out.length).toBeGreaterThan(1)
  })

  it('chunkText prefers paragraph breaks when present', () => {
    const body = 'paragraph one\n\nparagraph two\n\nparagraph three'
    const out = chunkText(body, 20, 5)
    expect(out.some(p => p.startsWith('paragraph'))).toBe(true)
  })
})

describe('BM25Indexer', () => {
  it('indexes a source and reports chunk count', async () => {
    const { store, idx } = await setup()
    const r = await idx.index(
      await store.registerSource({
        slug: 'a', kind: 'fs.file', uri: '/x', title: 'A',
      }),
      'rotating refresh tokens prevent replay attacks at the session boundary',
    )
    expect(r.chunkCount).toBeGreaterThan(0)
    expect(idx.size()).toBeGreaterThan(0)
  })

  it('marks the source as indexed via the store', async () => {
    const { store, idx } = await setup()
    const src = await ingest(store, idx, 'docs/auth', 'argon2id hashes passwords')
    const after = await store.getSource(src.id)
    expect(after?.status).toBe('indexed')
    expect(after?.chunkCount).toBeGreaterThan(0)
    expect(after?.contentHash?.length).toBeGreaterThan(0)
  })

  it('empty query returns no hits', async () => {
    const { store, idx } = await setup()
    await ingest(store, idx, 'a', 'some content here')
    expect(idx.search('')).toEqual([])
  })

  it('finds chunks containing the query terms (TF/IDF ranking)', async () => {
    const { store, idx } = await setup()
    await ingest(store, idx, 'auth', 'argon2id hashes passwords; verify against the stored hash')
    await ingest(store, idx, 'misc', 'cooking recipes for dinner')
    const hits = idx.search('argon2id verify')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].chunk.text.toLowerCase()).toContain('argon2id')
  })

  it('hits are sorted by descending score', async () => {
    const { store, idx } = await setup()
    await ingest(store, idx, 'a', 'argon2id argon2id argon2id many references here')
    await ingest(store, idx, 'b', 'argon2id appears once in this text')
    const hits = idx.search('argon2id')
    expect(hits.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score)
    }
  })

  it('respects sourceIds filter', async () => {
    const { store, idx } = await setup()
    const a = await ingest(store, idx, 'a', 'argon2id hashes passwords here')
    await ingest(store, idx, 'b', 'argon2id is also mentioned here')
    const hits = idx.search('argon2id', { sourceIds: [a.id] })
    expect(hits.every(h => h.chunk.sourceId === a.id)).toBe(true)
  })

  it('respects minScore floor', async () => {
    const { store, idx } = await setup()
    await ingest(store, idx, 'a', 'argon2id strong hashing modern crypto choice')
    const high = idx.search('argon2id', { minScore: 100 })
    expect(high).toEqual([])
    const low = idx.search('argon2id', { minScore: 0 })
    expect(low.length).toBeGreaterThan(0)
  })

  it('respects limit', async () => {
    const { store, idx } = await setup()
    for (let i = 0; i < 5; i++) {
      await ingest(store, idx, `s${i}`, `argon2id and other crypto note ${i}`)
    }
    expect(idx.search('argon2id', { limit: 2 }).length).toBeLessThanOrEqual(2)
  })

  it('hits include a ProvenanceRef ready to cite', async () => {
    const { store, idx } = await setup()
    const src = await ingest(store, idx, 'a', 'argon2id hashes passwords')
    const hits = idx.search('argon2id')
    const ref = hits[0].ref
    expect(ref.sourceId).toBe(src.id)
    expect(ref.chunkId).toBe(hits[0].chunk.id)
    expect(typeof ref.hints?.snippet).toBe('string')
  })

  it('reindexing the same source replaces previous chunks', async () => {
    const { store, idx } = await setup()
    const src = await ingest(store, idx, 'a', 'first version about argon2id')
    const before = idx.size()
    await idx.index(src, 'second version mentions bcrypt instead')
    expect(idx.search('argon2id').length).toBe(0)
    expect(idx.search('bcrypt').length).toBeGreaterThan(0)
    expect(idx.size()).toBe(before) // same chunk count for same body length
  })

  it('removeSource drops chunks + postings', async () => {
    const { store, idx } = await setup()
    const src = await ingest(store, idx, 'a', 'argon2id mentioned once')
    expect(idx.search('argon2id').length).toBeGreaterThan(0)
    const dropped = await idx.removeSource(src.id)
    expect(dropped).toBeGreaterThan(0)
    expect(idx.search('argon2id')).toEqual([])
    expect(idx.size()).toBe(0)
    expect(idx.vocabularySize()).toBe(0)
  })

  it('vocabularySize reflects unique tokens across sources', async () => {
    const { store, idx } = await setup()
    await ingest(store, idx, 'a', 'argon2id passwords')
    await ingest(store, idx, 'b', 'bcrypt passwords')
    expect(idx.vocabularySize()).toBeGreaterThanOrEqual(3)
  })
})
