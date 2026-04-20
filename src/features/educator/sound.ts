/**
 * OpeniBank Educator — Web Audio cue engine.
 *
 * Zero-dep audio. Uses the browser's AudioContext to synthesize short
 * tones for feedback. All cues auto-resume the context on first use (some
 * browsers gate audio behind a user gesture).
 *
 * Exported cues (Phase 1):
 *   - correct  — ascending two-note chirp
 *   - wrong    — short low blip
 *   - xp       — sparkle triad
 *   - badge    — longer celebratory arpeggio
 *   - tap      — click-style tick for UI
 *
 * Respect user preference: setMuted(true) silences everything until
 * toggled back off. Persisted under `ibn.v1.edu.muted`.
 */

const MUTE_KEY = 'ibn.v1.edu.muted'

let ctx: AudioContext | null = null
let muted = loadMuted()

function loadMuted(): boolean {
  try {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
    }
  } catch {
    /* ignore */
  }
}

export function isMuted(): boolean {
  return muted
}

function ensureCtx(): AudioContext | null {
  if (muted) return null
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') {
      // Fire and forget — Promise rejection is non-fatal.
      ctx.resume().catch(() => undefined)
    }
    return ctx
  } catch {
    return null
  }
}

interface Note {
  freq: number
  duration: number
  offset?: number
  type?: OscillatorType
  gain?: number
}

function playNotes(notes: Note[]): void {
  const ac = ensureCtx()
  if (!ac) return
  const now = ac.currentTime
  for (const n of notes) {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.freq
    const start = now + (n.offset ?? 0)
    const end = start + n.duration
    const peak = n.gain ?? 0.12
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(peak, start + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(g)
    g.connect(ac.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}

export function playCorrect(): void {
  playNotes([
    { freq: 660, duration: 0.12, type: 'triangle' },
    { freq: 990, duration: 0.18, offset: 0.1, type: 'triangle' },
  ])
}

export function playWrong(): void {
  playNotes([
    { freq: 220, duration: 0.2, type: 'sawtooth', gain: 0.08 },
    { freq: 185, duration: 0.24, offset: 0.08, type: 'sawtooth', gain: 0.08 },
  ])
}

export function playXp(): void {
  playNotes([
    { freq: 784, duration: 0.09, type: 'triangle' },
    { freq: 988, duration: 0.09, offset: 0.08, type: 'triangle' },
    { freq: 1319, duration: 0.14, offset: 0.16, type: 'triangle' },
  ])
}

export function playBadge(): void {
  playNotes([
    { freq: 523, duration: 0.12, type: 'triangle' },
    { freq: 659, duration: 0.12, offset: 0.1, type: 'triangle' },
    { freq: 784, duration: 0.14, offset: 0.2, type: 'triangle' },
    { freq: 1047, duration: 0.22, offset: 0.32, type: 'triangle', gain: 0.14 },
  ])
}

export function playTap(): void {
  playNotes([{ freq: 520, duration: 0.04, type: 'square', gain: 0.05 }])
}
