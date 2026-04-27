/**
 * Shell types — reserved at the renderer top level.
 *
 * `ViewKey` and `Overlay` previously lived inline in `src/App.tsx`. They were
 * lifted here as part of S-0 so the shell modules (chrome, layout, navigation,
 * settings, login) can import them without circular references.
 */

export type ViewKey = 'home' | 'chat' | 'history'

export type Overlay = 'none' | 'settings' | 'login'

/**
 * Shell-level UI slots reserved per CONVENTIONS § 7.
 *
 * The actual slot host (Cell-4) materializes contributions; S-0 only fixes
 * the names so future Cells / Native surfaces can declare into them.
 */
export type ShellSlotId =
  | 'shell.leftNav'
  | 'shell.main'
  | 'shell.rightContext'
  | 'shell.bottomPanel'
  | 'shell.commandPalette'

export const SHELL_SLOTS: readonly ShellSlotId[] = [
  'shell.leftNav',
  'shell.main',
  'shell.rightContext',
  'shell.bottomPanel',
  'shell.commandPalette',
] as const

export const VIEW_TITLES: Record<ViewKey, string> = {
  home: 'Home',
  chat: 'Chat',
  history: 'History',
}

/**
 * Persistence keys for the shell. Preserving the legacy names so existing
 * users keep their sidebar width / collapsed preference across the refactor.
 */
export const SIDEBAR_STORAGE_KEY = 'wsh.sidebarWidth'
export const SIDEBAR_COLLAPSED_KEY = 'wsh.sidebarCollapsed'
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 260
