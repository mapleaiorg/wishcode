/**
 * Sidebar footer companion.
 *
 * Keeps the existing buddy status/notification data, but presents it with
 * the official OpeniBank long mark instead of the previous smiley avatar.
 */

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BuddyView } from '../types'
import { OpeniBankLongMark } from './OpeniBankLongMark'

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
    void window.ibank?.buddy.get().then(setView).catch(() => {})
    return window.ibank?.buddy.onUpdate(setView) ?? (() => {})
  }, [])

  return (
    <div>
      <motion.div
        className="ibn-buddy"
        animate={cardAnim(view)}
        transition={{ duration: 0.8, repeat: shouldLoop(view) ? Infinity : 0, ease: 'easeInOut' }}
      >
        <div className="ibn-buddy-brand">
          <OpeniBankLongMark height={18} color="var(--brand)" />
        </div>
        <div className="ibn-buddy-message">{view.message || defaultMessage(view.mood)}</div>
      </motion.div>

      {view.notifications.length > 0 && (
        <div className="ibn-buddy-notifications">
          <AnimatePresence initial={false}>
            {view.notifications.map((n) => (
              <motion.div
                key={n.id}
                className={`ibn-buddy-note ${n.kind}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30 }}
                onClick={() => void window.ibank?.buddy.dismiss(n.id)}
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
