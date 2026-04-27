/**
 * Cell-8 — Cell Forge local lifecycle.
 *
 * State machine for a draft Cell:
 *
 *   pattern  →  draft  →  candidate  →  approved  →  published
 *      └────────┴──────────┴──────────┴──→  rejected (terminal)
 *
 * Each transition emits a Tel-0 event. Approved Cells move to the
 * registry as `installed`; rejected drafts stay around for diagnosis
 * but do not appear in `installed`.
 */

import type { TelemetryEmitter } from '../telemetry/index.js'
import type { CellManifest } from './manifest.js'
import { parseManifest } from './manifest.js'
import type { CellRegistry } from './registry.js'
import { TrustVerifier } from './trust.js'

export type ForgeStage =
  | 'pattern' | 'draft' | 'candidate' | 'approved' | 'published' | 'rejected'

export interface ForgeRecord {
  id: string
  /** The manifest under construction; may be partial in `pattern`. */
  manifest: CellManifest | null
  /** Source pattern that suggested this Cell. Free-form. */
  pattern?: string
  stage: ForgeStage
  /** ISO-8601 of the latest transition. */
  updatedAt: string
  /** History of `(stage, ts, by)` transitions. */
  history: ForgeHistoryEntry[]
  /** Set when the verifier rejected the manifest. */
  reason?: string
}

export interface ForgeHistoryEntry {
  stage: ForgeStage
  ts: string
  by: string
}

const TRANSITIONS: Record<ForgeStage, ForgeStage[]> = {
  pattern: ['draft', 'rejected'],
  draft: ['candidate', 'rejected'],
  candidate: ['approved', 'rejected'],
  approved: ['published', 'rejected'],
  published: [],
  rejected: [],
}

export interface ForgeOptions {
  registry: CellRegistry
  trust?: TrustVerifier
  telemetry?: TelemetryEmitter
}

let nextSeq = 0
function newId(): string {
  return `forge_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

export class CellForge {
  private readonly records = new Map<string, ForgeRecord>()
  private readonly registry: CellRegistry
  private readonly trust?: TrustVerifier
  private readonly telemetry?: TelemetryEmitter

  constructor(opts: ForgeOptions) {
    this.registry = opts.registry
    this.trust = opts.trust
    this.telemetry = opts.telemetry
  }

  /** Open a fresh forge record at the `pattern` stage. */
  observePattern(pattern: string, by = 'system'): ForgeRecord {
    const r: ForgeRecord = {
      id: newId(),
      manifest: null,
      pattern,
      stage: 'pattern',
      updatedAt: nowIso(),
      history: [{ stage: 'pattern', ts: nowIso(), by }],
    }
    this.records.set(r.id, r)
    this.emit('forge.pattern.observed', { id: r.id, by })
    return clone(r)
  }

  /** Promote a pattern to a draft, attaching a (possibly partial) manifest. */
  promoteToDraft(id: string, manifest: CellManifest, by = 'agent'): ForgeRecord {
    return this.transition(id, 'draft', by, r => { r.manifest = manifest })
  }

  /** Promote a draft to a candidate. Re-validates the manifest. */
  promoteToCandidate(id: string, by = 'agent'): ForgeRecord {
    const r = this.requireRecord(id)
    if (!r.manifest) throw new Error('Forge: draft has no manifest yet')
    const parsed = parseManifest(r.manifest)
    if (!parsed.ok) {
      const reason = parsed.errors.map(e => `${e.path}:${e.message}`).join('; ')
      return this.transition(id, 'rejected', by, x => { x.reason = reason })
    }
    return this.transition(id, 'candidate', by)
  }

  /** Approve a candidate. Calls the trust verifier when configured. */
  async approve(id: string, by = 'reviewer', bundleBytes?: Uint8Array): Promise<ForgeRecord> {
    const r = this.requireRecord(id)
    if (!r.manifest) throw new Error('Forge: cannot approve without a manifest')
    if (this.trust) {
      const verdict = await this.trust.verify(r.manifest, bundleBytes)
      if (!verdict.ok) {
        return this.transition(id, 'rejected', by, x => {
          x.reason = `${verdict.reason}${verdict.detail ? ': ' + verdict.detail : ''}`
        })
      }
    }
    return this.transition(id, 'approved', by)
  }

  /** Publish an approved Cell — adds it to the registry as `installed`. */
  async publish(id: string, by = 'reviewer'): Promise<ForgeRecord> {
    const r = this.requireRecord(id)
    if (r.stage !== 'approved') {
      throw new Error(`Forge: cannot publish from stage ${r.stage}`)
    }
    if (!r.manifest) throw new Error('Forge: cannot publish without a manifest')
    await this.registry.add({ manifest: r.manifest, status: 'installed' })
    return this.transition(id, 'published', by)
  }

  reject(id: string, reason: string, by = 'reviewer'): ForgeRecord {
    return this.transition(id, 'rejected', by, x => { x.reason = reason })
  }

  get(id: string): ForgeRecord | null {
    const r = this.records.get(id)
    return r ? clone(r) : null
  }

  list(filter: { stage?: ForgeStage } = {}): ForgeRecord[] {
    const out: ForgeRecord[] = []
    for (const r of this.records.values()) {
      if (filter.stage && r.stage !== filter.stage) continue
      out.push(clone(r))
    }
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return out
  }

  // ── internals ───────────────────────────────────────────────────

  private transition(
    id: string,
    next: ForgeStage,
    by: string,
    mutate?: (r: ForgeRecord) => void,
  ): ForgeRecord {
    const r = this.requireRecord(id)
    if (!TRANSITIONS[r.stage].includes(next)) {
      throw new Error(`Forge: illegal transition ${r.stage} → ${next}`)
    }
    if (mutate) mutate(r)
    r.stage = next
    r.updatedAt = nowIso()
    r.history.push({ stage: next, ts: r.updatedAt, by })
    this.emit(`forge.${next}`, { id, by })
    return clone(r)
  }

  private requireRecord(id: string): ForgeRecord {
    const r = this.records.get(id)
    if (!r) throw new Error(`Forge: not found: ${id}`)
    return r
  }

  private emit(type: string, attributes: Record<string, string>): void {
    this.telemetry?.emit({ type, level: 'info', attributes })
  }
}

function clone(r: ForgeRecord): ForgeRecord {
  return {
    ...r,
    manifest: r.manifest,
    history: r.history.map(h => ({ ...h })),
  }
}
