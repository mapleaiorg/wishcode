/**
 * Reference in-memory implementation of `KnowledgeStore`. K-0.1 swaps
 * in an fs-backed equivalent under `~/.wishcode/knowledge/sources.json`
 * and per-source content hash files; the contract is identical.
 */

import type {
  KnowledgeScope,
  KnowledgeSource,
  KnowledgeStore,
  NewSourceInput,
  SourceCapabilities,
  SourceFilter,
} from './types.js'
import { DEFAULT_CAPABILITIES } from './types.js'

function nowIso(): string {
  return new Date().toISOString()
}

let nextSeq = 0
function newId(): string {
  return `src_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9_./-]*[a-z0-9])?$/

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `KnowledgeStore: invalid slug "${slug}" — lowercase alnum + ./_-/`,
    )
  }
}

function scopeMatch(entry: KnowledgeScope, want: KnowledgeScope): boolean {
  if (want.workspaceId !== undefined && entry.workspaceId !== want.workspaceId) {
    return false
  }
  if (want.teamId !== undefined && entry.teamId !== want.teamId) return false
  if (want.personal !== undefined && entry.personal !== want.personal) {
    return false
  }
  return true
}

function withCapabilities(p: Partial<SourceCapabilities> | undefined): SourceCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...(p ?? {}) }
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly sources = new Map<string, KnowledgeSource>()
  private readonly slugIndex = new Map<string, string>()

  async registerSource(input: NewSourceInput): Promise<KnowledgeSource> {
    if (!input.title?.trim()) throw new Error('KnowledgeStore: title is required')
    if (!input.uri?.trim()) throw new Error('KnowledgeStore: uri is required')
    validateSlug(input.slug)
    if (this.slugIndex.has(input.slug)) {
      throw new Error(`KnowledgeStore: duplicate slug "${input.slug}"`)
    }

    const now = nowIso()
    const src: KnowledgeSource = {
      id: newId(),
      slug: input.slug,
      kind: input.kind,
      uri: input.uri,
      scope: input.scope ?? { personal: true },
      capabilities: withCapabilities(input.capabilities),
      status: 'unindexed',
      title: input.title.trim(),
      description: input.description?.trim(),
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    }
    this.sources.set(src.id, src)
    this.slugIndex.set(src.slug, src.id)
    return { ...src }
  }

  async getSource(id: string): Promise<KnowledgeSource | null> {
    const s = this.sources.get(id)
    return s ? { ...s } : null
  }

  async getBySlug(slug: string): Promise<KnowledgeSource | null> {
    const id = this.slugIndex.get(slug)
    return id ? this.getSource(id) : null
  }

  async listSources(filter: SourceFilter = {}): Promise<KnowledgeSource[]> {
    const limit = Math.min(filter.limit ?? 100, 1000)
    const q = filter.query?.toLowerCase()
    const out: KnowledgeSource[] = []
    for (const s of this.sources.values()) {
      if (filter.kinds && !filter.kinds.includes(s.kind)) continue
      if (filter.status && !filter.status.includes(s.status)) continue
      if (filter.scope && !scopeMatch(s.scope, filter.scope)) continue
      if (q) {
        const hay = `${s.slug} ${s.title}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      out.push({ ...s })
    }
    out.sort((a, b) => a.slug.localeCompare(b.slug))
    return out.slice(0, limit)
  }

  async updateSource(
    id: string,
    patch: Partial<KnowledgeSource>,
  ): Promise<KnowledgeSource> {
    const cur = this.sources.get(id)
    if (!cur) throw new Error(`KnowledgeStore: not found: ${id}`)
    if (patch.slug && patch.slug !== cur.slug) {
      validateSlug(patch.slug)
      if (this.slugIndex.has(patch.slug)) {
        throw new Error(`KnowledgeStore: duplicate slug "${patch.slug}"`)
      }
      this.slugIndex.delete(cur.slug)
      this.slugIndex.set(patch.slug, id)
    }
    const next: KnowledgeSource = {
      ...cur,
      ...patch,
      id: cur.id, // immutable
      createdAt: cur.createdAt, // immutable
      updatedAt: nowIso(),
    }
    this.sources.set(id, next)
    return { ...next }
  }

  async removeSource(id: string): Promise<boolean> {
    const cur = this.sources.get(id)
    if (!cur) return false
    this.sources.delete(id)
    this.slugIndex.delete(cur.slug)
    return true
  }

  async markIndexing(id: string): Promise<KnowledgeSource> {
    return this.updateSource(id, { status: 'indexing', error: undefined })
  }

  async markIndexed(
    id: string,
    info: { chunkCount: number; contentHash?: string },
  ): Promise<KnowledgeSource> {
    return this.updateSource(id, {
      status: 'indexed',
      chunkCount: info.chunkCount,
      contentHash: info.contentHash,
      lastIndexedAt: nowIso(),
      error: undefined,
    })
  }

  async markErrored(
    id: string,
    error: { code: string; message: string },
  ): Promise<KnowledgeSource> {
    return this.updateSource(id, { status: 'errored', error })
  }
}
