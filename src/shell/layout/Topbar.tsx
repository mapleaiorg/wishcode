/**
 * Topbar — application-frame title bar (the Mac-style drag region row).
 *
 * Owns:
 *  - brand mark + "New conversation" button + sidebar collapse + search trigger
 *  - center title (current view, or chat-aware ChatTitleMenu)
 *  - model picker, sign-in, panels menu, settings gear
 *
 * Pure presentation. All state lives in the shell store + hooks; this
 * component only receives values + callbacks.
 */

import React from 'react'
import { LogIn, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, UserRound } from 'lucide-react'
import type { Conversation, CurrentModel } from '../../types'
import { Logo } from '../branding/Logo'
import { ChatTitleMenu } from '../../components/ChatTitleMenu'
import { ModelPicker } from '../../components/ModelPicker'
import { PanelsMenu, type PanelKey } from '../../components/PanelsMenu'
import type { Overlay, ViewKey } from '../types'

interface AuthState {
  any: boolean
  label: string
}

interface TopbarProps {
  collapsed: boolean
  view: ViewKey
  overlay: Overlay
  topTitle: string
  active: Conversation | null
  model: CurrentModel | null
  authed: AuthState
  activePanel: PanelKey | null

  onNewConversation(): void
  onToggleCollapse(): void
  onToggleSearch(): void

  onModelChanged(m: CurrentModel): void
  onRequestLogin(): void

  onToggleLogin(): void
  onToggleSettings(): void
  onTogglePanel(panel: PanelKey): void

  onRenameConversation(id: string, title: string): void
  onTogglePinned(id: string): void
  onToggleArchived(id: string): void
  onRemoveConversation(id: string): void
}

export const Topbar: React.FC<TopbarProps> = ({
  collapsed,
  view,
  overlay,
  topTitle,
  active,
  model,
  authed,
  activePanel,
  onNewConversation,
  onToggleCollapse,
  onToggleSearch,
  onModelChanged,
  onRequestLogin,
  onToggleLogin,
  onToggleSettings,
  onTogglePanel,
  onRenameConversation,
  onTogglePinned,
  onToggleArchived,
  onRemoveConversation,
}) => {
  return (
    <header className="wsh-topbar">
      <div className="wsh-topbar-left">
        <div className="wsh-topbar-brand" title="Wish Code">
          <Logo size={20} />
          <span className="wsh-topbar-brand-word">Wish Code</span>
        </div>
        <button
          className={`wsh-sidebar-new ${collapsed ? 'icon-only' : ''}`}
          onClick={onNewConversation}
          title="New conversation"
        >
          <Plus size={12} />
          {!collapsed && <span style={{ marginLeft: 4 }}>New</span>}
        </button>
        <button
          className="wsh-icon-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
        <button
          className="wsh-icon-btn"
          onClick={onToggleSearch}
          title="Search conversations (⌘K)"
        >
          <Search size={14} />
        </button>
      </div>

      <div className="wsh-topbar-title">
        {overlay === 'none' && view === 'chat' && active ? (
          <ChatTitleMenu
            conversation={active}
            onRename={onRenameConversation}
            onTogglePin={onTogglePinned}
            onToggleArchive={onToggleArchived}
            onDelete={onRemoveConversation}
          />
        ) : (
          topTitle
        )}
      </div>

      <div className="wsh-topbar-right">
        <ModelPicker
          current={model}
          onChanged={onModelChanged}
          onRequestLogin={onRequestLogin}
        />
        <button
          className={`wsh-btn ${authed.any ? '' : 'primary'}`}
          onClick={onToggleLogin}
          title={authed.any ? 'Manage sign-in' : 'Sign in'}
        >
          {authed.any ? <UserRound size={12} /> : <LogIn size={12} />}
          <span style={{ marginLeft: 4 }}>{authed.label}</span>
        </button>
        <PanelsMenu active={activePanel} onOpen={onTogglePanel} />
        <button
          className="wsh-btn"
          onClick={onToggleSettings}
          title="Settings"
        >
          <Settings size={12} />
        </button>
      </div>
    </header>
  )
}
