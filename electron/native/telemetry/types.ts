/**
 * Tel-0 — Telemetry envelope.
 *
 * Every meaningful action — chat send, tool invoke, model switch,
 * task created, capability denied, package installed — emits a
 * `TelemetryEvent` through this envelope. Tel-1 transports them
 * (local sink + Hermon SSE); Tel-2 routes domain sinks; Tel-3 drives
 * dev observability + trace reconstruction.
 *
 * Hard rules (CONVENTIONS § 14):
 *   - No PII / message content in events. User strings stay in
 *     conversations; events carry shapes and counts.
 *   - Every event carries a redaction-class tag; sinks honor it.
 *   - Stable event types (`<domain>.<noun>.<verb>`) — bumping a
 *     shape requires a new type, never an in-place change.
 *   - Telemetry is best-effort; failures never block user work.
 */

/** The four redaction classes recognized by Tel-2 sinks. */
export type RedactionClass =
  /** Counts, durations, codes — safe to ship. */
  | 'safe'
  /** Workspace / file paths — emitted only if the sink is local
   * or the org explicitly opts-in. */
  | 'workspace'
  /** Per-user identifiers (user_id, device_id) — Hermon-only. */
  | 'user'
  /** Sensitive payload — never shipped, dropped at the sink. */
  | 'private'

export type EventLevel = 'debug' | 'info' | 'warn' | 'error'

export interface TraceContext {
  /** Stable trace-id for correlating cross-process activity. */
  traceId: string
  /** Span id within the trace; producers MAY mint per-event spans. */
  spanId: string
  /** Optional parent span; root spans omit. */
  parentSpanId?: string
}

export interface TelemetryEvent {
  /** ULID/UUID — unique per event. */
  id: string
  /** Stable event type, lowercased dotted: `<domain>.<noun>.<verb>`. */
  type: string
  /** ISO-8601 timestamp. */
  ts: string
  level: EventLevel
  redaction: RedactionClass
  /** Major shape version of `attributes` for this `type`. Bump on break. */
  schemaVersion: number
  /**
   * Free-form attributes — primitives, arrays of primitives, or shallow
   * records. Sinks MAY drop attributes whose keys are not declared in
   * the type's registered schema.
   */
  attributes: Record<string, AttributeValue>
  /** Trace correlation. */
  trace: TraceContext
  /** Source surface — `shell`, `agent`, `wishd`, `hermon`, `cell:<id>`. */
  source: string
}

export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | { [key: string]: string | number | boolean | null }

export interface NewEventInput {
  type: string
  level?: EventLevel
  redaction?: RedactionClass
  schemaVersion?: number
  attributes?: Record<string, AttributeValue>
  source?: string
  trace?: Partial<TraceContext>
}

export interface TelemetrySink {
  /** Best-effort fire-and-forget delivery. MUST NOT throw. */
  emit(event: TelemetryEvent): void
  /** Optional flush hook — sinks that buffer override. */
  flush?(): Promise<void>
}
