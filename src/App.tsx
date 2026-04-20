/**
 * App shell — the renderer top-level.
 *
 * Layout (three-zone):
 *
 *   ┌─────────────┬───────────────────────────────────┐
 *   │             │ Top titlebar (drag region)        │
 *   │  Sidebar    ├───────────────────────────────────┤
 *   │  (resize)   │   Active view (chat/wallet/…)     │
 *   │             │                                   │
 *   └─────────────┴───────────────────────────────────┘
 *
 * - Left sidebar is user-resizable; width persists in localStorage and is
 *   driven by the `--ibn-sidebar-w` CSS variable so the main column re-flows.
 * - Top titlebar owns model picker (right), login button (right), settings
 *   gear (right), and the current view title (center).
 * - Login and Settings are *overlays* on the main column, not modals — they
 *   behave like routes.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings, LogIn, UserRound, PanelLeftClose, PanelLeftOpen, Search, Plus } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { WalletView } from './components/WalletView'
import { NftGallery } from './components/NftGallery'
import { CryptoBuddiesView } from './components/CryptoBuddiesView'
import { FinancialBuddiesView } from './components/FinancialBuddiesView'
import { HarnessView } from './components/HarnessView'
import { SettingsView } from './components/SettingsView'
import { LoginView } from './components/LoginView'
import { HomeView } from './features/home/HomeView'
import { PortfolioView } from './features/portfolio/PortfolioView'
import { HistoryView } from './features/history/HistoryView'
import { MarketView } from './features/market/MarketView'
import { TokensView } from './features/tokens/TokensView'
import { AlertsView } from './features/alerts/AlertsView'
import { SwapView } from './features/swap/SwapView'
import { ExportsView } from './features/exports/ExportsView'
import { AddressBookView } from './features/addressBook/AddressBookView'
import { ModelPicker } from './components/ModelPicker'
import { LogoLong } from './components/LogoLong'
import { Logo } from './components/Logo'
import type { AuthStatusResponse, Conversation, CurrentModel } from './types'
import { useTheme } from './hooks/useTheme'

export type ViewKey =
  | 'home' | 'chat' | 'wallet' | 'portfolio' | 'history'
  | 'market' | 'tokens' | 'alerts' | 'swap' | 'exports' | 'addressBook'
  | 'nft' | 'cryptoBuddies' | 'financialBuddies' | 'harness'

type Overlay = 'none' | 'settings' | 'login'

const VIEW_TITLES: Record<ViewKey, string> = {
  home: 'Home',
  chat: 'Chat',
  wallet: 'Wallet',
  portfolio: 'Portfolio',
  history: 'History',
  market: 'Market',
  tokens: 'Tokens',
  alerts: 'Alerts',
  swap: 'Swap',
  exports: 'Exports',
  addressBook: 'Address Book',
  nft: 'NFTs',
  cryptoBuddies: 'CryptoBuddies',
  financialBuddies: 'FinancialBuddies',
  harness: 'Harness',
}

const SIDEBAR_STORAGE_KEY = 'ibn.sidebarWidth'
const SIDEBAR_COLLAPSED_KEY = 'ibn.sidebarCollapsed'
const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 480

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

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  // ── Platform class (macOS traffic-light safe zone) ──────────────────
  useEffect(() => {
    if (/Mac/.test(navigator.userAgent)) {
      document.documentElement.classList.add('is-mac')
    }
  }, [])

  // ── Resizable sidebar ───────────────────────────────────────────────
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
    document.documentElement.style.setProperty('--ibn-sidebar-w', `${sidebarW}px`)
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarW))
  }, [sidebarW])
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Cmd/Ctrl+B toggles the sidebar, Cmd/Ctrl+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [])

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

  // ── Conversation helpers ────────────────────────────────────────────
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

  // ── Current model + auth probe (for top-right chips) ────────────────
  const refreshMeta = useCallback(async () => {
    try { setModel(await window.ibank.model.current() as CurrentModel) } catch {}
    try {
      const st = (await window.ibank.auth.status()) as AuthStatusResponse
      const p = st.providers
      const any = p.anthropic.configured || p.openai.configured || p.xai.configured ||
        p.gemini.configured || p.openibank.configured
      const label = p.anthropic.configured
        ? (p.anthropic.oauth ? (p.anthropic.email ?? 'Claude · signed in') : 'Anthropic')
        : p.openai.configured ? 'OpenAI'
        : p.xai.configured ? 'Grok'
        : p.gemini.configured ? 'Gemini'
        : p.openibank.configured ? 'OpeniBank'
        : p.ollama.live ? 'Ollama · local'
        : 'Sign in'
      setAuthed({ any, label })
    } catch {}
  }, [])

  useEffect(() => { void refreshMeta() }, [refreshMeta])

  // Pick up oauth completion so header refreshes immediately.
  useEffect(() => {
    return window.ibank?.auth.onOAuthComplete(() => { void refreshMeta() })
  }, [refreshMeta])

  const topTitle = overlay === 'settings' ? 'Settings'
                 : overlay === 'login'    ? 'Login'
                 : VIEW_TITLES[view]

  // ── Filter conversations by search query ────────────────────────────
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
    <div className={`ibn-root ${collapsed ? 'collapsed' : ''}`}>
      {/* Unified top bar — spans full width; owns Logo, New, collapse, search,
          view title, model picker, login, settings. */}
      <header className="ibn-topbar">
        <div className="ibn-topbar-left">
          <div className="ibn-topbar-brand" title="iBank">
            {collapsed ? <Logo size={22} /> : <LogoLong height={22} />}
          </div>
          <button
            className={`ibn-sidebar-new ${collapsed ? 'icon-only' : ''}`}
            onClick={handleNew}
            title="New conversation"
          >
            <Plus size={12} />
            {!collapsed && <span style={{ marginLeft: 4 }}>New</span>}
          </button>
          <button
            className="ibn-icon-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          <button
            className="ibn-icon-btn"
            onClick={() => setSearchOpen((v) => !v)}
            title="Search conversations (⌘K)"
          >
            <Search size={14} />
          </button>
        </div>
        <div className="ibn-topbar-title">{topTitle}</div>
        <div className="ibn-topbar-right">
          <ModelPicker
            current={model}
            onChanged={(m) => setModel(m)}
            onRequestLogin={() => setOverlay('login')}
          />
          <button
            className={`ibn-btn ${authed.any ? '' : 'primary'}`}
            onClick={() => setOverlay(overlay === 'login' ? 'none' : 'login')}
            title={authed.any ? 'Manage sign-in' : 'Sign in'}
          >
            {authed.any ? <UserRound size={12} /> : <LogIn size={12} />}
            <span style={{ marginLeft: 4 }}>{authed.label}</span>
          </button>
          <button
            className="ibn-btn"
            onClick={() => setOverlay(overlay === 'settings' ? 'none' : 'settings')}
            title="Settings"
          >
            <Settings size={12} />
          </button>
        </div>
      </header>

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => { setActiveId(id); setView('chat'); setOverlay('none') }}
        onNew={handleNew}
        onRename={renameConversation}
        onTogglePin={toggleConversationPinned}
        onRemove={handleRemove}
        view={view}
        onSelectView={(v) => { setView(v); setOverlay('none') }}
      />

      <main className="ibn-main">
        {/* resize handle straddles the sidebar/main seam */}
        <div className="ibn-resizer" onMouseDown={onResizerDown} />

        {searchOpen && (
          <div className="ibn-search-overlay" onClick={() => setSearchOpen(false)}>
            <div className="ibn-search-box" onClick={(e) => e.stopPropagation()}>
              <Search size={14} style={{ color: 'var(--text-mute)' }} />
              <input
                autoFocus
                placeholder="Search conversations…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false) }}
              />
              <div className="ibn-search-results">
                {searchHits.length === 0 && (
                  <div style={{ padding: 16, color: 'var(--text-mute)', fontSize: 12 }}>No matches.</div>
                )}
                {searchHits.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    className="ibn-search-hit"
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
          <>
            {view === 'chat' && active && (
              <ChatView
                conversation={active}
                onUpdate={(partial) => updateConversation(active.id, partial)}
              />
            )}
            {view === 'home'              && <HomeView />}
            {view === 'wallet'            && <WalletView />}
            {view === 'portfolio'         && <PortfolioView />}
            {view === 'history'           && <HistoryView />}
            {view === 'market'            && <MarketView />}
            {view === 'tokens'            && <TokensView />}
            {view === 'alerts'            && <AlertsView />}
            {view === 'swap'              && <SwapView />}
            {view === 'exports'           && <ExportsView />}
            {view === 'addressBook'       && <AddressBookView />}
            {view === 'nft'               && <NftGallery />}
            {view === 'cryptoBuddies'     && <CryptoBuddiesView />}
            {view === 'financialBuddies'  && <FinancialBuddiesView />}
            {view === 'harness'           && <HarnessView />}
          </>
        )}
      </main>
    </div>
  )
}

export default App
