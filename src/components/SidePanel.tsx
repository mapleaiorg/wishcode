/**
 * SidePanel — docked overlay that hosts the Preview / Diff / Terminal /
 * Files / Tasks / Plan panels when opened from the topbar PanelsMenu.
 *
 * Rendering model: a sibling of the main chat column that slides in from
 * the right. The user can resize via the left edge, close with the X,
 * or swap between panels via the PanelsMenu without closing first.
 *
 * Content is deliberately stubbed at this stage — the wiring (open,
 * close, resize, keyboard shortcuts, keeping panel state while the user
 * jumps around) matters more than the richness of any one panel, which
 * will be filled in as each panel's feature is ported from cc-full.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { PanelKey } from './PanelsMenu'
import { PreviewPanel } from './panels/PreviewPanel'
import { DiffPanel } from './panels/DiffPanel'
import { TerminalPanel } from './panels/TerminalPanel'
import { FilesPanel } from './panels/FilesPanel'
import { TasksPanel } from './panels/TasksPanel'
import { PlanPanel } from './panels/PlanPanel'

const TITLES: Record<PanelKey, string> = {
  preview:  'Preview',
  diff:     'Diff',
  terminal: 'Terminal',
  files:    'Files',
  tasks:    'Tasks',
  plan:     'Plan',
}

const STORAGE_KEY = 'wsh.panelWidth'
const MIN_W = 320
const MAX_W = 960

interface Props {
  panel: PanelKey
  onClose(): void
}

export function SidePanel({ panel, onClose }: Props) {
  const [w, setW] = useState<number>(() => {
    const raw = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(raw) && raw >= MIN_W ? Math.min(raw, MAX_W) : 520
  })
  const draggingRef = useRef(false)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(w)) }, [w])

  const onResizerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const startX = e.clientX
    const startW = w
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      // Drag LEFT edge of a right-docked panel → width grows.
      const next = startW + (startX - ev.clientX)
      setW(Math.max(MIN_W, Math.min(MAX_W, next)))
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
  }, [w])

  return (
    <aside className="wsh-sidepanel" style={{ width: w }} role="complementary" aria-label={TITLES[panel]}>
      <div className="wsh-sidepanel-resizer" onMouseDown={onResizerDown} />
      <header className="wsh-sidepanel-head">
        <div className="wsh-sidepanel-title">{TITLES[panel]}</div>
        <button className="wsh-icon-btn" title="Close panel (Esc)" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </header>
      <div className="wsh-sidepanel-body">
        {panel === 'preview'  && <PreviewPanel />}
        {panel === 'diff'     && <DiffPanel />}
        {panel === 'terminal' && <TerminalPanel />}
        {panel === 'files'    && <FilesPanel />}
        {panel === 'tasks'    && <TasksPanel />}
        {panel === 'plan'     && <PlanPanel />}
      </div>
    </aside>
  )
}
