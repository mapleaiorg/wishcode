import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { DICTIONARIES, LANGUAGES, type Lang, type LangMeta } from '../i18n/messages'

const STORAGE_KEY = 'wsh.lang'

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (saved && DICTIONARIES[saved]) return saved
  } catch {
    /* localStorage might be disabled */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en').toLowerCase()
  // Map primary tag → supported locale.
  const m: Record<string, Lang> = {
    en: 'en',
    zh: 'zh',    // Simplified Chinese default
    ja: 'ja',
    ko: 'ko',
    es: 'es',
    fr: 'fr',
    de: 'de',
    pt: 'pt',
  }
  // zh-TW / zh-Hant → Traditional Chinese.
  if (nav.startsWith('zh-tw') || nav.startsWith('zh-hant')) return 'zh-TW' as Lang
  const primary = nav.split('-')[0]
  return (m[primary] ?? 'en') as Lang
}

// ── Module-level store (single source of truth) ─────────────────────
// Every component that calls useI18n() reads from the same state,
// so a language change in one place re-renders the whole app.

let _lang: Lang = detectInitialLang()
const _listeners = new Set<() => void>()

function _notify() {
  for (const l of _listeners) l()
}

function _subscribe(cb: () => void) {
  _listeners.add(cb)
  return () => { _listeners.delete(cb) }
}

function _getLang(): Lang {
  return _lang
}

function _setLang(next: Lang) {
  if (next === _lang) return
  _lang = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  _notify()
}

/**
 * React hook for accessing the UI message catalogue.
 *
 *   - `t(key)`: resolves a key in the active locale, falling back to
 *     English for missing keys. If the key is absent in both, the key
 *     string itself is returned (helps surface typos in development).
 *   - `lang`: the active locale code.
 *   - `setLang(next)`: persists + applies a new locale. Also flips the
 *     `<html dir>` attribute if the locale is RTL.
 *   - `langs`: metadata for the picker UI.
 *
 * Uses `useSyncExternalStore` against a module-level store so that
 * every component across the tree re-renders when any one of them
 * calls `setLang`.
 */
export function useI18n() {
  const lang = useSyncExternalStore(_subscribe, _getLang, _getLang)

  // Apply locale to <html lang> + dir on every change. We run this in
  // every consumer (harmless: it's idempotent) so it stays in sync
  // even if the first component that mounted hasn't yet set it.
  useEffect(() => {
    const meta = LANGUAGES.find((l) => l.code === lang)
    const root = document.documentElement
    root.setAttribute('lang', lang)
    root.setAttribute('dir', meta?.dir ?? 'ltr')
  }, [lang])

  const setLang = useCallback((next: Lang) => _setLang(next), [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const dict = DICTIONARIES[lang] ?? DICTIONARIES.en
      let s = dict[key] ?? DICTIONARIES.en[key] ?? key
      if (vars) {
        for (const k of Object.keys(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]))
        }
      }
      return s
    },
    [lang]
  )

  return { t, lang, setLang, langs: LANGUAGES as LangMeta[] }
}
