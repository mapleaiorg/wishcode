import { describe, expect, it } from 'vitest'
import { CoAgentCore, CoAgentDeliverables, type CoAgentEvent } from '../index.js'

function setup() {
  const core = new CoAgentCore()
  const d = new CoAgentDeliverables(core)
  d.attach()
  return { core, d }
}

describe('CoAgentDeliverables — outbound', () => {
  it('publishes deliverable.published on publish()', () => {
    const { core, d } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['deliverable.published'] }, e => seen.push(e))
    const x = d.publish({ taskId: 't1', title: 'Report', kind: 'markdown.report', author: 'agent:a' })
    expect(seen).toHaveLength(1)
    expect(seen[0].source).toBe('deliverable')
    expect(seen[0].payload.id).toBe(x.id)
    expect(seen[0].payload.version).toBe(1)
  })

  it('rejects empty taskId / title', () => {
    const { d } = setup()
    expect(() => d.publish({ taskId: '', title: 't', kind: 'k', author: 'a' })).toThrow(/taskId/)
    expect(() => d.publish({ taskId: 't', title: '  ', kind: 'k', author: 'a' })).toThrow(/title/)
  })

  it('revise bumps version + sets parent + supersedes prior', () => {
    const { core, d } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['deliverable.revised'] }, e => seen.push(e))
    const v1 = d.publish({ taskId: 't1', title: 'v1', kind: 'k', author: 'a' })
    const v2 = d.revise({ parentId: v1.id, payload: { x: 2 }, author: 'a' })
    expect(v2.version).toBe(2)
    expect(v2.parent).toBe(v1.id)
    expect(d.get(v1.id)?.supersededBy).toBe(v2.id)
    expect(seen).toHaveLength(1)
  })

  it('revise refuses an already-superseded parent', () => {
    const { d } = setup()
    const v1 = d.publish({ taskId: 't1', title: 'v1', kind: 'k', author: 'a' })
    d.revise({ parentId: v1.id, author: 'a' })
    expect(() => d.revise({ parentId: v1.id, author: 'a' })).toThrow(/already superseded/)
  })

  it('latest(taskId, kind) returns newest version', () => {
    const { d } = setup()
    const v1 = d.publish({ taskId: 't1', title: 'v1', kind: 'k', author: 'a' })
    const v2 = d.revise({ parentId: v1.id, author: 'a' })
    expect(d.latest('t1', 'k')?.id).toBe(v2.id)
  })

  it('listByTask sorts by createdAt', () => {
    const { d } = setup()
    d.publish({ taskId: 't1', title: 'A', kind: 'k', author: 'a' })
    d.publish({ taskId: 't1', title: 'B', kind: 'k2', author: 'a' })
    d.publish({ taskId: 't2', title: 'C', kind: 'k', author: 'a' })
    expect(d.listByTask('t1').map(x => x.title)).toEqual(['A', 'B'])
  })

  it('history walks parent chain newest-first', () => {
    const { d } = setup()
    const v1 = d.publish({ taskId: 't1', title: 'v1', kind: 'k', author: 'a' })
    const v2 = d.revise({ parentId: v1.id, author: 'a' })
    const v3 = d.revise({ parentId: v2.id, author: 'a' })
    expect(d.history(v3.id).map(x => x.id)).toEqual([v3.id, v2.id, v1.id])
  })
})

describe('CoAgentDeliverables — inbound + lifecycle', () => {
  it('ignores peer events when applyPeerEvents=false', () => {
    const core = new CoAgentCore()
    const d = new CoAgentDeliverables(core, { applyPeerEvents: false })
    d.attach()
    core.bus.publish('approval', {
      kind: 'deliverable.published',
      payload: { id: 'remote-1', taskId: 't', kind: 'k', version: 1, title: 'R' },
    })
    expect(d.peerEventsApplied()).toBe(0)
  })

  it('applies peer publishes when enabled', () => {
    const core = new CoAgentCore()
    const d = new CoAgentDeliverables(core, { applyPeerEvents: true })
    d.attach()
    core.bus.publish('approval', {
      kind: 'deliverable.published',
      payload: { id: 'remote-1', taskId: 't', kind: 'k', version: 1, title: 'R' },
    })
    expect(d.peerEventsApplied()).toBe(1)
    expect(d.get('remote-1')?.title).toBe('R')
  })

  it('attach idempotent, detach removes member', () => {
    const core = new CoAgentCore()
    const d = new CoAgentDeliverables(core)
    d.attach(); d.attach()
    expect(d.isAttached()).toBe(true)
    d.detach()
    expect(d.isAttached()).toBe(false)
    expect(core.bus.has('deliverable')).toBe(false)
  })
})
