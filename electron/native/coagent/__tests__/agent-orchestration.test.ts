import { describe, expect, it } from 'vitest'
import { CoAgentAgentOrchestration, CoAgentCore } from '../index.js'
import { AgentRuntime, type AgentRequest } from '../../agent/index.js'
import { InMemoryTaskStore } from '../../tasks/v2/index.js'
import { ProviderRuntime, type ProviderAdapter } from '../../ai/index.js'
import type { AIModel, AIProvider, AIStreamEvent } from '../../../shared/ai/canonical.js'

const PROV: AIProvider = { id: 'scripted', displayName: 'S', kind: 'first-party' }
const MODEL: AIModel = {
  id: 'm', providerId: 'scripted', displayName: 'M',
  capabilities: { streaming: true, tools: false, structuredOutput: false, imageInput: false, audioInput: false, fileInput: false, reasoning: false },
  contextWindow: 1024, maxOutputTokens: 1024,
}

class Scripted implements ProviderAdapter {
  readonly descriptor = PROV
  constructor(private events: AIStreamEvent[]) {}
  async listModels() { return [MODEL] }
  async *chat(): AsyncIterable<AIStreamEvent> { for (const e of this.events) yield e }
}

function makeRequest(): AgentRequest {
  return {
    sessionId: 's', model: { providerId: 'scripted', modelId: 'm' },
    messages: [{ id: 'u1', role: 'user', blocks: [{ kind: 'text', text: 'hi' }], createdAt: new Date(0).toISOString() }],
  }
}

function setup(events: AIStreamEvent[]) {
  const tasks = new InMemoryTaskStore()
  const pr = new ProviderRuntime()
  pr.register(new Scripted(events))
  const agent = new AgentRuntime(pr)
  const core = new CoAgentCore()
  const o = new CoAgentAgentOrchestration(agent, tasks, core)
  o.attach()
  return { tasks, agent, core, o }
}

describe('CoAgentAgentOrchestration', () => {
  it('flips task running on first turn, succeeded on completed run', async () => {
    const { tasks, o } = setup([
      { kind: 'response.started', responseId: 'r' },
      { kind: 'content.completed', blockIndex: 0, block: { kind: 'text', text: 'ok' } },
      { kind: 'response.completed', responseId: 'r' },
    ])
    const t = await tasks.createTask({ title: 'x', origin: 'chat' })
    const r = await o.runForTask(t.id, makeRequest())
    expect(r.task.status).toBe('succeeded')
    expect(r.runResult.stopReason).toBe('completed')
  })

  it('publishes agent.run.started + agent.run.finished', async () => {
    const { core, tasks, o } = setup([
      { kind: 'response.started', responseId: 'r' },
      { kind: 'response.completed', responseId: 'r' },
    ])
    const seen: string[] = []
    core.bus.join({ role: 'activity', subscribes: ['agent.run.started', 'agent.run.finished'] },
      e => seen.push(e.kind))
    const t = await tasks.createTask({ title: 'x', origin: 'chat' })
    await o.runForTask(t.id, makeRequest())
    expect(seen).toEqual(['agent.run.started', 'agent.run.finished'])
  })

  it('marks task failed when stream ends with response.error', async () => {
    const { tasks, o } = setup([
      { kind: 'response.started', responseId: 'r' },
      { kind: 'response.error', error: { code: 'rate_limited', message: 'slow', retryable: true } },
    ])
    const t = await tasks.createTask({ title: 'x', origin: 'chat' })
    const r = await o.runForTask(t.id, makeRequest())
    expect(r.task.status).toBe('failed')
    expect(r.task.error?.code).toBe('orchestration.error')
  })

  it('refuses concurrent runs on the same task', async () => {
    const { tasks, o } = setup([
      { kind: 'response.started', responseId: 'r' },
      { kind: 'response.completed', responseId: 'r' },
    ])
    const t = await tasks.createTask({ title: 'x', origin: 'chat' })
    const p = o.runForTask(t.id, makeRequest())
    await expect(o.runForTask(t.id, makeRequest())).rejects.toThrow(/already running/)
    await p
  })

  it('throws on unknown taskId', async () => {
    const { o } = setup([])
    await expect(o.runForTask('nope', makeRequest())).rejects.toThrow(/not found/)
  })

  it('attach + detach lifecycle, inFlightCount tracking', async () => {
    const { core, tasks, o } = setup([
      { kind: 'response.started', responseId: 'r' },
      { kind: 'response.completed', responseId: 'r' },
    ])
    expect(o.isAttached()).toBe(true)
    const t = await tasks.createTask({ title: 'x', origin: 'chat' })
    const p = o.runForTask(t.id, makeRequest())
    expect(o.inFlightCount()).toBe(1)
    await p
    expect(o.inFlightCount()).toBe(0)
    o.detach()
    expect(core.bus.has('orchestration')).toBe(false)
  })
})
