/**
 * LearnGate — Phase 3 "learn before you use" nudge.
 *
 * Used by wallet features (Swap, Send, Approve, Network switch) to surface
 * a relevant micro-lesson before the user takes a risky action. It's a
 * nudge, not a hard block — the user can always dismiss and proceed.
 *
 * The gate is compliance-safe: it never blocks legitimate wallet action,
 * it never gives advice, and it never talks to money primitives. It only
 * checks local Educator progress (`ibn.v1.edu.*`) and points the user at
 * the authored lesson for the concept.
 *
 * Typical usage:
 *   <LearnGate
 *     topic="approval"
 *     lessonId="w3-wallet-security.l5.lesson1"
 *     onOpenLesson={(id) => navigate(`/educator?lesson=${id}`)}
 *     onProceed={() => continueApproval()}
 *   />
 */

import React from 'react'
import { BookOpen, ShieldAlert, ArrowRight, X } from 'lucide-react'
import { getLessonById } from '../content/worlds'
import { loadProgress } from '../state/progress'

export type GateTopic =
  | 'approval'
  | 'send'
  | 'network-switch'
  | 'seed-phrase'
  | 'swap'
  | 'bridge'

interface Props {
  /** What wallet action is about to happen. */
  topic: GateTopic
  /** Authored lesson to point the user at. */
  lessonId: string
  /** Callback when user taps "Learn first". */
  onOpenLesson?: (lessonId: string) => void
  /** Callback when user taps "Proceed anyway". */
  onProceed?: () => void
  /** Callback when user dismisses the gate entirely. */
  onDismiss?: () => void
  /** Override the default copy if needed. */
  title?: string
  /** Override the explainer body. */
  body?: string
}

// Per-topic defaults — keeps the nudge specific without forcing every caller to author copy.
const DEFAULTS: Record<GateTopic, { title: string; body: string }> = {
  approval: {
    title: 'Before you approve — 60 seconds',
    body: 'Approvals let a contract move your tokens. The scope of what you approve matters more than the swap itself. Take one lesson on approval safety first.',
  },
  send: {
    title: 'Before you send — read the review',
    body: 'On-chain sends are final. The send review is the only point where a mistake can still be caught — learn what to check on it.',
  },
  'network-switch': {
    title: 'Before you switch networks',
    body: 'Anyone can suggest a custom network. Chain ID is the only durable identity. Take a quick lesson on network impersonation.',
  },
  'seed-phrase': {
    title: 'Before you export a seed phrase',
    body: 'A seed phrase is total control of your wallet. Learn the "never write, never share, never screenshot" hygiene before you handle one.',
  },
  swap: {
    title: 'Before you swap — price impact & slippage',
    body: 'A DEX swap is a trade against a pool, not a market. Take a minute on how slippage and price impact really work.',
  },
  bridge: {
    title: 'Before you bridge — one of the riskiest moves',
    body: 'Bridges concentrate value and have a long history of exploits. Take a lesson on what to check before you commit.',
  },
}

export function LearnGate({
  topic,
  lessonId,
  onOpenLesson,
  onProceed,
  onDismiss,
  title,
  body,
}: Props) {
  const lesson = getLessonById(lessonId)
  const progress = loadProgress()
  const alreadyCompleted = !!progress.lessons[lessonId]?.firstCompletedAt
  const defaults = DEFAULTS[topic]

  // If the user has already cleared the relevant lesson, we still show a
  // compact "you've got this" reminder instead of nothing — the point is
  // deliberate repetition of safety patterns.
  return (
    <div className={`edu-gate edu-gate-${topic} ${alreadyCompleted ? 'edu-gate-cleared' : ''}`}
         role="alertdialog"
         aria-labelledby="edu-gate-title">
      <div className="edu-gate-icon">
        <ShieldAlert size={18} />
      </div>
      <div className="edu-gate-body">
        <div className="edu-gate-eyebrow">
          {alreadyCompleted ? 'Refresh' : 'Learn before use'}
        </div>
        <div className="edu-gate-title" id="edu-gate-title">
          {title ?? defaults.title}
        </div>
        <p className="edu-gate-text">{body ?? defaults.body}</p>
        {lesson && (
          <div className="edu-gate-lesson-chip">
            <BookOpen size={12} />
            <span>{lesson.lesson.title}</span>
            <span className="edu-gate-lesson-xp">+{lesson.lesson.xp} XP</span>
          </div>
        )}
        <div className="edu-gate-actions">
          <button
            className="edu-gate-btn edu-gate-btn-primary"
            onClick={() => onOpenLesson?.(lessonId)}
          >
            <BookOpen size={14} /> Learn first <ArrowRight size={14} />
          </button>
          <button
            className="edu-gate-btn"
            onClick={onProceed}
          >
            {alreadyCompleted ? 'Proceed' : 'Proceed anyway'}
          </button>
        </div>
      </div>
      {onDismiss && (
        <button className="edu-gate-close" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
