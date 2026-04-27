/**
 * Cell-5 — CellGroup tests.
 */

import { describe, expect, it } from 'vitest'
import { CellGroup, defineGroup } from '../index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'

type DemoKind = 'demo.opened' | 'demo.closed'
const DEMO_KINDS = ['demo.opened', 'demo.closed'] as const

describe('CellGroup', () => {
  it('rejects invalid group ids', () => {
    expect(() => new CellGroup('bad space', DEMO_KINDS)).toThrow(/invalid/)
    expect(() => new CellGroup('Wrong.Case', DEMO_KINDS)).toThrow(/invalid/)
    expect(() => new CellGroup('only-one-segment', DEMO_KINDS)).toThrow(/invalid/)
  })

  it('accepts a valid id and knownKinds', () => {
    const g = new CellGroup<DemoKind>('wish.demo', DEMO_KINDS)
    expect(g.groupId).toBe('wish.demo')
    expect(g.size()).toBe(0)
  })

  it('join + publish + filter by subscribed kinds', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    const seen: string[] = []
    g.join({ memberId: 'a', subscribes: ['demo.opened'] }, e => seen.push(e.kind))
    g.publish('host', { kind: 'demo.opened', payload: {} })
    g.publish('host', { kind: 'demo.closed', payload: {} })
    expect(seen).toEqual(['demo.opened'])
  })

  it('rejects join with unknown kind', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    expect(() =>
      // deliberate cast to bypass the type guard for a runtime check
      g.join({ memberId: 'a', subscribes: ['demo.bogus' as DemoKind] }, () => {}),
    ).toThrow(/unknown event kind/)
  })

  it('publish rejects unknown kind', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    expect(() =>
      g.publish('host', { kind: 'demo.bogus' as DemoKind, payload: {} }),
    ).toThrow(/unknown event kind/)
  })

  it('rejects empty memberId', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    expect(() => g.join({ memberId: '', subscribes: [] }, () => {})).toThrow(/memberId/)
  })

  it('JoinResult.publish stamps source = memberId', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    const seen: { source: string }[] = []
    g.join({ memberId: 'observer', subscribes: ['demo.opened'] }, e =>
      seen.push({ source: e.source }),
    )
    const j = g.join({ memberId: 'publisher', subscribes: [] }, () => {})
    j.publish({ kind: 'demo.opened', payload: {} })
    expect(seen[0].source).toBe('publisher')
  })

  it('JoinResult.leave removes the member', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    const j = g.join({ memberId: 'a', subscribes: [] }, () => {})
    j.leave()
    expect(g.has('a')).toBe(false)
  })

  it('membership() snapshot is deep-copied', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    g.join({ memberId: 'a', subscribes: ['demo.opened'] }, () => {})
    const m = g.membership()
    m[0].subscribes.push('demo.closed')
    expect(g.membership()[0].subscribes).toEqual(['demo.opened'])
  })

  it('subscribersFor lists members for a given kind', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    g.join({ memberId: 'a', subscribes: ['demo.opened'] }, () => {})
    g.join({ memberId: 'b', subscribes: ['demo.opened', 'demo.closed'] }, () => {})
    expect(g.subscribersFor('demo.opened').sort()).toEqual(['a', 'b'])
    expect(g.subscribersFor('demo.closed')).toEqual(['b'])
  })

  it('thrown subscriber does not block other subscribers + emits subscriber_threw', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS, { telemetry: tel })
    let other = false
    g.join({ memberId: 'a', subscribes: ['demo.opened'] }, () => {
      throw new Error('boom')
    })
    g.join({ memberId: 'b', subscribes: ['demo.opened'] }, () => { other = true })
    g.publish('host', { kind: 'demo.opened', payload: {} })
    expect(other).toBe(true)
    expect(sink.events.some(e => e.type === 'wish.demo.subscriber_threw')).toBe(true)
  })

  it('emits {groupId}.event_delivered telemetry per publish', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS, { telemetry: tel })
    g.publish('host', { kind: 'demo.opened', payload: {} })
    expect(sink.events.some(e => e.type === 'wish.demo.event_delivered')).toBe(true)
  })

  it('emits joined / left telemetry on lifecycle changes', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS, { telemetry: tel })
    const j = g.join({ memberId: 'a', subscribes: [] }, () => {})
    j.leave()
    expect(sink.events.some(e => e.type === 'wish.demo.joined')).toBe(true)
    expect(sink.events.some(e => e.type === 'wish.demo.left')).toBe(true)
  })

  it('leave on unknown member returns false', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    expect(g.leave('nope')).toBe(false)
  })

  it('rejoin replaces the previous handler (last writer wins)', () => {
    const g = defineGroup<DemoKind>('wish.demo', DEMO_KINDS)
    const calls: string[] = []
    g.join({ memberId: 'a', subscribes: ['demo.opened'] }, () => calls.push('A'))
    g.join({ memberId: 'a', subscribes: ['demo.opened'] }, () => calls.push('B'))
    g.publish('host', { kind: 'demo.opened', payload: {} })
    expect(calls).toEqual(['B'])
  })
})
