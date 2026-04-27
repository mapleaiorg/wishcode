/**
 * K-2 — Retrieval.
 *
 * Joins K-1 BM25 ranking with org-policy filters from the registry
 * (scope + status). The retrieval layer is the seam where C-4 (team
 * knowledge) and the agent runtime (A-2) meet — both call
 * `retrieve({ query, ... })` and consume `RetrievalResult`s without
 * caring about which sources were eligible.
 *
 * H-7 will plug per-org policy enforcement into the same call —
 * today the host passes an explicit allow-list / deny-list; later
 * the host wraps the same `retrieve` in a policy-aware adapter.
 */

import type { BM25Indexer, SearchHit } from './indexer.js'
import type { KnowledgeStore, KnowledgeScope, SourceFilter, SourceStatus } from './types.js'

export interface RetrievalRequest {
  query: string
  /** Limit the final result set. Default 20. */
  limit?: number
  /** Optional minimum BM25 score. Default 0. */
  minScore?: number
  /** Restrict to sources matching this scope. */
  scope?: KnowledgeScope
  /** Status filter; default `['indexed']`. */
  status?: SourceStatus[]
  /** Slug allow-list — when set, every other slug is dropped. */
  slugAllowList?: string[]
  /** Slug deny-list — sources matching are excluded post-resolve. */
  slugDenyList?: string[]
  /** Source-id allow-list (post-resolve). */
  sourceIdAllowList?: string[]
}

export interface RetrievalResult {
  hits: SearchHit[]
  /** Stats for the /retrieval sidebar. */
  stats: {
    totalIndexedSources: number
    eligibleSources: number
    indexHits: number
    droppedByScore: number
    droppedByPolicy: number
  }
}

export class Retriever {
  constructor(
    public readonly store: KnowledgeStore,
    public readonly indexer: BM25Indexer,
  ) {}

  async retrieve(req: RetrievalRequest): Promise<RetrievalResult> {
    const status = req.status ?? ['indexed']
    const filter: SourceFilter = {
      status,
      ...(req.scope ? { scope: req.scope } : {}),
    }
    const eligible = await this.store.listSources(filter)
    const allowSlugs = req.slugAllowList ? new Set(req.slugAllowList) : null
    const denySlugs = req.slugDenyList ? new Set(req.slugDenyList) : null
    const allowSourceIds = req.sourceIdAllowList ? new Set(req.sourceIdAllowList) : null

    const filtered = eligible.filter(s => {
      if (allowSlugs && !allowSlugs.has(s.slug)) return false
      if (denySlugs && denySlugs.has(s.slug)) return false
      if (allowSourceIds && !allowSourceIds.has(s.id)) return false
      return true
    })
    const sourceIds = filtered.map(s => s.id)

    const all = await this.store.listSources({ status })
    const indexHits = this.indexer.search(req.query, {
      limit: 1000,
      sourceIds: sourceIds,
      minScore: 0,
    })

    const minScore = req.minScore ?? 0
    let droppedByScore = 0
    const filteredByScore = indexHits.filter(h => {
      if (h.score < minScore) {
        droppedByScore++
        return false
      }
      return true
    })

    const limit = req.limit ?? 20
    const final = filteredByScore.slice(0, limit)

    return {
      hits: final,
      stats: {
        totalIndexedSources: all.length,
        eligibleSources: filtered.length,
        indexHits: indexHits.length,
        droppedByScore,
        droppedByPolicy: eligible.length - filtered.length,
      },
    }
  }
}
