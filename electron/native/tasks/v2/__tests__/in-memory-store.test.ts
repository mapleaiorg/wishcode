/**
 * T-0 — InMemoryTaskStore tests.
 */

import { describe, expect, it } from 'vitest'
import {
  InMemoryTaskStore,
  isTerminalJob,
  isTerminalTask,
  type Job,
  type Task,
} from '../index.js'

function fresh(): InMemoryTaskStore {
  return new InMemoryTaskStore()
}

async function ready(s: InMemoryTaskStore, taskId: string, kind = 'noop'): Promise<Job> {
  return s.addJob({ taskId, kind })
}

describe('InMemoryTaskStore — Task lifecycle', () => {
  it('creates a queued task with bindings + origin', async () => {
    const s = fresh()
    const t = await s.createTask({
      title: 'Refactor auth',
      origin: 'chat',
      bindings: { workspaceId: 'ws-1', sessionId: 'sess-1' },
    })
    expect(t.title).toBe('Refactor auth')
    expect(t.status).toBe('queued')
    expect(t.bindings).toEqual({ workspaceId: 'ws-1', sessionId: 'sess-1' })
  })

  it('rejects empty title', async () => {
    const s = fresh()
    await expect(s.createTask({ title: '   ', origin: 'chat' })).rejects.toThrow(/title/)
  })

  it('forward-only legal transitions: queued → running → succeeded', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await s.setTaskStatus(t.id, 'running')
    expect(a.status).toBe('running')
    expect(a.startedAt).toBeDefined()
    const b = await s.setTaskStatus(t.id, 'succeeded')
    expect(b.status).toBe('succeeded')
    expect(b.finishedAt).toBeDefined()
  })

  it('rejects illegal transitions (succeeded → running)', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    await s.setTaskStatus(t.id, 'running')
    await s.setTaskStatus(t.id, 'succeeded')
    await expect(s.setTaskStatus(t.id, 'running')).rejects.toThrow(/illegal/)
  })

  it('listTasks filters by status, origin, bindings', async () => {
    const s = fresh()
    const a = await s.createTask({ title: 'a', origin: 'chat' })
    const b = await s.createTask({ title: 'b', origin: 'cron' })
    await s.setTaskStatus(a.id, 'running')
    expect(await s.listTasks({ status: ['running'] })).toHaveLength(1)
    expect(await s.listTasks({ origin: ['cron'] })).toEqual([{ ...b }])
  })

  it('setTaskOutput updates output without touching status', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const next = await s.setTaskOutput(t.id, 'a few lines')
    expect(next.output).toBe('a few lines')
    expect(next.status).toBe('queued')
  })

  it('removeTask deletes its jobs as well', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const j = await ready(s, t.id)
    expect(await s.getJob(j.id)).not.toBeNull()
    await s.removeTask(t.id)
    expect(await s.getTask(t.id)).toBeNull()
    expect(await s.getJob(j.id)).toBeNull()
  })

  it('isTerminalTask predicate matches the canonical set', () => {
    expect(isTerminalTask('succeeded')).toBe(true)
    expect(isTerminalTask('failed')).toBe(true)
    expect(isTerminalTask('cancelled')).toBe(true)
    expect(isTerminalTask('running')).toBe(false)
    expect(isTerminalTask('queued')).toBe(false)
  })
})

describe('InMemoryTaskStore — Job graph', () => {
  it('addJob without deps lands ready', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const j = await s.addJob({ taskId: t.id, kind: 'shell', payload: { cmd: 'ls' } })
    expect(j.status).toBe('ready')
  })

  it('addJob with deps lands pending', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    const b = await s.addJob({ taskId: t.id, kind: 'shell', dependencies: [a.id] })
    expect(b.status).toBe('pending')
  })

  it('rejects unknown task on addJob', async () => {
    const s = fresh()
    await expect(s.addJob({ taskId: 'no', kind: 'shell' })).rejects.toThrow(/unknown task/)
  })

  it('rejects cross-task dependencies', async () => {
    const s = fresh()
    const t1 = await s.createTask({ title: 'a', origin: 'chat' })
    const t2 = await s.createTask({ title: 'b', origin: 'chat' })
    const j1 = await ready(s, t1.id)
    await expect(
      s.addJob({ taskId: t2.id, kind: 'shell', dependencies: [j1.id] }),
    ).rejects.toThrow(/cross-task/)
  })

  it('promotes a pending dependent to ready when its dep succeeds', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    const b = await s.addJob({ taskId: t.id, kind: 'shell', dependencies: [a.id] })
    await s.setJobStatus(a.id, 'running')
    await s.setJobStatus(a.id, 'succeeded')
    const next = await s.getJob(b.id)
    expect(next?.status).toBe('ready')
  })

  it('readyJobs returns only ready ones for a given task', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    const b = await s.addJob({ taskId: t.id, kind: 'shell', dependencies: [a.id] })
    let r = await s.readyJobs(t.id)
    expect(r.map(j => j.id)).toEqual([a.id])
    await s.setJobStatus(a.id, 'running')
    await s.setJobStatus(a.id, 'succeeded')
    r = await s.readyJobs(t.id)
    expect(r.map(j => j.id)).toEqual([b.id])
  })

  it('cascadeSkip marks transitive dependents skipped', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    const b = await s.addJob({ taskId: t.id, kind: 'shell', dependencies: [a.id] })
    const c = await s.addJob({ taskId: t.id, kind: 'shell', dependencies: [b.id] })
    await s.setJobStatus(a.id, 'running')
    await s.setJobStatus(a.id, 'failed', { code: 'x', message: 'boom' })
    const dropped = await s.cascadeSkip(a.id)
    expect(dropped).toBe(2)
    expect((await s.getJob(b.id))?.status).toBe('skipped')
    expect((await s.getJob(c.id))?.status).toBe('skipped')
  })

  it('rejects illegal job transitions (succeeded → running)', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    await s.setJobStatus(a.id, 'running')
    await s.setJobStatus(a.id, 'succeeded')
    await expect(s.setJobStatus(a.id, 'running')).rejects.toThrow(/illegal/)
  })

  it('bumpJobAttempt increments attempts', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    expect((await s.bumpJobAttempt(a.id)).attempts).toBe(1)
    expect((await s.bumpJobAttempt(a.id)).attempts).toBe(2)
  })

  it('setJobState persists scratch for resume', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    const next = await s.setJobState(a.id, { offset: 1024 })
    expect(next.state).toEqual({ offset: 1024 })
  })

  it('listJobs is sorted by createdAt and scoped to the task', async () => {
    const s = fresh()
    const t1 = await s.createTask({ title: 'a', origin: 'chat' })
    const t2 = await s.createTask({ title: 'b', origin: 'chat' })
    const a = await ready(s, t1.id)
    const b = await ready(s, t1.id)
    await ready(s, t2.id)
    const ids = (await s.listJobs(t1.id)).map(j => j.id)
    expect(ids).toEqual([a.id, b.id])
  })

  it('isTerminalJob predicate matches the canonical set', () => {
    expect(isTerminalJob('succeeded')).toBe(true)
    expect(isTerminalJob('failed')).toBe(true)
    expect(isTerminalJob('cancelled')).toBe(true)
    expect(isTerminalJob('skipped')).toBe(true)
    expect(isTerminalJob('ready')).toBe(false)
    expect(isTerminalJob('pending')).toBe(false)
    expect(isTerminalJob('running')).toBe(false)
  })

  it('returns deep copies on get/list (caller mutations are isolated)', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    const a = await ready(s, t.id)
    const got = (await s.getJob(a.id)) as Job
    got.status = 'running'
    const refresh = await s.getJob(a.id)
    expect(refresh?.status).toBe('ready')
  })

  it('rejects unknown deps on addJob', async () => {
    const s = fresh()
    const t = await s.createTask({ title: 'x', origin: 'chat' })
    await expect(
      s.addJob({ taskId: t.id, kind: 'shell', dependencies: ['nope'] }),
    ).rejects.toThrow(/unknown dependency/)
  })

  it('keeps task untouched when a job fails (caller decides task fate)', async () => {
    const s = fresh()
    const t = (await s.createTask({ title: 'x', origin: 'chat' })) as Task
    const a = await ready(s, t.id)
    await s.setJobStatus(a.id, 'running')
    await s.setJobStatus(a.id, 'failed', { code: 'x', message: 'm' })
    const after = await s.getTask(t.id)
    expect(after?.status).toBe('queued')
  })
})
