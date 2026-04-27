/**
 * K-1 — Knowledge indexer.
 *
 * Pure-TS BM25 indexer that walks a `KnowledgeSource`'s content into
 * chunks, builds an inverted index, and answers ranked queries
 * scoped by source. Real wishd-index-backed (tantivy) indexing
 * lands in K-1.1 once W-5 ships; K-1 keeps the chunking + scoring
 * logic the rest of the stack depends on.
 *
 * Lifecycle:
 *   indexer.index(source, content)   — produces chunks + updates store status
 *   indexer.search(query, opts)      — BM25-ranked across indexed sources
 *   indexer.removeSource(sourceId)   — drops chunks + entries
 */

import type {
  KnowledgeSource,
  KnowledgeStore,
  ProvenanceRef,
  SourceFilter,
} from './types.js'

export interface Chunk {
  id: string
  sourceId: string
  /** Workspace-relative or in-source id (e.g. heading slug, file path). */
  uri: string
  /** Up to ~500 chars of body. */
  text: string
  /** Tokenized + lowercased + stop-worded. */
  tokens: string[]
  /** Precomputed term frequency map. */
  tf: Map<string, number>
}

export interface SearchHit {
  chunk: Chunk
  score: number
  /** Provenance ref ready to attach via Cell-3 SDK / K-3. */
  ref: ProvenanceRef
}

export interface SearchOptions {
  limit?: number
  /** Restrict search to these source ids; default = all indexed. */
  sourceIds?: string[]
  /** Restrict by source filter via the registry. */
  sourceFilter?: SourceFilter
  /** Optional minimum score; chunks below are dropped. Default 0. */
  minScore?: number
}

export interface IndexerOptions {
  /** Chunk target size in chars. Default 500. */
  chunkChars?: number
  /** Soft overlap between adjacent chunks. Default 80. */
  overlapChars?: number
  /** BM25 k1 parameter. Default 1.5. */
  k1?: number
  /** BM25 b parameter. Default 0.75. */
  b?: number
}

const DEFAULT_STOP = new Set([
  'a', 'an', 'and', 'or', 'but', 'if', 'when', 'where', 'how', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'for', 'with', 'this',
  'that', 'these', 'those', 'it', 'its', 'as', 'at', 'by', 'the',
  'from', 'into', 'about',
])

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !DEFAULT_STOP.has(t))
}

function makeChunkId(sourceId: string, idx: number): string {
  return `${sourceId}::c${idx.toString(36)}`
}

function tfMap(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

export class BM25Indexer {
  private readonly chunks = new Map<string, Chunk>()
  /** sourceId → chunk ids */
  private readonly bySource = new Map<string, Set<string>>()
  /** token → set of chunk ids that contain it (df source). */
  private readonly postings = new Map<string, Set<string>>()
  /** Aggregate stats. */
  private avgdl = 0
  private totalDl = 0
  private readonly opts: Required<IndexerOptions>

  constructor(
    public readonly store: KnowledgeStore,
    opts: IndexerOptions = {},
  ) {
    this.opts = {
      chunkChars: opts.chunkChars ?? 500,
      overlapChars: opts.overlapChars ?? 80,
      k1: opts.k1 ?? 1.5,
      b: opts.b ?? 0.75,
    }
  }

  /** Index (or re-index) a single source's content. */
  async index(source: KnowledgeSource, content: string): Promise<{ chunkCount: number }> {
    await this.removeSource(source.id)
    await this.store.markIndexing(source.id)

    const pieces = chunkText(content, this.opts.chunkChars, this.opts.overlapChars)
    const chunkIds = new Set<string>()
    let dlSum = 0

    pieces.forEach((text, i) => {
      const tokens = tokenize(text)
      const id = makeChunkId(source.id, i)
      const chunk: Chunk = {
        id, sourceId: source.id,
        uri: source.uri,
        text,
        tokens,
        tf: tfMap(tokens),
      }
      this.chunks.set(id, chunk)
      chunkIds.add(id)
      dlSum += tokens.length

      for (const t of new Set(tokens)) {
        let bucket = this.postings.get(t)
        if (!bucket) {
          bucket = new Set()
          this.postings.set(t, bucket)
        }
        bucket.add(id)
      }
    })

    this.bySource.set(source.id, chunkIds)
    this.totalDl += dlSum
    this.recomputeAvgdl()

    const contentHash = await sha256OfText(content)
    await this.store.markIndexed(source.id, { chunkCount: pieces.length, contentHash })
    return { chunkCount: pieces.length }
  }

  async removeSource(sourceId: string): Promise<number> {
    const ids = this.bySource.get(sourceId)
    if (!ids) return 0
    let dropped = 0
    for (const id of ids) {
      const c = this.chunks.get(id)
      if (!c) continue
      // Drop from postings.
      for (const t of new Set(c.tokens)) {
        const bucket = this.postings.get(t)
        if (bucket) {
          bucket.delete(id)
          if (bucket.size === 0) this.postings.delete(t)
        }
      }
      this.totalDl -= c.tokens.length
      this.chunks.delete(id)
      dropped++
    }
    this.bySource.delete(sourceId)
    this.recomputeAvgdl()
    return dropped
  }

  search(query: string, opts: SearchOptions = {}): SearchHit[] {
    const tokens = tokenize(query)
    if (tokens.length === 0) return []
    const limit = opts.limit ?? 20
    const minScore = opts.minScore ?? 0
    const allowed = opts.sourceIds ? new Set(opts.sourceIds) : null

    const scores = new Map<string, number>()
    const N = this.chunks.size || 1
    const { k1, b } = this.opts

    for (const t of tokens) {
      const bucket = this.postings.get(t)
      if (!bucket) continue
      const df = bucket.size
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      for (const id of bucket) {
        const c = this.chunks.get(id)
        if (!c) continue
        if (allowed && !allowed.has(c.sourceId)) continue
        const tf = c.tf.get(t) ?? 0
        const dl = c.tokens.length || 1
        const denom = tf + k1 * (1 - b + b * (dl / Math.max(1, this.avgdl || 1)))
        const term = idf * ((tf * (k1 + 1)) / Math.max(0.0001, denom))
        scores.set(id, (scores.get(id) ?? 0) + term)
      }
    }

    const hits: SearchHit[] = []
    for (const [id, score] of scores) {
      if (score < minScore) continue
      const c = this.chunks.get(id)!
      hits.push({
        chunk: c,
        score,
        ref: {
          sourceId: c.sourceId,
          chunkId: c.id,
          score,
          hints: { uri: c.uri, snippet: c.text.slice(0, 200) },
        },
      })
    }
    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, limit)
  }

  /** Diagnostic: how many chunks does the indexer hold? */
  size(): number {
    return this.chunks.size
  }

  vocabularySize(): number {
    return this.postings.size
  }

  private recomputeAvgdl(): void {
    const n = this.chunks.size
    this.avgdl = n === 0 ? 0 : this.totalDl / n
  }
}

/**
 * Chunk a body into roughly `chunkChars` pieces with `overlapChars`
 * of soft overlap. We try to break on paragraph then sentence
 * boundaries; long unbroken text falls back to a hard window.
 */
export function chunkText(content: string, chunkChars: number, overlapChars: number): string[] {
  const text = content.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(text.length, i + chunkChars)
    let cut = end
    if (end < text.length) {
      // Prefer a paragraph break, then a sentence end, then a space.
      const window = text.slice(i, end + Math.min(80, text.length - end))
      const para = window.lastIndexOf('\n\n')
      const sent = window.lastIndexOf('. ')
      const sp = window.lastIndexOf(' ')
      const candidate = para >= chunkChars * 0.5 ? para
                      : sent >= chunkChars * 0.5 ? sent + 1
                      : sp >= chunkChars * 0.5 ? sp
                      : -1
      if (candidate > 0) cut = i + candidate
    }
    const piece = text.slice(i, cut).trim()
    if (piece) out.push(piece)
    if (cut >= text.length) break
    i = Math.max(cut - overlapChars, cut - 0)
  }
  return out
}

async function sha256OfText(s: string): Promise<string> {
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    const buf = new TextEncoder().encode(s)
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback for environments without WebCrypto — non-cryptographic
  // FNV-1a 64 → hex (only used in tests; production hosts always
  // have WebCrypto via the Electron renderer / node ≥ 19).
  let h1 = 0xdeadbeef ^ 0
  let h2 = 0x41c6ce57 ^ 0
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  return [h1 >>> 0, h2 >>> 0].map(n => n.toString(16).padStart(8, '0')).join('').padEnd(64, '0')
}
