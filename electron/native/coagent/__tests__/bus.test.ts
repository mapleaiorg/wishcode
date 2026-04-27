/**
 * C-0 — CoAgent bus + core tests.
 */

import { describe, expect, it } from 'vitest'
import { CoAgentBus, CoAgentCore, COAGENT_FAMILY_ID, type CoAgentEvent } from '../index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'

describe('CoAgentBus', () => {
  it('exposes the family id', () => {
    const bus = new CoAgentBus()
    expect(bus.familyId).toBe(COAGENT_FAMILY_ID)
  })

  it('join + publish + filter by subscribed kinds', () => {
    const bus = new CoAgentBus()
    const seen: CoAgentEvent[] = []
    bus.join(
      { role: 'task', subscribes: ['task.created'] },
      ev => seen.push(ev),
    )
    bus.publish('core', { kind: 'task.created', payload: { id: 't1' } })
    bus.publish('core', { kind: 'approval.requested', payload: { id: 'a1' } })
    expect(seen).toHaveLength(1)
    expect(seen[0].kind).toBe('task.created')
  })

  it('publish stamps source + ts', () => {
    const bus = new CoAgentBus()
    const seen: CoAgentEvent[] = []
    bus.join({ role: 'task', subscribes: ['task.updated'] }, ev => seen.push(ev))
    bus.publish('approval', { kind: 'task.updated', payload: {} })
    expect(seen[0].source).toBe('approval')
    expect(seen[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('joining the same role swaps the handler (last writer wins)', () => {
    const bus = new CoAgentBus()
    const calls: string[] = []
    bus.join({ role: 'task', subscribes: ['task.created'] }, () => calls.push('A'))
    bus.join({ role: 'task', subscribes: ['task.created'] }, () => calls.push('B'))
    bus.publish('core', { kind: 'task.created', payload: {} })
    expect(calls).toEqual(['B'])
    expect(bus.size()).toBe(1)
  })

  it('emits family.member.joined on first join, family.member.left on leave', () => {
    const bus = new CoAgentBus()
    const seen: CoAgentEvent[] = []
    bus.join(
      { role: 'task', subscribes: ['family.member.joined', 'family.member.left'] },
      ev => seen.push(ev),
    )
    bus.join({ role: 'approval', subscribes: [] }, () => {})
    bus.leave('approval')
    expect(seen.some(e => e.kind === 'family.member.joined' && e.payload.role === 'approval')).toBe(true)
    expect(seen.some(e => e.kind === 'family.member.left' && e.payload.role === 'approval')).toBe(true)
  })

  it('does NOT re-emit family.member.joined when re-joining same role', () => {
    const bus = new CoAgentBus()
    const seen: CoAgentEvent[] = []
    bus.join(
      { role: 'task', subscribes: ['family.member.joined'] },
      ev => seen.push(ev),
    )
    bus.join({ role: 'task', subscribes: ['family.member.joined'] }, () => {})
    expect(seen.filter(e => e.kind === 'family.member.joined' && e.payload.role === 'task')).toHaveLength(1)
  })

  it('membership() returns a snapshot of every member', () => {
    const bus = new CoAgentBus()
    bus.join({ role: 'task', subscribes: ['task.created'] }, () => {})
    bus.join({ role: 'approval', subscribes: ['approval.requested'] }, () => {})
    const m = bus.membership()
    expect(m.map(x => x.role).sort()).toEqual(['approval', 'task'])
  })

  it('subscribersFor returns roles for a given kind', () => {
    const bus = new CoAgentBus()
    bus.join({ role: 'task', subscribes: ['task.created'] }, () => {})
    bus.join({ role: 'activity', subscribes: ['task.created', 'approval.requested'] }, () => {})
    expect(bus.subscribersFor('task.created').sort()).toEqual(['activity', 'task'])
    expect(bus.subscribersFor('approval.granted')).toEqual([])
  })

  it('a thrown subscriber does NOT block other subscribers, and emits coagent.subscriber.threw', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const bus = new CoAgentBus({ telemetry: tel })
    let activitySaw = false
    bus.join({ role: 'task', subscribes: ['task.created'] }, () => { throw new Error('boom') })
    bus.join({ role: 'activity', subscribes: ['task.created'] }, () => { activitySaw = true })
    bus.publish('core', { kind: 'task.created', payload: {} })
    expect(activitySaw).toBe(true)
    expect(sink.events.some(e => e.type === 'coagent.subscriber.threw')).toBe(true)
  })

  it('emits coagent.event.delivered telemetry per publish', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const bus = new CoAgentBus({ telemetry: tel })
    bus.publish('core', { kind: 'activity.appended', payload: {} })
    expect(sink.events.some(e => e.type === 'coagent.event.delivered')).toBe(true)
  })

  it('JoinResult.publish reuses the joining role as source', () => {
    const bus = new CoAgentBus()
    const seen: CoAgentEvent[] = []
    bus.join({ role: 'task', subscribes: ['task.updated'] }, ev => seen.push(ev))
    const j = bus.join({ role: 'approval', subscribes: [] }, () => {})
    j.publish({ kind: 'task.updated', payload: {} })
    expect(seen[0].source).toBe('approval')
  })

  it('JoinResult.leave removes the member', () => {
    const bus = new CoAgentBus()
    const j = bus.join({ role: 'task', subscribes: [] }, () => {})
    j.leave()
    expect(bus.has('task')).toBe(false)
  })

  it('leave on unknown role returns false', () => {
    const bus = new CoAgentBus()
    expect(bus.leave('task')).toBe(false)
  })
})

describe('CoAgentCore', () => {
  it('joins the bus as `core` automatically', () => {
    const core = new CoAgentCore()
    expect(core.bus.has('core')).toBe(true)
  })

  it('records every event through observe()', () => {
    const core = new CoAgentCore()
    core.bus.publish('task', { kind: 'task.created', payload: { id: 't1' } })
    core.bus.publish('task', { kind: 'task.updated', payload: { id: 't1' } })
    const recent = core.recent()
    // family.member.joined for `core` itself, then the two events above.
    expect(recent.length).toBeGreaterThanOrEqual(3)
    expect(recent.at(-2)?.kind).toBe('task.created')
    expect(recent.at(-1)?.kind).toBe('task.updated')
  })

  it('caps the recent buffer to 256 events', () => {
    const core = new CoAgentCore()
    for (let i = 0; i < 300; i++) {
      core.bus.publish('task', { kind: 'task.updated', payload: { i } })
    }
    expect(core.recent(1024).length).toBeLessThanOrEqual(256)
  })

  it('join() rejects the `core` role at the type level (smoke check via call shape)', () => {
    const core = new CoAgentCore()
    // The type guard prevents `role: 'core'` at compile time; we
    // assert at runtime that the existing core registration stayed.
    core.join({ role: 'task', subscribes: [] }, () => {})
    expect(core.bus.has('core')).toBe(true)
    expect(core.bus.has('task')).toBe(true)
  })
})
