import { describe, expect, it } from 'vitest'
import { CoAgentApprovals, CoAgentCore, type CoAgentEvent } from '../index.js'

function setup() {
  const core = new CoAgentCore()
  const a = new CoAgentApprovals(core)
  a.attach()
  return { core, a }
}

describe('CoAgentApprovals', () => {
  it('request creates a pending approval + publishes event', () => {
    const { core, a } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['approval.requested'] }, e => seen.push(e))
    const x = a.request({ topic: 'task.complete', summary: 's', requestedBy: 'agent:a' })
    expect(x.status).toBe('pending')
    expect(seen[0].payload.id).toBe(x.id)
  })

  it('rejects empty topic / requestedBy', () => {
    const { a } = setup()
    expect(() => a.request({ topic: '', summary: 's', requestedBy: 'u' })).toThrow(/topic/)
    expect(() => a.request({ topic: 't', summary: 's', requestedBy: '' })).toThrow(/requestedBy/)
  })

  it('grant transitions pending → granted + publishes', () => {
    const { core, a } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['approval.granted'] }, e => seen.push(e))
    const x = a.request({ topic: 't', summary: 's', requestedBy: 'u' })
    const g = a.grant(x.id, 'reviewer-1')
    expect(g.status).toBe('granted')
    expect(g.decidedBy).toBe('reviewer-1')
    expect(seen).toHaveLength(1)
  })

  it('deny transitions pending → denied + carries reason', () => {
    const { a } = setup()
    const x = a.request({ topic: 't', summary: 's', requestedBy: 'u' })
    const d = a.deny(x.id, 'reviewer-1', 'too risky')
    expect(d.status).toBe('denied')
    expect(d.reason).toBe('too risky')
  })

  it('cancel transitions pending → cancelled (no bus event)', () => {
    const { a } = setup()
    const x = a.request({ topic: 't', summary: 's', requestedBy: 'u' })
    expect(a.cancel(x.id).status).toBe('cancelled')
  })

  it('refuses to cancel/grant/deny a non-pending approval', () => {
    const { a } = setup()
    const x = a.request({ topic: 't', summary: 's', requestedBy: 'u' })
    a.grant(x.id, 'r')
    expect(() => a.cancel(x.id)).toThrow(/cannot cancel/)
    expect(() => a.grant(x.id, 'r')).toThrow(/already/)
    expect(() => a.deny(x.id, 'r')).toThrow(/already/)
  })

  it('list filters by status + topic, newest first', () => {
    const { a } = setup()
    const x = a.request({ topic: 't1', summary: 's', requestedBy: 'u' })
    a.request({ topic: 't2', summary: 's', requestedBy: 'u' })
    a.grant(x.id, 'r')
    expect(a.list({ status: 'granted' }).map(z => z.id)).toEqual([x.id])
    expect(a.list({ topic: 't2' })).toHaveLength(1)
  })

  it('applies peer requested events when enabled', () => {
    const core = new CoAgentCore()
    const a = new CoAgentApprovals(core, { applyPeerEvents: true })
    a.attach()
    core.bus.publish('orchestration', {
      kind: 'approval.requested',
      payload: { id: 'remote-1', topic: 't', summary: 's' },
    })
    expect(a.peerEventsApplied()).toBe(1)
    expect(a.get('remote-1')?.status).toBe('pending')
  })

  it('attach + detach lifecycle', () => {
    const core = new CoAgentCore()
    const a = new CoAgentApprovals(core)
    a.attach(); a.attach()
    expect(a.isAttached()).toBe(true)
    a.detach()
    expect(core.bus.has('approval')).toBe(false)
  })
})
