import { useEffect, useState, useCallback } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'ibank.theme'

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {}
  return 'system'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  return systemPrefersDark() ? 'dark' : 'light'
}

function apply(theme: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/**
 * Theme controller: persists the user's choice (light / dark / system),
 * resolves "system" against the OS preference, and writes a
 * `data-theme` attribute on <html> that the CSS variable layer keys off.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readChoice()))

  // Apply on mount + whenever the choice changes.
  useEffect(() => {
    const r = resolve(choice)
    setResolved(r)
    apply(r)
    try { localStorage.setItem(STORAGE_KEY, choice) } catch {}
  }, [choice])

  // Track OS-level changes when the user picked "system".
  useEffect(() => {
    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light'
      setResolved(r)
      apply(r)
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [choice])

  const setTheme = useCallback((c: ThemeChoice) => setChoice(c), [])

  return { choice, resolved, setTheme }
}
