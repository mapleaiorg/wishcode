/**
 * A-2 agent runtime tests.
 *
 * The tests use a deterministic in-memory provider that yields a
 * scripted sequence of canonical events. This isolates the agent
 * loop logic from real provider streaming.
 */

import { describe, expect, it } from 'vitest'
import { AgentRuntime, InMemoryToolDispatcher } from '../index.js'
import type {
  AIRequest,
  AIStreamEvent,
  AIProvider,
  AIModel,
  AIMessage,
} from '../../../shared/ai/canonical.js'
import type { ProviderAdapter } from '../../ai/adapter.js'
import { ProviderRuntime } from '../../ai/index.js'

const PROV: AIProvider = { id: 'scripted', displayName: 'Scripted', kind: 'first-party' }
const MODEL: AIModel = {
  id: 'm', providerId: 'scripted', displayName: 'M',
  capabilities: { streaming: true, tools: true, structuredOutput: false, imageInput: false, audioInput: false, fileInput: false, reasoning: false },
  contextWindow: 1024, maxOutputTokens: 1024,
}

class ScriptedAdapter implements ProviderAdapter {
  readonly descriptor = PROV
  constructor(private readonly turns: AIStreamEvent[][]) {}
  private callIdx = 0

  async listModels(): Promise<AIModel[]> { return [MODEL] }

  async *chat(): AsyncIterable<AIStreamEvent> {
    const events = this.turns[this.callIdx] ?? []
    this.callIdx++
    for (const e of events) yield e
  }
}

function userReq(text: string, sessionId = 's1'): AIRequest {
  return {
    sessionId,
    model: { providerId: 'scripted', modelId: 'm' },
    messages: [
      {
        id: 'm0', role: 'user',
        blocks: [{ kind: 'text', text }],
        createdAt: new Date(0).toISOString(),
      },
    ],
  }
}

function makeRuntime(turns: AIStreamEvent[][]): AgentRuntime {
  const pr = new ProviderRuntime()
  pr.register(new ScriptedAdapter(turns))
  return new AgentRuntime(pr)
}

describe('AgentRuntime', () => {
  it('returns completed when the first turn ends without tool calls', async () => {
    const runtime = makeRuntime([
      [
        { kind: 'response.started', responseId: 'r1' },
        { kind: 'content.completed', blockIndex: 0, block: { kind: 'text', text: 'hi' } },
        { kind: 'response.completed', responseId: 'r1' },
      ],
    ])
    const result = await runtime.run(userReq('hello'))
    expect(result.stopReason).toBe('completed')
    expect(result.turns).toBe(1)
    const last = result.messages.at(-1) as AIMessage
    expect(last.role).toBe('assistant')
    expect(last.blocks).toEqual([{ kind: 'text', text: 'hi' }])
  })

  it('runs a tool and then a final completion across two turns', async () => {
    const tools = new InMemoryToolDispatcher()
    tools.register({
      definition: { name: 'echo', description: 'echo', inputSchema: {} },
      handler: async (input) => ({ echoed: input }),
    })
    const runtime = makeRuntime([
      [
        { kind: 'response.started', responseId: 'r1' },
        {
          kind: 'tool_call.completed',
          invocation: { id: 'tu1', name: 'echo', input: { hi: 'there' }, createdAt: new Date(0).toISOString() },
        },
        { kind: 'response.completed', responseId: 'r1' },
      ],
      [
        { kind: 'response.started', responseId: 'r2' },
        { kind: 'content.completed', blockIndex: 0, block: { kind: 'text', text: 'done' } },
        { kind: 'response.completed', responseId: 'r2' },
      ],
    ])
    const result = await runtime.run(userReq('use a tool'), { tools })
    expect(result.stopReason).toBe('completed')
    expect(result.turns).toBe(2)
    const toolMsg = result.messages.find(m => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg?.blocks[0]?.kind).toBe('tool_result')
    if (toolMsg?.blocks[0]?.kind === 'tool_result') {
      expect(toolMsg.blocks[0].isError).toBe(false)
      expect(toolMsg.blocks[0].output).toEqual({ echoed: { hi: 'there' } })
    }
  })

  it('captures a thrown tool error as a tool_result with isError', async () => {
    const tools = new InMemoryToolDispatcher()
    tools.register({
      definition: { name: 'boom', description: 'fail', inputSchema: {} },
      handler: async () => { throw new Error('kaboom') },
    })
    const runtime = makeRuntime([
      [
        { kind: 'response.started', responseId: 'r1' },
        {
          kind: 'tool_call.completed',
          invocation: { id: 't', name: 'boom', input: {}, createdAt: new Date(0).toISOString() },
        },
        { kind: 'response.completed', responseId: 'r1' },
      ],
      [
        { kind: 'response.started', responseId: 'r2' },
        { kind: 'content.completed', blockIndex: 0, block: { kind: 'text', text: 'sorry' } },
        { kind: 'response.completed', responseId: 'r2' },
      ],
    ])
    const result = await runtime.run(userReq('boom'), { tools })
    const toolMsg = result.messages.find(m => m.role === 'tool')
    if (toolMsg?.blocks[0]?.kind === 'tool_result') {
      expect(toolMsg.blocks[0].isError).toBe(true)
      expect(JSON.stringify(toolMsg.blocks[0].output)).toContain('kaboom')
    }
  })

  it('flags unsupported_tool when the model calls a tool but no dispatcher is provided', async () => {
    const runtime = makeRuntime([
      [
        { kind: 'response.started', responseId: 'r1' },
        {
          kind: 'tool_call.completed',
          invocation: { id: 't', name: 'whatever', input: {}, createdAt: new Date(0).toISOString() },
        },
        { kind: 'response.completed', responseId: 'r1' },
      ],
    ])
    const result = await runtime.run(userReq('go'))
    expect(result.stopReason).toBe('unsupported_tool')
  })

  it('flags max_turns when the model keeps calling tools forever', async () => {
    const tools = new InMemoryToolDispatcher()
    tools.register({
      definition: { name: 'loop', description: 'loop', inputSchema: {} },
      handler: async () => 'looped',
    })
    const turn = (id: string): AIStreamEvent[] => [
      { kind: 'response.started', responseId: id },
      {
        kind: 'tool_call.completed',
        invocation: { id, name: 'loop', input: {}, createdAt: new Date(0).toISOString() },
      },
      { kind: 'response.completed', responseId: id },
    ]
    const runtime = makeRuntime([turn('a'), turn('b'), turn('c')])
    const result = await runtime.run(userReq('go'), { tools, maxTurns: 3 })
    expect(result.stopReason).toBe('max_turns')
    expect(result.turns).toBe(3)
  })

  it('terminates on response.error with stopReason=error', async () => {
    const runtime = makeRuntime([
      [
        { kind: 'response.started', responseId: 'r1' },
        {
          kind: 'response.error',
          error: { code: 'rate_limited', message: 'slow', retryable: true },
        },
      ],
    ])
    const result = await runtime.run(userReq('go'))
    expect(result.stopReason).toBe('error')
    expect(result.error?.code).toBe('rate_limited')
  })

  it('honors signal.abort before the first turn', async () => {
    const runtime = makeRuntime([])
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await runtime.run(userReq('go'), { signal: ctrl.signal })
    expect(result.stopReason).toBe('cancelled')
    expect(result.turns).toBe(0)
  })

  it('emits live events through onEvent during the run', async () => {
    const runtime = makeRuntime([
      [
        { kind: 'response.started', responseId: 'r1' },
        { kind: 'content.completed', blockIndex: 0, block: { kind: 'text', text: 'hi' } },
        { kind: 'response.completed', responseId: 'r1' },
      ],
    ])
    const seen: string[] = []
    await runtime.run(userReq('go'), { onEvent: e => seen.push(e.kind) })
    expect(seen[0]).toBe('response.started')
    expect(seen).toContain('content.completed')
    expect(seen.at(-1)).toBe('response.completed')
  })

  it('InMemoryToolDispatcher rejects duplicate registrations', () => {
    const tools = new InMemoryToolDispatcher()
    tools.register({
      definition: { name: 'x', description: 'd', inputSchema: {} },
      handler: async () => 'ok',
    })
    expect(() =>
      tools.register({
        definition: { name: 'x', description: 'd', inputSchema: {} },
        handler: async () => 'ok',
      }),
    ).toThrow(/duplicate/)
  })
})
