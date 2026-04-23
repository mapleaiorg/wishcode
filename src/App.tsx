/**
 * App shell — the renderer top-level.
 *
 * Layout (three-zone):
 *
 *   ┌─────────────┬───────────────────────────────────┐
 *   │             │ Top titlebar (drag region)        │
 *   │  Sidebar    ├───────────────────────────────────┤
 *   │  (resize)   │   Active view (chat/home/…)       │
 *   │             │                                   │
 *   └─────────────┴───────────────────────────────────┘
 *
 * - Left sidebar is user-resizable; width persists in localStorage and is
 *   driven by the `--wsh-sidebar-w` CSS variable so the main column re-flows.
 * - Top titlebar owns model picker (right), login button (right), settings
 *   gear (right), and the current view title (center).
 * - Login and Settings are *overlays* on the main column, not modals — they
 *   behave like routes.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings, LogIn, UserRound, PanelLeftClose, PanelLeftOpen, Search, Plus } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsView } from './components/SettingsView'
import { LoginView } from './components/LoginView'
import { HomeView } from './features/home/HomeView'
import { HistoryView } from './features/history/HistoryView'
import { ModelPicker } from './components/ModelPicker'
import { Logo } from './components/Logo'
import { AskUserModel } from './components/AskUserModel'
import { ChatTitleMenu } from './components/ChatTitleMenu'
import { PanelsMenu, type PanelKey } from './components/PanelsMenu'
import { SidePanel } from './components/SidePanel'
import type { AuthStatusResponse, Conversation, CurrentModel, Message } from './types'
import { useTheme } from './hooks/useTheme'

export type ViewKey = 'home' | 'chat' | 'history'

type Overlay = 'none' | 'settings' | 'login'

const VIEW_TITLES: Record<ViewKey, string> = {
  home: 'Home',
  chat: 'Chat',
  history: 'History',
}

const SIDEBAR_STORAGE_KEY = 'wsh.sidebarWidth'
const SIDEBAR_COLLAPSED_KEY = 'wsh.sidebarCollapsed'
const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 480

/**
 * Turn the first user message into a short, human-readable title.
 * Trims to ~48 chars and drops trailing punctuation so the sidebar looks
 * neat. Returns null if no suitable text exists yet (so the caller can
 * keep the default "New conversation" placeholder).
 *
 * We intentionally do this client-side rather than asking the model: it
 * always runs, it's free, and it makes the sidebar snap into a real title
 * on the very first assistant reply.
 */
function deriveTitleFromMessages(messages: Message[]): string | null {
  for (const m of messages) {
    if (m.role !== 'user') continue
    for (const b of m.content) {
      const text = (b as any).type === 'text' ? String((b as any).text ?? '') : ''
      const first = text.split('\n').map((s) => s.trim()).find((s) => s.length > 0)
      if (!first) continue
      // Strip leading slash-commands like "/new " or "/explain "
      const stripped = first.replace(/^\/[a-z][\w-]*\s+/i, '').trim()
      const source = stripped.length > 0 ? stripped : first
      let t = source.replace(/\s+/g, ' ').trim()
      if (t.length > 48) t = t.slice(0, 48).replace(/[\s.,;:!?-]+$/, '') + '…'
      return t || null
    }
  }
  return null
}

function newConversation(): Conversation {
  const now = Date.now()
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    pinned: false,
    messages: [],
  }
}

export const App: React.FC = () => {
  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme()
  const [conversations, setConversations] = useState<Conversation[]>(() => [newConversation()])
  const [activeId, setActiveId] = useState<string | null>(() => conversations[0].id)
  const [view, setView] = useState<ViewKey>('home')
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [model, setModel] = useState<CurrentModel | null>(null)
  const [authed, setAuthed] = useState<{ any: boolean; label: string }>({ any: false, label: 'Sign in' })
  const [modelToast, setModelToast] = useState<{ from: string; to: string; ts: number } | null>(null)
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  useEffect(() => {
    if (/Mac/.test(navigator.userAgent)) {
      document.documentElement.classList.add('is-mac')
    }
  }, [])

  const [sidebarW, setSidebarW] = useState<number>(() => {
    const raw = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY))
    return Number.isFinite(raw) && raw >= SIDEBAR_MIN ? Math.min(raw, SIDEBAR_MAX) : 260
  })
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const draggingRef = useRef<boolean>(false)
  useEffect(() => {
    document.documentElement.style.setProperty('--wsh-sidebar-w', `${sidebarW}px`)
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarW))
  }, [sidebarW])
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the right-docked panel if one is open. Don't swallow
      // Escape otherwise — child menus and the search overlay need it too.
      if (e.key === 'Escape' && activePanel) {
        setActivePanel(null); return
      }
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd) return
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault(); setCollapsed((v) => !v)
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault(); setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePanel])

  const onResizerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX))
      setSidebarW(w)
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

  const updateConversation = useCallback((id: string, partial: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const nextMessages = partial.messages ?? c.messages
      const nextUpdatedAt = partial.updatedAt
        ?? (partial.messages
          ? nextMessages[nextMessages.length - 1]?.ts ?? Date.now()
          : c.updatedAt ?? c.createdAt)
      return { ...c, ...partial, messages: nextMessages, updatedAt: nextUpdatedAt }
    }))
  }, [])

  /**
   * Functional update for a conversation's `messages` list.
   * Used by ChatView stream handlers so rapid-fire deltas always read the
   * latest messages from state rather than a captured snapshot.
   */
  const mutateMessages = useCallback((id: string, fn: (prev: Message[]) => Message[]) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const next = fn(c.messages)
      const lastTs = next[next.length - 1]?.ts ?? c.updatedAt ?? c.createdAt
      return { ...c, messages: next, updatedAt: lastTs }
    }))
  }, [])

  const renameConversation = useCallback((id: string, title: string) => {
    const nextTitle = title.trim() || 'New conversation'
    setConversations((prev) => prev.map((c) => (
      c.id === id ? { ...c, title: nextTitle } : c
    )))
  }, [])

  const toggleConversationPinned = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (
      c.id === id ? { ...c, pinned: !c.pinned } : c
    )))
  }, [])

  const toggleConversationArchived = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (
      c.id === id ? { ...c, archived: !c.archived } : c
    )))
  }, [])

  const handleNew = useCallback(() => {
    const c = newConversation()
    setConversations((prev) => [c, ...prev])
    setActiveId(c.id)
    setView('chat')
    setOverlay('none')
  }, [])

  const handleRemove = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (next.length === 0) return [newConversation()]
      return next
    })
    setActiveId((cur) => (cur === id ? null : cur))
  }, [])

  useEffect(() => {
    if (activeId) return
    if (conversations[0]) setActiveId(conversations[0].id)
  }, [activeId, conversations])

  const refreshMeta = useCallback(async () => {
    try { setModel(await window.wish.model.current() as CurrentModel) } catch {}
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
    } catch {}
  }, [])

  useEffect(() => { void refreshMeta() }, [refreshMeta])

  useEffect(() => {
    return window.wish?.auth.onOAuthComplete(() => { void refreshMeta() })
  }, [refreshMeta])

  // A ref rather than state so we can atomically flip it inside an event
  // handler without the async re-render window racing against the backend
  // `model.changed` broadcast that follows our programmatic `.set()`.
  const suppressNextModelToast = useRef(false)

  // Surface a model-switch toast + refresh the header label so users see
  // that the change took effect and the active session noted it. Toasts
  // are skipped for programmatic restores (opening an old conversation)
  // since the user didn't explicitly change models.
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

  // Record the model that just produced an assistant turn on the active
  // conversation, so reopening it later restores this model automatically.
  // Also opportunistically auto-title the conversation from the first user
  // message — only when the title is still the stock "New conversation"
  // placeholder, so we never clobber a name the user set manually.
  useEffect(() => {
    const unsub = window.wish?.chat.onDone?.(() => {
      if (!activeId) return
      setConversations((prev) => prev.map((c) => {
        if (c.id !== activeId) return c
        const next: Conversation = { ...c }
        if (model) next.lastModel = { provider: model.provider, model: model.model }
        // Auto-title: cheap client-side derivation from the first non-empty
        // user text block. We only do this once (when title is still the
        // default), so the user can rename and it sticks forever after.
        const isDefault = !c.title || c.title === 'New conversation' || c.title === 'Untitled'
        if (isDefault) {
          const derived = deriveTitleFromMessages(c.messages)
          if (derived) next.title = derived
        }
        return next
      }))
    })
    return () => { unsub?.() }
  }, [activeId, model])

  const topTitle = overlay === 'settings' ? 'Settings'
                 : overlay === 'login'    ? 'Login'
                 : VIEW_TITLES[view]

  const searchHits = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true
      for (const m of c.messages) {
        for (const b of m.content) {
          if ((b as any).text && String((b as any).text).toLowerCase().includes(q)) return true
        }
      }
      return false
    })
  }, [conversations, searchQ])

  return (
    <div className={`wsh-root ${collapsed ? 'collapsed' : ''}`}>
      <header className="wsh-topbar">
        <div className="wsh-topbar-left">
          <div className="wsh-topbar-brand" title="Wish Code">
            <Logo size={20} />
            <span className="wsh-topbar-brand-word">Wish Code</span>
          </div>
          <button
            className={`wsh-sidebar-new ${collapsed ? 'icon-only' : ''}`}
            onClick={handleNew}
            title="New conversation"
          >
            <Plus size={12} />
            {!collapsed && <span style={{ marginLeft: 4 }}>New</span>}
          </button>
          <button
            className="wsh-icon-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          <button
            className="wsh-icon-btn"
            onClick={() => setSearchOpen((v) => !v)}
            title="Search conversations (⌘K)"
          >
            <Search size={14} />
          </button>
        </div>
        <div className="wsh-topbar-title">
          {overlay === 'none' && view === 'chat' && active ? (
            <ChatTitleMenu
              conversation={active}
              onRename={renameConversation}
              onTogglePin={toggleConversationPinned}
              onToggleArchive={toggleConversationArchived}
              onDelete={handleRemove}
            />
          ) : (
            topTitle
          )}
        </div>
        <div className="wsh-topbar-right">
          <ModelPicker
            current={model}
            onChanged={(m) => setModel(m)}
            onRequestLogin={() => setOverlay('login')}
          />
          <button
            className={`wsh-btn ${authed.any ? '' : 'primary'}`}
            onClick={() => setOverlay(overlay === 'login' ? 'none' : 'login')}
            title={authed.any ? 'Manage sign-in' : 'Sign in'}
          >
            {authed.any ? <UserRound size={12} /> : <LogIn size={12} />}
            <span style={{ marginLeft: 4 }}>{authed.label}</span>
          </button>
          <PanelsMenu
            active={activePanel}
            onOpen={(p) => setActivePanel((cur) => (cur === p ? null : p))}
          />
          <button
            className="wsh-btn"
            onClick={() => setOverlay(overlay === 'settings' ? 'none' : 'settings')}
            title="Settings"
          >
            <Settings size={12} />
          </button>
        </div>
      </header>

      <Sidebar
        conversations={conversations.filter((c) => !c.archived || c.id === activeId)}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id); setView('chat'); setOverlay('none')
          // Restore the model this conversation was last run against so the
          // user doesn't accidentally continue an Opus thread on Ollama (or
          // vice-versa). Update local state OPTIMISTICALLY so the header
          // flips on the same frame as the conversation swap, then fire the
          // backend `model.set` in the background. The `onChanged` listener
          // above suppresses the toast for this class of switch — opening
          // an old chat should feel instant, not narrated.
          const conv = conversations.find((c) => c.id === id)
          const last = conv?.lastModel
          if (last && (last.provider !== model?.provider || last.model !== model?.model)) {
            suppressNextModelToast.current = true
            setModel({ provider: last.provider, model: last.model } as CurrentModel)
            void window.wish?.model.set(last.provider, last.model).catch((err) => {
              // If the set fails (e.g. provider not configured), drop the
              // suppression flag so the next real switch isn't silent, and
              // surface the error so the user can pick a different model.
              suppressNextModelToast.current = false
              console.warn('model restore failed', err)
            })
          }
        }}
        onNew={handleNew}
        onRename={renameConversation}
        onTogglePin={toggleConversationPinned}
        onRemove={handleRemove}
        view={view}
        onSelectView={(v) => { setView(v); setOverlay('none') }}
      />

      <main className="wsh-main">
        <div className="wsh-resizer" onMouseDown={onResizerDown} />

        {searchOpen && (
          <div className="wsh-search-overlay" onClick={() => setSearchOpen(false)}>
            <div className="wsh-search-box" onClick={(e) => e.stopPropagation()}>
              <Search size={14} style={{ color: 'var(--text-mute)' }} />
              <input
                autoFocus
                placeholder="Search conversations…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false) }}
              />
              <div className="wsh-search-results">
                {searchHits.length === 0 && (
                  <div style={{ padding: 16, color: 'var(--text-mute)', fontSize: 12 }}>No matches.</div>
                )}
                {searchHits.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    className="wsh-search-hit"
                    onClick={() => {
                      setActiveId(c.id); setView('chat'); setOverlay('none'); setSearchOpen(false)
                    }}
                  >
                    <strong>{c.title || 'Untitled'}</strong>
                    <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
                      {c.messages.length} message{c.messages.length === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {overlay === 'login' && (
          <LoginView
            onClose={() => setOverlay('none')}
            onChanged={() => void refreshMeta()}
          />
        )}
        {overlay === 'settings' && (
          <SettingsView
            onClose={() => setOverlay('none')}
            onOpenLogin={() => setOverlay('login')}
            onModelChanged={(m) => setModel(m)}
            themeChoice={themeChoice}
            resolvedTheme={resolvedTheme}
            onThemeChange={setTheme}
          />
        )}

        {overlay === 'none' && (
          <div className={`wsh-main-inner ${activePanel ? 'with-panel' : ''}`}>
            <div className="wsh-main-view">
              {view === 'chat' && active && (
                <ChatView
                  conversation={active}
                  onUpdate={(partial) => updateConversation(active.id, partial)}
                  onMutateMessages={(fn) => mutateMessages(active.id, fn)}
                />
              )}
              {view === 'home'    && <HomeView />}
              {view === 'history' && <HistoryView />}
            </div>
            {activePanel && (
              <SidePanel panel={activePanel} onClose={() => setActivePanel(null)} />
            )}
          </div>
        )}
      </main>

      <AskUserModel />

      {modelToast && (
        <div className="wsh-toast" role="status" aria-live="polite">
          <strong>Model switched</strong>
          <span>
            <code>{modelToast.from}</code> → <code>{modelToast.to}</code>
          </span>
          <span className="wsh-toast-hint">
            The active chat keeps its history. Start a new conversation if you want a clean slate.
          </span>
          <div className="wsh-toast-actions">
            <button className="wsh-btn" onClick={() => setModelToast(null)}>Dismiss</button>
            <button
              className="wsh-btn primary"
              onClick={() => { handleNew(); setModelToast(null) }}
            >
              New chat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
