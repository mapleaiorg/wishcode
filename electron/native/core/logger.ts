/**
 * Structured logger.
 *
 * Writes a rolling in-memory ring (500 lines) + append-only daily log
 * file at ~/.wishcode/logs/wish-YYYY-MM-DD.log. Used by every subsystem.
 *
 * Levels: debug < info < warn < error
 * WISH_LOG_LEVEL env var controls minimum level (default: info).
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths, ensureAllDirs } from './config.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  scope: string
  msg: string
  data?: any
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
}

const MIN_LEVEL =
  ((process.env.WISH_LOG_LEVEL ?? process.env.IBANK_LOG_LEVEL) as LogLevel) ?? 'info'
const MIN_RANK = LEVEL_RANK[MIN_LEVEL] ?? 1

const ring: LogEntry[] = []
const RING_SIZE = 500
type Listener = (entry: LogEntry) => void
const listeners = new Set<Listener>()

let fileStream: fs.WriteStream | null = null
let currentDay = ''

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10) // YYYY-MM-DD
}

function rotateIfNeeded(ts: number): void {
  const day = dayKey(ts)
  if (day === currentDay && fileStream && !fileStream.destroyed) return
  try { ensureAllDirs() } catch {}
  fileStream?.end()
  currentDay = day
  const file = path.join(paths().logsDir, `wish-${day}.log`)
  try {
    fileStream = fs.createWriteStream(file, { flags: 'a', mode: 0o600 })
  } catch {
    fileStream = null
  }
}

function format(entry: LogEntry): string {
  const t = new Date(entry.ts).toISOString()
  const base = `${t} ${entry.level.toUpperCase().padEnd(5)} [${entry.scope}] ${entry.msg}`
  return entry.data ? `${base} ${safeStringify(entry.data)}` : base
}

function safeStringify(v: any): string {
  try { return JSON.stringify(v) }
  catch { return String(v) }
}

function emit(level: LogLevel, scope: string, msg: string, data?: any): void {
  if (LEVEL_RANK[level] < MIN_RANK) return
  const entry: LogEntry = { ts: Date.now(), level, scope, msg, data }
  ring.push(entry)
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE)
  rotateIfNeeded(entry.ts)
  if (fileStream) fileStream.write(format(entry) + '\n')
  // eslint-disable-next-line no-console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(format(entry))
  for (const l of listeners) { try { l(entry) } catch {} }
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, data?: any) => emit('debug', scope, msg, data),
    info:  (msg: string, data?: any) => emit('info',  scope, msg, data),
    warn:  (msg: string, data?: any) => emit('warn',  scope, msg, data),
    error: (msg: string, data?: any) => emit('error', scope, msg, data),
  }
}

export function onLog(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function recentLogs(limit: number = 100): LogEntry[] {
  return ring.slice(-limit)
}
