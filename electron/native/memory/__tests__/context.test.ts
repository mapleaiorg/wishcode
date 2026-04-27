/**
 * Mem-1 — Context assembly tests.
 */

import { describe, expect, it } from 'vitest'
import {
  InMemoryMemoryStore,
  assembleContext,
  rankCandidates,
  renderEntry,
  type MemoryEntry,
} from '../index.js'

async function seed(): Promise<InMemoryMemoryStore> {
  const s = new InMemoryMemoryStore()
  await s.put({ scope: 'personal', body: 'always reject flaky tests', tags: ['testing'] })
  await s.put({
    scope: 'workspace',
    body: 'use pnpm not npm in this repo',
    bindings: { workspaceId: 'ws-1' },
    tags: ['build'],
  })
  await s.put({
    scope: 'session',
    body: 'we are debugging a flaky CI step in workflow.yml',
    bindings: { sessionId: 'sess-1' },
  })
  await s.put({
    scope: 'task',
    body: 'investigate the auth.ts redirect loop',
    bindings: { taskId: 't-1' },
  })
  await s.put({
    scope: 'agent',
    body: 'last tool call returned 17 results',
    bindings: { agentId: 'a-1' },
  })
  return s
}

describe('rankCandidates', () => {
  it('puts personal scope ahead of session/task/agent on a query miss', async () => {
    const s = await seed()
    const all = await s.list({})
    const ranked = rankCandidates(all, '')
    expect(ranked[0].entry.scope).toBe('personal')
  })

  it('substring match dominates scope priority', async () => {
    const s = await seed()
    // The session entry has "flaky CI" — query "flaky CI" should bring
    // it ahead of the personal "flaky tests" entry, because the
    // substring bonus (+0.6) outweighs the small scope delta.
    const all = await s.list({})
    const ranked = rankCandidates(all, 'flaky CI')
    expect(ranked[0].entry.scope).toBe('session')
  })

  it('token overlap lifts a matching entry above no-overlap entries of the same scope', async () => {
    const s = new InMemoryMemoryStore()
    await s.put({ scope: 'workspace', body: 'use pnpm not npm in this repo', bindings: { workspaceId: 'ws-1' } })
    await s.put({ scope: 'workspace', body: 'log files live in tmp', bindings: { workspaceId: 'ws-1' } })
    const ranked = rankCandidates(await s.list({}), 'pnpm build repo')
    expect(ranked[0].entry.body).toContain('pnpm')
  })

  it('returns reasons for each scored entry', async () => {
    const s = await seed()
    const all = await s.list({})
    const ranked = rankCandidates(all, 'flaky')
    expect(ranked[0].reasons.length).toBeGreaterThan(0)
    expect(ranked[0].reasons.some(r => r.startsWith('scope:'))).toBe(true)
  })

  it('recency breaks ties on equal score', async () => {
    const s = new InMemoryMemoryStore()
    await s.put({ scope: 'personal', body: 'older' })
    // sleep 5ms so the second entry has a strictly newer updatedAt.
    await new Promise(r => setTimeout(r, 5))
    await s.put({ scope: 'personal', body: 'newer' })
    const ranked = rankCandidates(await s.list({}), '')
    expect(ranked[0].entry.body).toBe('newer')
  })
})

describe('assembleContext', () => {
  it('returns the highest-score entries first', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, { query: 'flaky CI' })
    expect(ctx.entries.length).toBeGreaterThan(0)
    expect(ctx.entries[0].entry.scope).toBe('session')
  })

  it('respects maxEntries', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, { maxEntries: 2 })
    expect(ctx.entries).toHaveLength(2)
  })

  it('respects budgetChars (caps body length)', async () => {
    const s = new InMemoryMemoryStore()
    for (let i = 0; i < 10; i++) {
      await s.put({ scope: 'personal', body: 'x'.repeat(500) })
    }
    const ctx = await assembleContext(s, { budgetChars: 1000 })
    expect(ctx.charCount).toBeLessThanOrEqual(1100)
  })

  it('always emits at least one entry even if it exceeds budget', async () => {
    const s = new InMemoryMemoryStore()
    await s.put({ scope: 'personal', body: 'x'.repeat(2000) })
    const ctx = await assembleContext(s, { budgetChars: 100 })
    expect(ctx.entries).toHaveLength(1)
  })

  it('filters by scope', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, { scopes: ['personal'] })
    expect(ctx.entries.every(e => e.entry.scope === 'personal')).toBe(true)
  })

  it('filters by bindings', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, {
      scopes: ['workspace'],
      bindings: { workspaceId: 'ws-1' },
    })
    expect(ctx.entries.every(e => e.entry.bindings.workspaceId === 'ws-1')).toBe(true)
  })

  it('filters pinnedOnly', async () => {
    const s = await seed()
    await s.put({ scope: 'personal', body: 'pinned thing', pinned: true })
    const ctx = await assembleContext(s, { pinnedOnly: true })
    expect(ctx.entries).toHaveLength(1)
    expect(ctx.entries[0].entry.pinned).toBe(true)
  })

  it('reports candidateCount = total before budgeting', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, { maxEntries: 2 })
    expect(ctx.candidateCount).toBeGreaterThanOrEqual(2)
  })

  it('scopeMix counts accepted entries by scope', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, { maxEntries: 99 })
    const total = Object.values(ctx.scopeMix).reduce((a, b) => a + b, 0)
    expect(total).toBe(ctx.entries.length)
  })

  it('renders body with header prefixes per entry', async () => {
    const s = await seed()
    const ctx = await assembleContext(s, { maxEntries: 99 })
    const headerCount = (ctx.body.match(/^### memory:/gm) ?? []).length
    expect(headerCount).toBe(ctx.entries.length)
  })

  it('handles an empty store gracefully', async () => {
    const s = new InMemoryMemoryStore()
    const ctx = await assembleContext(s, { query: 'anything' })
    expect(ctx.entries).toHaveLength(0)
    expect(ctx.body).toBe('')
    expect(ctx.candidateCount).toBe(0)
  })
})

describe('renderEntry', () => {
  it('includes scope, pinned marker, and tag list', () => {
    const e: MemoryEntry = {
      id: 'm1', scope: 'personal',
      body: 'remember this', tags: ['rule', 'voice'],
      pinned: true, bindings: {},
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    }
    const out = renderEntry(e)
    expect(out).toContain('### memory:personal')
    expect(out).toContain('(pinned)')
    expect(out).toContain('[rule,voice]')
    expect(out).toContain('remember this')
  })

  it('omits tag list when no tags', () => {
    const e: MemoryEntry = {
      id: 'm1', scope: 'session', body: 'x', tags: [],
      pinned: false, bindings: { sessionId: 's' },
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    }
    expect(renderEntry(e)).not.toContain('[]')
  })
})
