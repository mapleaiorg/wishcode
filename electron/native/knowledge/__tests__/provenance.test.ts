/**
 * K-3 — InMemoryProvenanceStore tests.
 */

import { describe, expect, it } from 'vitest'
import { InMemoryProvenanceStore } from '../provenance.js'

function ref(sourceId: string, chunkId?: string) {
  return { sourceId, chunkId, score: 1, hints: { snippet: 'x' } }
}

describe('InMemoryProvenanceStore', () => {
  it('records + retrieves a single entry', async () => {
    const s = new InMemoryProvenanceStore()
    const r = await s.record({
      actionKind: 'agent.message',
      actionId: 'msg-1',
      author: 'agent:a1',
      refs: [ref('src-1', 'c-1')],
    })
    expect(r.id).toMatch(/^prov_/)
    expect(r.refs[0].sourceId).toBe('src-1')
    expect((await s.get(r.id))?.actionId).toBe('msg-1')
  })

  it('rejects empty actionId / author', async () => {
    const s = new InMemoryProvenanceStore()
    await expect(
      s.record({ actionKind: 'a.b', actionId: '', author: 'u', refs: [] }),
    ).rejects.toThrow(/actionId/)
    await expect(
      s.record({ actionKind: 'a.b', actionId: 'x', author: '', refs: [] }),
    ).rejects.toThrow(/author/)
  })

  it('latest returns the most recent record per (kind, id)', async () => {
    const s = new InMemoryProvenanceStore()
    await s.record({ actionKind: 'agent.message', actionId: 'msg-1', author: 'u', refs: [] })
    await new Promise(r => setTimeout(r, 5))
    const r2 = await s.record({
      actionKind: 'agent.message', actionId: 'msg-1', author: 'u', refs: [ref('s', 'c2')],
    })
    expect((await s.latest('agent.message', 'msg-1'))?.id).toBe(r2.id)
  })

  it('parent chain — history walks newest-first', async () => {
    const s = new InMemoryProvenanceStore()
    const v1 = await s.record({ actionKind: 'a.b', actionId: 'x', author: 'u', refs: [] })
    const v2 = await s.record({ actionKind: 'a.b', actionId: 'x', author: 'u', refs: [], parent: v1.id })
    const v3 = await s.record({ actionKind: 'a.b', actionId: 'x', author: 'u', refs: [], parent: v2.id })
    const hist = await s.history(v3.id)
    expect(hist.map(r => r.id)).toEqual([v3.id, v2.id, v1.id])
  })

  it('rejects unknown parent', async () => {
    const s = new InMemoryProvenanceStore()
    await expect(
      s.record({ actionKind: 'a.b', actionId: 'x', author: 'u', refs: [], parent: 'no' }),
    ).rejects.toThrow(/parent/)
  })

  it('list filters by actionKind (single + array)', async () => {
    const s = new InMemoryProvenanceStore()
    await s.record({ actionKind: 'agent.message', actionId: '1', author: 'u', refs: [] })
    await s.record({ actionKind: 'file.write', actionId: '2', author: 'u', refs: [] })
    await s.record({ actionKind: 'task.update', actionId: '3', author: 'u', refs: [] })
    expect((await s.list({ actionKind: 'agent.message' })).map(r => r.actionId)).toEqual(['1'])
    expect(
      (await s.list({ actionKind: ['agent.message', 'file.write'] })).map(r => r.actionId).sort(),
    ).toEqual(['1', '2'])
  })

  it('list filters by actionId + author', async () => {
    const s = new InMemoryProvenanceStore()
    await s.record({ actionKind: 'a.b', actionId: 'x', author: 'alice', refs: [] })
    await s.record({ actionKind: 'a.b', actionId: 'x', author: 'bob', refs: [] })
    await s.record({ actionKind: 'a.b', actionId: 'y', author: 'alice', refs: [] })
    expect((await s.list({ actionId: 'x' })).length).toBe(2)
    expect((await s.list({ author: 'alice' })).length).toBe(2)
    expect((await s.list({ actionId: 'x', author: 'alice' })).length).toBe(1)
  })

  it('list since/until time bounds', async () => {
    const s = new InMemoryProvenanceStore()
    const before = new Date(Date.now() - 1000).toISOString()
    const after = new Date(Date.now() + 60_000).toISOString()
    await s.record({ actionKind: 'a.b', actionId: 'x', author: 'u', refs: [] })
    expect((await s.list({ since: before })).length).toBe(1)
    expect((await s.list({ until: before })).length).toBe(0)
    expect((await s.list({ since: after })).length).toBe(0)
  })

  it('list returns newest-first', async () => {
    const s = new InMemoryProvenanceStore()
    await s.record({ actionKind: 'a.b', actionId: '1', author: 'u', refs: [] })
    await new Promise(r => setTimeout(r, 5))
    await s.record({ actionKind: 'a.b', actionId: '2', author: 'u', refs: [] })
    const out = await s.list({})
    expect(out.map(r => r.actionId)).toEqual(['2', '1'])
  })

  it('list applies limit', async () => {
    const s = new InMemoryProvenanceStore()
    for (let i = 0; i < 10; i++) {
      await s.record({ actionKind: 'a.b', actionId: `${i}`, author: 'u', refs: [] })
    }
    expect((await s.list({ limit: 3 })).length).toBe(3)
  })

  it('returns deep copies on get/list/history (caller mutation isolation)', async () => {
    const s = new InMemoryProvenanceStore()
    const r = await s.record({
      actionKind: 'a.b', actionId: 'x', author: 'u', refs: [ref('s', 'c')],
    })
    const got = await s.get(r.id)
    if (got) got.refs[0].sourceId = 'mutated'
    expect((await s.get(r.id))?.refs[0].sourceId).toBe('s')
  })
})
