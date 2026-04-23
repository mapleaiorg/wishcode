/**
 * PanelsMenu — topbar dropdown that opens side-panel workspaces.
 *
 * Matches the Claude-Code-style "panels" affordance: click the panel icon
 * in the top-right, get a menu of Preview / Diff / Terminal / Files /
 * Tasks / Plan. Each menu item toggles a named panel that the parent
 * renders as an overlay on the main column.
 *
 * This component is the launcher only — the actual panel bodies live in
 * `components/panels/*` and the parent App owns the active-panel state
 * + renders the overlay. We pass the mac-style shortcut hint next to
 * each item for parity with the user's reference screenshot.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  PanelRightOpen,
  ChevronDown,
  Play,
  GitCompare,
  TerminalSquare,
  Folder,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'

export type PanelKey = 'preview' | 'diff' | 'terminal' | 'files' | 'tasks' | 'plan'

interface PanelSpec {
  key: PanelKey
  label: string
  Icon: LucideIcon
  shortcut?: string
}

const PANELS: PanelSpec[] = [
  { key: 'preview',  label: 'Preview',  Icon: Play,            shortcut: '⇧⌘P' },
  { key: 'diff',     label: 'Diff',     Icon: GitCompare,      shortcut: '⇧⌘D' },
  { key: 'terminal', label: 'Terminal', Icon: TerminalSquare,  shortcut: '⌃`'  },
  { key: 'files',    label: 'Files',    Icon: Folder,          shortcut: '⇧⌘F' },
  { key: 'tasks',    label: 'Tasks',    Icon: LayoutGrid                       },
  { key: 'plan',     label: 'Plan',     Icon: ListChecks                       },
]

interface Props {
  active: PanelKey | null
  onOpen(panel: PanelKey): void
}

export function PanelsMenu({ active, onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Global keyboard shortcuts — mirror the menu's hints so power users
  // don't have to open the dropdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const ctrl = e.ctrlKey
      // ⇧⌘P — Preview
      if (meta && shift && e.key.toLowerCase() === 'p') { e.preventDefault(); onOpen('preview'); return }
      // ⇧⌘D — Diff
      if (meta && shift && e.key.toLowerCase() === 'd') { e.preventDefault(); onOpen('diff'); return }
      // ⇧⌘F — Files
      if (meta && shift && e.key.toLowerCase() === 'f') { e.preventDefault(); onOpen('files'); return }
      // ⌃` — Terminal (backtick, ctrl without meta on both macOS and Linux)
      if (ctrl && !e.metaKey && e.key === '`') { e.preventDefault(); onOpen('terminal'); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpen])

  return (
    <div className="wsh-panels-menu" ref={rootRef}>
      <button
        type="button"
        className={`wsh-btn wsh-panels-trigger ${active ? 'is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Open panel"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PanelRightOpen size={13} />
        <ChevronDown size={11} style={{ marginLeft: 2, opacity: 0.7 }} />
      </button>

      {open && (
        <div className="wsh-panels-pop" role="menu">
          {PANELS.map(({ key, label, Icon, shortcut }) => (
            <button
              key={key}
              className={`wsh-panels-item ${active === key ? 'active' : ''}`}
              onClick={() => { onOpen(key); setOpen(false) }}
              role="menuitem"
            >
              <Icon size={14} />
              <span className="wsh-panels-label">{label}</span>
              {shortcut && <span className="wsh-panels-shortcut">{shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
