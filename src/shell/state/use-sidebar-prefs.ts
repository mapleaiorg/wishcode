/**
 * Sidebar layout preferences — width and collapsed flag.
 *
 * Persisted to localStorage under the legacy keys (`wsh.sidebarWidth`,
 * `wsh.sidebarCollapsed`) so the refactor is transparent to existing users.
 * Width is also written to the `--wsh-sidebar-w` CSS custom property so the
 * three-zone layout reflows when the user drags the resizer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_STORAGE_KEY,
} from '../types'

export function clampSidebarWidth(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n))
}

export function readPersistedWidth(storage: Pick<Storage, 'getItem'> = localStorage): number {
  const raw = Number(storage.getItem(SIDEBAR_STORAGE_KEY))
  if (!Number.isFinite(raw) || raw < SIDEBAR_MIN) return SIDEBAR_DEFAULT
  return Math.min(raw, SIDEBAR_MAX)
}

export function readPersistedCollapsed(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

export interface SidebarPrefs {
  width: number
  collapsed: boolean
  setWidth(w: number): void
  setCollapsed(value: boolean | ((prev: boolean) => boolean)): void
  beginResize(initialClientX: number): void
}

/**
 * React hook that owns sidebar layout state.
 *
 * The `beginResize` callback installs document-level mousemove/mouseup
 * listeners so the resizer in the topbar can capture drags that wander
 * outside its own bounding box — preserving the pre-S-0 UX exactly.
 */
export function useSidebarPrefs(): SidebarPrefs {
  const [width, setWidthState] = useState<number>(() => readPersistedWidth())
  const [collapsed, setCollapsedState] = useState<boolean>(() => readPersistedCollapsed())
  const draggingRef = useRef<boolean>(false)

  useEffect(() => {
    document.documentElement.style.setProperty('--wsh-sidebar-w', `${width}px`)
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width)) } catch { /* ignore quota / privacy mode */ }
  }, [width])

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

  const setWidth = useCallback((w: number) => setWidthState(clampSidebarWidth(w)), [])

  const setCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) =>
      setCollapsedState((prev) => (typeof value === 'function' ? value(prev) : value)),
    [],
  )

  const beginResize = useCallback((_initialClientX: number) => {
    draggingRef.current = true
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      setWidthState(clampSidebarWidth(ev.clientX))
    }
    const onUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  return { width, collapsed, setWidth, setCollapsed, beginResize }
}
