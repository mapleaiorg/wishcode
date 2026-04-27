/**
 * Reference in-memory implementation of `TaskStore`. T-1 lands the
 * fs-backed equivalent under `~/.wishcode/tasks/v2/<task>/{task.json,
 * jobs/<id>.json}` so jobs survive restart.
 */

import type {
  Job,
  JobStatus,
  NewJobInput,
  NewTaskInput,
  Task,
  TaskFilter,
  TaskStatus,
  TaskStore,
} from './types.js'
import { isTerminalJob, isTerminalTask } from './types.js'

function now(): string {
  return new Date().toISOString()
}

let nextSeq = 0
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

/** Forward-only Task transitions. The graph is documented inline; any
 *  edge not listed throws. */
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['paused', 'succeeded', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
}

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending: ['ready', 'cancelled', 'skipped'],
  ready: ['running', 'cancelled', 'skipped'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
  skipped: [],
}

function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) return
  if (!TASK_TRANSITIONS[from].includes(to)) {
    throw new Error(`TaskStore: illegal task transition ${from} → ${to}`)
  }
}

function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (from === to) return
  if (!JOB_TRANSITIONS[from].includes(to)) {
    throw new Error(`TaskStore: illegal job transition ${from} → ${to}`)
  }
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>()
  private readonly jobs = new Map<string, Job>()
  private readonly jobsByTask = new Map<string, Set<string>>()
  /** Reverse index: parent → set of dependents. Built on addJob. */
  private readonly dependents = new Map<string, Set<string>>()

  async createTask(input: NewTaskInput): Promise<Task> {
    if (!input.title?.trim()) throw new Error('TaskStore: title is required')
    const t: Task = {
      id: newId('task'),
      title: input.title.trim(),
      status: 'queued',
      origin: input.origin,
      bindings: input.bindings ?? {},
      metadata: input.metadata,
      createdAt: now(),
    }
    this.tasks.set(t.id, t)
    this.jobsByTask.set(t.id, new Set())
    return { ...t }
  }

  async getTask(id: string): Promise<Task | null> {
    const t = this.tasks.get(id)
    return t ? { ...t } : null
  }

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    const limit = filter.limit ?? 100
    const out: Task[] = []
    for (const t of this.tasks.values()) {
      if (filter.status && !filter.status.includes(t.status)) continue
      if (filter.origin && !filter.origin.includes(t.origin)) continue
      if (filter.bindings) {
        const want = filter.bindings
        const ok = (Object.keys(want) as (keyof typeof want)[]).every(
          k => want[k] === undefined || t.bindings[k] === want[k],
        )
        if (!ok) continue
      }
      out.push({ ...t })
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return out.slice(0, limit)
  }

  async setTaskStatus(
    id: string,
    status: TaskStatus,
    error?: Task['error'],
  ): Promise<Task> {
    const t = this.tasks.get(id)
    if (!t) throw new Error(`TaskStore: task not found: ${id}`)
    assertTaskTransition(t.status, status)
    const next: Task = {
      ...t,
      status,
      error: error ?? t.error,
      startedAt: t.startedAt ?? (status === 'running' ? now() : undefined),
      finishedAt: isTerminalTask(status) ? now() : t.finishedAt,
    }
    this.tasks.set(id, next)
    return { ...next }
  }

  async setTaskOutput(id: string, output: string): Promise<Task> {
    const t = this.tasks.get(id)
    if (!t) throw new Error(`TaskStore: task not found: ${id}`)
    const next: Task = { ...t, output }
    this.tasks.set(id, next)
    return { ...next }
  }

  async removeTask(id: string): Promise<boolean> {
    const had = this.tasks.delete(id)
    const ids = this.jobsByTask.get(id)
    if (ids) {
      for (const jid of ids) {
        this.jobs.delete(jid)
        this.dependents.delete(jid)
      }
      this.jobsByTask.delete(id)
    }
    return had
  }

  // ── jobs ────────────────────────────────────────────────────────────

  async addJob(input: NewJobInput): Promise<Job> {
    const taskJobs = this.jobsByTask.get(input.taskId)
    if (!taskJobs) {
      throw new Error(`TaskStore: unknown task: ${input.taskId}`)
    }
    const deps = input.dependencies ?? []
    for (const d of deps) {
      const dep = this.jobs.get(d)
      if (!dep) throw new Error(`TaskStore: unknown dependency: ${d}`)
      if (dep.taskId !== input.taskId) {
        throw new Error(
          `TaskStore: cross-task dependency forbidden (${d} belongs to ${dep.taskId})`,
        )
      }
    }
    const j: Job = {
      id: newId('job'),
      taskId: input.taskId,
      kind: input.kind,
      status: deps.length === 0 ? 'ready' : 'pending',
      dependencies: deps,
      payload: input.payload ?? null,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 1,
      createdAt: now(),
    }
    this.jobs.set(j.id, j)
    taskJobs.add(j.id)
    for (const d of deps) {
      let set = this.dependents.get(d)
      if (!set) {
        set = new Set()
        this.dependents.set(d, set)
      }
      set.add(j.id)
    }
    return { ...j }
  }

  async getJob(id: string): Promise<Job | null> {
    const j = this.jobs.get(id)
    return j ? { ...j } : null
  }

  async listJobs(taskId: string): Promise<Job[]> {
    const ids = this.jobsByTask.get(taskId)
    if (!ids) return []
    const out: Job[] = []
    for (const id of ids) {
      const j = this.jobs.get(id)
      if (j) out.push({ ...j })
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return out
  }

  async setJobStatus(
    id: string,
    status: JobStatus,
    error?: Job['error'],
  ): Promise<Job> {
    const j = this.jobs.get(id)
    if (!j) throw new Error(`TaskStore: job not found: ${id}`)
    assertJobTransition(j.status, status)
    const next: Job = {
      ...j,
      status,
      error: error ?? j.error,
      startedAt: j.startedAt ?? (status === 'running' ? now() : undefined),
      finishedAt: isTerminalJob(status) ? now() : j.finishedAt,
    }
    this.jobs.set(id, next)
    if (status === 'succeeded') {
      // Promote dependents whose deps are now all succeeded.
      const dependents = this.dependents.get(id) ?? new Set()
      for (const did of dependents) {
        const d = this.jobs.get(did)
        if (!d || d.status !== 'pending') continue
        const allOk = d.dependencies.every(p => this.jobs.get(p)?.status === 'succeeded')
        if (allOk) {
          this.jobs.set(did, { ...d, status: 'ready' })
        }
      }
    }
    return { ...next }
  }

  async bumpJobAttempt(id: string): Promise<Job> {
    const j = this.jobs.get(id)
    if (!j) throw new Error(`TaskStore: job not found: ${id}`)
    const next: Job = { ...j, attempts: j.attempts + 1 }
    this.jobs.set(id, next)
    return { ...next }
  }

  async setJobState(id: string, state: Record<string, unknown>): Promise<Job> {
    const j = this.jobs.get(id)
    if (!j) throw new Error(`TaskStore: job not found: ${id}`)
    const next: Job = { ...j, state }
    this.jobs.set(id, next)
    return { ...next }
  }

  async readyJobs(taskId: string): Promise<Job[]> {
    const all = await this.listJobs(taskId)
    return all.filter(j => j.status === 'ready')
  }

  async cascadeSkip(failedJobId: string): Promise<number> {
    let dropped = 0
    const stack = [failedJobId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      const dependents = this.dependents.get(cur) ?? new Set()
      for (const did of dependents) {
        const d = this.jobs.get(did)
        if (!d) continue
        if (isTerminalJob(d.status)) continue
        this.jobs.set(did, { ...d, status: 'skipped', finishedAt: now() })
        dropped++
        stack.push(did)
      }
    }
    return dropped
  }
}
