/**
 * Cron scheduler.
 *
 * Persists schedules at ~/.wishcode/schedules.json, ticks every minute, and
 * fires each matching entry as a background task that runs the stored prompt
 * through the turn-loop (`fetchModel`).
 *
 * A schedule fires to a dedicated session id (`cron:<id>`) so the chat
 * transcript stays clean. Output lives on the Task (see tasks/manager.ts).
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { createTask } from '../tasks/manager.js'
import { matchesCron, parseCron } from './parser.js'

const log = createLogger('cron')

export interface Schedule {
  id: string
  name: string
  expression: string
  prompt: string
  disabled?: boolean
  lastRunAt?: number
  lastRunTaskId?: string
  runCount?: number
  createdAt: number
}

let schedules: Schedule[] = []
let loaded = false
let tickTimer: NodeJS.Timeout | undefined

function file(): string {
  return path.join(paths().configDir, 'schedules.json')
}

function load(): void {
  if (loaded) return
  loaded = true
  try {
    if (fs.existsSync(file())) {
      schedules = JSON.parse(fs.readFileSync(file(), 'utf8')) as Schedule[]
    }
  } catch (e) {
    log.warn('schedules.json parse failed', { err: (e as Error).message })
    schedules = []
  }
}

function persist(): void {
  try {
    fs.writeFileSync(file(), JSON.stringify(schedules, null, 2), { mode: 0o600 })
  } catch (e) {
    log.warn('schedules persist failed', { err: (e as Error).message })
  }
}

export function listSchedules(): Schedule[] {
  load()
  return [...schedules].sort((a, b) => a.createdAt - b.createdAt)
}

export function getSchedule(id: string): Schedule | undefined {
  load()
  return schedules.find((s) => s.id === id)
}

export function createSchedule(input: {
  name: string
  expression: string
  prompt: string
}): Schedule {
  load()
  // Validate the expression up-front so invalid schedules never make it to disk.
  parseCron(input.expression)
  const id = `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const entry: Schedule = {
    id,
    name: input.name.trim() || id,
    expression: input.expression.trim(),
    prompt: input.prompt,
    createdAt: Date.now(),
    runCount: 0,
  }
  schedules.push(entry)
  persist()
  return entry
}

export function updateSchedule(
  id: string,
  patch: Partial<Pick<Schedule, 'name' | 'expression' | 'prompt' | 'disabled'>>,
): Schedule | undefined {
  load()
  const entry = schedules.find((s) => s.id === id)
  if (!entry) return undefined
  if (patch.expression) parseCron(patch.expression) // validate
  Object.assign(entry, patch)
  persist()
  return entry
}

export function deleteSchedule(id: string): boolean {
  load()
  const before = schedules.length
  schedules = schedules.filter((s) => s.id !== id)
  if (schedules.length !== before) persist()
  return schedules.length !== before
}

/**
 * Fire the schedule's prompt as a background task. Exposed so the renderer
 * can run a schedule manually ("Run now").
 */
export function fireSchedule(entry: Schedule): string | null {
  load()
  if (entry.disabled) return null

  // Lazy-import to avoid circular (modelFetch → tools → cron → modelFetch).
  const taskTitle = `cron: ${entry.name}`
  const task = createTask({
    title: taskTitle,
    meta: { kind: 'cron', scheduleId: entry.id, expression: entry.expression },
    run: async ({ update, signal }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { fetchModel } = require('../modelFetch/modelFetch') as typeof import('../modelFetch/modelFetch')
      const sessionId = `cron:${entry.id}`
      const requestId = `cron_${Date.now().toString(36)}`
      update({ progress: 0.1 })
      const res = await fetchModel({
        sessionId,
        requestId,
        userText: entry.prompt,
        abort: signal,
      })
      update({ progress: 1 })
      return `stopped=${res.stopReason} turns=${res.turns}`
    },
  })
  entry.lastRunAt = Date.now()
  entry.lastRunTaskId = task.id
  entry.runCount = (entry.runCount ?? 0) + 1
  persist()
  return task.id
}

function tick(): void {
  load()
  const now = new Date()
  // Round to the current minute for deterministic matching.
  now.setSeconds(0, 0)
  for (const entry of schedules) {
    if (entry.disabled) continue
    try {
      const fields = parseCron(entry.expression)
      if (!matchesCron(fields, now)) continue
      // Guard against double-fires if the loop drifts within the same minute.
      if (entry.lastRunAt && Math.abs(now.getTime() - entry.lastRunAt) < 30_000) continue
      log.info('firing schedule', { id: entry.id, name: entry.name, expression: entry.expression })
      fireSchedule(entry)
    } catch (e) {
      log.warn('schedule evaluation failed', { id: entry.id, err: (e as Error).message })
    }
  }
}

/** Start the minute-tick loop. Idempotent. */
export function startScheduler(): void {
  if (tickTimer) return
  load()
  // Align the first tick to the next wall-clock minute boundary, then every 60s.
  const now = Date.now()
  const msToNextMinute = 60_000 - (now % 60_000)
  tickTimer = setTimeout(() => {
    tick()
    tickTimer = setInterval(tick, 60_000)
  }, msToNextMinute)
  log.info('scheduler started', { count: schedules.length, firstTickInMs: msToNextMinute })
}

export function stopScheduler(): void {
  if (!tickTimer) return
  clearTimeout(tickTimer)
  clearInterval(tickTimer)
  tickTimer = undefined
}
