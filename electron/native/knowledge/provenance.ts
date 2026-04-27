/**
 * K-3 — Provenance store.
 *
 * Records `ProvenanceRecord`s — every material agent action carries
 * a list of `ProvenanceRef`s pointing back at the knowledge sources
 * that informed it. K-3 persists those records (durable audit trail)
 * and surfaces them to the chat UI as citation chips.
 *
 * Records are append-only by design — a new revision of an action
 * issues a new record with a `parent` pointing at the prior one.
 * The store never mutates an existing record.
 *
 * The fs-backed implementation lands in K-3.1 once D-2 surfaces an
 * IPC handler. K-3 ships the contract + an in-memory ref store.
 */

import type { ProvenanceRef } from './types.js'

export type ProvenanceActionKind =
  | 'agent.message'
  | 'agent.tool_call'
  | 'file.write'
  | 'file.edit'
  | 'task.update'
  | 'deliverable.publish'
  | 'memory.put'
  | string

export interface ProvenanceRecord {
  id: string
  /** What action this record provenances. */
  actionKind: ProvenanceActionKind
  /** Stable id of the action being provenanced — `msg:<id>`,
   *  `tool:<id>`, `file:<workspace>:<rel>`, `task:<id>`. */
  actionId: string
  /** ISO-8601. */
  ts: string
  /** Author — `user`, `agent:<id>`, `cell:<id>`, `system`. */
  author: string
  /** The cited knowledge sources / chunks. May be empty. */
  refs: ProvenanceRef[]
  /** Free-form metadata; never PII. */
  metadata?: Record<string, unknown>
  /** Previous revision of this action's provenance, if any. */
  parent?: string
}

export interface NewProvenanceInput {
  actionKind: ProvenanceActionKind
  actionId: string
  author: string
  refs: ProvenanceRef[]
  metadata?: Record<string, unknown>
  parent?: string
}

export interface ProvenanceFilter {
  actionKind?: ProvenanceActionKind | ProvenanceActionKind[]
  actionId?: string
  author?: string
  /** Inclusive. */
  since?: string
  /** Exclusive. */
  until?: string
  limit?: number
}

export interface ProvenanceStore {
  record(input: NewProvenanceInput): Promise<ProvenanceRecord>
  get(id: string): Promise<ProvenanceRecord | null>
  list(filter?: ProvenanceFilter): Promise<ProvenanceRecord[]>
  /** Latest record for a given (actionKind, actionId) pair. */
  latest(actionKind: ProvenanceActionKind, actionId: string): Promise<ProvenanceRecord | null>
  /** Walk the parent chain newest-first. */
  history(id: string): Promise<ProvenanceRecord[]>
}

let nextSeq = 0
function newId(): string {
  return `prov_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

export class InMemoryProvenanceStore implements ProvenanceStore {
  private readonly records = new Map<string, ProvenanceRecord>()
  /** (actionKind, actionId) → latest record id. */
  private readonly latestByAction = new Map<string, string>()

  async record(input: NewProvenanceInput): Promise<ProvenanceRecord> {
    if (!input.actionId) throw new Error('ProvenanceStore: actionId is required')
    if (!input.author) throw new Error('ProvenanceStore: author is required')
    if (input.parent && !this.records.has(input.parent)) {
      throw new Error(`ProvenanceStore: parent not found: ${input.parent}`)
    }
    const rec: ProvenanceRecord = {
      id: newId(),
      ts: nowIso(),
      actionKind: input.actionKind,
      actionId: input.actionId,
      author: input.author,
      refs: input.refs.map(r => ({ ...r })),
      metadata: input.metadata,
      parent: input.parent,
    }
    this.records.set(rec.id, rec)
    this.latestByAction.set(actionKey(rec.actionKind, rec.actionId), rec.id)
    return clone(rec)
  }

  async get(id: string): Promise<ProvenanceRecord | null> {
    const r = this.records.get(id)
    return r ? clone(r) : null
  }

  async list(filter: ProvenanceFilter = {}): Promise<ProvenanceRecord[]> {
    const limit = Math.min(filter.limit ?? 100, 1000)
    const kinds = filter.actionKind
      ? Array.isArray(filter.actionKind)
        ? new Set(filter.actionKind)
        : new Set([filter.actionKind])
      : null
    const out: ProvenanceRecord[] = []
    for (const r of this.records.values()) {
      if (kinds && !kinds.has(r.actionKind)) continue
      if (filter.actionId && r.actionId !== filter.actionId) continue
      if (filter.author && r.author !== filter.author) continue
      if (filter.since && r.ts < filter.since) continue
      if (filter.until && r.ts >= filter.until) continue
      out.push(clone(r))
    }
    // Newest first.
    out.sort((a, b) => b.ts.localeCompare(a.ts))
    return out.slice(0, limit)
  }

  async latest(
    actionKind: ProvenanceActionKind,
    actionId: string,
  ): Promise<ProvenanceRecord | null> {
    const id = this.latestByAction.get(actionKey(actionKind, actionId))
    return id ? this.get(id) : null
  }

  async history(id: string): Promise<ProvenanceRecord[]> {
    const out: ProvenanceRecord[] = []
    let cur = this.records.get(id)
    while (cur) {
      out.push(clone(cur))
      cur = cur.parent ? this.records.get(cur.parent) : undefined
    }
    return out
  }
}

function actionKey(kind: ProvenanceActionKind, id: string): string {
  return `${kind}::${id}`
}

function clone(r: ProvenanceRecord): ProvenanceRecord {
  return { ...r, refs: r.refs.map(x => ({ ...x })) }
}
