/**
 * Tel-0 — TelemetryEmitter + MemorySink tests.
 */

import { describe, expect, it } from 'vitest'
import { MemorySink, TelemetryEmitter } from '../index.js'

describe('TelemetryEmitter', () => {
  it('emits an event with stable shape', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    const ev = e.emit({ type: 'chat.session.opened', attributes: { sessionId: 's1' } })
    expect(sink.events).toHaveLength(1)
    expect(sink.events[0]).toBe(ev)
    expect(ev.type).toBe('chat.session.opened')
    expect(ev.level).toBe('info')
    expect(ev.redaction).toBe('safe')
    expect(ev.schemaVersion).toBe(1)
    expect(ev.id).toMatch(/^evt_/)
    expect(ev.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ev.trace.traceId).toMatch(/^tr_/)
    expect(ev.trace.spanId).toMatch(/^sp_/)
  })

  it('mints a fresh traceId per emit when no trace context is supplied', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'a.b.c' })
    e.emit({ type: 'a.b.c' })
    expect(sink.events[0].trace.traceId).not.toBe(sink.events[1].trace.traceId)
  })

  it('reuses traceId from constructor and mints fresh spans per emit', () => {
    const trace = { traceId: 'tr_static', spanId: 'sp_root' }
    const e = new TelemetryEmitter({ trace })
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'a.b.c' })
    e.emit({ type: 'a.b.c' })
    expect(sink.events[0].trace.traceId).toBe('tr_static')
    expect(sink.events[1].trace.traceId).toBe('tr_static')
    expect(sink.events[0].trace.spanId).not.toBe(sink.events[1].trace.spanId)
    // when a parent trace is set, the parentSpanId chain forms.
    expect(sink.events[0].trace.parentSpanId).toBe('sp_root')
  })

  it('rejects malformed event types', () => {
    const e = new TelemetryEmitter()
    expect(() => e.emit({ type: 'no_dots' })).toThrow(/event type/)
    expect(() => e.emit({ type: 'TWO.parts' })).toThrow(/event type/)
    expect(() => e.emit({ type: 'a.b' })).toThrow(/event type/)
    expect(() => e.emit({ type: 'A.B.C' })).toThrow(/event type/)
  })

  it('scrubs sensitive attribute keys before emit', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({
      type: 'auth.login.attempted',
      attributes: { user: 'alice', password: 'secret', token: 'tok', api_key: 'k' },
    })
    const ev = sink.events[0]
    expect(ev.attributes.user).toBe('alice')
    expect(ev.attributes.password).toBeUndefined()
    expect(ev.attributes.token).toBeUndefined()
    expect(ev.attributes.api_key).toBeUndefined()
  })

  it('honors caller-supplied level + redaction', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'a.b.c', level: 'warn', redaction: 'workspace' })
    expect(sink.events[0].level).toBe('warn')
    expect(sink.events[0].redaction).toBe('workspace')
  })

  it('falls back to default level + redaction from constructor', () => {
    const e = new TelemetryEmitter({ defaultLevel: 'debug', defaultRedaction: 'user' })
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'a.b.c' })
    expect(sink.events[0].level).toBe('debug')
    expect(sink.events[0].redaction).toBe('user')
  })

  it('supports multiple sinks; one bad sink does not block others', () => {
    const e = new TelemetryEmitter()
    const good = new MemorySink()
    const bad: ReturnType<typeof Object.assign> = {
      emit() { throw new Error('boom') },
    }
    e.addSink(good)
    e.addSink(bad as unknown as MemorySink)
    e.emit({ type: 'a.b.c' })
    expect(good.events).toHaveLength(1)
  })

  it('removes sinks via the returned unsub', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    const unsub = e.addSink(sink)
    e.emit({ type: 'a.b.c' })
    unsub()
    e.emit({ type: 'a.b.c' })
    expect(sink.events).toHaveLength(1)
  })

  it('byType filters MemorySink contents by event type', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'chat.message.sent' })
    e.emit({ type: 'chat.session.opened' })
    e.emit({ type: 'chat.message.sent' })
    expect(sink.byType('chat.message.sent')).toHaveLength(2)
  })

  it('withTrace returns a child emitter sharing options + trace', () => {
    const e = new TelemetryEmitter({ source: 'agent' })
    const sink = new MemorySink()
    e.addSink(sink)
    const child = e.withTrace({ traceId: 'tr_child', spanId: 'sp_a' })
    // child has no sinks of its own; useful when the host wants a
    // scoped emitter that *only* affects sinks added to it.
    child.emit({ type: 'a.b.c' })
    expect(sink.events).toHaveLength(0) // child sinks are independent

    const childSink = new MemorySink()
    child.addSink(childSink)
    child.emit({ type: 'a.b.c' })
    expect(childSink.events[0].trace.traceId).toBe('tr_child')
    expect(childSink.events[0].source).toBe('agent')
  })

  it('source falls back to "shell" when not configured', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'a.b.c' })
    expect(sink.events[0].source).toBe('shell')
  })

  it('flush awaits sinks that implement flush', async () => {
    const e = new TelemetryEmitter()
    let flushed = false
    e.addSink({ emit() {}, async flush() { flushed = true } })
    await e.flush()
    expect(flushed).toBe(true)
  })

  it('MemorySink.clear empties the buffer', () => {
    const e = new TelemetryEmitter()
    const sink = new MemorySink()
    e.addSink(sink)
    e.emit({ type: 'a.b.c' })
    sink.clear()
    expect(sink.events).toHaveLength(0)
  })
})
