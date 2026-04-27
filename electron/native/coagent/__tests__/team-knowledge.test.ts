import { describe, expect, it } from 'vitest'
import { CoAgentCore, CoAgentTeamKnowledge } from '../index.js'
import { InMemoryProvenanceStore } from '../../knowledge/index.js'

function setup() {
  const provenance = new InMemoryProvenanceStore()
  const core = new CoAgentCore()
  const k = new CoAgentTeamKnowledge(provenance, core)
  k.attach()
  return { provenance, core, k }
}

describe('CoAgentTeamKnowledge', () => {
  it('cite records to K-3 + publishes knowledge.cited', async () => {
    const { core, k } = setup()
    const seen: unknown[] = []
    core.bus.join({ role: 'activity', subscribes: ['knowledge.cited'] }, e => seen.push(e.payload))
    const r = await k.cite({
      actionKind: 'agent.message', actionId: 'm1', author: 'agent:a',
      refs: [{ sourceId: 's1', chunkId: 'c1' }],
    })
    expect(r.recordId).toBeTruthy()
    expect(seen).toHaveLength(1)
  })

  it('counts citations per source', async () => {
    const { k } = setup()
    await k.cite({ actionKind: 'a.b', actionId: '1', author: 'u', refs: [{ sourceId: 's1' }] })
    await k.cite({ actionKind: 'a.b', actionId: '2', author: 'u', refs: [{ sourceId: 's1' }, { sourceId: 's2' }] })
    expect(k.citationCount('s1')).toBe(2)
    expect(k.citationCount('s2')).toBe(1)
    expect(k.citationCount('missing')).toBe(0)
  })

  it('topCitedSources returns descending count', async () => {
    const { k } = setup()
    for (let i = 0; i < 3; i++) {
      await k.cite({ actionKind: 'a.b', actionId: `${i}`, author: 'u', refs: [{ sourceId: 'a' }] })
    }
    await k.cite({ actionKind: 'a.b', actionId: 'x', author: 'u', refs: [{ sourceId: 'b' }] })
    expect(k.topCitedSources(2)).toEqual([
      { sourceId: 'a', count: 3 }, { sourceId: 'b', count: 1 },
    ])
  })

  it('peer events bump counts when applyPeerEvents=true', () => {
    const provenance = new InMemoryProvenanceStore()
    const core = new CoAgentCore()
    const k = new CoAgentTeamKnowledge(provenance, core, { applyPeerEvents: true })
    k.attach()
    core.bus.publish('orchestration', {
      kind: 'knowledge.cited',
      payload: { sourceIds: ['s1', 's2', 's1'] },
    })
    expect(k.peerEventsApplied()).toBe(1)
    expect(k.citationCount('s1')).toBe(2)
    expect(k.citationCount('s2')).toBe(1)
  })

  it('attach + detach', () => {
    const core = new CoAgentCore()
    const k = new CoAgentTeamKnowledge(new InMemoryProvenanceStore(), core)
    k.attach()
    expect(k.isAttached()).toBe(true)
    k.detach()
    expect(core.bus.has('knowledge')).toBe(false)
  })
})
