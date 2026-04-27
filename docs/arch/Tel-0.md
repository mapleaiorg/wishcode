# Tel-0 — Telemetry Envelope

Date: 2026-04-26
Phase: Tel-0 (Telemetry — event taxonomy + envelope)

## Decision

Every meaningful action emits a `TelemetryEvent` through a host-side
`TelemetryEmitter`. Events carry a redaction class, a stable event
type, a trace context, and free-form attributes (with sensitive keys
auto-scrubbed). Sinks are pluggable; `MemorySink` is the canonical
test sink and the local-dev observer.

## Layout

```
electron/native/telemetry/
├─ types.ts                   # Event, Sink, RedactionClass, TraceContext
├─ emitter.ts                 # TelemetryEmitter + MemorySink
├─ index.ts                   # Public barrel
└─ __tests__/emitter.test.ts  # 14 tests
```

## Hard rules (CONVENTIONS § 14)

1. **No PII / message content in events.** Attribute keys named
   `password`, `token`, `secret`, `api_key`, `apikey`, `authorization`,
   `cookie`, `message`, `content`, `body` are silently scrubbed at
   emit time.
2. **Stable type strings:** `<domain>.<noun>.<verb>`, lowercased, ≥ 3
   parts. Validated at emit time; bad types throw.
3. **`schemaVersion` per type.** Bumping a shape requires either a new
   `type` or a new `schemaVersion`; never an in-place change.
4. **Sinks NEVER throw.** `emit()` is fire-and-forget. The emitter
   catches per-sink exceptions so one bad sink can't take down the
   producer.
5. **Redaction class is metadata, not enforcement.** Tel-2 sinks honor
   it (private dropped, user/workspace gated by org policy).

## Trace correlation

`TraceContext = { traceId, spanId, parentSpanId? }`. The emitter mints
a fresh trace per emit when none is supplied; passing a trace via the
constructor (or `withTrace()`) keeps every emit on the same trace and
threads `parentSpanId` from the constructor's `spanId`.

## Tests (14)

- emit shape (id, ts, level, redaction, schemaVersion, trace) (1)
- fresh traceId per emit when no trace context (1)
- shared traceId + per-emit spanId + parent chain when trace supplied (1)
- malformed event-type rejection (1)
- attribute scrubbing for sensitive keys (1)
- caller-supplied level + redaction (1)
- defaults from constructor (1)
- multiple sinks; bad sink doesn't block others (1)
- sink unsubscribe via returned closure (1)
- `MemorySink.byType` filtering (1)
- `withTrace()` returns a child emitter with fresh sink list (1)
- source default = "shell" (1)
- `flush()` awaits sinks that implement flush (1)
- `MemorySink.clear()` empties the buffer (1)

## Wow moment

A single `emitter.emit({ type: 'chat.message.sent', attributes: { sessionId, password: 'oops' } })`
emits cleanly with the password attribute scrubbed and the trace
auto-correlated — proving the telemetry boundary protects sensitive
data even when the producer accidentally hands it over.

## Pending

- **Tel-1** transports: rotating-file local sink + Hermon SSE sink.
- **Tel-2** domain sinks: analytics + governance routing keyed on
  redaction class + org policy.
- **Tel-3** dev observability: `chrome-trace`-compatible export +
  per-trace timeline reconstruction.

## Handoff

Tel-1 reads this ADR + plugs `RotatingFileSink` and `HermonSseSink`
into the same `TelemetrySink` contract. The agent runtime (A-2),
capability gate (D-6), and the chat IPC handler (D-2) all hold a
shared `TelemetryEmitter` from boot.
