/**
 * Sidebar footer companion. Presents buddy status/notifications with the
 * Wish Code long mark.
 *
 * Layout: single horizontal row — [logo] "Wish Code" · [status message] —
 * so the brand and the current mood/status read as one line at a glance.
 * When the status message is long it ellipses; on hover the title attribute
 * gives the full text. Keep this compact so the sidebar footer never
 * wraps past two lines of chrome.
 */

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BuddyView } from '../types'
import { Logo } from './Logo'

const INITIAL: BuddyView = {
  mood: 'idle',
  message: '',
  notifications: [],
  intensity: 0,
  sinceMs: Date.now(),
}

export function Buddy() {
  const [view, setView] = useState<BuddyView>(INITIAL)

  useEffect(() => {
    void window.wish?.buddy.get().then(setView).catch(() => {})
    return window.wish?.buddy.onUpdate(setView) ?? (() => {})
  }, [])

  const statusText = view.message || defaultMessage(view.mood)

  return (
    <div>
      <motion.div
        className="wsh-buddy"
        animate={cardAnim(view)}
        transition={{ duration: 0.8, repeat: shouldLoop(view) ? Infinity : 0, ease: 'easeInOut' }}
      >
        <div className="wsh-buddy-row" title={statusText}>
          <Logo size={16} />
          <span className="wsh-buddy-wordmark">Wish Code</span>
          <span className="wsh-buddy-sep">·</span>
          <span className={`wsh-buddy-dot mood-${view.mood}`} aria-hidden />
          <span className="wsh-buddy-status">{statusText}</span>
        </div>
      </motion.div>

      {view.notifications.length > 0 && (
        <div className="wsh-buddy-notifications">
          <AnimatePresence initial={false}>
            {view.notifications.map((n) => (
              <motion.div
                key={n.id}
                className={`wsh-buddy-note ${n.kind}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30 }}
                onClick={() => void window.wish?.buddy.dismiss(n.id)}
                style={{ cursor: 'pointer' }}
              >
                {n.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function cardAnim(view: BuddyView): any {
  if (view.mood === 'thinking') return { y: [0, -1.5, 0], scale: [1, 1.01, 1] }
  if (view.mood === 'speaking') return { scale: [1, 1.02, 1] }
  if (view.mood === 'tooling' || view.mood === 'working') return { y: [0, -1, 0] }
  if (view.mood === 'alert' || view.mood === 'worried') return { x: [0, -1.5, 1.5, 0] }
  if (view.mood === 'smiling') return { scale: [1, 1.03, 1] }
  return { y: [0, -1, 0, 1, 0] }
}

function shouldLoop(view: BuddyView): boolean {
  return view.mood === 'idle' || view.mood === 'thinking' || view.mood === 'tooling' || view.mood === 'working'
}

function defaultMessage(mood: BuddyView['mood']): string {
  switch (mood) {
    case 'idle': return 'Ready.'
    case 'thinking': return 'Thinking…'
    case 'speaking': return 'Drafting…'
    case 'tooling': return 'Running tool…'
    case 'working': return 'Working on tasks…'
    case 'smiling': return 'Done.'
    case 'worried': return 'Let me retry that.'
    case 'alert': return 'Attention needed.'
    case 'sleeping': return 'Idle.'
    default: return ''
  }
}
