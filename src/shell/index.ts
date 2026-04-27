/**
 * Public barrel for the Wish Code shell (S-0).
 *
 * Renderer entry points should consume the shell via this barrel rather
 * than reaching into individual modules — that gives later prompts a
 * stable boundary even as the internal layout evolves.
 */

export { AppShell } from './layout/AppShell'
export { Topbar } from './layout/Topbar'
export { MainArea } from './layout/MainArea'

export { Sidebar } from './chrome/Sidebar'
export { SearchOverlay, searchConversations } from './chrome/SearchOverlay'
export { ModelToast } from './chrome/ModelToast'

export { renderView, deferredSurfaces } from './navigation/routes'
export { ViewRouter } from './navigation/ViewRouter'

export { SettingsView } from './settings/SettingsView'
export { LoginView } from './login/LoginView'
export { Logo } from './branding/Logo'

export {
  shellStore,
  useShellState,
  useShellActions,
  type ShellState,
  type ShellActions,
  type ShellStore,
} from './state/shell-store'
export { useSidebarPrefs, clampSidebarWidth, readPersistedWidth, readPersistedCollapsed } from './state/use-sidebar-prefs'
export { useConversations, makeNewConversation } from './state/use-conversations'
export { useShellKeyboard } from './state/use-shell-keyboard'

export { deriveTitleFromMessages, newConversationId } from './util/derive-title'
export { SHELL_SLOT_DESCRIPTORS, isShellSlot } from './slots'
export {
  SHELL_SLOTS,
  VIEW_TITLES,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_STORAGE_KEY,
  type Overlay,
  type ShellSlotId,
  type ViewKey,
} from './types'
