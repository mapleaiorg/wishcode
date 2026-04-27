/**
 * C-5 — CoAgent activity feed.
 *
 * Joins the family as `activity` and observes EVERY event kind. Maintains
 * a feed of recent events for the team UI. Publishes `activity.appended`
 * after every observed event so other members can synthesize summaries.
 *
 * Also tracks per-role presence (last-seen timestamp) so the UI can render
 * "who's active right now" indicators.
 */

import type { CoAgentBus, CoAgentCore } from './bus.js'
import type {
  CoAgentEvent,
  CoAgentEventKind,
  CoAgentMember,
  CoAgentRole,
  JoinResult,
} from './types.js'

const ALL_KINDS: CoAgentEventKind[] = [
  'family.member.joined', 'family.member.left',
  'task.created', 'task.updated', 'task.deleted',
  'deliverable.published', 'deliverable.revised',
  'approval.requested', 'approval.granted', 'approval.denied',
  'knowledge.cited',
  'agent.run.started', 'agent.run.finished',
]

export interface ActivityEntry {
  /** Stable id assigned on append. */
  id: string
  event: CoAgentEvent
}

export interface ActivityFeedOptions {
  /** Max entries kept in the buffer (FIFO drop oldest). Default 256. */
  maxEntries?: number
}

let nextSeq = 0
function newId(): string {
  return `act_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

export class CoAgentActivityFeed {
  private join: JoinResult | null = null
  private readonly bus: CoAgentBus
  private readonly entries: ActivityEntry[] = []
  private readonly presence = new Map<CoAgentRole, string>()
  private readonly maxEntries: number

  constructor(coreOrBus: CoAgentCore | CoAgentBus, opts: ActivityFeedOptions = {}) {
    this.bus = 'bus' in coreOrBus ? coreOrBus.bus : coreOrBus
    this.maxEntries = opts.maxEntries ?? 256
  }

  attach(): void {
    if (this.join) return
    const member: CoAgentMember = {
      role: 'activity', label: 'CoAgent activity feed', subscribes: ALL_KINDS,
    }
    this.join = this.bus.join(member, ev => this.onEvent(ev))
  }

  detach(): void {
    if (!this.join) return
    this.join.leave()
    this.join = null
  }

  isAttached(): boolean { return !!this.join }

  /** Newest-first feed (deep-copied). */
  list(filter: { kinds?: CoAgentEventKind[]; source?: CoAgentRole; limit?: number } = {}): ActivityEntry[] {
    const limit = filter.limit ?? 50
    const out: ActivityEntry[] = []
    for (let i = this.entries.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.entries[i]
      if (filter.kinds && !filter.kinds.includes(e.event.kind)) continue
      if (filter.source && e.event.source !== filter.source) continue
      out.push({ id: e.id, event: { ...e.event, payload: { ...e.event.payload } } })
    }
    return out
  }

  size(): number { return this.entries.length }

  /** Last-seen ISO timestamp per role. */
  presenceFor(role: CoAgentRole): string | null {
    return this.presence.get(role) ?? null
  }

  /** All roles with their last-seen timestamp, freshest first. */
  presenceAll(): Array<{ role: CoAgentRole; lastSeen: string }> {
    const out: Array<{ role: CoAgentRole; lastSeen: string }> = []
    for (const [role, lastSeen] of this.presence) out.push({ role, lastSeen })
    out.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    return out
  }

  clear(): void {
    this.entries.length = 0
    this.presence.clear()
  }

  private onEvent(ev: CoAgentEvent): void {
    // Don't feed-loop on our own activity.appended events.
    if (ev.source === 'activity' && ev.kind === 'activity.appended') return
    this.presence.set(ev.source as CoAgentRole, ev.ts)
    const entry: ActivityEntry = {
      id: newId(),
      event: { ...ev, payload: { ...ev.payload } },
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    if (this.join) {
      this.join.publish({
        kind: 'activity.appended',
        payload: { entryId: entry.id, kind: ev.kind, source: ev.source },
      })
    }
  }
}
