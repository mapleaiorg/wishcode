/**
 * AppShell — top-level Wish Code renderer frame (S-0).
 *
 * Replaces the monolithic `src/App.tsx` (which was ~545 LoC) with a
 * composition of focused modules:
 *
 *   - state/        — shell store + sidebar prefs + conversations + keyboard
 *   - layout/       — Topbar, MainArea (this file is the orchestrator)
 *   - chrome/       — Sidebar, SearchOverlay, ModelToast
 *   - navigation/   — view routing
 *   - settings/     — SettingsView
 *   - login/        — LoginView
 *   - branding/     — Logo
 *
 * Behavior preserved exactly: localStorage keys (`wsh.sidebarWidth`,
 * `wsh.sidebarCollapsed`), three-zone layout, resize/collapse UX, ⌘B/⌘K
 * shortcuts, model-switch toast, auto-derived conversation titles.
 *
 * Native Chat / Native Code surfaces are deferred to S-1 / S-2 (clean mount
 * points reserved in `navigation/routes.tsx`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthStatusResponse, CurrentModel } from '../../types'
import { useTheme } from '../../hooks/useTheme'
import { Sidebar } from '../chrome/Sidebar'
import { ModelToast, type ModelToastView } from '../chrome/ModelToast'
import { searchConversations } from '../chrome/SearchOverlay'
import { Topbar } from './Topbar'
import { MainArea } from './MainArea'
import { AskUserModel } from '../../components/AskUserModel'
import type { PanelKey } from '../../components/PanelsMenu'
import { useSidebarPrefs } from '../state/use-sidebar-prefs'
import { useConversations } from '../state/use-conversations'
import { useShellKeyboard } from '../state/use-shell-keyboard'
import { useShellActions, useShellState } from '../state/shell-store'
import { deriveTitleFromMessages } from '../util/derive-title'
import { VIEW_TITLES } from '../types'

export const AppShell: React.FC = () => {
  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme()

  // ── conversations ----------------------------------------------------
  const {
    conversations,
    active,
    activeId,
    setActiveId,
    createNew,
    remove: removeConversation,
    rename,
    togglePinned,
    toggleArchived,
    update,
    mutateMessages,
  } = useConversations()

  // ── shell-level cross-cutting state (Zustand-shaped) ----------------
  const { view, overlay, activePanel, searchOpen, searchQuery } = useShellState()
  const shellActions = useShellActions()

  // ── sidebar prefs ----------------------------------------------------
  const { width: sidebarW, collapsed, setCollapsed, beginResize } = useSidebarPrefs()

  // ── IPC-fed metadata (model + auth label) ---------------------------
  const [model, setModel] = useState<CurrentModel | null>(null)
  const [authed, setAuthed] = useState<{ any: boolean; label: string }>({ any: false, label: 'Sign in' })
  const [modelToast, setModelToast] = useState<ModelToastView | null>(null)
  const suppressNextModelToast = useRef(false)

  // ── platform class --------------------------------------------------
  useEffect(() => {
    if (/Mac/.test(navigator.userAgent)) {
      document.documentElement.classList.add('is-mac')
    }
  }, [])

  // ── shell keyboard shortcuts ----------------------------------------
  useShellKeyboard({
    onToggleSidebar: () => setCollapsed((v) => !v),
    onOpenSearch: shellActions.openSearch,
    onClosePanel: () => shellActions.setActivePanel(null),
    hasActivePanel: activePanel != null,
  })

  // ── refresh model + auth label --------------------------------------
  const refreshMeta = useCallback(async () => {
    try { setModel((await window.wish.model.current()) as CurrentModel) } catch { /* ignore */ }
    try {
      const st = (await window.wish.auth.status()) as AuthStatusResponse
      const p = st.providers
      const any = p.anthropic.configured || p.openai.configured || p.xai.configured ||
        p.gemini.configured || p.hermon.configured
      const label = p.anthropic.configured
        ? (p.anthropic.oauth ? (p.anthropic.email ?? 'Claude · signed in') : 'Anthropic')
        : p.openai.configured ? 'OpenAI'
        : p.xai.configured ? 'Grok'
        : p.gemini.configured ? 'Gemini'
        : p.hermon.configured ? 'Hermon'
        : p.ollama.live ? 'Ollama · local'
        : 'Sign in'
      setAuthed({ any, label })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refreshMeta() }, [refreshMeta])
  useEffect(() => window.wish?.auth.onOAuthComplete(() => { void refreshMeta() }), [refreshMeta])

  useEffect(() => {
    const unsub = window.wish?.model.onChanged?.((p) => {
      setModel({ provider: p.to.provider, model: p.to.model } as CurrentModel)
      if (suppressNextModelToast.current) {
        suppressNextModelToast.current = false
        return
      }
      setModelToast({
        from: `${p.from.provider}/${p.from.model}`,
        to: `${p.to.provider}/${p.to.model}`,
        ts: p.ts,
      })
    })
    return () => { unsub?.() }
  }, [])

  useEffect(() => {
    if (!modelToast) return
    const t = setTimeout(() => setModelToast(null), 6000)
    return () => clearTimeout(t)
  }, [modelToast])

  // ── auto-title + remember last model on every assistant 'done' ------
  useEffect(() => {
    const unsub = window.wish?.chat.onDone?.(() => {
      if (!activeId) return
      // Functional update through the conversations API.
      const c = conversationsRef.current.find((x) => x.id === activeId)
      if (!c) return
      const patch: Parameters<typeof update>[1] = {}
      if (model) patch.lastModel = { provider: model.provider, model: model.model }
      const isDefault = !c.title || c.title === 'New conversation' || c.title === 'Untitled'
      if (isDefault) {
        const derived = deriveTitleFromMessages(c.messages)
        if (derived) patch.title = derived
      }
      if (Object.keys(patch).length > 0) update(activeId, patch)
    })
    return () => { unsub?.() }
  }, [activeId, model, update])

  // Snapshot for the chat.onDone closure (avoids re-subscribing on every
  // conversations change).
  const conversationsRef = useRef(conversations)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])

  // ── search hits ------------------------------------------------------
  const searchHits = useMemo(
    () => searchConversations(conversations, searchQuery),
    [conversations, searchQuery],
  )

  // ── derived top title -----------------------------------------------
  const topTitle = overlay === 'settings' ? 'Settings'
                 : overlay === 'login'    ? 'Login'
                 : VIEW_TITLES[view]

  // ── handlers --------------------------------------------------------
  const handleNew = useCallback(() => {
    createNew()
    shellActions.setView('chat')
  }, [createNew, shellActions])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id)
    shellActions.setView('chat')
    const conv = conversations.find((c) => c.id === id)
    const last = conv?.lastModel
    if (last && (last.provider !== model?.provider || last.model !== model?.model)) {
      suppressNextModelToast.current = true
      setModel({ provider: last.provider, model: last.model } as CurrentModel)
      void window.wish?.model.set(last.provider, last.model).catch((err) => {
        suppressNextModelToast.current = false
        // eslint-disable-next-line no-console
        console.warn('model restore failed', err)
      })
    }
  }, [conversations, model?.model, model?.provider, setActiveId, shellActions])

  const onResizerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    beginResize(e.clientX)
  }, [beginResize])

  return (
    <div className={`wsh-root ${collapsed ? 'collapsed' : ''}`}>
      <Topbar
        collapsed={collapsed}
        view={view}
        overlay={overlay}
        topTitle={topTitle}
        active={active}
        model={model}
        authed={authed}
        activePanel={activePanel}
        onNewConversation={handleNew}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onToggleSearch={shellActions.openSearch}
        onModelChanged={setModel}
        onRequestLogin={() => shellActions.setOverlay('login')}
        onToggleLogin={() => shellActions.toggleOverlay('login')}
        onToggleSettings={() => shellActions.toggleOverlay('settings')}
        onTogglePanel={(p: PanelKey) => shellActions.togglePanel(p)}
        onRenameConversation={rename}
        onTogglePinned={togglePinned}
        onToggleArchived={toggleArchived}
        onRemoveConversation={removeConversation}
      />

      <Sidebar
        conversations={conversations.filter((c) => !c.archived || c.id === activeId)}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNew}
        onRename={rename}
        onTogglePin={togglePinned}
        onRemove={removeConversation}
        view={view}
        onSelectView={(v) => shellActions.setView(v)}
      />

      <MainArea
        view={view}
        overlay={overlay}
        active={active}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        searchHits={searchHits}
        onSearchQueryChange={shellActions.setSearchQuery}
        onSearchClose={shellActions.closeSearch}
        onSearchPick={(id) => {
          handleSelectConversation(id)
          shellActions.closeSearch()
        }}
        onLoginClose={shellActions.closeOverlay}
        onLoginChanged={() => void refreshMeta()}
        onSettingsClose={shellActions.closeOverlay}
        onSettingsOpenLogin={() => shellActions.setOverlay('login')}
        onSettingsModelChanged={setModel}
        themeChoice={themeChoice}
        resolvedTheme={resolvedTheme}
        onThemeChange={setTheme}
        activePanel={activePanel}
        onPanelClose={() => shellActions.setActivePanel(null)}
        onResizerDown={onResizerDown}
        chatContext={{
          onUpdate: (partial) => active && update(active.id, partial),
          onMutateMessages: (fn) => active && mutateMessages(active.id, fn),
        }}
      />

      <AskUserModel />

      <ModelToast
        toast={modelToast}
        onDismiss={() => setModelToast(null)}
        onNewChat={() => { handleNew(); setModelToast(null) }}
      />

      {/* `sidebarW` is read by the resizer hook into the
        * `--wsh-sidebar-w` CSS variable; this comment keeps the variable
        * in scope for future inline styling. */}
      <span data-sidebar-width={sidebarW} hidden />
    </div>
  )
}
