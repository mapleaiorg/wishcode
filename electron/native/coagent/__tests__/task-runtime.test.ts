/**
 * C-1 — CoAgentTaskRuntime tests.
 */

import { describe, expect, it } from 'vitest'
import { CoAgentCore, CoAgentTaskRuntime, type CoAgentEvent } from '../index.js'
import { InMemoryTaskStore } from '../../tasks/v2/index.js'

function setup() {
  const store = new InMemoryTaskStore()
  const core = new CoAgentCore()
  const rt = new CoAgentTaskRuntime(store, core)
  rt.attach()
  return { store, core, rt }
}

describe('CoAgentTaskRuntime — outbound', () => {
  it('publishes task.created on createTask', async () => {
    const { core, rt } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['task.created'] }, e => seen.push(e))
    const t = await rt.createTask({ title: 'Refactor auth', origin: 'chat' })
    expect(seen).toHaveLength(1)
    expect(seen[0].source).toBe('task')
    expect(seen[0].payload.id).toBe(t.id)
    expect(seen[0].payload.title).toBe('Refactor auth')
  })

  it('publishes task.updated on setTaskStatus', async () => {
    const { core, rt } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['task.updated'] }, e => seen.push(e))
    const t = await rt.createTask({ title: 'x', origin: 'chat' })
    await rt.setTaskStatus(t.id, 'running')
    expect(seen.find(e => e.payload.id === t.id && e.payload.status === 'running')).toBeDefined()
  })

  it('publishes task.updated on setTaskOutput with the output payload', async () => {
    const { core, rt } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['task.updated'] }, e => seen.push(e))
    const t = await rt.createTask({ title: 'x', origin: 'chat' })
    await rt.setTaskOutput(t.id, 'done')
    expect(seen.some(e => e.payload.id === t.id && e.payload.output === 'done')).toBe(true)
  })

  it('publishes task.deleted only when removal succeeded', async () => {
    const { core, rt } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: ['task.deleted'] }, e => seen.push(e))
    const t = await rt.createTask({ title: 'x', origin: 'chat' })
    expect(await rt.removeTask(t.id)).toBe(true)
    expect(await rt.removeTask(t.id)).toBe(false)
    expect(seen).toHaveLength(1)
    expect(seen[0].payload.id).toBe(t.id)
  })

  it('read paths (getTask / listTasks / listJobs) do not publish', async () => {
    const { core, rt } = setup()
    const seen: CoAgentEvent[] = []
    core.bus.join({ role: 'activity', subscribes: [
      'task.created', 'task.updated', 'task.deleted',
    ] }, e => seen.push(e))
    const t = await rt.createTask({ title: 'x', origin: 'chat' })
    await rt.getTask(t.id)
    await rt.listTasks()
    await rt.listJobs(t.id)
    expect(seen).toHaveLength(1) // only the create
  })
})

describe('CoAgentTaskRuntime — inbound (applyPeerEvents)', () => {
  it('ignores peer events when applyPeerEvents is false', async () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core, { applyPeerEvents: false })
    rt.attach()
    core.bus.publish('approval', {
      kind: 'task.created',
      payload: { title: 'remote task', origin: 'cron' },
    })
    expect(rt.peerEventsApplied()).toBe(0)
    expect(await rt.listTasks()).toHaveLength(0)
  })

  it('applies peer task.created events when enabled', async () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core, { applyPeerEvents: true })
    rt.attach()
    core.bus.publish('approval', {
      kind: 'task.created',
      payload: { title: 'remote task', origin: 'cron' },
    })
    await Promise.resolve(); await Promise.resolve()
    expect(rt.peerEventsApplied()).toBe(1)
    const tasks = await rt.listTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('remote task')
  })

  it('does NOT re-apply its own published events (no echo)', async () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core, { applyPeerEvents: true })
    rt.attach()
    await rt.createTask({ title: 'x', origin: 'chat' })
    expect(rt.peerEventsApplied()).toBe(0) // own events don't echo
    expect(await rt.listTasks()).toHaveLength(1)
  })

  it('peer event with malformed payload does not crash', async () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core, { applyPeerEvents: true })
    rt.attach()
    core.bus.publish('approval', {
      kind: 'task.created',
      payload: { something: 'bad' },
    })
    expect(rt.peerEventsApplied()).toBe(0)
  })
})

describe('CoAgentTaskRuntime — lifecycle', () => {
  it('attach is idempotent', () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core)
    rt.attach()
    rt.attach()
    expect(rt.isAttached()).toBe(true)
    expect(core.bus.has('task')).toBe(true)
  })

  it('detach leaves the bus', () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core)
    rt.attach()
    rt.detach()
    expect(rt.isAttached()).toBe(false)
    expect(core.bus.has('task')).toBe(false)
  })

  it('detach without attach is a no-op', () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core)
    rt.detach()
    expect(rt.isAttached()).toBe(false)
  })

  it('mutations before attach silently skip publish but still mutate the store', async () => {
    const store = new InMemoryTaskStore()
    const core = new CoAgentCore()
    const rt = new CoAgentTaskRuntime(store, core)
    const t = await rt.createTask({ title: 'detached', origin: 'chat' })
    expect(await rt.getTask(t.id)).not.toBeNull()
  })
})
