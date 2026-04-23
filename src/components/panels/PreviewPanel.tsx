/**
 * PreviewPanel — renders a preview of a file the assistant generated
 * (markdown, code, pdf, image). Picks a renderer based on the file's
 * extension and falls back to a pretty "pick a file" empty state.
 *
 * First iteration: read files directly via fs_read through the backend
 * tool router. Future work: stream from the chat transcript's
 * tool_result blocks so preview always mirrors what the agent just
 * produced, without the user hunting for the path.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileCode, FileText, RefreshCw, FolderOpen, AlertCircle } from 'lucide-react'

interface RecentFile {
  path: string
  label: string
  kind: 'md' | 'code' | 'pdf' | 'img' | 'text'
  ts: number
}

function extKind(path: string): RecentFile['kind'] {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'md' || ext === 'mdx') return 'md'
  if (ext === 'pdf') return 'pdf'
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'img'
  if (['js','jsx','ts','tsx','py','rs','go','java','c','cpp','h','hpp','cs','rb','php','swift','kt','scala','lua','sh','bash','zsh','sql','json','yaml','yml','toml','css','scss','html','xml'].includes(ext)) return 'code'
  return 'text'
}

export function PreviewPanel() {
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [body, setBody] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // Collect every file the assistant touched this session via fs_write /
    // fs_edit tool results. The backend bubbles these up through the
    // transcript; we simply ask the fs layer for the most recently
    // modified files in the workspace as a first pass.
    try {
      const res: any = await (window.wish as any)?.fs?.recentTouched?.({ limit: 25 })
      const list = Array.isArray(res) ? res : []
      const mapped: RecentFile[] = list.map((r: any) => ({
        path: String(r.path),
        label: String(r.path).split('/').slice(-1)[0] || String(r.path),
        kind: extKind(String(r.path)),
        ts: Number(r.mtime ?? Date.now()),
      }))
      setRecent(mapped)
      if (!active && mapped[0]) setActive(mapped[0].path)
    } catch {
      // fs_recent isn't wired yet — show the friendly empty state.
      setRecent([])
    }
  }, [active])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!active) { setBody(''); return }
    setLoading(true); setErr(null)
    void (async () => {
      try {
        const res: any = await (window.wish as any)?.fs?.read?.({ path: active, limit: 2000 })
        setBody(typeof res === 'string' ? res : String(res?.content ?? JSON.stringify(res, null, 2)))
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [active])

  const activeKind = useMemo(() => active ? extKind(active) : null, [active])

  return (
    <div className="wsh-panel-preview">
      <div className="wsh-panel-sub">
        <div className="wsh-panel-sub-head">
          <span>Recent files</span>
          <button className="wsh-icon-btn" onClick={() => void refresh()} title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>
        {recent.length === 0 && (
          <div className="wsh-panel-empty">
            <FolderOpen size={22} />
            <div className="wsh-panel-empty-title">Nothing to preview yet</div>
            <div className="wsh-panel-empty-sub">
              Files the assistant creates or edits appear here. Ask it to
              write a <code>.md</code>, <code>.pdf</code>, or any code file
              and it will show up in this list.
            </div>
          </div>
        )}
        <ul className="wsh-panel-list">
          {recent.map((r) => (
            <li key={r.path}>
              <button
                className={`wsh-panel-row ${active === r.path ? 'active' : ''}`}
                onClick={() => setActive(r.path)}
                title={r.path}
              >
                {r.kind === 'code' ? <FileCode size={13} /> : <FileText size={13} />}
                <span className="wsh-panel-row-label">{r.label}</span>
                <code className="wsh-panel-row-path">{r.path}</code>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="wsh-panel-content">
        {loading && <div className="wsh-panel-empty-sub">Loading…</div>}
        {err && (
          <div className="wsh-panel-err">
            <AlertCircle size={14} /> <span>{err}</span>
          </div>
        )}
        {!loading && !err && active && (
          <>
            {activeKind === 'md' && (
              <pre className="wsh-panel-pre md">{body}</pre>
            )}
            {activeKind === 'code' && (
              <pre className="wsh-panel-pre code">{body}</pre>
            )}
            {activeKind === 'img' && (
              <div className="wsh-panel-img-wrap">
                <img src={`file://${active}`} alt={active} />
              </div>
            )}
            {activeKind === 'pdf' && (
              <div className="wsh-panel-empty-sub">
                PDF preview opens in a new window — click{' '}
                <button
                  className="wsh-btn"
                  onClick={() => window.wish?.app?.openExternal?.(`file://${active}`)}
                >
                  Open {active.split('/').slice(-1)[0]}
                </button>
              </div>
            )}
            {(activeKind === 'text' || !activeKind) && (
              <pre className="wsh-panel-pre">{body}</pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}
