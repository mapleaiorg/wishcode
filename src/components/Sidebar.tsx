/**
 * Sidebar — view rail, conversation history, and the bottom buddy footer.
 *
 * The view list and chat history now live inside one scroll container so the
 * footer stays pinned at the bottom while the rest of the sidebar remains
 * reachable on smaller window sizes.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  MessageSquare,
  LayoutDashboard, History, MoreHorizontal,
  Pencil, Pin, PinOff, Trash2,
} from 'lucide-react'
import type { Conversation } from '../types'
import type { ViewKey } from '../App'
import { Buddy } from './Buddy'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onSelect(id: string): void
  onNew(): void
  onRename(id: string, title: string): void
  onTogglePin(id: string): void
  onRemove(id: string): void
  view: ViewKey
  onSelectView(v: ViewKey): void
}

type MenuState = { conversationId: string; x: number; y: number } | null

const VIEWS: Array<{ id: ViewKey; label: string; icon: React.ReactNode }> = [
  { id: 'home',    label: 'Home',    icon: <LayoutDashboard size={14} /> },
  { id: 'chat',    label: 'Chat',    icon: <MessageSquare size={14} /> },
  { id: 'history', label: 'History', icon: <History size={14} /> },
]

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onTogglePin,
  onRemove,
  view,
  onSelectView,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [menu, setMenu] = useState<MenuState>(null)

  const orderedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const pinDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      if (pinDelta !== 0) return pinDelta
      return conversationLastActive(b) - conversationLastActive(a)
    })
  }, [conversations])

  useEffect(() => {
    if (!editingId) return
    if (conversations.some((conversation) => conversation.id === editingId)) return
    setEditingId(null)
    setDraftTitle('')
  }, [editingId, conversations])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const openMenu = (conversationId: string, x: number, y: number) => {
    const maxX = Math.max(24, window.innerWidth - 196)
    const maxY = Math.max(24, window.innerHeight - 164)
    setMenu({
      conversationId,
      x: Math.min(x, maxX),
      y: Math.min(y, maxY),
    })
  }

  const beginRename = (conversation: Conversation) => {
    setEditingId(conversation.id)
    setDraftTitle(conversation.title || '')
    setMenu(null)
  }

  const commitRename = () => {
    if (!editingId) return
    onRename(editingId, draftTitle)
    setEditingId(null)
    setDraftTitle('')
  }

  const cancelRename = () => {
    setEditingId(null)
    setDraftTitle('')
  }

  const handleDelete = (conversationId: string) => {
    setMenu(null)
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return
    onRemove(conversationId)
  }

  const menuConversation = orderedConversations.find((conversation) => conversation.id === menu?.conversationId) ?? null

  // The topbar owns the global New action. Keep the prop "used" for future
  // empty-state wiring without changing the public sidebar contract.
  void onNew

  return (
    <>
      <aside className="wsh-sidebar">
        <div className="wsh-sidebar-scroll">
          <div className="wsh-sidebar-section">Views</div>
          <nav className="wsh-sidebar-views">
            {VIEWS.map((entry) => (
              <button
                key={entry.id}
                className={`wsh-sidebar-view ${view === entry.id ? 'active' : ''}`}
                onClick={() => onSelectView(entry.id)}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </button>
            ))}
          </nav>

          {view === 'chat' && (
            <>
              <div className="wsh-sidebar-section">Conversations</div>
              <div className="wsh-sidebar-list">
                {orderedConversations.length === 0 && (
                  <div style={{ color: 'var(--text-mute)', fontSize: 12, padding: '6px 10px' }}>
                    No conversations yet.
                  </div>
                )}
                {orderedConversations.map((conversation) => {
                  const lastActive = conversationLastActive(conversation)
                  const isEditing = editingId === conversation.id
                  return (
                    <div
                      key={conversation.id}
                      className={`wsh-sidebar-item ${conversation.id === activeId ? 'active' : ''}`}
                      onClick={() => onSelect(conversation.id)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        if (isEditing) return
                        openMenu(conversation.id, event.clientX, event.clientY)
                      }}
                    >
                      <MessageSquare size={13} />
                      <div className="wsh-sidebar-item-main">
                        {isEditing ? (
                          <input
                            autoFocus
                            className="wsh-sidebar-item-input"
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={commitRename}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                commitRename()
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelRename()
                              }
                            }}
                          />
                        ) : (
                          <span className="wsh-sidebar-item-title">{conversation.title || 'Untitled'}</span>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="wsh-sidebar-item-meta">
                          {conversation.pinned && (
                            <span className="wsh-sidebar-pin" title="Pinned">
                              <Pin size={10} />
                            </span>
                          )}
                          <span className="wsh-sidebar-date">{formatRelativeDate(lastActive)}</span>
                          <button
                            className="wsh-sidebar-menu-trigger"
                            onClick={(event) => {
                              event.stopPropagation()
                              const rect = event.currentTarget.getBoundingClientRect()
                              openMenu(conversation.id, rect.right - 160, rect.bottom + 6)
                            }}
                            title="Conversation actions"
                          >
                            <MoreHorizontal size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="wsh-sidebar-foot">
          <Buddy />
        </div>
      </aside>

      {menu && menuConversation && (
        <>
          <div className="wsh-floating-menu-backdrop" onClick={() => setMenu(null)} />
          <div className="wsh-floating-menu" style={{ left: menu.x, top: menu.y }}>
            <button
              className="wsh-floating-menu-item"
              onClick={() => beginRename(menuConversation)}
            >
              <Pencil size={12} />
              <span>Rename</span>
            </button>
            <button
              className="wsh-floating-menu-item"
              onClick={() => {
                onTogglePin(menuConversation.id)
                setMenu(null)
              }}
            >
              {menuConversation.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              <span>{menuConversation.pinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button
              className="wsh-floating-menu-item danger"
              onClick={() => handleDelete(menuConversation.id)}
            >
              <Trash2 size={12} />
              <span>Delete</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}

function conversationLastActive(conversation: Conversation): number {
  return conversation.updatedAt
    ?? conversation.messages[conversation.messages.length - 1]?.ts
    ?? conversation.createdAt
}

function formatRelativeDate(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day

  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute) || 1)}m`
  if (diff < day) return `${Math.floor(diff / hour)}h`
  if (diff < week) return `${Math.floor(diff / day)}d`
  if (diff < month) return `${Math.floor(diff / week)}w`
  if (diff < year) return `${Math.floor(diff / month)}mo`
  return `${Math.floor(diff / year)}y`
}
