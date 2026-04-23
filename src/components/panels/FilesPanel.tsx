/**
 * FilesPanel — simple workspace file browser. Lists top-level entries,
 * drills into a directory on click, and surfaces a quick "open" action
 * that feeds the path back to the chat composer so the user can attach
 * it to their next message.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { FolderOpen, FileText, ArrowUp, RefreshCw, AlertCircle } from 'lucide-react'

interface Entry {
  name: string
  path: string
  isDir: boolean
  size?: number
}

export function FilesPanel() {
  const [cwd, setCwd] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (path?: string) => {
    setLoading(true); setErr(null)
    try {
      const res: any = await (window.wish as any)?.fs?.list?.({ path })
      const nextCwd = String(res?.cwd ?? path ?? '')
      const list: Entry[] = Array.isArray(res?.entries) ? res.entries : []
      setCwd(nextCwd)
      setEntries(list)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const parent = cwd ? cwd.replace(/\/[^/]+$/, '') || '/' : null

  return (
    <div className="wsh-panel-files">
      <div className="wsh-panel-sub-head sticky">
        <code className="wsh-panel-cwd" title={cwd ?? ''}>{cwd ?? '—'}</code>
        <div style={{ display: 'flex', gap: 4 }}>
          {parent && (
            <button className="wsh-icon-btn" title="Up one level" onClick={() => void load(parent)}>
              <ArrowUp size={12} />
            </button>
          )}
          <button className="wsh-icon-btn" title="Refresh" onClick={() => void load(cwd ?? undefined)}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>
      {err && <div className="wsh-panel-err"><AlertCircle size={14} /> <span>{err}</span></div>}
      {!loading && entries.length === 0 && !err && (
        <div className="wsh-panel-empty">
          <FolderOpen size={22} />
          <div className="wsh-panel-empty-title">Empty directory</div>
        </div>
      )}
      <ul className="wsh-panel-list">
        {entries.map((e) => (
          <li key={e.path}>
            <button
              className="wsh-panel-row"
              onClick={() => (e.isDir ? void load(e.path) : void window.wish?.app?.openExternal?.(`file://${e.path}`))}
              title={e.path}
            >
              {e.isDir ? <FolderOpen size={13} /> : <FileText size={13} />}
              <span className="wsh-panel-row-label">{e.name}</span>
              {!e.isDir && e.size !== undefined && (
                <span className="wsh-panel-row-meta">{fmtSize(e.size)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
