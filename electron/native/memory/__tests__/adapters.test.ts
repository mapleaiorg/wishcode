/**
 * Mem-2 — surface adapter tests.
 */

import { describe, expect, it } from 'vitest'
import {
  InMemoryMemoryStore,
  assembleAgentContext,
  assembleChatContext,
  assembleCodeContext,
} from '../index.js'

async function seed() {
  const s = new InMemoryMemoryStore()
  await s.put({ scope: 'personal', body: 'always cite sources' })
  await s.put({
    scope: 'workspace', body: 'use pnpm in this repo',
    bindings: { workspaceId: 'ws-1' },
  })
  await s.put({
    scope: 'workspace', body: 'other workspace note',
    bindings: { workspaceId: 'ws-other' },
  })
  await s.put({
    scope: 'session', body: 'investigating CI flake',
    bindings: { sessionId: 'sess-A' },
  })
  await s.put({
    scope: 'session', body: 'wrong session',
    bindings: { sessionId: 'sess-B' },
  })
  await s.put({
    scope: 'task', body: 'task scratch A',
    bindings: { taskId: 't-1' },
  })
  await s.put({
    scope: 'agent', body: 'agent scratch A',
    bindings: { agentId: 'a-1' },
  })
  return s
}

describe('assembleChatContext', () => {
  it('pulls personal + session for the bound session only', async () => {
    const s = await seed()
    const ctx = await assembleChatContext({ store: s, sessionId: 'sess-A' })
    const bodies = ctx.entries.map(e => e.entry.body)
    expect(bodies).toContain('always cite sources')
    expect(bodies).toContain('investigating CI flake')
    expect(bodies).not.toContain('wrong session')
    expect(bodies).not.toContain('task scratch A')
    expect(bodies).not.toContain('agent scratch A')
  })

  it('includes workspace scope when workspaceId is supplied', async () => {
    const s = await seed()
    const ctx = await assembleChatContext({
      store: s, sessionId: 'sess-A', workspaceId: 'ws-1',
    })
    const bodies = ctx.entries.map(e => e.entry.body)
    expect(bodies).toContain('use pnpm in this repo')
    expect(bodies).not.toContain('other workspace note')
  })

  it('excludes task / agent / team by default', async () => {
    const s = await seed()
    const ctx = await assembleChatContext({ store: s, sessionId: 'sess-A' })
    expect(ctx.scopeMix.task).toBe(0)
    expect(ctx.scopeMix.agent).toBe(0)
    expect(ctx.scopeMix.team).toBe(0)
  })
})

describe('assembleCodeContext', () => {
  it('pulls workspace + personal only', async () => {
    const s = await seed()
    const ctx = await assembleCodeContext({ store: s, workspaceId: 'ws-1' })
    const bodies = ctx.entries.map(e => e.entry.body)
    expect(bodies).toContain('use pnpm in this repo')
    expect(bodies).toContain('always cite sources')
    expect(bodies).not.toContain('investigating CI flake')
    expect(bodies).not.toContain('agent scratch A')
  })

  it('excludes other-workspace entries by binding filter', async () => {
    const s = await seed()
    const ctx = await assembleCodeContext({ store: s, workspaceId: 'ws-1' })
    expect(
      ctx.entries.every(
        (e: { entry: { scope: string; bindings: { workspaceId?: string } } }) =>
          e.entry.scope === 'personal' ||
          e.entry.bindings.workspaceId === 'ws-1',
      ),
    ).toBe(true)
  })

  it('default budget is 6000 chars', async () => {
    const s = new InMemoryMemoryStore()
    for (let i = 0; i < 20; i++) {
      await s.put({
        scope: 'workspace', body: 'x'.repeat(800),
        bindings: { workspaceId: 'ws-1' },
      })
    }
    const ctx = await assembleCodeContext({ store: s, workspaceId: 'ws-1' })
    expect(ctx.charCount).toBeLessThanOrEqual(6800)
  })
})

describe('assembleAgentContext', () => {
  it('pulls personal + workspace + task + agent for the bound subject', async () => {
    const s = await seed()
    const ctx = await assembleAgentContext({
      store: s, agentId: 'a-1', taskId: 't-1', workspaceId: 'ws-1',
    })
    const bodies = ctx.entries.map(e => e.entry.body)
    expect(bodies).toContain('always cite sources')
    expect(bodies).toContain('use pnpm in this repo')
    expect(bodies).toContain('task scratch A')
    expect(bodies).toContain('agent scratch A')
    expect(bodies).not.toContain('investigating CI flake')   // session excluded
    expect(bodies).not.toContain('other workspace note')
  })

  it('omits task scope when no taskId is bound', async () => {
    const s = await seed()
    const ctx = await assembleAgentContext({
      store: s, agentId: 'a-1', workspaceId: 'ws-1',
    })
    const bodies = ctx.entries.map(e => e.entry.body)
    expect(bodies).not.toContain('task scratch A')
  })

  it('respects maxEntries cap (default 16)', async () => {
    const s = new InMemoryMemoryStore()
    for (let i = 0; i < 30; i++) {
      await s.put({ scope: 'personal', body: `note ${i}` })
    }
    const ctx = await assembleAgentContext({ store: s, agentId: 'a-1' })
    expect(ctx.entries.length).toBeLessThanOrEqual(16)
  })
})
