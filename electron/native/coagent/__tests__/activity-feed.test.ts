import { describe, expect, it } from 'vitest'
import { CoAgentActivityFeed, CoAgentCore } from '../index.js'

function setup() {
  const core = new CoAgentCore()
  const feed = new CoAgentActivityFeed(core)
  feed.attach()
  return { core, feed }
}

describe('CoAgentActivityFeed', () => {
  it('captures every observed event into the feed', () => {
    const { core, feed } = setup()
    core.bus.publish('task', { kind: 'task.created', payload: { id: 't1' } })
    core.bus.publish('approval', { kind: 'approval.requested', payload: { id: 'a1' } })
    expect(feed.size()).toBeGreaterThanOrEqual(2)
  })

  it('list filters by kinds and source, newest first', () => {
    const { core, feed } = setup()
    core.bus.publish('task', { kind: 'task.created', payload: {} })
    core.bus.publish('approval', { kind: 'approval.requested', payload: {} })
    core.bus.publish('task', { kind: 'task.updated', payload: {} })
    const onlyTaskCreated = feed.list({ kinds: ['task.created'] })
    expect(onlyTaskCreated).toHaveLength(1)
    expect(onlyTaskCreated[0].event.kind).toBe('task.created')
    const fromTask = feed.list({ source: 'task' })
    expect(fromTask.length).toBeGreaterThanOrEqual(2)
    expect(fromTask.every(e => e.event.source === 'task')).toBe(true)
  })

  it('respects limit option', () => {
    const { core, feed } = setup()
    for (let i = 0; i < 10; i++) {
      core.bus.publish('task', { kind: 'task.updated', payload: { i } })
    }
    expect(feed.list({ limit: 3 }).length).toBe(3)
  })

  it('caps internal buffer (FIFO drop oldest)', () => {
    const core = new CoAgentCore()
    const feed = new CoAgentActivityFeed(core, { maxEntries: 3 })
    feed.attach()
    for (let i = 0; i < 8; i++) {
      core.bus.publish('task', { kind: 'task.updated', payload: { i } })
    }
    expect(feed.size()).toBe(3)
  })

  it('does not feed-loop on its own activity.appended events', () => {
    const { core, feed } = setup()
    core.bus.publish('task', { kind: 'task.created', payload: {} })
    const before = feed.size()
    // re-publishing as 'activity' source should be ignored
    core.bus.publish('activity', { kind: 'activity.appended', payload: { x: 1 } })
    expect(feed.size()).toBe(before)
  })

  it('tracks per-role presence', () => {
    const { core, feed } = setup()
    core.bus.publish('task', { kind: 'task.created', payload: {} })
    core.bus.publish('approval', { kind: 'approval.requested', payload: {} })
    expect(feed.presenceFor('task')).toBeTruthy()
    expect(feed.presenceFor('approval')).toBeTruthy()
    const all = feed.presenceAll()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('clear empties feed and presence', () => {
    const { core, feed } = setup()
    core.bus.publish('task', { kind: 'task.created', payload: {} })
    feed.clear()
    expect(feed.size()).toBe(0)
    expect(feed.presenceFor('task')).toBeNull()
  })

  it('detach + attach idempotency', () => {
    const core = new CoAgentCore()
    const feed = new CoAgentActivityFeed(core)
    feed.attach(); feed.attach()
    expect(feed.isAttached()).toBe(true)
    feed.detach()
    expect(core.bus.has('activity')).toBe(false)
  })

  it('returns deep-copied entries (caller mutation isolation)', () => {
    const { core, feed } = setup()
    core.bus.publish('task', { kind: 'task.created', payload: { id: 't1' } })
    const e = feed.list()[0]
    e.event.payload.id = 'mutated'
    expect(feed.list()[0].event.payload.id).toBe('t1')
  })
})
