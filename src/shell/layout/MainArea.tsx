/**
 * MainArea — the right-hand column of the shell frame.
 *
 * Houses, in z-order:
 *   - sidebar resizer (the thin draggable column)
 *   - search overlay (when open)
 *   - login overlay
 *   - settings overlay
 *   - the active view + an optional right-docked side panel
 *
 * Pure presentation — receives all state via props.
 */

import React from 'react'
import type { Conversation, CurrentModel, Message } from '../../types'
import type { ResolvedTheme, ThemeChoice } from '../../hooks/useTheme'
import { LoginView } from '../login/LoginView'
import { SettingsView } from '../settings/SettingsView'
import { SearchOverlay } from '../chrome/SearchOverlay'
import { SidePanel } from '../../components/SidePanel'
import type { PanelKey } from '../../components/PanelsMenu'
import { ViewRouter } from '../navigation/ViewRouter'
import type { Overlay, ViewKey } from '../types'

interface MainAreaProps {
  view: ViewKey
  overlay: Overlay
  active: Conversation | null

  searchOpen: boolean
  searchQuery: string
  searchHits: Conversation[]
  onSearchQueryChange(q: string): void
  onSearchClose(): void
  onSearchPick(id: string): void

  onLoginClose(): void
  onLoginChanged(): void

  onSettingsClose(): void
  onSettingsOpenLogin(): void
  onSettingsModelChanged(m: CurrentModel): void
  themeChoice: ThemeChoice
  resolvedTheme: ResolvedTheme
  onThemeChange(choice: ThemeChoice): void

  activePanel: PanelKey | null
  onPanelClose(): void

  onResizerDown(e: React.MouseEvent): void

  chatContext: {
    onUpdate(partial: Partial<Conversation>): void
    onMutateMessages(fn: (prev: Message[]) => Message[]): void
  }
}

export const MainArea: React.FC<MainAreaProps> = ({
  view,
  overlay,
  active,
  searchOpen,
  searchQuery,
  searchHits,
  onSearchQueryChange,
  onSearchClose,
  onSearchPick,
  onLoginClose,
  onLoginChanged,
  onSettingsClose,
  onSettingsOpenLogin,
  onSettingsModelChanged,
  themeChoice,
  resolvedTheme,
  onThemeChange,
  activePanel,
  onPanelClose,
  onResizerDown,
  chatContext,
}) => {
  return (
    <main className="wsh-main">
      <div className="wsh-resizer" onMouseDown={onResizerDown} />

      <SearchOverlay
        open={searchOpen}
        query={searchQuery}
        hits={searchHits}
        onQuery={onSearchQueryChange}
        onClose={onSearchClose}
        onPick={onSearchPick}
      />

      {overlay === 'login' && (
        <LoginView onClose={onLoginClose} onChanged={onLoginChanged} />
      )}
      {overlay === 'settings' && (
        <SettingsView
          onClose={onSettingsClose}
          onOpenLogin={onSettingsOpenLogin}
          onModelChanged={onSettingsModelChanged}
          themeChoice={themeChoice}
          resolvedTheme={resolvedTheme}
          onThemeChange={onThemeChange}
        />
      )}

      {overlay === 'none' && (
        <div className={`wsh-main-inner ${activePanel ? 'with-panel' : ''}`}>
          <div className="wsh-main-view">
            <ViewRouter
              view={view}
              chatContext={{
                active,
                onUpdate: chatContext.onUpdate,
                onMutateMessages: chatContext.onMutateMessages,
              }}
            />
          </div>
          {activePanel && (
            <SidePanel panel={activePanel} onClose={onPanelClose} />
          )}
        </div>
      )}
    </main>
  )
}
