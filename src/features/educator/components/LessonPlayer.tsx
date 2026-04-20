/**
 * LessonPlayer — Hook → Explain → Exercise → Takeaway → XP.
 *
 * A Duolingo-style linear player. The lesson data is authored in
 * content/worlds.ts; this component is purely presentational + progress
 * recording. It uses framer-motion for step transitions and the Character
 * mascot for state cues.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, CheckCircle2, XCircle, Sparkles, ShieldCheck } from 'lucide-react'
import type {
  Exercise,
  Lesson,
  MultipleChoiceExercise,
  OrderingExercise,
  ScenarioExercise,
  TrueFalseExercise,
} from '../types'
import { Character, type CharacterState } from './Character'
import {
  completeLesson,
  markLessonAttempted,
  markLessonIntroduced,
} from '../state/progress'
import { playCorrect, playWrong, playXp } from '../sound'

interface Props {
  lesson: Lesson
  onComplete?: (result: { xp: number; missedIds: string[] }) => void
  onExit?: () => void
  accent?: string
}

type Phase = 'hook' | 'explain' | 'exercise' | 'takeaway' | 'done'

export function LessonPlayer({ lesson, onComplete, onExit, accent = '#4a86e8' }: Props) {
  const [phase, setPhase] = useState<Phase>('hook')
  const [explainIdx, setExplainIdx] = useState(0)
  const [exIdx, setExIdx] = useState(0)
  const [missed, setMissed] = useState<string[]>([])
  const [charState, setCharState] = useState<CharacterState>('idle')

  useEffect(() => {
    markLessonIntroduced(lesson.id)
  }, [lesson.id])

  const exercise = lesson.exercises[exIdx]
  const totalExercises = lesson.exercises.length

  const next = () => {
    if (phase === 'hook') {
      setPhase('explain')
      setCharState('explain')
      return
    }
    if (phase === 'explain') {
      if (explainIdx < lesson.explain.length - 1) {
        setExplainIdx((i) => i + 1)
      } else {
        setPhase(lesson.exercises.length ? 'exercise' : 'takeaway')
        setCharState('idle')
      }
      return
    }
    if (phase === 'exercise') {
      if (exIdx < totalExercises - 1) {
        setExIdx((i) => i + 1)
        setCharState('idle')
      } else {
        setPhase('takeaway')
        setCharState('correct')
      }
      return
    }
    if (phase === 'takeaway') {
      setPhase('done')
      setCharState('celebrate')
      const result = completeLesson({
        lessonId: lesson.id,
        xp: lesson.xp,
        missedIds: missed,
      })
      playXp()
      onComplete?.({ xp: result.xp, missedIds: missed })
    }
  }

  const onAnswer = (correct: boolean, exerciseId: string) => {
    if (correct) {
      setCharState('correct')
      playCorrect()
    } else {
      setCharState('warn')
      playWrong()
      setMissed((prev) => (prev.includes(exerciseId) ? prev : [...prev, exerciseId]))
      markLessonAttempted(lesson.id, [exerciseId])
    }
  }

  return (
    <div className="edu-lesson-player" style={{ ['--edu-accent' as string]: accent }}>
      <header className="edu-lesson-header">
        <div className="edu-lesson-title">{lesson.title}</div>
        <ProgressBar phase={phase} exIdx={exIdx} totalExercises={totalExercises} />
        {onExit && (
          <button className="edu-lesson-exit" onClick={onExit} title="Exit lesson">
            ×
          </button>
        )}
      </header>

      <div className="edu-lesson-body">
        <div className="edu-lesson-character">
          <Character state={charState} size={180} />
        </div>

        <div className="edu-lesson-stage">
          <AnimatePresence mode="wait">
            {phase === 'hook' && (
              <motion.section
                key="hook"
                className="edu-lesson-card edu-lesson-hook"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.32 }}
              >
                <p className="edu-lesson-hook-text">{lesson.hook}</p>
                <button className="edu-lesson-next" onClick={next}>
                  Start <ArrowRight size={16} />
                </button>
              </motion.section>
            )}

            {phase === 'explain' && (
              <motion.section
                key={`explain-${explainIdx}`}
                className="edu-lesson-card edu-lesson-explain"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.28 }}
              >
                <p>{lesson.explain[explainIdx]}</p>
                <div className="edu-lesson-pager">
                  <span>
                    {explainIdx + 1} / {lesson.explain.length}
                  </span>
                  <button className="edu-lesson-next" onClick={next}>
                    {explainIdx < lesson.explain.length - 1 ? 'Next' : 'Practice'} <ArrowRight size={16} />
                  </button>
                </div>
              </motion.section>
            )}

            {phase === 'exercise' && exercise && (
              <motion.section
                key={`ex-${exercise.id}`}
                className="edu-lesson-card edu-lesson-exercise"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.28 }}
              >
                <ExerciseRunner
                  exercise={exercise}
                  onAnswer={onAnswer}
                  onContinue={next}
                />
              </motion.section>
            )}

            {phase === 'takeaway' && (
              <motion.section
                key="takeaway"
                className="edu-lesson-card edu-lesson-takeaway"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.32 }}
              >
                <div className="edu-takeaway-badge">
                  <ShieldCheck size={18} /> Safety takeaway
                </div>
                <p className="edu-takeaway-text">{lesson.safetyTakeaway}</p>
                <button className="edu-lesson-next" onClick={next}>
                  Claim {lesson.xp} XP <Sparkles size={16} />
                </button>
              </motion.section>
            )}

            {phase === 'done' && (
              <motion.section
                key="done"
                className="edu-lesson-card edu-lesson-done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="edu-done-xp">+{lesson.xp} XP</div>
                <p className="edu-done-title">Lesson complete!</p>
                <p className="edu-done-sub">
                  {missed.length === 0
                    ? 'Clean pass — mastery advanced.'
                    : `You missed ${missed.length} exercise${missed.length === 1 ? '' : 's'}. Queued for review.`}
                </p>
                {onExit && (
                  <button className="edu-lesson-next" onClick={onExit}>
                    Continue
                  </button>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Progress bar ────────────────────────────────────────────────────────

function ProgressBar({
  phase,
  exIdx,
  totalExercises,
}: {
  phase: Phase
  exIdx: number
  totalExercises: number
}) {
  // Very rough: 5 notional slots (hook, explain, exercises, takeaway, done).
  const slots = 4 + Math.max(1, totalExercises)
  let idx = 0
  if (phase === 'hook') idx = 0
  else if (phase === 'explain') idx = 1
  else if (phase === 'exercise') idx = 2 + exIdx
  else if (phase === 'takeaway') idx = 2 + totalExercises
  else idx = slots
  const pct = Math.min(100, Math.round((idx / slots) * 100))
  return (
    <div className="edu-progress-track">
      <div className="edu-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Exercise runner ─────────────────────────────────────────────────────

interface ExerciseRunnerProps {
  exercise: Exercise
  onAnswer(correct: boolean, exerciseId: string): void
  onContinue(): void
}

function ExerciseRunner({ exercise, onAnswer, onContinue }: ExerciseRunnerProps) {
  const [picked, setPicked] = useState<string | boolean | string[] | null>(null)
  const [resolved, setResolved] = useState(false)
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null)

  const resolve = (correct: boolean) => {
    setResolved(true)
    setWasCorrect(correct)
    onAnswer(correct, exercise.id)
  }

  const cont = () => {
    setPicked(null)
    setResolved(false)
    setWasCorrect(null)
    onContinue()
  }

  return (
    <div className="edu-exercise">
      <h4 className="edu-exercise-prompt">{exercise.prompt}</h4>
      {exercise.kind === 'mcq' && (
        <MCQRunner
          ex={exercise}
          picked={picked as string | null}
          setPicked={setPicked as (v: string) => void}
          resolved={resolved}
          resolve={resolve}
        />
      )}
      {exercise.kind === 'tf' && (
        <TFRunner
          ex={exercise}
          picked={picked as boolean | null}
          setPicked={setPicked as (v: boolean) => void}
          resolved={resolved}
          resolve={resolve}
        />
      )}
      {exercise.kind === 'order' && (
        <OrderRunner
          ex={exercise}
          resolved={resolved}
          resolve={resolve}
        />
      )}
      {exercise.kind === 'scenario' && (
        <ScenarioRunner
          ex={exercise}
          picked={picked as string | null}
          setPicked={setPicked as (v: string) => void}
          resolved={resolved}
          resolve={resolve}
        />
      )}

      {resolved && (
        <motion.div
          className={`edu-feedback ${wasCorrect ? 'correct' : 'wrong'}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {wasCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{exercise.explain ?? (wasCorrect ? 'Correct!' : 'Not quite. Review the explanation.')}</span>
        </motion.div>
      )}

      {resolved && (
        <button className="edu-lesson-next" onClick={cont}>
          Continue <ArrowRight size={16} />
        </button>
      )}
    </div>
  )
}

// ── MCQ ────────────────────────────────────────────────────────────────

function MCQRunner({
  ex,
  picked,
  setPicked,
  resolved,
  resolve,
}: {
  ex: MultipleChoiceExercise
  picked: string | null
  setPicked: (v: string) => void
  resolved: boolean
  resolve: (correct: boolean) => void
}) {
  return (
    <div className="edu-choices">
      {ex.choices.map((c) => {
        const chosen = picked === c.id
        const state = !resolved
          ? chosen ? 'chosen' : 'idle'
          : c.correct
          ? 'correct'
          : chosen
          ? 'wrong'
          : 'muted'
        return (
          <button
            key={c.id}
            className={`edu-choice edu-choice-${state}`}
            disabled={resolved}
            onClick={() => {
              setPicked(c.id)
              resolve(!!c.correct)
            }}
          >
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

// ── True/False ─────────────────────────────────────────────────────────

function TFRunner({
  ex,
  picked,
  setPicked,
  resolved,
  resolve,
}: {
  ex: TrueFalseExercise
  picked: boolean | null
  setPicked: (v: boolean) => void
  resolved: boolean
  resolve: (correct: boolean) => void
}) {
  const opt = (value: boolean, label: string) => {
    const chosen = picked === value
    const state = !resolved
      ? chosen ? 'chosen' : 'idle'
      : ex.answer === value
      ? 'correct'
      : chosen
      ? 'wrong'
      : 'muted'
    return (
      <button
        key={label}
        className={`edu-choice edu-choice-${state}`}
        disabled={resolved}
        onClick={() => {
          setPicked(value)
          resolve(ex.answer === value)
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <div className="edu-choices edu-choices-tf">
      {opt(true, 'True')}
      {opt(false, 'False')}
    </div>
  )
}

// ── Ordering ───────────────────────────────────────────────────────────

function OrderRunner({
  ex,
  resolved,
  resolve,
}: {
  ex: OrderingExercise
  resolved: boolean
  resolve: (correct: boolean) => void
}) {
  const shuffled = useMemo(() => shuffle(ex.steps), [ex.id])
  const [order, setOrder] = useState<string[]>(shuffled)
  const move = (from: number, to: number) => {
    if (resolved) return
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setOrder(next)
  }
  const submit = () => {
    const correct = order.every((step, i) => step === ex.steps[i])
    resolve(correct)
  }
  return (
    <div className="edu-order">
      <ol>
        {order.map((step, i) => (
          <li key={step} className="edu-order-step">
            <span className="edu-order-index">{i + 1}</span>
            <span className="edu-order-label">{step}</span>
            <span className="edu-order-actions">
              <button disabled={resolved || i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button disabled={resolved || i === order.length - 1} onClick={() => move(i, i + 1)}>↓</button>
            </span>
          </li>
        ))}
      </ol>
      {!resolved && (
        <button className="edu-lesson-next" onClick={submit}>
          Check order
        </button>
      )}
    </div>
  )
}

// ── Scenario ───────────────────────────────────────────────────────────

function ScenarioRunner({
  ex,
  picked,
  setPicked,
  resolved,
  resolve,
}: {
  ex: ScenarioExercise
  picked: string | null
  setPicked: (v: string) => void
  resolved: boolean
  resolve: (correct: boolean) => void
}) {
  return (
    <div className="edu-scenario">
      <div className="edu-scenario-context">{ex.context}</div>
      <div className="edu-choices">
        {ex.choices.map((c) => {
          const chosen = picked === c.id
          const isCorrect = c.id === ex.correctChoiceId
          const state = !resolved
            ? chosen ? 'chosen' : 'idle'
            : isCorrect
            ? 'correct'
            : chosen
            ? 'wrong'
            : 'muted'
          return (
            <button
              key={c.id}
              className={`edu-choice edu-choice-${state}`}
              disabled={resolved}
              onClick={() => {
                setPicked(c.id)
                resolve(isCorrect)
              }}
            >
              <span>{c.label}</span>
              {resolved && (
                <em className={`edu-outcome edu-outcome-${c.outcome}`}>{c.outcome}</em>
              )}
            </button>
          )
        })}
      </div>
      {resolved && picked && (
        <div className="edu-scenario-explain">
          {ex.choices.find((c) => c.id === picked)?.explain}
        </div>
      )}
    </div>
  )
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
