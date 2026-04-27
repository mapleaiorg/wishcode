/**
 * Mem-0 — InMemoryMemoryStore tests.
 */

import { describe, expect, it } from 'vitest'
import { InMemoryMemoryStore, MEMORY_SCOPES } from '../index.js'

function fresh(): InMemoryMemoryStore {
  return new InMemoryMemoryStore()
}

describe('InMemoryMemoryStore', () => {
  it('round-trips a personal entry', async () => {
    const s = fresh()
    const a = await s.put({ scope: 'personal', body: 'hi' })
    const back = await s.get(a.id)
    expect(back?.body).toBe('hi')
    expect(back?.scope).toBe('personal')
    expect(back?.pinned).toBe(false)
    expect(back?.tags).toEqual([])
  })

  it('rejects empty body', async () => {
    const s = fresh()
    await expect(s.put({ scope: 'personal', body: '' })).rejects.toThrow(/body/)
  })

  it('requires sessionId on session-scoped entries', async () => {
    const s = fresh()
    await expect(s.put({ scope: 'session', body: 'x' })).rejects.toThrow(/sessionId/)
  })

  it('requires workspaceId on workspace-scoped entries', async () => {
    const s = fresh()
    await expect(s.put({ scope: 'workspace', body: 'x' })).rejects.toThrow(/workspaceId/)
  })

  it('requires taskId on task-scoped entries', async () => {
    const s = fresh()
    await expect(s.put({ scope: 'task', body: 'x' })).rejects.toThrow(/taskId/)
    const ok = await s.put({ scope: 'task', body: 'x', bindings: { taskId: 't1' } })
    expect(ok.bindings.taskId).toBe('t1')
  })

  it('rejects unknown scopes', async () => {
    const s = fresh()
    // @ts-expect-error
    await expect(s.put({ scope: 'nope', body: 'x' })).rejects.toThrow(/scope/)
  })

  it('list filters by scope', async () => {
    const s = fresh()
    await s.put({ scope: 'personal', body: 'p' })
    await s.put({
      scope: 'session', body: 's', bindings: { sessionId: 'a' },
    })
    const onlyPersonal = await s.list({ scopes: ['personal'] })
    expect(onlyPersonal).toHaveLength(1)
    expect(onlyPersonal[0].scope).toBe('personal')
  })

  it('list filters by tags', async () => {
    const s = fresh()
    await s.put({ scope: 'personal', body: 'a', tags: ['x'] })
    await s.put({ scope: 'personal', body: 'b', tags: ['y'] })
    const xs = await s.list({ tags: ['x'] })
    expect(xs).toHaveLength(1)
    expect(xs[0].body).toBe('a')
  })

  it('list filters by bindings', async () => {
    const s = fresh()
    await s.put({ scope: 'session', body: 'a', bindings: { sessionId: 'A' } })
    await s.put({ scope: 'session', body: 'b', bindings: { sessionId: 'B' } })
    const a = await s.list({ scopes: ['session'], bindings: { sessionId: 'A' } })
    expect(a).toHaveLength(1)
    expect(a[0].body).toBe('a')
  })

  it('list does case-insensitive substring search on body', async () => {
    const s = fresh()
    await s.put({ scope: 'personal', body: 'Wish Code is great' })
    await s.put({ scope: 'personal', body: 'unrelated' })
    const hits = await s.list({ query: 'WISH' })
    expect(hits).toHaveLength(1)
    expect(hits[0].body).toBe('Wish Code is great')
  })

  it('list pinnedOnly returns only pinned entries', async () => {
    const s = fresh()
    await s.put({ scope: 'personal', body: 'pin me', pinned: true })
    await s.put({ scope: 'personal', body: 'not pinned' })
    const hits = await s.list({ pinnedOnly: true })
    expect(hits).toHaveLength(1)
    expect(hits[0].pinned).toBe(true)
  })

  it('list applies limit + sorts newest first', async () => {
    const s = fresh()
    for (let i = 0; i < 10; i++) {
      await s.put({ scope: 'personal', body: `e${i}` })
    }
    const hits = await s.list({ limit: 3 })
    expect(hits).toHaveLength(3)
    // newest first => e9, e8, e7
    expect(hits.map(h => h.body)).toEqual(['e9', 'e8', 'e7'])
  })

  it('update mutates body + tags + pinned + updatedAt', async () => {
    const s = fresh()
    const a = await s.put({ scope: 'personal', body: 'old' })
    await new Promise(r => setTimeout(r, 5))
    const b = await s.update(a.id, { body: 'new', tags: ['t'], pinned: true })
    expect(b.body).toBe('new')
    expect(b.tags).toEqual(['t'])
    expect(b.pinned).toBe(true)
    expect(b.updatedAt > a.updatedAt).toBe(true)
  })

  it('update refuses scope changes', async () => {
    const s = fresh()
    const a = await s.put({ scope: 'personal', body: 'x' })
    await expect(
      s.update(a.id, { scope: 'session' }),
    ).rejects.toThrow(/scope/)
  })

  it('update on missing id throws', async () => {
    const s = fresh()
    await expect(s.update('missing', { body: 'x' })).rejects.toThrow(/not found/)
  })

  it('remove returns true on first call, false thereafter', async () => {
    const s = fresh()
    const a = await s.put({ scope: 'personal', body: 'x' })
    expect(await s.remove(a.id)).toBe(true)
    expect(await s.remove(a.id)).toBe(false)
  })

  it('prune drops entries by scope + bindings', async () => {
    const s = fresh()
    await s.put({ scope: 'session', body: 'a', bindings: { sessionId: 'A' } })
    await s.put({ scope: 'session', body: 'b', bindings: { sessionId: 'A' } })
    await s.put({ scope: 'session', body: 'c', bindings: { sessionId: 'B' } })
    const dropped = await s.prune('session', { sessionId: 'A' })
    expect(dropped).toBe(2)
    const remaining = await s.list({ scopes: ['session'] })
    expect(remaining).toHaveLength(1)
    expect(remaining[0].bindings.sessionId).toBe('B')
  })

  it('exposes the scope vocabulary as a frozen list', () => {
    expect(MEMORY_SCOPES).toContain('personal')
    expect(MEMORY_SCOPES).toContain('agent')
    expect(MEMORY_SCOPES.length).toBe(6)
  })

  it('returns a copy of the entry on get to prevent caller mutation', async () => {
    const s = fresh()
    const a = await s.put({ scope: 'personal', body: 'x', tags: ['original'] })
    const back = await s.get(a.id)
    back!.tags.push('mutated')
    const back2 = await s.get(a.id)
    expect(back2!.tags).toEqual(['original'])
  })
})
