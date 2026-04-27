/**
 * K-0 — Knowledge registry types.
 *
 * The knowledge subsystem is what lifts Wish Code above bolt-on RAG:
 * every retrievable artifact (a markdown doc, an indexed git tree, a
 * connector slice) registers as a `KnowledgeSource` here. K-1 (indexer)
 * walks each source into BM25 + vector indexes; K-2 (retrieval) reads
 * those indexes; K-3 (provenance) attaches `ProvenanceRef`s to every
 * material agent action so the UI can cite sources.
 *
 * K-0 ships only the registry + provenance shape + the `KnowledgeStore`
 * contract. The indexer and retrieval layers add their own modules.
 *
 * Lives at `electron/native/knowledge/`. Consumers above this seam
 * import from `index.ts` only.
 */

/** Where a knowledge artifact comes from. */
export type SourceKind =
  /** A directory in the local workspace (markdown, code, …). */
  | 'fs.directory'
  /** A single file. */
  | 'fs.file'
  /** A git ref or commit range. */
  | 'git.ref'
  /** A connector slice (Jira project, GitHub repo, Slack channel). */
  | 'connector'
  /** An inline blob the user pasted at runtime. */
  | 'inline'
  /** A URL fetched on demand. */
  | 'url'

/** Indexing lifecycle. */
export type SourceStatus =
  | 'unindexed'
  | 'indexing'
  | 'indexed'
  | 'errored'
  | 'disabled'

/** What kinds of retrieval the source supports — set by the indexer. */
export interface SourceCapabilities {
  bm25: boolean
  vector: boolean
  /** Indexer can return a stable hash for change-detection. */
  hashable: boolean
}

/**
 * Scope binding controls who-may-read. Mirrors `MemoryBindings` so the
 * agent runtime can use the same filters for both subsystems.
 */
export interface KnowledgeScope {
  workspaceId?: string
  /** Org-scoped sync once K-3 + Hermon connect. */
  teamId?: string
  /** Personal-only sources never sync to Hermon. */
  personal?: boolean
}

export interface KnowledgeSource {
  id: string
  /** Stable, human-friendly identifier (e.g. "docs/handbook"). */
  slug: string
  kind: SourceKind
  /** Backend location. The indexer interprets this per-kind. */
  uri: string
  scope: KnowledgeScope
  capabilities: SourceCapabilities
  status: SourceStatus
  /** Human-readable title; what the UI shows in citation chips. */
  title: string
  /** Optional one-line description; ≤ 280 chars. */
  description?: string
  /** Last-known content hash; bumped by the indexer on change. */
  contentHash?: string
  /** Number of indexable chunks the indexer last produced. */
  chunkCount?: number
  /** ISO-8601 timestamps. */
  createdAt: string
  updatedAt: string
  lastIndexedAt?: string
  /** Set on `errored`. */
  error?: { code: string; message: string }
  metadata?: Record<string, unknown>
}

export interface NewSourceInput {
  slug: string
  kind: SourceKind
  uri: string
  scope?: KnowledgeScope
  title: string
  description?: string
  capabilities?: Partial<SourceCapabilities>
  metadata?: Record<string, unknown>
}

export interface SourceFilter {
  scope?: KnowledgeScope
  kinds?: SourceKind[]
  status?: SourceStatus[]
  /** Substring search on slug + title; case-insensitive. */
  query?: string
  limit?: number
}

/**
 * Reference into a knowledge source — emitted on every material agent
 * action (file write, tool result, model answer). K-3 persists these
 * alongside the action; the UI surfaces them as citation chips.
 */
export interface ProvenanceRef {
  sourceId: string
  /** Stable chunk id from the indexer. Empty when the whole source is the citation. */
  chunkId?: string
  /** Optional slice into the chunk content (line range, byte offsets). */
  span?: { from: number; to: number }
  /** Score from K-2 retrieval, if known. */
  score?: number
  /** Free-form indexer metadata (snippet, headings, …) — never PII. */
  hints?: Record<string, unknown>
}

/**
 * Storage contract. K-1 reads sources to schedule indexing; K-2 reads
 * sources to filter retrieval by scope; the IPC handler reads sources
 * to build the settings UI. The fs-backed implementation lives at
 * `electron/native/knowledge/fs-store.ts` once K-0.1 lands.
 */
export interface KnowledgeStore {
  registerSource(input: NewSourceInput): Promise<KnowledgeSource>
  getSource(id: string): Promise<KnowledgeSource | null>
  getBySlug(slug: string): Promise<KnowledgeSource | null>
  listSources(filter?: SourceFilter): Promise<KnowledgeSource[]>
  updateSource(
    id: string,
    patch: Partial<KnowledgeSource>,
  ): Promise<KnowledgeSource>
  removeSource(id: string): Promise<boolean>

  /** Indexer hooks. */
  markIndexing(id: string): Promise<KnowledgeSource>
  markIndexed(
    id: string,
    info: { chunkCount: number; contentHash?: string },
  ): Promise<KnowledgeSource>
  markErrored(
    id: string,
    error: { code: string; message: string },
  ): Promise<KnowledgeSource>
}

export const DEFAULT_CAPABILITIES: SourceCapabilities = {
  bm25: true,
  vector: false,
  hashable: false,
}
