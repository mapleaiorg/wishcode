/**
 * LogsPanel — tail the in-process log ring buffer.
 *
 * Pulls the last N entries via `app.logs(limit)` then streams subsequent
 * entries via `app.onLog`. Filterable by level and scope; auto-scrolls
 * unless the user has scrolled up.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, ScrollText, Download, Pause, Play, X } from 'lucide-react'

interface LogEntry {
  ts: number
  level: string
  scope: string
  msg: string
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const
type Level = typeof LEVELS[number]

const LEVEL_COLOR: Record<string, string> = {
  debug: 'var(--text-mute)',
  info:  'var(--text-dim)',
  warn:  'var(--warn, #d28a2c)',
  error: 'var(--err, #c84242)',
}

export function LogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [minLevel, setMinLevel] = useState<Level>('info')
  const [scope, setScope] = useState<string>('all')
  const [paused, setPaused] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const tailRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef<boolean>(true)

  const refresh = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.app.logs(500)
      setEntries((list as LogEntry[]) ?? [])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const unsub = window.wish?.app.onLog((entry: LogEntry) => {
      if (paused) return
      setEntries((prev) => {
        const next = [...prev, entry]
        return next.length > 2000 ? next.slice(-2000) : next
      })
    })
    return () => { unsub?.() }
  }, [paused])

  const scopes = useMemo(() => {
    const s = new Set<string>()
    for (const e of entries) if (e.scope) s.add(e.scope)
    return ['all', ...Array.from(s).sort()]
  }, [entries])

  const levelRank = (l: string) => LEVELS.indexOf(l as Level)
  const minRank = levelRank(minLevel)

  const visible = useMemo(
    () => entries.filter((e) => {
      if (levelRank(e.level) < minRank) return false
      if (scope !== 'all' && e.scope !== scope) return false
      return true
    }),
    [entries, minRank, scope],
  )

  // Track whether the user is at the bottom so auto-scroll is non-intrusive.
  useEffect(() => {
    const el = tailRef.current
    if (!el || !stickRef.current) return
    el.scrollTop = el.scrollHeight
  }, [visible])

  const onScroll = () => {
    const el = tailRef.current
    if (!el) return
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16
    stickRef.current = bottom
  }

  const download = () => {
    const body = visible
      .map((e) => `${new Date(e.ts).toISOString()} [${e.level}] ${e.scope} — ${e.msg}`)
      .join('\n')
    const blob = new Blob([body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wishcode-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ScrollText size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Logs</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Refresh
          </button>
          <button className="wsh-btn" onClick={() => setPaused((v) => !v)}>
            {paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}
          </button>
          <button className="wsh-btn" onClick={() => setEntries([])} title="Clear the view">
            <X size={12} /> Clear
          </button>
          <button className="wsh-btn" onClick={download} title="Download visible entries">
            <Download size={12} /> Export
          </button>
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Level ≥</label>
        <select
          value={minLevel}
          onChange={(e) => setMinLevel(e.target.value as Level)}
          style={selectStyle}
        >
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={selectStyle}>
          {scopes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ color: 'var(--text-mute)', fontSize: 11, marginLeft: 'auto' }}>
          {visible.length} / {entries.length}
        </span>
      </div>

      <div
        ref={tailRef}
        onScroll={onScroll}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elev-1)',
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          fontSize: 11,
          lineHeight: 1.5,
          maxHeight: 420,
          overflow: 'auto',
          padding: 10,
        }}
      >
        {visible.length === 0 ? (
          <div style={{ color: 'var(--text-mute)' }}>No entries match the current filter.</div>
        ) : (
          visible.map((e, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <span style={{ color: 'var(--text-mute)' }}>
                {new Date(e.ts).toLocaleTimeString()}
              </span>{' '}
              <span style={{
                color: LEVEL_COLOR[e.level] ?? 'var(--text)',
                fontWeight: 600, textTransform: 'uppercase',
              }}>
                {e.level}
              </span>{' '}
              <span style={{ color: 'var(--brand)' }}>{e.scope}</span>{' '}
              <span style={{ color: 'var(--text)' }}>{e.msg}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 8px',
  fontSize: 12,
  color: 'var(--text)',
}
