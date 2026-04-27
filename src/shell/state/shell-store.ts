/**
 * Cross-cutting shell state — view, overlay, active panel, search.
 *
 * Zustand was chosen here per CONVENTIONS § 1: "preferred for cross-cutting
 * shell state; keep existing where present — don't rip-and-replace". The app
 * had no global state library, and S-0 introduces one only for the shell
 * frame itself. Conversation data + IPC-backed objects (model, auth) keep
 * their existing local-state homes for now.
 *
 * Justification recorded in `docs/arch/S-0.md`.
 */

import { useSyncExternalStore } from 'react'
import type { PanelKey } from '../../components/PanelsMenu'
import type { Overlay, ViewKey } from '../types'

export interface ShellState {
  view: ViewKey
  overlay: Overlay
  activePanel: PanelKey | null
  searchOpen: boolean
  searchQuery: string
}

export interface ShellActions {
  setView(view: ViewKey): void
  setOverlay(overlay: Overlay): void
  toggleOverlay(overlay: Exclude<Overlay, 'none'>): void
  closeOverlay(): void
  setActivePanel(panel: PanelKey | null): void
  togglePanel(panel: PanelKey): void
  openSearch(): void
  closeSearch(): void
  setSearchQuery(q: string): void
}

export type ShellStore = ShellState & ShellActions

type Listener = (state: ShellState) => void

const initialState: ShellState = {
  view: 'home',
  overlay: 'none',
  activePanel: null,
  searchOpen: false,
  searchQuery: '',
}

/**
 * Hand-rolled tiny store with the same surface shape Zustand would expose
 * (`getState`, `setState`, `subscribe`, hook). Avoids adding a runtime
 * dependency for S-0 while still giving us the cross-cutting shell store
 * called for in CONVENTIONS § 1; if/when other prompts add Zustand for
 * other reasons we will swap this out for `create()` with no API change.
 */
function createShellStore() {
  let state: ShellState = { ...initialState }
  const listeners = new Set<Listener>()

  const setState = (patch: Partial<ShellState>) => {
    const next = { ...state, ...patch }
    if (shallowEqual(state, next)) return
    state = next
    for (const l of listeners) l(state)
  }

  const getState = (): ShellState => state

  const subscribe = (fn: Listener): (() => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  const reset = () => { state = { ...initialState }; for (const l of listeners) l(state) }

  const actions: ShellActions = {
    setView: (view) => setState({ view, overlay: 'none' }),
    setOverlay: (overlay) => setState({ overlay }),
    toggleOverlay: (overlay) => setState({ overlay: state.overlay === overlay ? 'none' : overlay }),
    closeOverlay: () => setState({ overlay: 'none' }),
    setActivePanel: (panel) => setState({ activePanel: panel }),
    togglePanel: (panel) => setState({ activePanel: state.activePanel === panel ? null : panel }),
    openSearch: () => setState({ searchOpen: true }),
    closeSearch: () => setState({ searchOpen: false, searchQuery: '' }),
    setSearchQuery: (q) => setState({ searchQuery: q }),
  }

  return { getState, setState, subscribe, reset, actions }
}

const store = createShellStore()

/**
 * Read the entire shell state. Components subscribe via `useSyncExternalStore`
 * to get tear-free renders without pulling in a state library at build time.
 */
export function useShellState(): ShellState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}

/** Stable actions handle. */
export function useShellActions(): ShellActions {
  return store.actions
}

/** Direct access for non-React callers + tests. */
export const shellStore = {
  getState: store.getState,
  subscribe: store.subscribe,
  actions: store.actions,
  /** Test-only — resets to initial state. Do not call from production code. */
  __resetForTests: store.reset,
}

function shallowEqual(a: ShellState, b: ShellState): boolean {
  return (
    a.view === b.view &&
    a.overlay === b.overlay &&
    a.activePanel === b.activePanel &&
    a.searchOpen === b.searchOpen &&
    a.searchQuery === b.searchQuery
  )
}
