/**
 * LevelMap — Duolingo-style vertical path.
 *
 * Renders a world's levels as a zig-zag trail of medallions. Each
 * medallion shows:
 *   - its index + glyph
 *   - a mastery ring (not-started / introduced / practicing / competent / mastered)
 *   - a locked overlay until the previous level has been started
 *
 * Clicking an unlocked medallion opens its first lesson.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Lock, CheckCircle2 } from 'lucide-react'
import type { Level, Mastery, World } from '../types'
import { isLessonUnlocked, lessonMastery } from '../state/progress'

interface Props {
  world: World
  onPickLesson(lessonId: string): void
}

export function LevelMap({ world, onPickLesson }: Props) {
  return (
    <div className="edu-level-map" style={{ ['--edu-accent' as string]: world.accent }}>
      <header className="edu-world-header">
        <div className="edu-world-glyph" aria-hidden>{world.glyph}</div>
        <div>
          <div className="edu-world-index">World {world.index}</div>
          <h3 className="edu-world-title">{world.title}</h3>
          <p className="edu-world-tagline">{world.tagline}</p>
        </div>
      </header>

      <ol className="edu-level-trail">
        {world.levels.map((level, i) => (
          <LevelNode
            key={level.id}
            level={level}
            side={i % 2 === 0 ? 'left' : 'right'}
            onPickLesson={onPickLesson}
          />
        ))}
      </ol>
    </div>
  )
}

function LevelNode({
  level,
  side,
  onPickLesson,
}: {
  level: Level
  side: 'left' | 'right'
  onPickLesson(id: string): void
}) {
  const firstLesson = level.lessons[0]
  const unlocked = firstLesson ? isLessonUnlocked(firstLesson.id) : false

  // Level mastery is the lowest mastery among its lessons.
  const mastery = aggregateMastery(level.lessons.map((l) => lessonMastery(l.id)))

  return (
    <li className={`edu-level-node edu-level-${side}`}>
      <motion.button
        className={`edu-level-medallion edu-mastery-${mastery} ${unlocked ? '' : 'locked'}`}
        whileHover={unlocked ? { scale: 1.05 } : undefined}
        whileTap={unlocked ? { scale: 0.96 } : undefined}
        disabled={!unlocked}
        onClick={() => unlocked && firstLesson && onPickLesson(firstLesson.id)}
        title={unlocked ? level.title : 'Finish the previous level first'}
      >
        <span className="edu-level-index">{level.index}</span>
        {!unlocked && (
          <span className="edu-level-lock">
            <Lock size={14} />
          </span>
        )}
        {mastery === 'mastered' && (
          <span className="edu-level-crown">
            <CheckCircle2 size={14} />
          </span>
        )}
      </motion.button>
      <div className="edu-level-info">
        <div className="edu-level-title">{level.title}</div>
        <div className="edu-level-summary">{level.summary}</div>
        <div className="edu-level-lessons">
          {level.lessons.map((lesson) => {
            const lessonUnlocked = isLessonUnlocked(lesson.id)
            const m = lessonMastery(lesson.id)
            return (
              <button
                key={lesson.id}
                className={`edu-level-lesson-chip edu-mastery-${m}`}
                disabled={!lessonUnlocked}
                onClick={() => lessonUnlocked && onPickLesson(lesson.id)}
              >
                <span>{lesson.title}</span>
                <em className="edu-lesson-xp">+{lesson.xp} XP</em>
              </button>
            )
          })}
        </div>
      </div>
    </li>
  )
}

function aggregateMastery(list: Mastery[]): Mastery {
  const rank: Record<Mastery, number> = {
    'not-started': 0,
    'introduced': 1,
    'practicing': 2,
    'competent': 3,
    'mastered': 4,
  }
  if (list.length === 0) return 'not-started'
  let min: Mastery = list[0]
  for (const m of list) {
    if (rank[m] < rank[min]) min = m
  }
  return min
}
