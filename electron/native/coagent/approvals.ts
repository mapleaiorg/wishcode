/**
 * C-3 — CoAgent approvals.
 *
 * Tracks approval requests inside the family. `request()` opens a
 * pending approval; `grant()` / `deny()` resolve it. All three
 * publish to the bus.
 */

import type { CoAgentBus, CoAgentCore } from './bus.js'
import type {
  CoAgentEventKind,
  CoAgentMember,
  JoinResult,
} from './types.js'

export type ApprovalStatus = 'pending' | 'granted' | 'denied' | 'cancelled'

export interface Approval {
  id: string
  /** What's being approved — `task.complete`, `deliverable.publish`, …. */
  topic: string
  /** Human-readable reason / payload. */
  summary: string
  /** Requester subject id (`session:…`, `agent:…`, `cell:…`). */
  requestedBy: string
  status: ApprovalStatus
  /** Set on grant/deny. */
  decidedBy?: string
  /** Free-form payload — never PII. */
  metadata?: Record<string, unknown>
  /** Reason for deny. */
  reason?: string
  createdAt: string
  decidedAt?: string
}

const SUBSCRIBES: CoAgentEventKind[] = [
  'approval.requested', 'approval.granted', 'approval.denied',
]

export interface ApprovalsRuntimeOptions {
  applyPeerEvents?: boolean
}

let nextSeq = 0
function newId(): string {
  return `app_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

export class CoAgentApprovals {
  private join: JoinResult | null = null
  private readonly bus: CoAgentBus
  private readonly applyPeer: boolean
  private readonly byId = new Map<string, Approval>()
  private peerCount = 0

  constructor(coreOrBus: CoAgentCore | CoAgentBus, opts: ApprovalsRuntimeOptions = {}) {
    this.bus = 'bus' in coreOrBus ? coreOrBus.bus : coreOrBus
    this.applyPeer = opts.applyPeerEvents ?? false
  }

  attach(): void {
    if (this.join) return
    const member: CoAgentMember = {
      role: 'approval', label: 'CoAgent approvals', subscribes: SUBSCRIBES,
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

  request(input: {
    topic: string; summary: string; requestedBy: string; metadata?: Record<string, unknown>
  }): Approval {
    if (!input.topic) throw new Error('Approvals: topic required')
    if (!input.requestedBy) throw new Error('Approvals: requestedBy required')
    const a: Approval = {
      id: newId(),
      topic: input.topic,
      summary: input.summary,
      requestedBy: input.requestedBy,
      status: 'pending',
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    }
    this.byId.set(a.id, a)
    this.publishEvent('approval.requested', a)
    return clone(a)
  }

  grant(id: string, decidedBy: string): Approval {
    return this.decide(id, 'granted', decidedBy, 'approval.granted')
  }

  deny(id: string, decidedBy: string, reason?: string): Approval {
    return this.decide(id, 'denied', decidedBy, 'approval.denied', reason)
  }

  cancel(id: string): Approval {
    const cur = this.byId.get(id)
    if (!cur) throw new Error(`Approvals: not found: ${id}`)
    if (cur.status !== 'pending') {
      throw new Error(`Approvals: cannot cancel ${cur.status}`)
    }
    const next: Approval = {
      ...cur, status: 'cancelled', decidedAt: new Date().toISOString(),
    }
    this.byId.set(id, next)
    return clone(next)
  }

  get(id: string): Approval | null {
    const a = this.byId.get(id)
    return a ? clone(a) : null
  }

  list(filter: { status?: ApprovalStatus; topic?: string } = {}): Approval[] {
    const out: Approval[] = []
    for (const a of this.byId.values()) {
      if (filter.status && a.status !== filter.status) continue
      if (filter.topic && a.topic !== filter.topic) continue
      out.push(clone(a))
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return out
  }

  private decide(
    id: string,
    status: ApprovalStatus,
    decidedBy: string,
    eventKind: CoAgentEventKind,
    reason?: string,
  ): Approval {
    const cur = this.byId.get(id)
    if (!cur) throw new Error(`Approvals: not found: ${id}`)
    if (cur.status !== 'pending') {
      throw new Error(`Approvals: already ${cur.status}`)
    }
    const next: Approval = {
      ...cur,
      status,
      decidedBy,
      decidedAt: new Date().toISOString(),
      reason: reason ?? cur.reason,
    }
    this.byId.set(id, next)
    this.publishEvent(eventKind, next)
    return clone(next)
  }

  private publishEvent(kind: CoAgentEventKind, a: Approval): void {
    if (!this.join) return
    this.join.publish({
      kind,
      payload: { id: a.id, topic: a.topic, status: a.status },
    })
  }

  private onEvent(ev: { source: string; kind: CoAgentEventKind; payload: Record<string, unknown> }): void {
    if (!this.applyPeer) return
    if (ev.source === 'approval') return
    const p = ev.payload
    if (typeof p.id !== 'string') return
    if (ev.kind === 'approval.requested' && typeof p.topic === 'string') {
      if (this.byId.has(p.id)) return
      this.byId.set(p.id, {
        id: p.id, topic: p.topic, summary: typeof p.summary === 'string' ? p.summary : '',
        requestedBy: 'peer:' + ev.source, status: 'pending',
        createdAt: new Date().toISOString(),
      })
      this.peerCount++
    }
  }
}

function clone(a: Approval): Approval {
  return { ...a }
}
