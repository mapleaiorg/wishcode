/**
 * Global shell keyboard shortcuts.
 *
 *   ⌘B / Ctrl-B   toggle sidebar collapsed state
 *   ⌘K / Ctrl-K   open the conversation search overlay
 *   Escape        close active right-docked panel (if any)
 *
 * Preserved from the pre-S-0 `src/App.tsx` implementation verbatim.
 */

import { useEffect } from 'react'

export interface ShellKeyboardHandlers {
  onToggleSidebar(): void
  onOpenSearch(): void
  onClosePanel(): void
  hasActivePanel: boolean
}

export function useShellKeyboard({
  onToggleSidebar,
  onOpenSearch,
  onClosePanel,
  hasActivePanel,
}: ShellKeyboardHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasActivePanel) {
        onClosePanel()
        return
      }
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd) return
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        onToggleSidebar()
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasActivePanel, onClosePanel, onOpenSearch, onToggleSidebar])
}
