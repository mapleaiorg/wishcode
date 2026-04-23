/**
 * ChatTitleMenu — top-bar affordance for the active conversation.
 *
 * Shows the conversation title with a caret; clicking opens a small menu
 * with Rename / Pin / Archive / Delete. Matches the Claude Code UX where
 * the thread title is a live control, not a dead label. The parent owns
 * the actual mutations — this component just surfaces them.
 */

import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Pin, PinOff, Archive, ArchiveRestore, Trash2, Check, X } from 'lucide-react'
import type { Conversation } from '../types'

interface Props {
  conversation: Conversation
  onRename(id: string, title: string): void
  onTogglePin(id: string): void
  onToggleArchive(id: string): void
  onDelete(id: string): void
}

export function ChatTitleMenu({ conversation, onRename, onTogglePin, onToggleArchive, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the menu when the conversation switches, or when clicking elsewhere.
  useEffect(() => {
    setOpen(false); setEditing(false); setConfirmDelete(false)
    setDraft(conversation.title)
  }, [conversation.id, conversation.title])

  useEffect(() => {
    if (!open && !editing) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false); setEditing(false); setConfirmDelete(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setEditing(false); setConfirmDelete(false) }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, editing])

  const startRename = () => {
    setDraft(conversation.title)
    setEditing(true)
    setOpen(false)
    setConfirmDelete(false)
  }
  const commitRename = () => {
    const next = draft.trim()
    if (next && next !== conversation.title) onRename(conversation.id, next)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="wsh-title-menu editing" ref={rootRef}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(conversation.title) }
          }}
          onBlur={commitRename}
          className="wsh-title-input"
          maxLength={120}
        />
        <button className="wsh-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={commitRename} title="Save"><Check size={13} /></button>
        <button className="wsh-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditing(false); setDraft(conversation.title) }} title="Cancel"><X size={13} /></button>
      </div>
    )
  }

  return (
    <div className="wsh-title-menu" ref={rootRef}>
      <button
        type="button"
        className="wsh-title-trigger"
        onClick={() => setOpen((v) => !v)}
        title={conversation.title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {conversation.pinned && <Pin size={11} className="wsh-title-pin" />}
        <span className="wsh-title-label">{conversation.title}</span>
        <ChevronDown size={12} className="wsh-title-caret" />
      </button>

      {open && (
        <div className="wsh-title-menu-pop" role="menu">
          <button className="wsh-title-menu-item" onClick={startRename}>
            <Pencil size={12} /> <span>Rename</span>
          </button>
          <button
            className="wsh-title-menu-item"
            onClick={() => { onTogglePin(conversation.id); setOpen(false) }}
          >
            {conversation.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            <span>{conversation.pinned ? 'Unpin from top' : 'Pin to top'}</span>
          </button>
          <button
            className="wsh-title-menu-item"
            onClick={() => { onToggleArchive(conversation.id); setOpen(false) }}
          >
            {conversation.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            <span>{conversation.archived ? 'Unarchive' : 'Archive'}</span>
          </button>
          <div className="wsh-title-menu-sep" />
          {confirmDelete ? (
            <div className="wsh-title-menu-confirm">
              <span>Delete this chat?</span>
              <div className="wsh-title-menu-confirm-row">
                <button
                  className="wsh-btn danger"
                  onClick={() => { onDelete(conversation.id); setOpen(false); setConfirmDelete(false) }}
                >
                  <Trash2 size={11} /> Delete
                </button>
                <button className="wsh-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              className="wsh-title-menu-item danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={12} /> <span>Delete</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
