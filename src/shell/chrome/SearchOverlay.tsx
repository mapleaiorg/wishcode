/**
 * SearchOverlay — full-window conversation search popover.
 *
 * Extracted from `src/App.tsx` during S-0. The overlay is always rendered
 * INSIDE the shell's main column (not at the document root) so its z-index
 * stack stays predictable relative to the right-docked panel.
 */

import React from 'react'
import { Search } from 'lucide-react'
import type { Conversation } from '../../types'

interface Props {
  open: boolean
  query: string
  hits: Conversation[]
  onQuery(q: string): void
  onClose(): void
  onPick(id: string): void
}

export const SearchOverlay: React.FC<Props> = ({ open, query, hits, onQuery, onClose, onPick }) => {
  if (!open) return null
  return (
    <div className="wsh-search-overlay" onClick={onClose}>
      <div className="wsh-search-box" onClick={(e) => e.stopPropagation()}>
        <Search size={14} style={{ color: 'var(--text-mute)' }} />
        <input
          autoFocus
          placeholder="Search conversations…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        />
        <div className="wsh-search-results">
          {hits.length === 0 && (
            <div style={{ padding: 16, color: 'var(--text-mute)', fontSize: 12 }}>
              No matches.
            </div>
          )}
          {hits.slice(0, 50).map((c) => (
            <button
              key={c.id}
              className="wsh-search-hit"
              onClick={() => onPick(c.id)}
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
  )
}

export function searchConversations(conversations: readonly Conversation[], q: string): Conversation[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...conversations]
  return conversations.filter((c) => {
    if (c.title.toLowerCase().includes(needle)) return true
    for (const m of c.messages) {
      for (const b of m.content) {
        const text = (b as { text?: unknown }).text
        if (text != null && String(text).toLowerCase().includes(needle)) return true
      }
    }
    return false
  })
}
