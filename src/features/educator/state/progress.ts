/**
 * OpeniBank Educator — progress store (local-first).
 *
 * Stored under the `ibn.v1.edu.*` namespace so it coexists with the rest
 * of the desktop app's localStorage keys without collisions. No IPC and
 * no server — MVP keeps all state on the user's machine.
 *
 * Public API:
 *   - loadProgress() / saveProgress(p)
 *   - subscribe(listener) — notified on every mutation
 *   - markLessonIntroduced(lessonId)
 *   - markLessonAttempted(lessonId, missedIds)
 *   - completeLesson({lessonId, xp, missedIds, reviewTags})
 *   - bumpScenario(scenarioId)
 *   - resetProgress()  (debug only)
 *
 * Mastery ladder:
 *   not-started → introduced → practicing → competent → mastered
 *
 * Streaks: a "day" is the user's local YYYY-MM-DD. Completing any lesson
 * increments the streak if the user completed a lesson yesterday,
 * otherwise the streak resets to 1.
 */

import type { BadgeId, LessonProgress, Mastery, Progress } from '../types'
import { BADGES, allLessons } from '../content/worlds'

const STORAGE_KEY = 'ibn.v1.edu.progress'
const DEFAULT_DAILY_GOAL_XP = 30

// ── Defaults ───────────────────────────────────────────────────────────

function emptyProgress(): Progress {
  return {
    xp: 0,
    streakDays: 0,
    streakLastDay: null,
    dailyGoalXp: DEFAULT_DAILY_GOAL_XP,
    lessons: {},
    earnedBadges: [],
    completedScenarios: {},
  }
}

function emptyLesson(lessonId: string): LessonProgress {
  return {
    lessonId,
    timesCompleted: 0,
    mastery: 'not-started',
    missedExerciseIds: [],
  }
}

// ── Persistence ────────────────────────────────────────────────────────

let cached: Progress | null = null
const listeners = new Set<(p: Progress) => void>()

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function loadProgress(): Progress {
  if (cached) return cached
  if (!hasStorage()) {
    cached = emptyProgress()
    return cached
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      cached = emptyProgress()
      return cached
    }
    const parsed = JSON.parse(raw) as Partial<Progress>
    cached = { ...emptyProgress(), ...parsed }
    // Normalize — older records may be missing these fields.
    if (!cached.lessons) cached.lessons = {}
    if (!cached.earnedBadges) cached.earnedBadges = []
    if (!cached.completedScenarios) cached.completedScenarios = {}
    return cached
  } catch {
    cached = emptyProgress()
    return cached
  }
}

export function saveProgress(next: Progress): void {
  cached = next
  if (hasStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // quota or private mode — state stays in memory for this session
    }
  }
  for (const fn of listeners) fn(next)
}

export function subscribe(fn: (p: Progress) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function resetProgress(): void {
  saveProgress(emptyProgress())
}

// ── Internal helpers ───────────────────────────────────────────────────

function localDay(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yesterday(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() - 1)
  return localDay(dt)
}

function advanceMastery(prev: Mastery, cleanPass: boolean): Mastery {
  if (prev === 'mastered') return 'mastered'
  if (cleanPass) {
    if (prev === 'competent') return 'mastered'
    if (prev === 'practicing' || prev === 'introduced' || prev === 'not-started') return 'competent'
  }
  // imperfect pass
  if (prev === 'competent') return 'competent'
  if (prev === 'practicing') return 'practicing'
  return 'practicing'
}

function recomputeBadges(p: Progress): BadgeId[] {
  return BADGES.filter((b) => b.earned(p)).map((b) => b.id)
}

// ── Mutators ───────────────────────────────────────────────────────────

export function markLessonIntroduced(lessonId: string): Progress {
  const cur = loadProgress()
  const lp = cur.lessons[lessonId] ?? emptyLesson(lessonId)
  if (lp.mastery !== 'not-started') return cur
  const next: Progress = {
    ...cur,
    lessons: {
      ...cur.lessons,
      [lessonId]: { ...lp, mastery: 'introduced' },
    },
  }
  saveProgress(next)
  return next
}

export function markLessonAttempted(lessonId: string, missedIds: string[] = []): Progress {
  const cur = loadProgress()
  const lp = cur.lessons[lessonId] ?? emptyLesson(lessonId)
  const mastery: Mastery = lp.mastery === 'not-started' || lp.mastery === 'introduced'
    ? 'practicing'
    : lp.mastery
  // Union of missed ids across attempts (so Review tab sees them all).
  const nextMissed = Array.from(new Set([...lp.missedExerciseIds, ...missedIds]))
  const next: Progress = {
    ...cur,
    lessons: {
      ...cur.lessons,
      [lessonId]: { ...lp, mastery, missedExerciseIds: nextMissed },
    },
  }
  saveProgress(next)
  return next
}

export interface CompleteLessonInput {
  lessonId: string
  xp: number
  missedIds: string[]
  clearReviewOnPerfect?: boolean
}

/**
 * Mark a lesson complete. Awards XP the FIRST time only (Duolingo rule);
 * re-plays update mastery and may clear missed-exercise flags but do not
 * re-award full XP. Also updates streak and recomputes earned badges.
 */
export function completeLesson(input: CompleteLessonInput): Progress {
  const { lessonId, xp, missedIds, clearReviewOnPerfect = true } = input
  const cur = loadProgress()
  const now = Date.now()
  const today = localDay()
  const cleanPass = missedIds.length === 0

  const lp = cur.lessons[lessonId] ?? emptyLesson(lessonId)
  const firstTime = !lp.firstCompletedAt
  const nextLesson: LessonProgress = {
    ...lp,
    firstCompletedAt: lp.firstCompletedAt ?? now,
    lastCompletedAt: now,
    timesCompleted: lp.timesCompleted + 1,
    mastery: advanceMastery(lp.mastery, cleanPass),
    missedExerciseIds: cleanPass && clearReviewOnPerfect
      ? []
      : Array.from(new Set([...lp.missedExerciseIds, ...missedIds])),
  }

  // Streak logic.
  let streakDays = cur.streakDays
  let streakLastDay = cur.streakLastDay
  if (streakLastDay !== today) {
    if (streakLastDay === yesterday(today)) streakDays = streakDays + 1
    else streakDays = 1
    streakLastDay = today
  } else if (streakDays === 0) {
    streakDays = 1
  }

  const nextProgress: Progress = {
    ...cur,
    xp: firstTime ? cur.xp + xp : cur.xp + Math.max(1, Math.floor(xp / 3)),
    streakDays,
    streakLastDay,
    lessons: { ...cur.lessons, [lessonId]: nextLesson },
  }
  nextProgress.earnedBadges = recomputeBadges(nextProgress)
  saveProgress(nextProgress)
  return nextProgress
}

export function bumpScenario(scenarioId: string, xp = 5): Progress {
  const cur = loadProgress()
  const count = (cur.completedScenarios[scenarioId] ?? 0) + 1
  const next: Progress = {
    ...cur,
    xp: count === 1 ? cur.xp + xp : cur.xp + 1,
    completedScenarios: { ...cur.completedScenarios, [scenarioId]: count },
  }
  next.earnedBadges = recomputeBadges(next)
  saveProgress(next)
  return next
}

// ── Selectors ──────────────────────────────────────────────────────────

export function isLessonUnlocked(lessonId: string, progress: Progress = loadProgress()): boolean {
  // A lesson is unlocked if it is the very first lesson of a world OR
  // the previous lesson in authoring order has been completed at least once.
  const chain = allLessons()
  const idx = chain.findIndex((entry) => entry.lesson.id === lessonId)
  if (idx < 0) return false
  if (idx === 0) return true
  const prev = chain[idx - 1].lesson
  return !!progress.lessons[prev.id]?.firstCompletedAt
}

export function lessonMastery(lessonId: string, progress: Progress = loadProgress()): Mastery {
  return progress.lessons[lessonId]?.mastery ?? 'not-started'
}

export function dailyProgressRatio(progress: Progress = loadProgress()): number {
  const today = localDay()
  if (progress.streakLastDay !== today) return 0
  // Approximate: XP earned "today" = min(dailyGoal, xp-gained-this-session).
  // Without per-day XP buckets, we use streak continuity as the signal
  // and cap at the daily goal.
  return Math.min(1, progress.xp > 0 ? 1 : 0)
}

/** Lessons with missed exercises, oldest-first — feeds the Review tab. */
export function reviewQueue(progress: Progress = loadProgress()): string[] {
  return Object.values(progress.lessons)
    .filter((lp) => lp.missedExerciseIds.length > 0)
    .sort((a, b) => (a.lastCompletedAt ?? 0) - (b.lastCompletedAt ?? 0))
    .map((lp) => lp.lessonId)
}
