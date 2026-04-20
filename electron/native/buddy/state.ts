/**
 * Buddy — the animated companion mascot.
 *
 * A finite state machine that reacts to app signals and exposes a compact
 * view (`BuddyView`) the renderer uses to drive the SVG / Framer-Motion
 * avatar.
 *
 * Inputs (via bus subscription):
 *   - chat.delta       → "speaking"
 *   - chat.thinking    → "thinking"
 *   - chat.toolUse     → "tooling"
 *   - chat.done        → "idle" with brief "smiling" flourish
 *   - chat.error       → "worried"
 *   - wallet.lockChanged → "alert" (locked) / subtle "relieved" (unlocked)
 *   - tasks.update     → "working" while any task is running
 *   - trading.price    → optional "reactive" quick flash if price volatility > cfg threshold
 *
 * Output: a single-writer BuddyView broadcast via bus channel `buddy.update`.
 */

import { bus, emit, on } from '../core/events.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('buddy')

export type BuddyMood =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'tooling'
  | 'smiling'
  | 'worried'
  | 'alert'
  | 'working'
  | 'sleeping'

export interface BuddyNotification {
  id: string
  kind: 'info' | 'success' | 'warn' | 'error'
  text: string
  ts: number
}

export interface BuddyView {
  mood: BuddyMood
  message: string
  notifications: BuddyNotification[]
  // For the renderer's motion tuning:
  intensity: 0 | 1 | 2 | 3   // 0 still, 3 excited
  sinceMs: number
}

// ---------------------------------------------------------------------------

const MAX_NOTIFICATIONS = 6
const IDLE_DECAY_MS = 4_000

let view: BuddyView = { mood: 'idle', message: '', notifications: [], intensity: 0, sinceMs: Date.now() }
let decayTimer: NodeJS.Timeout | null = null
let booted = false

function broadcast(partial: Partial<BuddyView>): void {
  view = {
    ...view,
    ...partial,
    sinceMs: Date.now(),
  }
  emit('buddy.update', view)
}

function set(mood: BuddyMood, message: string, intensity: 0 | 1 | 2 | 3 = 1): void {
  broadcast({ mood, message, intensity })
  if (decayTimer) clearTimeout(decayTimer)
  // Decay back to idle after a quiet period, except for sticky moods.
  if (mood === 'idle' || mood === 'sleeping') return
  decayTimer = setTimeout(() => {
    broadcast({ mood: 'idle', message: '', intensity: 0 })
    decayTimer = null
  }, IDLE_DECAY_MS)
}

function note(kind: BuddyNotification['kind'], text: string): void {
  const n: BuddyNotification = { id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, kind, text, ts: Date.now() }
  const list = [n, ...view.notifications].slice(0, MAX_NOTIFICATIONS)
  broadcast({ notifications: list })
}

export function dismissNotification(id: string): void {
  broadcast({ notifications: view.notifications.filter((n) => n.id !== id) })
}

export function getBuddyView(): BuddyView { return view }

// ---------------------------------------------------------------------------

export function startBuddy(): void {
  if (booted) return
  booted = true
  log.info('buddy started')

  on('chat.delta', () => {
    if (view.mood !== 'speaking') set('speaking', '…', 2)
  })
  on('chat.thinking', () => {
    if (view.mood !== 'thinking') set('thinking', 'Thinking', 1)
  })
  on('chat.toolUse', (p: any) => {
    if (p?.phase === 'start') set('tooling', `Running ${p.name}…`, 2)
  })
  on('chat.done', () => {
    set('smiling', 'Done', 1)
  })
  on('chat.error', (p: any) => {
    set('worried', 'Something went wrong', 3)
    note('error', typeof p?.error === 'string' ? p.error.slice(0, 140) : 'Error')
  })
  on('wallet.lockChanged', (p: any) => {
    if (p?.unlocked) {
      set('smiling', 'Wallet unlocked', 1)
      note('success', 'Wallet unlocked — auto-locks after 15 min idle.')
    } else {
      set('alert', 'Wallet locked', 2)
    }
  })
  on('tasks.changed', (p: any) => {
    if (p?.runningCount > 0) set('working', `${p.runningCount} running task${p.runningCount > 1 ? 's' : ''}`, 2)
    else set('idle', '', 0)
  })
}

// Make sure we subscribe exactly once per process.
if (bus.listenerCount('chat.delta') === 0) startBuddy()
