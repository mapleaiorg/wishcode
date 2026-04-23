/**
 * HistoryView — session/conversation history.
 *
 * Phase 0 stub: tracks session IDs in localStorage as they are used in
 * Chat, and loads each session's transcript on demand via
 * `window.wish.session.read`.
 *
 * Phase 2+3 will replace this with a proper session index backed by
 * ~/.wishcode/sessions/.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { History as HistoryIcon, Download, Trash2, Filter } from 'lucide-react'

const SESSION_INDEX_KEY = 'wsh.sessions.index'

interface SessionIndexEntry {
  id: string
  title: string
  createdAt: number
  updatedAt?: number
  messageCount?: number
}

function readIndex(): SessionIndexEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeIndex(list: SessionIndexEntry[]): void {
  try { localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(list)) } catch {}
}

function fmtTs(ms?: number): string {
  if (!ms) return '—'
  try {
    const d = new Date(ms)
    return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`
  } catch { return '—' }
}

function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function HistoryView() {
  const [sessions, setSessions] = useState<SessionIndexEntry[]>([])
  const [query,    setQuery]    = useState('')
  const [busy,     setBusy]     = useState<string | null>(null)
  const [err,      setErr]      = useState<string | null>(null)

  const refresh = useCallback(() => { setSessions(readIndex()) }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(
    () => sessions.filter((s) =>
      !query || s.title.toLowerCase().includes(query.toLowerCase()) || s.id.includes(query),
    ),
    [sessions, query],
  )

  const exportSession = useCallback(async (s: SessionIndexEntry, fmt: 'markdown' | 'json') => {
    setBusy(s.id); setErr(null)
    try {
      const path = await window.wish.session.export(s.id, fmt)
      const ext = fmt === 'markdown' ? 'md' : 'json'
      // The native export writes to disk; for renderer convenience, also
      // download a copy by re-reading via session.read.
      const events = await window.wish.session.read(s.id)
      const text = fmt === 'json'
        ? JSON.stringify(events, null, 2)
        : events.map((e: any) => `### ${e.role ?? e.kind}\n${JSON.stringify(e.content ?? e.summary ?? '', null, 2)}`).join('\n\n')
      downloadText(`${s.id}.${ext}`, text, fmt === 'json' ? 'application/json' : 'text/markdown')
      void path // unused in renderer; just avoid lint
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally { setBusy(null) }
  }, [])

  const clearSession = useCallback(async (id: string) => {
    setBusy(id); setErr(null)
    try {
      await window.wish.session.clear(id)
      const next = readIndex().filter((s) => s.id !== id)
      writeIndex(next)
      setSessions(next)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally { setBusy(null) }
  }, [])

  return (
    <div className="wsh-panel">
      <header className="wsh-panel-head">
        <h2>History</h2>
        <div className="wsh-panel-head-actions">
          <button className="wsh-btn" onClick={refresh}>
            <HistoryIcon size={12} /> Refresh
          </button>
        </div>
      </header>

      <section className="wsh-filter-row">
        <label className="wsh-filter">
          <Filter size={12} />
          <span>Search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or id…"
          />
        </label>
        <span className="wsh-muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {sessions.length} sessions
        </span>
      </section>

      {err && <div className="wsh-error-banner">{err}</div>}
      {sessions.length === 0 && (
        <div className="wsh-muted">No sessions yet. Start a conversation in Chat to populate history.</div>
      )}
      {sessions.length > 0 && filtered.length === 0 && (
        <div className="wsh-muted">No sessions match the current filter.</div>
      )}

      {filtered.length > 0 && (
        <table className="wsh-table wsh-table-history">
          <thead>
            <tr>
              <th>Created</th>
              <th>Title</th>
              <th>Session ID</th>
              <th>Messages</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="wsh-muted">{fmtTs(s.createdAt)}</td>
                <td><strong>{s.title || '(untitled)'}</strong></td>
                <td><code className="wsh-addr">{s.id.slice(0, 18)}…</code></td>
                <td>{s.messageCount ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="wsh-btn wsh-btn-sm"
                    disabled={busy === s.id}
                    onClick={() => void exportSession(s, 'markdown')}
                    title="Export as Markdown"
                  >
                    <Download size={11} /> md
                  </button>
                  <button
                    className="wsh-btn wsh-btn-sm"
                    disabled={busy === s.id}
                    onClick={() => void exportSession(s, 'json')}
                    title="Export as JSON"
                  >
                    <Download size={11} /> json
                  </button>
                  <button
                    className="wsh-icon-btn"
                    disabled={busy === s.id}
                    onClick={() => void clearSession(s.id)}
                    title="Clear session"
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function recordSession(entry: SessionIndexEntry): void {
  const cur = readIndex()
  const idx = cur.findIndex((s) => s.id === entry.id)
  const next = idx >= 0
    ? cur.map((s, i) => i === idx ? { ...s, ...entry, updatedAt: Date.now() } : s)
    : [entry, ...cur].slice(0, 200)
  writeIndex(next)
}
