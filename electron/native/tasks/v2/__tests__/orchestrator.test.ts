/**
 * T-1 — JobOrchestrator + RunnerRegistry tests.
 */

import { describe, expect, it } from 'vitest'
import {
  InMemoryTaskStore,
  JobOrchestrator,
  RunnerRegistry,
  type Job,
  type JobRunResult,
} from '../index.js'
import { MemorySink, TelemetryEmitter } from '../../../telemetry/index.js'

function setup() {
  const store = new InMemoryTaskStore()
  const runners = new RunnerRegistry()
  const orch = new JobOrchestrator(store, runners, { concurrency: 2 })
  return { store, runners, orch }
}

const okRunner = (state?: Record<string, unknown>) => ({
  async run(): Promise<JobRunResult> {
    return state ? { ok: true, state } : { ok: true }
  },
})

const failRunner = (code = 'x', message = 'm') => ({
  async run(): Promise<JobRunResult> {
    return { ok: false, error: { code, message } }
  },
})

const throwRunner = () => ({
  async run(): Promise<JobRunResult> {
    throw new Error('runner exploded')
  },
})

describe('RunnerRegistry', () => {
  it('rejects duplicate registrations', () => {
    const r = new RunnerRegistry()
    r.register('noop', okRunner())
    expect(() => r.register('noop', okRunner())).toThrow(/duplicate/)
  })

  it('unregister removes the runner', () => {
    const r = new RunnerRegistry()
    r.register('noop', okRunner())
    r.unregister('noop')
    expect(r.has('noop')).toBe(false)
  })
})

describe('JobOrchestrator — happy path', () => {
  it('runs a single job + transitions task to succeeded', async () => {
    const { store, runners, orch } = setup()
    runners.register('noop', okRunner())
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    await store.addJob({ taskId: t.id, kind: 'noop' })
    const r = await orch.drain(t.id)
    expect(r.started).toBe(1)
    expect(r.succeeded).toBe(1)
    expect((await store.getTask(t.id))?.status).toBe('succeeded')
  })

  it('drives a 3-node dep chain in order', async () => {
    const { store, runners, orch } = setup()
    runners.register('noop', okRunner())
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    const a = await store.addJob({ taskId: t.id, kind: 'noop' })
    const b = await store.addJob({ taskId: t.id, kind: 'noop', dependencies: [a.id] })
    const c = await store.addJob({ taskId: t.id, kind: 'noop', dependencies: [b.id] })
    const r = await orch.drain(t.id)
    expect(r.started).toBe(3)
    expect(r.succeeded).toBe(3)
    for (const id of [a.id, b.id, c.id]) {
      expect((await store.getJob(id))?.status).toBe('succeeded')
    }
    expect((await store.getTask(t.id))?.status).toBe('succeeded')
  })

  it('persists runner state via setJobState', async () => {
    const { store, runners, orch } = setup()
    runners.register('noop', okRunner({ checkpoint: 7 }))
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    const j = await store.addJob({ taskId: t.id, kind: 'noop' })
    await orch.drain(t.id)
    expect((await store.getJob(j.id))?.state).toEqual({ checkpoint: 7 })
  })

  it('respects concurrency bound', async () => {
    const { store, runners, orch } = setup()
    let inFlight = 0
    let peak = 0
    runners.register('noop', {
      async run() {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise(r => setTimeout(r, 5))
        inFlight--
        return { ok: true }
      },
    })
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    for (let i = 0; i < 6; i++) {
      await store.addJob({ taskId: t.id, kind: 'noop' })
    }
    await orch.drain(t.id)
    expect(peak).toBeLessThanOrEqual(2) // concurrency cap is 2
  })
})

describe('JobOrchestrator — failure paths', () => {
  it('failure cascades to dependents', async () => {
    const { store, runners, orch } = setup()
    runners.register('boom', failRunner('boom', 'no'))
    runners.register('noop', okRunner())
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    const a = await store.addJob({ taskId: t.id, kind: 'boom' })
    const b = await store.addJob({ taskId: t.id, kind: 'noop', dependencies: [a.id] })
    const r = await orch.drain(t.id)
    expect(r.failed).toBe(1)
    expect(r.skipped).toBe(1)
    expect((await store.getJob(a.id))?.status).toBe('failed')
    expect((await store.getJob(b.id))?.status).toBe('skipped')
    expect((await store.getTask(t.id))?.status).toBe('failed')
  })

  it('thrown runner becomes a structured failure (runner.threw)', async () => {
    const { store, runners, orch } = setup()
    runners.register('explode', throwRunner())
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    const j = await store.addJob({ taskId: t.id, kind: 'explode' })
    await orch.drain(t.id)
    const final = await store.getJob(j.id)
    expect(final?.status).toBe('failed')
    expect(final?.error?.code).toBe('runner.threw')
    expect(final?.error?.message).toContain('runner exploded')
  })

  it('missing runner kind fails the job with orchestrator.no_runner', async () => {
    const { store, orch } = setup()
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    const j = await store.addJob({ taskId: t.id, kind: 'unregistered' })
    await orch.drain(t.id)
    const final = await store.getJob(j.id)
    expect(final?.status).toBe('failed')
    expect(final?.error?.code).toBe('orchestrator.no_runner')
  })
})

describe('JobOrchestrator — telemetry', () => {
  it('emits started / succeeded / failed events when an emitter is wired', async () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const store = new InMemoryTaskStore()
    const runners = new RunnerRegistry()
    runners.register('noop', okRunner())
    runners.register('boom', failRunner())
    const orch = new JobOrchestrator(store, runners, { telemetry: tel })
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    await store.addJob({ taskId: t.id, kind: 'noop' })
    await store.addJob({ taskId: t.id, kind: 'boom' })
    await orch.drain(t.id)
    const types = sink.events.map(e => e.type)
    expect(types).toContain('job.run.started')
    expect(types).toContain('job.run.succeeded')
    expect(types).toContain('job.run.failed')
  })

  it('emits job.run.no_runner when no runner is registered', async () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const store = new InMemoryTaskStore()
    const orch = new JobOrchestrator(store, new RunnerRegistry(), { telemetry: tel })
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    await store.addJob({ taskId: t.id, kind: 'unknown' })
    await orch.drain(t.id)
    expect(sink.events.some(e => e.type === 'job.run.no_runner')).toBe(true)
  })
})

describe('JobOrchestrator — abort + idle', () => {
  it('honors signal.aborted by skipping the tick', async () => {
    const { store, runners, orch: _ } = setup()
    runners.register('noop', okRunner())
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    await store.addJob({ taskId: t.id, kind: 'noop' })
    const ctrl = new AbortController()
    ctrl.abort()
    const aborted = new JobOrchestrator(store, runners, { signal: ctrl.signal })
    const r = await aborted.tick(t.id)
    expect(r.started).toBe(0)
    const job = (await store.listJobs(t.id))[0] as Job
    expect(job.status).toBe('ready')
  })

  it('tick on an idle task returns zeros without starting work', async () => {
    const { store, orch } = setup()
    const t = await store.createTask({ title: 'x', origin: 'chat' })
    const r = await orch.tick(t.id)
    expect(r).toEqual({ started: 0, succeeded: 0, failed: 0, skipped: 0, retried: 0 })
  })

  it('throws on unknown task id', async () => {
    const { orch } = setup()
    await expect(orch.tick('nope')).rejects.toThrow(/task not found/)
  })
})
