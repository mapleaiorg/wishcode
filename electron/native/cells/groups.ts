/**
 * Cell-5 — Cell Groups + internal bus.
 *
 * Generalises C-0's CoAgent bus pattern: any set of Cells (a Cell
 * Family or an ad-hoc group) can share a typed pub/sub bus + a
 * member registry. Third-party Cells form their own groups via the
 * SDK; first-party groups (CoAgent) reuse this same machinery
 * through `defineGroup`.
 *
 * The group's events are namespaced by `{groupId}.{event}` on the
 * Tel-0 sink so multiple groups don't collide.
 */

import type { TelemetryEmitter } from '../telemetry/index.js'

/** Group id grammar — same shape as Cell ids (lowercase reverse-DNS). */
const GROUP_ID_RE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_-]*){1,4}$/

export interface GroupMember<TEvent extends string> {
  /** Stable id within the group; family-scoped. */
  memberId: string
  /** Optional human-readable label. */
  label?: string
  /** Subscribed event kinds. */
  subscribes: TEvent[]
}

export interface GroupEvent<TEvent extends string> {
  kind: TEvent
  /** Member that published; the group fills this. */
  source: string
  /** ISO-8601, group-stamped. */
  ts: string
  payload: Record<string, unknown>
}

export type GroupSubscriber<TEvent extends string> = (
  event: GroupEvent<TEvent>,
) => void

export interface GroupJoinResult<TEvent extends string> {
  publish(ev: { kind: TEvent; payload: Record<string, unknown> }): void
  membership(): GroupMember<TEvent>[]
  leave(): void
}

export interface GroupOptions {
  telemetry?: TelemetryEmitter
}

interface Subscription<TEvent extends string> {
  member: GroupMember<TEvent>
  handler: GroupSubscriber<TEvent>
}

export class CellGroup<TEvent extends string> {
  private readonly subscriptions = new Map<string, Subscription<TEvent>>()
  private readonly telemetry?: TelemetryEmitter

  constructor(
    public readonly groupId: string,
    public readonly knownKinds: readonly TEvent[],
    opts: GroupOptions = {},
  ) {
    if (!GROUP_ID_RE.test(groupId)) {
      throw new Error(`CellGroup: invalid group id "${groupId}"`)
    }
    this.telemetry = opts.telemetry
  }

  size(): number {
    return this.subscriptions.size
  }

  has(memberId: string): boolean {
    return this.subscriptions.has(memberId)
  }

  membership(): GroupMember<TEvent>[] {
    return [...this.subscriptions.values()].map(s => ({
      ...s.member,
      subscribes: [...s.member.subscribes],
    }))
  }

  subscribersFor(kind: TEvent): string[] {
    return [...this.subscriptions.values()]
      .filter(s => s.member.subscribes.includes(kind))
      .map(s => s.member.memberId)
  }

  join(
    member: GroupMember<TEvent>,
    handler: GroupSubscriber<TEvent>,
  ): GroupJoinResult<TEvent> {
    if (!member.memberId) {
      throw new Error('CellGroup: member.memberId is required')
    }
    for (const k of member.subscribes) {
      if (!this.knownKinds.includes(k)) {
        throw new Error(
          `CellGroup[${this.groupId}]: unknown event kind "${k}" — declare it in knownKinds`,
        )
      }
    }
    this.subscriptions.set(member.memberId, {
      member: { ...member, subscribes: [...member.subscribes] },
      handler,
    })
    this.emitTelemetry('joined', { memberId: member.memberId })
    return {
      publish: ev => this.publish(member.memberId, ev),
      membership: () => this.membership(),
      leave: () => this.leave(member.memberId),
    }
  }

  leave(memberId: string): boolean {
    const had = this.subscriptions.delete(memberId)
    if (had) this.emitTelemetry('left', { memberId })
    return had
  }

  publish(
    source: string,
    ev: { kind: TEvent; payload: Record<string, unknown> },
  ): void {
    if (!this.knownKinds.includes(ev.kind)) {
      throw new Error(
        `CellGroup[${this.groupId}]: unknown event kind "${ev.kind}"`,
      )
    }
    const event: GroupEvent<TEvent> = {
      kind: ev.kind,
      source,
      ts: new Date().toISOString(),
      payload: ev.payload,
    }
    let recipients = 0
    for (const s of this.subscriptions.values()) {
      if (!s.member.subscribes.includes(ev.kind)) continue
      recipients++
      try {
        s.handler(event)
      } catch (e) {
        this.emitTelemetry('subscriber_threw', {
          memberId: s.member.memberId,
          kind: ev.kind,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }
    this.emitTelemetry('event_delivered', {
      kind: ev.kind,
      source,
      recipients,
    })
  }

  private emitTelemetry(
    suffix: string,
    attributes: Record<string, string | number | boolean>,
  ): void {
    this.telemetry?.emit({
      type: `${this.groupId}.${suffix}`,
      level: suffix === 'subscriber_threw' ? 'warn' : 'debug',
      attributes,
    })
  }
}

/** Convenience: define a typed group with a frozen kind list. */
export function defineGroup<TEvent extends string>(
  groupId: string,
  knownKinds: readonly TEvent[],
  opts: GroupOptions = {},
): CellGroup<TEvent> {
  return new CellGroup<TEvent>(groupId, knownKinds, opts)
}
