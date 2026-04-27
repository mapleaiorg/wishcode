/**
 * Mem-0 — Multi-scope memory storage.
 *
 * Replaces the single-bag BM25 memory under `~/.wishcode/memory/` with
 * a scope-aware structured store. Every memory entry carries a
 * `MemoryScope` so retrieval at the agent boundary respects who-saw-
 * what, what-survives-restart, and what-may-not-leave-this-machine.
 *
 * The six scopes mirror the architecture vocabulary:
 *
 *   - personal   — survives forever; only this user; cross-workspace.
 *   - session    — alive for one chat; dies with the session.
 *   - workspace  — bound to the open workspace root; cross-session.
 *   - team       — synchronised through Hermon to org members.
 *   - task       — bound to a single Task (T-0); GC'd with the task.
 *   - agent      — internal scratch for the agent loop; never user-
 *                  facing unless explicitly surfaced.
 *
 * Mem-1 builds the context-assembly engine on top of these primitives;
 * Mem-2 plugs adapters for chat / code / agent surfaces.
 */

export type MemoryScope =
  | 'personal'
  | 'session'
  | 'workspace'
  | 'team'
  | 'task'
  | 'agent'

export const MEMORY_SCOPES: readonly MemoryScope[] = [
  'personal',
  'session',
  'workspace',
  'team',
  'task',
  'agent',
] as const

export interface MemoryProvenance {
  /** Where the memory came from. */
  origin: 'user' | 'agent' | 'tool' | 'sync'
  /**
   * Stable id of the producing surface — `chat:<sessionId>`,
   * `code:<file>`, `tool:<name>`, etc.
   */
  source?: string
  /** Optional reference into the knowledge graph (K-3 provenance). */
  knowledgeRef?: string
}

export interface MemoryEntry {
  id: string
  scope: MemoryScope
  /** Body — opaque to the storage layer; rendered by Mem-1 / Mem-2. */
  body: string
  /**
   * Tags supplied by callers. Storage is exact-match by tag; richer
   * retrieval lives in Mem-1 (BM25 + scope-aware filters).
   */
  tags: string[]
  /** Pinned entries are protected from automatic eviction. */
  pinned: boolean
  /**
   * Scope-binding ids. Required for non-personal scopes; ignored for
   * personal entries. Storage validates presence at insert time.
   */
  bindings: MemoryBindings
  /** Free-form structured metadata (workspaceId, agentRole, …). */
  metadata?: Record<string, unknown>
  /** Source attribution (Mem-1 surfaces this in cited replies). */
  provenance?: MemoryProvenance
  createdAt: string
  updatedAt: string
}

export interface MemoryBindings {
  workspaceId?: string
  sessionId?: string
  taskId?: string
  agentId?: string
  /** Hermon-side anchor id once `team`-scoped entries sync up. */
  teamId?: string
}

export interface NewMemoryEntry {
  scope: MemoryScope
  body: string
  tags?: string[]
  pinned?: boolean
  bindings?: MemoryBindings
  metadata?: Record<string, unknown>
  provenance?: MemoryProvenance
}

export interface MemoryQuery {
  scopes?: MemoryScope[]
  tags?: string[]
  bindings?: MemoryBindings
  /** Substring text-match against `body`; case-insensitive. */
  query?: string
  /** Default 50; max 500. */
  limit?: number
  pinnedOnly?: boolean
}

/**
 * Storage contract every concrete memory backend must satisfy. The
 * Electron main process wires a filesystem-backed implementation
 * (`FsMemoryStore`); tests use `InMemoryMemoryStore`.
 */
export interface MemoryStore {
  put(entry: NewMemoryEntry): Promise<MemoryEntry>
  get(id: string): Promise<MemoryEntry | null>
  update(id: string, patch: Partial<NewMemoryEntry>): Promise<MemoryEntry>
  remove(id: string): Promise<boolean>
  list(query?: MemoryQuery): Promise<MemoryEntry[]>
  /**
   * Drop every entry whose scope/binding tuple matches. Used when a
   * session ends, a task is GC'd, or a workspace is removed.
   */
  prune(scope: MemoryScope, bindings: MemoryBindings): Promise<number>
}
