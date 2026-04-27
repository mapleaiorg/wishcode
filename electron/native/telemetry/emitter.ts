/**
 * `TelemetryEmitter` — host-side facade. Producers (chat handler,
 * agent loop, capability gate, ops modules) hold an emitter and call
 * `emit({type, attributes, ...})`. The emitter mints id + timestamp
 * + trace context, and fans out to every registered sink.
 *
 * Sinks NEVER throw; emit() is fire-and-forget. The `MemorySink`
 * here is the canonical test sink + the local-dev observer. Tel-1
 * adds a file-rotated sink + a Hermon SSE sink.
 */

import type {
  AttributeValue,
  EventLevel,
  NewEventInput,
  RedactionClass,
  TelemetryEvent,
  TelemetrySink,
  TraceContext,
} from './types.js'

function newId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function newTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function newSpanId(): string {
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

const TYPE_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){2,}$/

function validateType(t: string): void {
  if (!TYPE_RE.test(t)) {
    throw new Error(
      `TelemetryEmitter: invalid event type "${t}" — must be <domain>.<noun>.<verb> (lowercase dotted)`,
    )
  }
}

const DENYLISTED_KEYS = new Set([
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'message',     // chat content
  'content',     // file/chat content
  'body',        // memory body
])

function scrubAttributes(
  attrs: Record<string, AttributeValue>,
): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (DENYLISTED_KEYS.has(k.toLowerCase())) continue
    out[k] = v
  }
  return out
}

export interface EmitterOptions {
  /** Source identifier — `shell`, `agent`, `wishd`, etc. Default `shell`. */
  source?: string
  /** Default trace; new traces minted per-emit when omitted. */
  trace?: TraceContext
  /** Default level when an event omits one. */
  defaultLevel?: EventLevel
  /** Default redaction class. */
  defaultRedaction?: RedactionClass
}

export class TelemetryEmitter {
  private readonly sinks: TelemetrySink[] = []
  private readonly source: string
  private readonly trace?: TraceContext
  private readonly defaultLevel: EventLevel
  private readonly defaultRedaction: RedactionClass

  constructor(opts: EmitterOptions = {}) {
    this.source = opts.source ?? 'shell'
    this.trace = opts.trace
    this.defaultLevel = opts.defaultLevel ?? 'info'
    this.defaultRedaction = opts.defaultRedaction ?? 'safe'
  }

  addSink(sink: TelemetrySink): () => void {
    this.sinks.push(sink)
    return () => {
      const i = this.sinks.indexOf(sink)
      if (i !== -1) this.sinks.splice(i, 1)
    }
  }

  withTrace(trace: TraceContext): TelemetryEmitter {
    return new TelemetryEmitter({
      source: this.source,
      trace,
      defaultLevel: this.defaultLevel,
      defaultRedaction: this.defaultRedaction,
    })
  }

  emit(input: NewEventInput): TelemetryEvent {
    validateType(input.type)

    const trace: TraceContext = {
      traceId: input.trace?.traceId ?? this.trace?.traceId ?? newTraceId(),
      spanId: input.trace?.spanId ?? newSpanId(),
      ...(input.trace?.parentSpanId ?? this.trace?.spanId
        ? { parentSpanId: input.trace?.parentSpanId ?? this.trace?.spanId }
        : {}),
    }

    const event: TelemetryEvent = {
      id: newId(),
      type: input.type,
      ts: new Date().toISOString(),
      level: input.level ?? this.defaultLevel,
      redaction: input.redaction ?? this.defaultRedaction,
      schemaVersion: input.schemaVersion ?? 1,
      attributes: scrubAttributes(input.attributes ?? {}),
      source: input.source ?? this.source,
      trace,
    }

    for (const s of this.sinks) {
      try {
        s.emit(event)
      } catch {
        // sinks must not throw; swallow so the producer keeps running.
      }
    }
    return event
  }

  async flush(): Promise<void> {
    await Promise.all(this.sinks.map(s => s.flush?.() ?? Promise.resolve()))
  }
}

/**
 * In-memory sink — collects events for tests and the local dev
 * console. Tel-1 adds the rotating file sink + Hermon SSE sink.
 */
export class MemorySink implements TelemetrySink {
  readonly events: TelemetryEvent[] = []
  emit(event: TelemetryEvent): void {
    this.events.push(event)
  }
  byType(type: string): TelemetryEvent[] {
    return this.events.filter(e => e.type === type)
  }
  clear(): void {
    this.events.length = 0
  }
}
