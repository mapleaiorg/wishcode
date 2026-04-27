/**
 * T-2 — Activity timeline tests.
 */

import { describe, expect, it } from 'vitest'
import { ActivityTimeline } from '../index.js'
import { TelemetryEmitter } from '../../telemetry/index.js'

function setup() {
  const t = new ActivityTimeline()
  const e = new TelemetryEmitter()
  e.addSink(t)
  return { t, e }
}

describe('ActivityTimeline', () => {
  it('groups events by traceId', () => {
    const { t, e } = setup()
    const trace = { traceId: 'tr-A', spanId: 'sp-1' }
    e.emit({ type: 'job.run.started', trace, attributes: { jobId: 'j1' } })
    e.emit({ type: 'job.run.succeeded', trace, attributes: { jobId: 'j1' } })
    e.emit({ type: 'cell.activate.started', trace: { traceId: 'tr-B', spanId: 'sp-1' } })
    expect(t.size()).toBe(2)
    const a = t.trace('tr-A')
    expect(a?.events).toHaveLength(2)
    expect(a?.events[0].type).toBe('job.run.started')
  })

  it('tracks domains and highest level per trace', () => {
    const { t, e } = setup()
    const trace = { traceId: 'tr-A', spanId: 'sp-1' }
    e.emit({ type: 'job.run.started', level: 'info', trace })
    e.emit({ type: 'capability.check.denied', level: 'warn', trace })
    e.emit({ type: 'cell.activate.failed', level: 'error', trace })
    const a = t.trace('tr-A')
    expect(a?.highestLevel).toBe('error')
    expect(a?.domains.sort()).toEqual(['capability', 'cell', 'job'])
  })

  it('list is newest-first and supports domain + minLevel filters', () => {
    const { t, e } = setup()
    e.emit({ type: 'job.run.started', level: 'info', trace: { traceId: 'A', spanId: 's' } })
    e.emit({ type: 'cell.activate.failed', level: 'error', trace: { traceId: 'B', spanId: 's' } })
    e.emit({ type: 'job.run.started', level: 'info', trace: { traceId: 'C', spanId: 's' } })
    const all = t.list()
    expect(all.map(x => x.traceId)).toEqual(['C', 'B', 'A'])
    expect(t.list({ domain: 'cell' }).map(x => x.traceId)).toEqual(['B'])
    expect(t.list({ minLevel: 'error' }).map(x => x.traceId)).toEqual(['B'])
  })

  it('caps events per trace (FIFO drop oldest)', () => {
    const t = new ActivityTimeline({ maxEventsPerTrace: 3 })
    const e = new TelemetryEmitter()
    e.addSink(t)
    const trace = { traceId: 'A', spanId: 's' }
    for (let i = 0; i < 7; i++) {
      e.emit({ type: `a.b.c${i % 5}`, trace, attributes: { i } })
    }
    expect(t.trace('A')?.events).toHaveLength(3)
  })

  it('caps total traces (evict oldest)', () => {
    const t = new ActivityTimeline({ maxTraces: 2 })
    const e = new TelemetryEmitter()
    e.addSink(t)
    e.emit({ type: 'a.b.c', trace: { traceId: 'A', spanId: 's' } })
    e.emit({ type: 'a.b.c', trace: { traceId: 'B', spanId: 's' } })
    e.emit({ type: 'a.b.c', trace: { traceId: 'C', spanId: 's' } })
    expect(t.size()).toBe(2)
    expect(t.trace('A')).toBeNull()
    expect(t.trace('C')).not.toBeNull()
  })

  it('returns deep copies on trace() / list() (caller mutation isolation)', () => {
    const { t, e } = setup()
    e.emit({ type: 'a.b.c', trace: { traceId: 'A', spanId: 's' } })
    const got = t.trace('A')!
    got.events.push({} as never)
    got.domains.push('hacked')
    const refresh = t.trace('A')!
    expect(refresh.events).toHaveLength(1)
    expect(refresh.domains).not.toContain('hacked')
  })

  it('clear() drops every trace', () => {
    const { t, e } = setup()
    e.emit({ type: 'a.b.c', trace: { traceId: 'A', spanId: 's' } })
    expect(t.size()).toBe(1)
    t.clear()
    expect(t.size()).toBe(0)
  })

  it('integrates as a TelemetrySink alongside other sinks', () => {
    const t = new ActivityTimeline()
    const e = new TelemetryEmitter()
    const other: { events: unknown[] } = { events: [] }
    e.addSink({ emit: ev => { other.events.push(ev) } })
    e.addSink(t)
    e.emit({ type: 'a.b.c' })
    expect(t.size()).toBe(1)
    expect(other.events).toHaveLength(1)
  })

  it('handles bursts on the same trace within a single tick', () => {
    const { t, e } = setup()
    const trace = { traceId: 'A', spanId: 's' }
    for (let i = 0; i < 50; i++) {
      e.emit({ type: 'job.run.started', trace, attributes: { i } })
    }
    expect(t.trace('A')?.events).toHaveLength(50)
  })

  it('updatedAt advances with the latest event', () => {
    const { t, e } = setup()
    const trace = { traceId: 'A', spanId: 's' }
    e.emit({ type: 'a.b.c', trace })
    const first = t.trace('A')!.updatedAt
    e.emit({ type: 'a.b.c', trace })
    const second = t.trace('A')!.updatedAt
    expect(second >= first).toBe(true)
  })
})
