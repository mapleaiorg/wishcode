/**
 * Blackboard — cross-turn, cross-agent working memory.
 *
 * Distinct from the two existing memory systems:
 *   - transcript  = append-only chat log (for replay / context)
 *   - memory_*    = long-term facts carried across sessions
 *   - blackboard  = **scoped to one session**, structured, mutable
 *
 * The blackboard is KAIROS-style: sub-agents and the main agent all share
 * one keyed store. One agent can jot "architecture = React + Electron;
 * bundler = Vite" and a later agent can pick it up without rereading the
 * transcript. Keys are dotted paths; values are any JSON. Designed so that
 * `agent_chain` stages can hand structured outputs to downstream stages
 * without rebuilding context each time.
 *
 * Persistence: ~/.wishcode/blackboards/<sessionId>.json (0o600).
 * We flush on every write — size is small (< 64 KB typical) and blackboards
 * double as session-scoped notebooks visible to the user in the UI.
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths, ensureAllDirs } from '../core/config.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('blackboard')

// Hard cap so a runaway agent can't fill the disk with one big blob.
const MAX_BLACKBOARD_BYTES = 256 * 1024
const MAX_KEY_LEN = 120

export interface BlackboardEntry {
  value: unknown
  ts: number                 // last-write timestamp
  writer?: string            // tool or persona id
  note?: string              // optional one-line provenance
}

export interface BlackboardState {
  sessionId: string
  updated: number
  entries: Record<string, BlackboardEntry>
}

function fileFor(sessionId: string): string {
  ensureAllDirs()
  return path.join(paths().blackboardDir, `${sanitize(sessionId)}.json`)
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function emptyState(sessionId: string): BlackboardState {
  return { sessionId, updated: Date.now(), entries: {} }
}

function loadState(sessionId: string): BlackboardState {
  const f = fileFor(sessionId)
  try {
    if (!fs.existsSync(f)) return emptyState(sessionId)
    const raw = fs.readFileSync(f, 'utf8')
    const parsed = JSON.parse(raw) as BlackboardState
    // Defensive — a corrupt file shouldn't brick the session.
    if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
      log.warn('blackboard malformed, reinitializing', { sessionId })
      return emptyState(sessionId)
    }
    return parsed
  } catch (err) {
    log.warn('blackboard read failed', { sessionId, err: (err as Error).message })
    return emptyState(sessionId)
  }
}

function saveState(state: BlackboardState): void {
  const f = fileFor(state.sessionId)
  state.updated = Date.now()
  const text = JSON.stringify(state, null, 2)
  if (Buffer.byteLength(text) > MAX_BLACKBOARD_BYTES) {
    throw new Error(
      `Blackboard exceeds ${MAX_BLACKBOARD_BYTES} bytes. ` +
      `Delete or compact entries with bb_delete / bb_clear before adding more.`,
    )
  }
  fs.writeFileSync(f, text, { mode: 0o600 })
}

function validateKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('blackboard key must be a non-empty string')
  }
  if (key.length > MAX_KEY_LEN) {
    throw new Error(`blackboard key too long (${key.length} > ${MAX_KEY_LEN})`)
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
    throw new Error('blackboard key must match /^[a-zA-Z0-9._-]+$/')
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function bbGet(sessionId: string, key?: string): unknown {
  const state = loadState(sessionId)
  if (!key) {
    return Object.fromEntries(
      Object.entries(state.entries).map(([k, e]) => [k, e.value]),
    )
  }
  validateKey(key)
  const entry = state.entries[key]
  return entry ? entry.value : null
}

export function bbPut(
  sessionId: string,
  key: string,
  value: unknown,
  opts: { writer?: string; note?: string } = {},
): BlackboardEntry {
  validateKey(key)
  const state = loadState(sessionId)
  const entry: BlackboardEntry = {
    value,
    ts: Date.now(),
    writer: opts.writer,
    note: opts.note,
  }
  state.entries[key] = entry
  saveState(state)
  log.info('bb put', { sessionId, key, writer: opts.writer })
  return entry
}

export function bbDelete(sessionId: string, key: string): boolean {
  validateKey(key)
  const state = loadState(sessionId)
  if (!(key in state.entries)) return false
  delete state.entries[key]
  saveState(state)
  return true
}

export function bbList(sessionId: string): Array<{ key: string } & BlackboardEntry> {
  const state = loadState(sessionId)
  return Object.entries(state.entries).map(([key, e]) => ({ key, ...e }))
}

export function bbClear(sessionId: string): number {
  const state = loadState(sessionId)
  const n = Object.keys(state.entries).length
  state.entries = {}
  saveState(state)
  return n
}

/**
 * Summarize the blackboard as a compact markdown block for inclusion in
 * the system prompt. Returns empty string if the blackboard is empty so
 * callers can cleanly concat.
 */
export function blackboardSystemBlock(sessionId: string): string {
  const state = loadState(sessionId)
  const keys = Object.keys(state.entries)
  if (keys.length === 0) return ''
  const lines: string[] = ['## Shared blackboard (session memory)']
  lines.push(
    'Entries written by earlier turns or sub-agents. Read freely; write new ' +
    'keys with `bb_put` when you have structured facts a later stage will need.',
  )
  keys.sort()
  for (const key of keys) {
    const e = state.entries[key]
    const val = typeof e.value === 'string' ? e.value : JSON.stringify(e.value)
    const short = val.length > 240 ? val.slice(0, 237) + '…' : val
    const prov = e.writer ? ` _(by ${e.writer})_` : ''
    lines.push(`- \`${key}\`${prov}: ${short}`)
  }
  return lines.join('\n')
}
