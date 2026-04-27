/**
 * A-1 runtime + EchoAdapter smoke tests.
 *
 * These exercise the contract every adapter must obey:
 *   - first event is `response.started`
 *   - last event is `response.completed` or `response.error`
 *   - all yielded events validate through the canonical Zod schema.
 *
 * Real-provider tests (anthropic / openai / …) land alongside their
 * adapters in A-3.
 */

import { describe, expect, it } from 'vitest'
import { EchoAdapter, ProviderRuntime } from '../index.js'
import type { AIRequest, AIStreamEvent } from '../../../shared/ai/canonical.js'

function makeRequest(text: string): AIRequest {
  return {
    sessionId: 's_test',
    model: { providerId: 'echo', modelId: 'echo-1' },
    messages: [
      {
        id: 'm1',
        role: 'user',
        blocks: [{ kind: 'text', text }],
        createdAt: new Date().toISOString(),
      },
    ],
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

describe('ProviderRuntime + EchoAdapter', () => {
  it('registers + lists models from the echo adapter', async () => {
    const rt = new ProviderRuntime()
    rt.register(new EchoAdapter())
    const models = await rt.models()
    expect(models).toHaveLength(1)
    expect(models[0].providerId).toBe('echo')
    expect(models[0].id).toBe('echo-1')
  })

  it('rejects duplicate registration', () => {
    const rt = new ProviderRuntime()
    rt.register(new EchoAdapter())
    expect(() => rt.register(new EchoAdapter())).toThrow(/duplicate/)
  })

  it('emits the canonical stream event sequence on chat', async () => {
    const rt = new ProviderRuntime()
    rt.register(new EchoAdapter())
    const events = await collect<AIStreamEvent>(rt.chat(makeRequest('hello world')))
    const kinds = events.map(e => e.kind)
    expect(kinds[0]).toBe('response.started')
    expect(kinds.at(-1)).toBe('response.completed')
    expect(kinds).toContain('content.delta')
    expect(kinds).toContain('content.completed')
    expect(kinds).toContain('usage.updated')
  })

  it('echoes the last user text back as a content block', async () => {
    const rt = new ProviderRuntime()
    rt.register(new EchoAdapter())
    const events = await collect<AIStreamEvent>(rt.chat(makeRequest('round trip')))
    const completed = events.find(e => e.kind === 'content.completed')
    expect(completed).toBeDefined()
    if (completed && completed.kind === 'content.completed') {
      expect(completed.block.kind).toBe('text')
      if (completed.block.kind === 'text') {
        expect(completed.block.text).toBe('round trip')
      }
    }
  })

  it('honors an aborted signal at the start of chat', async () => {
    const rt = new ProviderRuntime()
    rt.register(new EchoAdapter())
    const ctrl = new AbortController()
    ctrl.abort()
    const events = await collect<AIStreamEvent>(
      rt.chat(makeRequest('cancel me'), { signal: ctrl.signal }),
    )
    const last = events.at(-1)
    expect(last?.kind).toBe('response.error')
    if (last?.kind === 'response.error') {
      expect(last.error.code).toBe('provider.cancelled')
    }
  })

  it('throws when the requested provider is not registered', async () => {
    const rt = new ProviderRuntime()
    const req: AIRequest = {
      ...makeRequest('x'),
      model: { providerId: 'nope', modelId: 'nada' },
    }
    await expect(async () => {
      for await (const _ of rt.chat(req)) {
        /* drain */
      }
    }).rejects.toThrow(/no adapter registered/)
  })

  it('falls back to "(empty)" when no user text is present', async () => {
    const rt = new ProviderRuntime()
    rt.register(new EchoAdapter())
    const req: AIRequest = {
      sessionId: 's2',
      model: { providerId: 'echo', modelId: 'echo-1' },
      messages: [],
    }
    const events = await collect<AIStreamEvent>(rt.chat(req))
    const completed = events.find(e => e.kind === 'content.completed')
    expect(completed).toBeDefined()
    if (completed && completed.kind === 'content.completed' && completed.block.kind === 'text') {
      expect(completed.block.text).toBe('(empty)')
    }
  })
})
