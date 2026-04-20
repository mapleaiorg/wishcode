/**
 * ReviewTab — spaced-review queue.
 *
 * Shows lessons that currently have missed exercises, ordered
 * oldest-first. Clicking a row replays the lesson. Completing the
 * lesson with no misses clears it from the queue (see `completeLesson`
 * in state/progress.ts).
 */

import React, { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { LessonPlayer } from '../components/LessonPlayer'
import { getLessonById } from '../content/worlds'
import { loadProgress, reviewQueue, subscribe } from '../state/progress'
import type { Progress } from '../types'

export function ReviewTab() {
  const [progress, setProgress] = useState<Progress>(loadProgress())
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)

  useEffect(() => subscribe(setProgress), [])

  const queue = reviewQueue(progress)
  const rows = queue
    .map((id) => getLessonById(id))
    .filter((x): x is NonNullable<ReturnType<typeof getLessonById>> => !!x)

  if (activeLessonId) {
    const entry = getLessonById(activeLessonId)
    if (entry) {
      return (
        <div className="edu-tab edu-lesson-wrap">
          <LessonPlayer
            lesson={entry.lesson}
            accent={entry.world.accent}
            onExit={() => setActiveLessonId(null)}
          />
        </div>
      )
    }
  }

  return (
    <div className="edu-tab edu-review-tab">
      <header className="edu-tab-header">
        <h2>Review queue</h2>
        <p>
          Lessons where you missed an exercise. Replay them with a clean pass
          to clear the flag and lift your mastery score.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="edu-empty">
          <CheckCircle2 size={22} />
          <div>
            <div className="edu-empty-title">Nothing to review — nice work.</div>
            <div className="edu-empty-sub">
              New items appear here the moment you miss an exercise. Your
              mastery level updates whenever you re-clear them.
            </div>
          </div>
        </div>
      ) : (
        <ul className="edu-review-list">
          {rows.map((entry) => {
            const lp = progress.lessons[entry.lesson.id]
            return (
              <li key={entry.lesson.id} className="edu-review-row">
                <div className="edu-review-world">
                  <span>{entry.world.glyph}</span>
                  <span>{entry.world.title}</span>
                </div>
                <div className="edu-review-main">
                  <div className="edu-review-title">{entry.lesson.title}</div>
                  <div className="edu-review-meta">
                    {lp?.missedExerciseIds.length ?? 0} missed · mastery{' '}
                    <em>{lp?.mastery ?? 'practicing'}</em>
                  </div>
                </div>
                <button
                  className="edu-review-replay"
                  onClick={() => setActiveLessonId(entry.lesson.id)}
                >
                  <RefreshCw size={14} /> Replay
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
