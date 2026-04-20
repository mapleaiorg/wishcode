/**
 * LearnTab — the main curriculum surface.
 *
 * Shows the list of worlds on the left, the active world's LevelMap in
 * the centre, and launches the LessonPlayer when a lesson is picked.
 */

import React, { useEffect, useState } from 'react'
import { WORLDS, getLessonById } from '../content/worlds'
import { LevelMap } from '../components/LevelMap'
import { LessonPlayer } from '../components/LessonPlayer'
import { loadProgress, subscribe } from '../state/progress'
import type { Progress } from '../types'

export function LearnTab() {
  const [activeWorldId, setActiveWorldId] = useState(WORLDS[0].id)
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress>(loadProgress())

  useEffect(() => subscribe(setProgress), [])

  const world = WORLDS.find((w) => w.id === activeWorldId) ?? WORLDS[0]
  const activeLesson = activeLessonId ? getLessonById(activeLessonId) : null

  if (activeLesson) {
    return (
      <div className="edu-tab edu-lesson-wrap">
        <LessonPlayer
          lesson={activeLesson.lesson}
          accent={activeLesson.world.accent}
          onExit={() => setActiveLessonId(null)}
          onComplete={() => {
            /* stay on the done screen so the user can tap Continue */
          }}
        />
      </div>
    )
  }

  return (
    <div className="edu-tab edu-learn-tab">
      <aside className="edu-world-list">
        <div className="edu-section-title">Worlds</div>
        {WORLDS.map((w) => {
          const completed = w.levels
            .flatMap((l) => l.lessons)
            .filter((l) => progress.lessons[l.id]?.firstCompletedAt).length
          const total = w.levels.flatMap((l) => l.lessons).length
          return (
            <button
              key={w.id}
              className={`edu-world-chip ${activeWorldId === w.id ? 'active' : ''}`}
              onClick={() => setActiveWorldId(w.id)}
            >
              <span className="edu-world-chip-glyph">{w.glyph}</span>
              <span className="edu-world-chip-main">
                <span className="edu-world-chip-title">{w.title}</span>
                <span className="edu-world-chip-progress">
                  {completed}/{total} lessons
                </span>
              </span>
            </button>
          )
        })}
        <div className="edu-phase-hint">
          Worlds 4–9 arrive in Phase 2 & 3 (deep simulator, DeFi safety, wallet mastery).
        </div>
      </aside>

      <div className="edu-world-canvas">
        <LevelMap world={world} onPickLesson={(id) => setActiveLessonId(id)} />
      </div>
    </div>
  )
}
