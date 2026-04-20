/**
 * Background task manager.
 *
 * Lightweight, in-memory task registry for long-running work the user kicks
 * off (price watchers, batched backfills, scheduled /loop commands, swarm
 * agents). Emits `tasks.update` for UI, `tasks.changed` with running count
 * for the buddy.
 *
 * Persisted as ~/.ibank/tasks/tasks.json on mutation. Not a replacement for
 * a proper job queue — meant for single-user desktop scope.
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths } from '../core/config.js'
import { emit } from '../core/events.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('tasks')

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  createdAt: number
  startedAt?: number
  finishedAt?: number
  progress?: number          // 0..1
  output?: string
  error?: string
  meta?: Record<string, unknown>
}

const tasks = new Map<string, Task>()
const aborts = new Map<string, AbortController>()
let loaded = false

function file(): string {
  return path.join(paths().tasksDir, 'tasks.json')
}

function persist(): void {
  try {
    fs.writeFileSync(file(), JSON.stringify([...tasks.values()], null, 2), { mode: 0o600 })
  } catch (e) {
    log.warn('persist failed', { err: (e as Error).message })
  }
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    if (fs.existsSync(file())) {
      const arr = JSON.parse(fs.readFileSync(file(), 'utf8')) as Task[]
      for (const t of arr) {
        // Anything that was running on last shutdown is stranded.
        if (t.status === 'running' || t.status === 'queued') t.status = 'cancelled'
        tasks.set(t.id, t)
      }
    }
  } catch (e) {
    log.warn('load failed', { err: (e as Error).message })
  }
}

function runningCount(): number {
  let n = 0
  for (const t of tasks.values()) if (t.status === 'running') n++
  return n
}

function broadcast(task: Task): void {
  emit('tasks.update', { id: task.id, task })
  emit('tasks.changed', { runningCount: runningCount(), total: tasks.size })
}

// ---------------------------------------------------------------------------

export function listTasks(): Task[] {
  ensureLoaded()
  return [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export function getTask(id: string): Task | undefined {
  ensureLoaded()
  return tasks.get(id)
}

export interface CreateTaskOptions {
  title: string
  meta?: Record<string, unknown>
  run: (ctx: {
    update: (patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void
    signal: AbortSignal
  }) => Promise<string | void>
}

export function createTask(opts: CreateTaskOptions): Task {
  ensureLoaded()
  const id = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const task: Task = {
    id,
    title: opts.title,
    status: 'queued',
    createdAt: Date.now(),
    meta: opts.meta,
  }
  tasks.set(id, task)
  persist()
  broadcast(task)

  const controller = new AbortController()
  aborts.set(id, controller)

  // Fire-and-forget runner.
  ;(async () => {
    task.status = 'running'
    task.startedAt = Date.now()
    broadcast(task)
    try {
      const out = await opts.run({
        update: (patch) => {
          Object.assign(task, patch)
          broadcast(task)
        },
        signal: controller.signal,
      })
      task.status = 'done'
      task.finishedAt = Date.now()
      task.progress = 1
      if (typeof out === 'string') task.output = out
    } catch (err) {
      task.status = controller.signal.aborted ? 'cancelled' : 'failed'
      task.error = (err as Error).message
      task.finishedAt = Date.now()
    } finally {
      aborts.delete(id)
      broadcast(task)
      persist()
    }
  })()

  return task
}

export function cancelTask(id: string): boolean {
  ensureLoaded()
  const controller = aborts.get(id)
  if (!controller) return false
  controller.abort()
  const t = tasks.get(id)
  if (t) {
    t.status = 'cancelled'
    broadcast(t)
    persist()
  }
  return true
}

export function removeTask(id: string): boolean {
  ensureLoaded()
  if (tasks.get(id)?.status === 'running') return false
  tasks.delete(id)
  persist()
  emit('tasks.changed', { runningCount: runningCount(), total: tasks.size })
  return true
}

export function clearCompleted(): number {
  ensureLoaded()
  let removed = 0
  for (const [id, t] of tasks) {
    if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
      tasks.delete(id); removed++
    }
  }
  if (removed > 0) {
    persist()
    emit('tasks.changed', { runningCount: runningCount(), total: tasks.size })
  }
  return removed
}
