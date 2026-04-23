/**
 * WorkspacePicker — show + change the agent's workspace root.
 *
 * Workspace root gates FS tools (read/write/edit/glob/grep/bash cwd) and
 * hook cwd. Without a native OS "open directory" dialog wired to the
 * preload we accept a manual path entry for now — the main process
 * canonicalizes and validates it.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

export function WorkspacePicker() {
  const [current, setCurrent] = useState<string>('')
  const [draft, setDraft] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setErr(null); setNotice(null)
    try {
      const dir = await window.wish.workspace.get()
      setCurrent(dir)
      setDraft(dir)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async () => {
    const next = draft.trim()
    if (!next) { setErr('Workspace path required.'); return }
    if (next === current) return
    setErr(null); setNotice(null); setLoading(true)
    try {
      const resolved = await window.wish.workspace.set(next)
      setCurrent(resolved); setDraft(resolved)
      setNotice('Workspace updated.')
      setTimeout(() => setNotice(null), 1800)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [draft, current])

  const dirty = draft.trim() !== current

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FolderOpen size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Workspace</h3>
        <span style={{ marginLeft: 'auto' }}>
          <button className="wsh-btn" onClick={() => void refresh()}>
            <RefreshCw size={12} /> Refresh
          </button>
        </span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 8px 0' }}>
        The agent's filesystem tools and shell commands run relative to this directory.
        Paths outside the workspace are rejected.
      </p>

      <label>Workspace root</label>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
        placeholder="/Users/you/projects/my-repo"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          fontSize: 12,
          color: 'var(--text)',
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <button className="wsh-btn primary" disabled={!dirty || loading} onClick={() => void save()}>
          <Save size={12} /> {loading ? 'Saving…' : 'Save'}
        </button>
        {current && (
          <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
            Current: <code>{current}</code>
          </span>
        )}
      </div>

      {err && (
        <div className="wsh-helper warn" style={{ marginTop: 8 }}>
          <AlertCircle size={12} /> {err}
        </div>
      )}
      {notice && (
        <div className="wsh-helper info" style={{ marginTop: 8 }}>
          <CheckCircle2 size={12} /> {notice}
        </div>
      )}
    </section>
  )
}
