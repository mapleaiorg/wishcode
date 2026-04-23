/**
 * DiffPanel — shows the working-tree diff against HEAD for the current
 * workspace. Quick-glance surface so the user can review the assistant's
 * edits without tab-switching to a separate git client.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { GitBranch, RefreshCw, AlertCircle } from 'lucide-react'

interface FileDiff {
  path: string
  added: number
  removed: number
  patch: string
}

export function DiffPanel() {
  const [files, setFiles] = useState<FileDiff[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res: any = await (window.wish as any)?.git?.diff?.({ base: 'HEAD' })
      const list: FileDiff[] = Array.isArray(res?.files) ? res.files : []
      setFiles(list)
      if (list[0]) setActive(list[0].path)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const activePatch = files.find((f) => f.path === active)?.patch ?? ''

  return (
    <div className="wsh-panel-diff">
      <div className="wsh-panel-sub">
        <div className="wsh-panel-sub-head">
          <span><GitBranch size={12} /> Changed files</span>
          <button className="wsh-icon-btn" onClick={() => void refresh()} title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>
        {err && (
          <div className="wsh-panel-err"><AlertCircle size={14} /> <span>{err}</span></div>
        )}
        {!loading && !err && files.length === 0 && (
          <div className="wsh-panel-empty">
            <GitBranch size={22} />
            <div className="wsh-panel-empty-title">Working tree clean</div>
            <div className="wsh-panel-empty-sub">
              No uncommitted changes. Ask the assistant to edit something,
              and the diff will show up here.
            </div>
          </div>
        )}
        <ul className="wsh-panel-list">
          {files.map((f) => (
            <li key={f.path}>
              <button
                className={`wsh-panel-row ${active === f.path ? 'active' : ''}`}
                onClick={() => setActive(f.path)}
                title={f.path}
              >
                <span className="wsh-panel-row-label">{f.path.split('/').slice(-1)[0]}</span>
                <code className="wsh-panel-row-path">{f.path}</code>
                <span className="wsh-diff-stat added">+{f.added}</span>
                <span className="wsh-diff-stat removed">−{f.removed}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="wsh-panel-content">
        {loading && <div className="wsh-panel-empty-sub">Loading…</div>}
        {!loading && active && (
          <pre className="wsh-panel-pre diff">
            {activePatch.split('\n').map((line, i) => {
              const cls = line.startsWith('+') && !line.startsWith('+++') ? 'added'
                        : line.startsWith('-') && !line.startsWith('---') ? 'removed'
                        : line.startsWith('@@') ? 'hunk'
                        : ''
              return <span key={i} className={`diff-line ${cls}`}>{line + '\n'}</span>
            })}
          </pre>
        )}
      </div>
    </div>
  )
}
