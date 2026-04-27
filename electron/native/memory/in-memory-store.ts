/**
 * In-memory memory store. Reference implementation used by tests +
 * the agent runtime's `agent` scope (which never persists). The
 * filesystem-backed equivalent lands in Mem-0.1 alongside the JSONL
 * write path under `~/.wishcode/memory/<scope>/<id>.json`.
 */

import type {
  MemoryBindings,
  MemoryEntry,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
  NewMemoryEntry,
} from './types.js'
import { MEMORY_SCOPES } from './types.js'

const SCOPE_REQUIRES: Record<MemoryScope, (keyof MemoryBindings)[]> = {
  personal: [],
  session: ['sessionId'],
  workspace: ['workspaceId'],
  team: ['teamId'],
  task: ['taskId'],
  agent: ['agentId'],
}

function assertBindings(scope: MemoryScope, bindings: MemoryBindings | undefined): void {
  for (const key of SCOPE_REQUIRES[scope]) {
    if (!bindings || typeof bindings[key] !== 'string' || (bindings[key] as string).length === 0) {
      throw new Error(
        `MemoryStore: scope "${scope}" requires bindings.${key}`,
      )
    }
  }
}

function newId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function bindingsMatch(entry: MemoryBindings, query: MemoryBindings): boolean {
  // Lenient match: a binding key only filters when the entry actually
  // carries that binding. This lets cross-scope queries (e.g. chat
  // pulls personal + session) return personal entries without
  // requiring them to declare a `sessionId`.
  for (const key of Object.keys(query) as (keyof MemoryBindings)[]) {
    const want = query[key]
    if (want === undefined) continue
    const have = entry[key]
    if (have === undefined) continue
    if (have !== want) return false
  }
  return true
}

function tagsMatch(entryTags: string[], wantTags: string[]): boolean {
  if (wantTags.length === 0) return true
  return wantTags.every(t => entryTags.includes(t))
}

function bodyMatch(body: string, q: string | undefined): boolean {
  if (!q) return true
  return body.toLowerCase().includes(q.toLowerCase())
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly entries = new Map<string, MemoryEntry>()
  /** Insert order — used as tie-break when entries land in the same ms. */
  private readonly seq = new Map<string, number>()
  private nextSeq = 0

  async put(entry: NewMemoryEntry): Promise<MemoryEntry> {
    if (!MEMORY_SCOPES.includes(entry.scope)) {
      throw new Error(`MemoryStore: unknown scope "${entry.scope}"`)
    }
    if (typeof entry.body !== 'string' || entry.body.length === 0) {
      throw new Error('MemoryStore: body is required')
    }
    assertBindings(entry.scope, entry.bindings)

    const now = nowIso()
    const full: MemoryEntry = {
      id: newId(),
      scope: entry.scope,
      body: entry.body,
      tags: entry.tags ?? [],
      pinned: entry.pinned ?? false,
      bindings: entry.bindings ?? {},
      metadata: entry.metadata,
      provenance: entry.provenance,
      createdAt: now,
      updatedAt: now,
    }
    this.entries.set(full.id, full)
    this.seq.set(full.id, this.nextSeq++)
    return { ...full, tags: [...full.tags] }
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const e = this.entries.get(id)
    return e ? { ...e, tags: [...e.tags] } : null
  }

  async update(id: string, patch: Partial<NewMemoryEntry>): Promise<MemoryEntry> {
    const cur = this.entries.get(id)
    if (!cur) throw new Error(`MemoryStore: not found: ${id}`)
    if (patch.scope && patch.scope !== cur.scope) {
      throw new Error(
        `MemoryStore: cannot change scope (${cur.scope} → ${patch.scope}); remove + re-put instead`,
      )
    }
    if (patch.bindings) {
      assertBindings(cur.scope, { ...cur.bindings, ...patch.bindings })
    }
    const next: MemoryEntry = {
      ...cur,
      body: patch.body ?? cur.body,
      tags: patch.tags ?? cur.tags,
      pinned: patch.pinned ?? cur.pinned,
      bindings: { ...cur.bindings, ...(patch.bindings ?? {}) },
      metadata: patch.metadata ?? cur.metadata,
      provenance: patch.provenance ?? cur.provenance,
      updatedAt: nowIso(),
    }
    this.entries.set(id, next)
    return { ...next, tags: [...next.tags] }
  }

  async remove(id: string): Promise<boolean> {
    this.seq.delete(id)
    return this.entries.delete(id)
  }

  async list(query: MemoryQuery = {}): Promise<MemoryEntry[]> {
    const limit = Math.min(query.limit ?? 50, 500)
    const scopes = query.scopes ?? MEMORY_SCOPES
    const out: MemoryEntry[] = []
    for (const e of this.entries.values()) {
      if (!scopes.includes(e.scope)) continue
      if (query.bindings && !bindingsMatch(e.bindings, query.bindings)) continue
      if (query.tags && !tagsMatch(e.tags, query.tags)) continue
      if (!bodyMatch(e.body, query.query)) continue
      if (query.pinnedOnly && !e.pinned) continue
      out.push({ ...e, tags: [...e.tags] })
    }
    // newest first; use insert order as tie-break for same-ms entries.
    out.sort((a, b) => {
      const c = b.createdAt.localeCompare(a.createdAt)
      if (c !== 0) return c
      return (this.seq.get(b.id) ?? 0) - (this.seq.get(a.id) ?? 0)
    })
    return out.slice(0, limit)
  }

  async prune(scope: MemoryScope, bindings: MemoryBindings): Promise<number> {
    let dropped = 0
    for (const [id, e] of this.entries) {
      if (e.scope !== scope) continue
      if (!bindingsMatch(e.bindings, bindings)) continue
      this.entries.delete(id)
      this.seq.delete(id)
      dropped++
    }
    return dropped
  }
}
