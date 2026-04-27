/**
 * C-2 — CoAgent deliverables.
 *
 * Versioned `Deliverable` records bridged to the bus. Joins family
 * as `deliverable`. Each `publish()` mints a new version; `revise()`
 * supersedes the latest. `applyPeerEvents` mirrors peer publishes
 * (Hermon mirror seam).
 */

import type { CoAgentBus, CoAgentCore } from './bus.js'
import type {
  CoAgentEventKind,
  CoAgentMember,
  JoinResult,
} from './types.js'

export interface Deliverable {
  id: string
  taskId: string
  title: string
  /** Stable kind tag — `code.diff`, `markdown.report`, `data.csv`, …. */
  kind: string
  /** Version starts at 1; bumped on revise. */
  version: number
  /** Opaque payload — bytes, URI, structured doc; subscribers parse. */
  payload: unknown
  author: string
  createdAt: string
  /** Set when superseded. */
  supersededBy?: string
  /** Pointer to the prior version. */
  parent?: string
}

export interface PublishInput {
  taskId: string
  title: string
  kind: string
  payload?: unknown
  author: string
}

export interface ReviseInput {
  parentId: string
  title?: string
  payload?: unknown
  author: string
}

const SUBSCRIBES: CoAgentEventKind[] = ['deliverable.published', 'deliverable.revised']

export interface DeliverablesRuntimeOptions {
  applyPeerEvents?: boolean
}

let nextSeq = 0
function newId(): string {
  return `del_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

export class CoAgentDeliverables {
  private join: JoinResult | null = null
  private readonly bus: CoAgentBus
  private readonly applyPeer: boolean
  private readonly byId = new Map<string, Deliverable>()
  /** Latest version per (taskId, kind). */
  private readonly latestKey = new Map<string, string>()
  private peerCount = 0

  constructor(coreOrBus: CoAgentCore | CoAgentBus, opts: DeliverablesRuntimeOptions = {}) {
    this.bus = 'bus' in coreOrBus ? coreOrBus.bus : coreOrBus
    this.applyPeer = opts.applyPeerEvents ?? false
  }

  attach(): void {
    if (this.join) return
    const member: CoAgentMember = {
      role: 'deliverable',
      label: 'CoAgent deliverables',
      subscribes: SUBSCRIBES,
    }
    this.join = this.bus.join(member, ev => this.onEvent(ev))
  }

  detach(): void {
    if (!this.join) return
    this.join.leave()
    this.join = null
  }

  isAttached(): boolean { return !!this.join }
  peerEventsApplied(): number { return this.peerCount }

  publish(input: PublishInput): Deliverable {
    if (!input.taskId) throw new Error('Deliverables: taskId required')
    if (!input.title?.trim()) throw new Error('Deliverables: title required')
    const d: Deliverable = {
      id: newId(),
      taskId: input.taskId,
      title: input.title.trim(),
      kind: input.kind,
      version: 1,
      payload: input.payload ?? null,
      author: input.author,
      createdAt: new Date().toISOString(),
    }
    this.byId.set(d.id, d)
    this.latestKey.set(`${d.taskId}::${d.kind}`, d.id)
    this.publishEvent('deliverable.published', d)
    return clone(d)
  }

  revise(input: ReviseInput): Deliverable {
    const prev = this.byId.get(input.parentId)
    if (!prev) throw new Error(`Deliverables: parent not found: ${input.parentId}`)
    if (prev.supersededBy) {
      throw new Error(`Deliverables: parent ${input.parentId} already superseded`)
    }
    const next: Deliverable = {
      id: newId(),
      taskId: prev.taskId,
      title: input.title?.trim() ?? prev.title,
      kind: prev.kind,
      version: prev.version + 1,
      payload: input.payload === undefined ? prev.payload : input.payload,
      author: input.author,
      createdAt: new Date().toISOString(),
      parent: prev.id,
    }
    this.byId.set(next.id, next)
    this.byId.set(prev.id, { ...prev, supersededBy: next.id })
    this.latestKey.set(`${next.taskId}::${next.kind}`, next.id)
    this.publishEvent('deliverable.revised', next)
    return clone(next)
  }

  get(id: string): Deliverable | null {
    const d = this.byId.get(id)
    return d ? clone(d) : null
  }

  /** Latest non-superseded version per (taskId, kind). */
  latest(taskId: string, kind: string): Deliverable | null {
    const id = this.latestKey.get(`${taskId}::${kind}`)
    return id ? this.get(id) : null
  }

  listByTask(taskId: string): Deliverable[] {
    const out: Deliverable[] = []
    for (const d of this.byId.values()) {
      if (d.taskId === taskId) out.push(clone(d))
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return out
  }

  history(id: string): Deliverable[] {
    const out: Deliverable[] = []
    let cur = this.byId.get(id)
    while (cur) {
      out.push(clone(cur))
      cur = cur.parent ? this.byId.get(cur.parent) : undefined
    }
    return out
  }

  private publishEvent(kind: CoAgentEventKind, d: Deliverable): void {
    if (!this.join) return
    this.join.publish({
      kind,
      payload: { id: d.id, taskId: d.taskId, kind: d.kind, version: d.version, title: d.title },
    })
  }

  private onEvent(ev: { source: string; kind: CoAgentEventKind; payload: Record<string, unknown> }): void {
    if (!this.applyPeer) return
    if (ev.source === 'deliverable') return
    // Best-effort back-fill — full reconciliation in C-2.1.
    const p = ev.payload
    if (typeof p.id === 'string' && typeof p.taskId === 'string' && typeof p.kind === 'string'
        && typeof p.title === 'string' && typeof p.version === 'number') {
      const existing = this.byId.get(p.id)
      if (existing) return
      const d: Deliverable = {
        id: p.id, taskId: p.taskId, title: p.title, kind: p.kind,
        version: p.version, payload: null, author: 'peer:' + ev.source,
        createdAt: new Date().toISOString(),
      }
      this.byId.set(d.id, d)
      const key = `${d.taskId}::${d.kind}`
      const cur = this.latestKey.get(key)
      const curRec = cur ? this.byId.get(cur) : undefined
      if (!curRec || curRec.version < d.version) this.latestKey.set(key, d.id)
      this.peerCount++
    }
  }
}

function clone(d: Deliverable): Deliverable {
  return { ...d }
}
