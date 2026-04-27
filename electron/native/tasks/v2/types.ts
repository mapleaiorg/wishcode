/**
 * T-0 — Task vs Job model.
 *
 * The legacy `electron/native/tasks/manager.ts` conflates "the user's
 * intent" with "the executable unit of work" — they're the same flat
 * row. T-0 splits them:
 *
 *   - **Task** is the user-facing intent. "Refactor the auth module."
 *     One row per ask. Owns title, status, deadlines, bindings to
 *     workspace / session / agent. Survives restarts; resumable.
 *
 *   - **Job** is an executable node in a directed graph that fulfills
 *     a Task. "Run the tests." Many Jobs per Task. Owns runner,
 *     status, attempts, dependencies on other Jobs. Resumable.
 *
 * The flat `Task` of the legacy module maps cleanly onto T-0's `Task`
 * (no body changes needed for the IPC). T-1 lands the `Job` graph;
 * T-2 lands the cross-cutting activity timeline that observes both.
 *
 * Lives at `electron/native/tasks/v2/` so the legacy module keeps
 * working while D-3 migrates the IPC handler. The `manager.ts` of
 * the legacy module becomes a thin adapter onto the new TaskStore.
 */

/** User-facing task lifecycle. */
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

/** Executable-node lifecycle (Job). Independent of Task lifecycle. */
export type JobStatus =
  | 'pending'      // waiting on deps
  | 'ready'        // deps satisfied; not yet started
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped'      // dep failed; skipped by graph

/** Where a Task surfaces. */
export type TaskOrigin =
  | 'chat'
  | 'agent'
  | 'cron'
  | 'ipc'
  | 'cell'
  | 'system'

/** Stable kinds the runner registry knows how to execute. */
export type JobKind =
  | 'shell'           // run a command via wishd-process
  | 'agent'           // run an agent loop turn
  | 'tool'            // invoke a single tool
  | 'fetch'           // HTTP fetch
  | 'noop'            // for testing / dependency-only nodes
  | string            // open string for Cell-supplied runners

export interface TaskBindings {
  workspaceId?: string
  sessionId?: string
  agentId?: string
  /** Hermon-side anchor once tasks sync up. */
  teamId?: string
}

export interface Task {
  id: string
  title: string
  status: TaskStatus
  origin: TaskOrigin
  bindings: TaskBindings
  /** ISO-8601 — when the user asked. */
  createdAt: string
  /** ISO-8601 — when the runner picked it up. */
  startedAt?: string
  /** ISO-8601 — set when status leaves the running set. */
  finishedAt?: string
  /** Free-form caller metadata; never PII. */
  metadata?: Record<string, unknown>
  /** Set on failure. */
  error?: { code: string; message: string }
  /** Bytes / lines summary; UI-rendered. Not the artifact itself. */
  output?: string
}

export interface Job {
  id: string
  taskId: string
  kind: JobKind
  status: JobStatus
  /** Job ids this job waits on; cycle-detection runs at insert. */
  dependencies: string[]
  /** Opaque payload for the runner — e.g. shell command, tool name. */
  payload: unknown
  attempts: number
  maxAttempts: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: { code: string; message: string }
  /** Job-local scratch that the runner writes for resume. */
  state?: Record<string, unknown>
}

export interface NewTaskInput {
  title: string
  origin: TaskOrigin
  bindings?: TaskBindings
  metadata?: Record<string, unknown>
}

export interface NewJobInput {
  taskId: string
  kind: JobKind
  payload?: unknown
  dependencies?: string[]
  maxAttempts?: number
}

/**
 * Storage contract for the new task/job model. T-1 ships an
 * fs-backed implementation under `~/.wishcode/tasks/v2/`; the
 * `InMemoryTaskStore` here is the reference + test seam.
 */
export interface TaskStore {
  // Tasks
  createTask(input: NewTaskInput): Promise<Task>
  getTask(id: string): Promise<Task | null>
  listTasks(filter?: TaskFilter): Promise<Task[]>
  setTaskStatus(id: string, status: TaskStatus, error?: Task['error']): Promise<Task>
  setTaskOutput(id: string, output: string): Promise<Task>
  removeTask(id: string): Promise<boolean>

  // Jobs
  addJob(input: NewJobInput): Promise<Job>
  getJob(id: string): Promise<Job | null>
  listJobs(taskId: string): Promise<Job[]>
  setJobStatus(id: string, status: JobStatus, error?: Job['error']): Promise<Job>
  bumpJobAttempt(id: string): Promise<Job>
  setJobState(id: string, state: Record<string, unknown>): Promise<Job>

  /** Returns Jobs whose dependencies are all `succeeded` and whose
   *  status is still `pending` — i.e. ready for the runner. */
  readyJobs(taskId: string): Promise<Job[]>

  /** Marks every dependent job (transitive) `skipped` when a job fails. */
  cascadeSkip(failedJobId: string): Promise<number>
}

export interface TaskFilter {
  status?: TaskStatus[]
  bindings?: TaskBindings
  origin?: TaskOrigin[]
  limit?: number
}

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
] as const

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
] as const

export function isTerminalTask(status: TaskStatus): boolean {
  return (TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(status)
}

export function isTerminalJob(status: JobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status)
}
