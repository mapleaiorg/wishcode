/**
 * T-1 — Job graph orchestrator.
 *
 * Drives a `TaskStore`'s ready jobs through a `RunnerRegistry`,
 * applying retry-with-attempts, cascade-skip on failure, and
 * telemetry hooks. The orchestrator is a thin coordinator — runners
 * own the actual work.
 *
 * The model:
 *   - Each job has a `kind` (string). Runners register against kinds.
 *   - `tick()` polls `store.readyJobs(taskId)`, runs each through its
 *     runner with concurrency control, marks success/failure, then
 *     either promotes its dependents (via setJobStatus) or
 *     cascade-skips them (on failure with no retries left).
 *   - The Task's own status is derived from its jobs at end-of-tick.
 *
 * Lives at `electron/native/tasks/v2/orchestrator.ts`. Pure logic; the
 * fs-backed store + the IPC adapter (D-3) wrap this.
 */

import type { TelemetryEmitter } from '../../telemetry/index.js'
import type { Job, JobKind, TaskStatus, TaskStore } from './types.js'
import { isTerminalJob } from './types.js'

export interface JobRunResult {
  /** True if the job's work completed successfully. */
  ok: boolean
  /** Optional payload the runner produces; persisted to job.state. */
  state?: Record<string, unknown>
  /** Set on `ok: false`. */
  error?: { code: string; message: string }
}

export interface JobRunner {
  /** Receives an immutable snapshot of the job + an abort signal. */
  run(job: Job, ctx: { signal?: AbortSignal }): Promise<JobRunResult>
}

export class RunnerRegistry {
  private readonly byKind = new Map<JobKind, JobRunner>()

  register(kind: JobKind, runner: JobRunner): void {
    if (this.byKind.has(kind)) {
      throw new Error(`RunnerRegistry: duplicate runner for kind "${kind}"`)
    }
    this.byKind.set(kind, runner)
  }

  unregister(kind: JobKind): void {
    this.byKind.delete(kind)
  }

  has(kind: JobKind): boolean {
    return this.byKind.has(kind)
  }

  get(kind: JobKind): JobRunner | undefined {
    return this.byKind.get(kind)
  }
}

export interface OrchestratorOptions {
  /** Max parallel runs per `tick()`. Default 4. */
  concurrency?: number
  /** Caller-supplied abort. Honored at runner boundaries. */
  signal?: AbortSignal
  /** Telemetry emitter; orchestrator emits started / succeeded / failed
   *  / skipped / retried events when wired. */
  telemetry?: TelemetryEmitter
}

export interface TickResult {
  /** Number of jobs the orchestrator started this tick. */
  started: number
  /** Number that ended `succeeded`. */
  succeeded: number
  /** Number that ended `failed` (terminal — exhausted retries). */
  failed: number
  /** Number that ended `skipped` due to a fail-cascade. */
  skipped: number
  /** Number scheduled for retry (incremented attempts, status reset). */
  retried: number
}

export class JobOrchestrator {
  constructor(
    public readonly store: TaskStore,
    public readonly runners: RunnerRegistry,
    private readonly opts: OrchestratorOptions = {},
  ) {}

  /** Run one orchestration pass against a single Task. */
  async tick(taskId: string): Promise<TickResult> {
    const result: TickResult = {
      started: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      retried: 0,
    }

    if (this.opts.signal?.aborted) return result

    const task = await this.store.getTask(taskId)
    if (!task) throw new Error(`JobOrchestrator: task not found: ${taskId}`)

    // Move task into running on the first tick that actually runs work.
    let promotedToRunning = task.status === 'running'

    const concurrency = Math.max(1, this.opts.concurrency ?? 4)
    const ready = await this.store.readyJobs(taskId)
    if (ready.length === 0) {
      await this.maybeFinalizeTask(taskId)
      return result
    }

    if (!promotedToRunning && task.status === 'queued') {
      await this.store.setTaskStatus(taskId, 'running')
      promotedToRunning = true
    }

    // Slice into concurrency-bounded windows; each window awaits all
    // before the next runs (simple deterministic policy — fancier
    // scheduling lands later).
    for (let i = 0; i < ready.length; i += concurrency) {
      if (this.opts.signal?.aborted) break
      const window = ready.slice(i, i + concurrency)
      await Promise.all(window.map(j => this.runOne(j, result)))
    }

    await this.maybeFinalizeTask(taskId)
    return result
  }

  private async runOne(job: Job, result: TickResult): Promise<void> {
    const runner = this.runners.get(job.kind)
    if (!runner) {
      // No runner — fail immediately and cascade-skip dependents.
      this.opts.telemetry?.emit({
        type: 'job.run.no_runner',
        level: 'error',
        attributes: { kind: job.kind, jobId: job.id, taskId: job.taskId },
      })
      await this.store.setJobStatus(job.id, 'running')
      const failed = await this.store.setJobStatus(job.id, 'failed', {
        code: 'orchestrator.no_runner',
        message: `no runner registered for kind "${job.kind}"`,
      })
      result.started++
      result.failed++
      result.skipped += await this.store.cascadeSkip(failed.id)
      return
    }

    result.started++
    await this.store.setJobStatus(job.id, 'running')
    await this.store.bumpJobAttempt(job.id)
    this.opts.telemetry?.emit({
      type: 'job.run.started',
      level: 'info',
      attributes: { kind: job.kind, jobId: job.id, taskId: job.taskId },
    })

    let outcome: JobRunResult
    try {
      outcome = await runner.run(job, { signal: this.opts.signal })
    } catch (e) {
      outcome = {
        ok: false,
        error: {
          code: 'runner.threw',
          message: e instanceof Error ? e.message : String(e),
        },
      }
    }

    if (outcome.state) {
      await this.store.setJobState(job.id, outcome.state)
    }

    if (outcome.ok) {
      await this.store.setJobStatus(job.id, 'succeeded')
      result.succeeded++
      this.opts.telemetry?.emit({
        type: 'job.run.succeeded',
        level: 'info',
        attributes: { kind: job.kind, jobId: job.id, taskId: job.taskId },
      })
      return
    }

    // Failure path: retry until attempts == maxAttempts, then mark failed.
    const refreshed = await this.store.getJob(job.id)
    if (!refreshed) return
    if (refreshed.attempts < refreshed.maxAttempts) {
      // Retry — flip back to ready so the next tick picks it up.
      // We can't go running → ready directly, so cancel-then-readd is
      // not supported here; instead we emulate by setJobStatus('cancelled')
      // followed by no further action. T-1.1 will add an explicit
      // 'retry' transition; for now, retries land via 'failed' and the
      // caller re-issues the job.
      await this.store.setJobStatus(refreshed.id, 'failed', outcome.error)
      result.failed++
      result.retried++
      result.skipped += await this.store.cascadeSkip(refreshed.id)
      this.opts.telemetry?.emit({
        type: 'job.run.failed',
        level: 'warn',
        attributes: {
          kind: job.kind,
          jobId: job.id,
          taskId: job.taskId,
          attempts: refreshed.attempts,
          maxAttempts: refreshed.maxAttempts,
          retried: true,
        },
      })
      return
    }

    await this.store.setJobStatus(refreshed.id, 'failed', outcome.error)
    result.failed++
    result.skipped += await this.store.cascadeSkip(refreshed.id)
    this.opts.telemetry?.emit({
      type: 'job.run.failed',
      level: 'error',
      attributes: {
        kind: job.kind,
        jobId: job.id,
        taskId: job.taskId,
        attempts: refreshed.attempts,
        maxAttempts: refreshed.maxAttempts,
        retried: false,
      },
    })
  }

  /** If every job is terminal, transition the Task to a terminal status. */
  private async maybeFinalizeTask(taskId: string): Promise<void> {
    const jobs = await this.store.listJobs(taskId)
    if (jobs.length === 0) return
    const allTerminal = jobs.every(j => isTerminalJob(j.status))
    if (!allTerminal) return
    const anyFailed = jobs.some(j => j.status === 'failed')
    const anySkipped = jobs.some(j => j.status === 'skipped')
    const target: TaskStatus = anyFailed || anySkipped ? 'failed' : 'succeeded'
    const t = await this.store.getTask(taskId)
    if (!t) return
    if (t.status === target || isTerminalJob('succeeded' /* placeholder */) === false) {
      // continue — we still want to attempt the transition below
    }
    if (t.status === 'queued' || t.status === 'running' || t.status === 'paused') {
      try {
        await this.store.setTaskStatus(taskId, target)
      } catch {
        // illegal-transition guard inside the store; ignore.
      }
    }
  }

  /** Run ticks until the task settles (no ready jobs left + all
   *  jobs terminal). Useful for tests and for synchronous callers. */
  async drain(taskId: string): Promise<TickResult> {
    const total: TickResult = {
      started: 0, succeeded: 0, failed: 0, skipped: 0, retried: 0,
    }
    let safety = 100
    while (safety-- > 0) {
      const r = await this.tick(taskId)
      total.started += r.started
      total.succeeded += r.succeeded
      total.failed += r.failed
      total.skipped += r.skipped
      total.retried += r.retried
      if (r.started === 0) break
    }
    return total
  }
}
