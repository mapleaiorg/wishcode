/**
 * T-2 — Activity timeline.
 *
 * Subscribes to a `TelemetryEmitter`'s sink and assembles a UI-facing
 * feed grouped by `traceId` (one trace ≈ one user action). The
 * timeline never writes outside its in-memory buffer; persistence is
 * a job for the host (D-3 supervisor / Hermon mirror).
 *
 * Producers are unchanged: every prompt that already calls
 * `emitter.emit({ type: 'job.run.started', ... })` (T-1),
 * `cell.activate.*` (Cell-2), `capability.check.denied` (D-6) feeds
 * directly into this timeline.
 */

import type {
  EventLevel,
  TelemetryEvent,
  TelemetrySink,
} from '../telemetry/types.js'

export interface TimelineEntry {
  traceId: string
  startedAt: string
  updatedAt: string
  events: TelemetryEvent[]
  /** Highest level seen across the trace's events. */
  highestLevel: EventLevel
  /** Distinct event-type prefixes, lowercase first segment (e.g. "job", "cell"). */
  domains: string[]
}

const LEVEL_ORDER: Record<EventLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
}

function bumpLevel(cur: EventLevel, ev: EventLevel): EventLevel {
  return LEVEL_ORDER[ev] > LEVEL_ORDER[cur] ? ev : cur
}

export interface TimelineOptions {
  /** Max events kept per trace; older events are dropped FIFO. Default 200. */
  maxEventsPerTrace?: number
  /** Max distinct traces kept; oldest evicted. Default 100. */
  maxTraces?: number
}

export class ActivityTimeline implements TelemetrySink {
  private readonly traces = new Map<string, TimelineEntry>()
  /** Insertion-order tiebreak for same-ms updatedAt sorting. */
  private readonly insertSeq = new Map<string, number>()
  private nextSeq = 0
  private readonly maxEventsPerTrace: number
  private readonly maxTraces: number

  constructor(opts: TimelineOptions = {}) {
    this.maxEventsPerTrace = opts.maxEventsPerTrace ?? 200
    this.maxTraces = opts.maxTraces ?? 100
  }

  emit(event: TelemetryEvent): void {
    const tid = event.trace.traceId
    let entry = this.traces.get(tid)
    if (!entry) {
      // Evict oldest trace if over capacity.
      if (this.traces.size >= this.maxTraces) {
        const oldest = this.traces.keys().next().value as string | undefined
        if (oldest !== undefined) this.traces.delete(oldest)
      }
      entry = {
        traceId: tid,
        startedAt: event.ts,
        updatedAt: event.ts,
        events: [],
        highestLevel: event.level,
        domains: [],
      }
      this.traces.set(tid, entry)
    }
    // Bump the insertion seq each emit so the most-recently-touched
    // trace sorts first when updatedAt strings tie.
    this.insertSeq.set(tid, this.nextSeq++)
    entry.events.push(event)
    if (entry.events.length > this.maxEventsPerTrace) {
      entry.events.splice(0, entry.events.length - this.maxEventsPerTrace)
    }
    entry.updatedAt = event.ts
    entry.highestLevel = bumpLevel(entry.highestLevel, event.level)
    const domain = event.type.split('.')[0]
    if (domain && !entry.domains.includes(domain)) entry.domains.push(domain)
  }

  trace(traceId: string): TimelineEntry | null {
    const e = this.traces.get(traceId)
    return e ? cloneEntry(e) : null
  }

  /** Newest-first list. */
  list(filter: { domain?: string; minLevel?: EventLevel } = {}): TimelineEntry[] {
    const minLevel = filter.minLevel ?? 'debug'
    const out: TimelineEntry[] = []
    for (const e of this.traces.values()) {
      if (filter.domain && !e.domains.includes(filter.domain)) continue
      if (LEVEL_ORDER[e.highestLevel] < LEVEL_ORDER[minLevel]) continue
      out.push(cloneEntry(e))
    }
    out.sort((a, b) => {
      const c = b.updatedAt.localeCompare(a.updatedAt)
      if (c !== 0) return c
      return (this.insertSeq.get(b.traceId) ?? 0) - (this.insertSeq.get(a.traceId) ?? 0)
    })
    return out
  }

  size(): number {
    return this.traces.size
  }

  clear(): void {
    this.traces.clear()
    this.insertSeq.clear()
  }
}

function cloneEntry(e: TimelineEntry): TimelineEntry {
  return {
    ...e,
    events: e.events.slice(),
    domains: e.domains.slice(),
  }
}
