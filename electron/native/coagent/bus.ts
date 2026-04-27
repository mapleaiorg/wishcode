/**
 * Internal CoAgent bus — minimal pub/sub wired into Tel-0.
 *
 * One core, many members. Each member declares its subscribed event
 * kinds at join; the bus filters before delivery so subscribers
 * never see events they don't care about. Throwing handlers are
 * caught + logged (Tel-0 `coagent.subscriber.threw`); the publisher
 * continues unaffected.
 */

import type { TelemetryEmitter } from '../telemetry/index.js'
import type {
  CoAgentBusOptions,
  CoAgentEvent,
  CoAgentEventKind,
  CoAgentMember,
  CoAgentRole,
  CoAgentSubscriber,
  JoinResult,
} from './types.js'
import { COAGENT_FAMILY_ID } from './types.js'

interface Subscription {
  member: CoAgentMember
  handler: CoAgentSubscriber
}

export class CoAgentBus {
  private readonly subscriptions = new Map<CoAgentRole, Subscription>()
  private readonly telemetry?: TelemetryEmitter

  constructor(opts: CoAgentBusOptions = {}) {
    this.telemetry = opts.telemetry
  }

  get familyId(): string {
    return COAGENT_FAMILY_ID
  }

  /** Number of members currently joined (including `core`). */
  size(): number {
    return this.subscriptions.size
  }

  /** Snapshot of every member, including roles + subscribed kinds. */
  membership(): CoAgentMember[] {
    return [...this.subscriptions.values()].map(s => ({ ...s.member, subscribes: [...s.member.subscribes] }))
  }

  has(role: CoAgentRole): boolean {
    return this.subscriptions.has(role)
  }

  /** Join the family with a handler. Re-joining the same role
   *  swaps the previous handler (last writer wins) — this matches
   *  Cell-2 deactivate + activate semantics. */
  join(member: CoAgentMember, handler: CoAgentSubscriber): JoinResult {
    const wasMember = this.subscriptions.has(member.role)
    this.subscriptions.set(member.role, {
      member: { ...member, subscribes: [...member.subscribes] },
      handler,
    })
    if (!wasMember) {
      this.deliverMembership('family.member.joined', member.role)
    }
    return {
      publish: ev => this.publish(member.role, ev),
      membership: () => this.membership(),
      leave: () => this.leave(member.role),
    }
  }

  leave(role: CoAgentRole): boolean {
    const had = this.subscriptions.delete(role)
    if (had) {
      this.deliverMembership('family.member.left', role)
    }
    return had
  }

  publish(source: CoAgentRole, ev: Omit<CoAgentEvent, 'source' | 'ts'>): void {
    const event: CoAgentEvent = {
      ...ev,
      source,
      ts: new Date().toISOString(),
    }
    this.deliver(event)
  }

  /** Iterate live subscribers for a kind — useful for diagnostics. */
  subscribersFor(kind: CoAgentEventKind): CoAgentRole[] {
    const out: CoAgentRole[] = []
    for (const s of this.subscriptions.values()) {
      if (s.member.subscribes.includes(kind)) out.push(s.member.role)
    }
    return out
  }

  private deliver(event: CoAgentEvent): void {
    for (const s of this.subscriptions.values()) {
      if (!s.member.subscribes.includes(event.kind)) continue
      try {
        s.handler(event)
      } catch (e) {
        this.telemetry?.emit({
          type: 'coagent.subscriber.threw',
          level: 'warn',
          attributes: {
            role: s.member.role,
            kind: event.kind,
            reason: e instanceof Error ? e.message : String(e),
          },
        })
      }
    }
    this.telemetry?.emit({
      type: 'coagent.event.delivered',
      level: 'debug',
      attributes: {
        kind: event.kind,
        source: event.source,
        recipients: this.subscribersFor(event.kind).length,
      },
    })
  }

  private deliverMembership(
    kind: 'family.member.joined' | 'family.member.left',
    role: CoAgentRole,
  ): void {
    const event: CoAgentEvent = {
      kind,
      source: 'core',
      ts: new Date().toISOString(),
      payload: { role, familyId: this.familyId },
    }
    this.deliver(event)
  }
}

/**
 * The CoAgent core cell — joins the bus as `core`, subscribes to
 * every kind for diagnostics, and exposes the bus to family members.
 * C-1..7 obtain a `JoinResult` via `core.join({...})`.
 */
export class CoAgentCore {
  readonly bus: CoAgentBus
  /** Telemetry-only mirror of every event the core sees. */
  private readonly seen: CoAgentEvent[] = []
  private readonly maxSeen = 256

  constructor(opts: CoAgentBusOptions = {}) {
    this.bus = new CoAgentBus(opts)
    this.bus.join(
      { role: 'core', label: 'CoAgent core', subscribes: ALL_KINDS },
      ev => this.observe(ev),
    )
  }

  /** Family member entry point. */
  join(
    member: Omit<CoAgentMember, 'role'> & { role: Exclude<CoAgentRole, 'core'> },
    handler: CoAgentSubscriber,
  ): JoinResult {
    return this.bus.join(member, handler)
  }

  recent(limit = 32): CoAgentEvent[] {
    return this.seen.slice(-limit)
  }

  private observe(ev: CoAgentEvent): void {
    this.seen.push(ev)
    if (this.seen.length > this.maxSeen) {
      this.seen.splice(0, this.seen.length - this.maxSeen)
    }
  }
}

const ALL_KINDS: CoAgentEventKind[] = [
  'family.member.joined',
  'family.member.left',
  'task.created',
  'task.updated',
  'task.deleted',
  'deliverable.published',
  'deliverable.revised',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'knowledge.cited',
  'activity.appended',
  'agent.run.started',
  'agent.run.finished',
]
