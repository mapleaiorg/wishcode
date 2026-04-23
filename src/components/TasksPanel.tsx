/**
 * TasksPanel — monitor background sub-agent / long-running tasks.
 *
 * Sub-agent tasks are spawned by the `task_create` tool. Each has its own
 * streamChat session; this panel shows live status, progress, and (for
 * completed tasks) truncated output. Users can cancel running tasks or
 * clear finished ones.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, Trash2, Square, ListChecks, Play, CheckCircle2,
  AlertTriangle, Timer, ChevronDown, ChevronRight, Eraser,
} from 'lucide-react'
import type { TaskView } from '../types'

type StatusFilter = 'all' | 'running' | 'done' | 'failed'

export function TasksPanel() {
  const [tasks, setTasks] = useState<TaskView[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.tasks.list()
      setTasks(list as TaskView[])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const u1 = window.wish?.tasks.onUpdate((p: any) => {
      if (!p || !p.task || !p.id) return      // ignore todo payloads
      const incoming = p.task as TaskView
      setTasks((prev) => {
        const i = prev.findIndex((t) => t.id === incoming.id)
        if (i < 0) return [incoming, ...prev]
        const next = [...prev]; next[i] = incoming; return next
      })
    })
    const u2 = window.wish?.tasks.onChanged(() => { void refresh() })
    return () => { u1?.(); u2?.() }
  }, [refresh])

  const cancel = useCallback(async (id: string) => {
    try { await window.wish.tasks.cancel(id); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    try { await window.wish.tasks.remove(id); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const clearCompleted = useCallback(async () => {
    try { await window.wish.tasks.clearCompleted(); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const statusOf = (t: TaskView): StatusFilter =>
    t.status === 'running' || t.status === 'queued' ? 'running'
    : t.status === 'done' ? 'done'
    : 'failed' // 'failed' | 'cancelled'

  const visible = tasks.filter((t) => filter === 'all' || statusOf(t) === filter)

  const running = tasks.filter((t) => statusOf(t) === 'running').length
  const completed = tasks.filter((t) => statusOf(t) !== 'running').length

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ListChecks size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Background tasks</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Refresh
          </button>
          <button
            className="wsh-btn"
            onClick={() => void clearCompleted()}
            disabled={completed === 0}
            title="Remove done/failed/cancelled tasks"
          >
            <Eraser size={12} /> Clear finished
          </button>
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      <div style={{
        display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {(['all', 'running', 'done', 'failed'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            className={`wsh-btn ${filter === f ? 'primary' : ''}`}
            style={{ fontSize: 11, padding: '4px 9px' }}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <span style={{ color: 'var(--text-mute)', fontSize: 11, marginLeft: 'auto' }}>
          {running} running · {tasks.length} total
        </span>
      </div>

      {visible.length === 0 && (
        <div className="wsh-helper info" style={{ fontSize: 12 }}>
          No tasks to show.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((t) => {
          const isOpen = !!open[t.id]
          const isRunning = statusOf(t) === 'running'
          return (
            <div
              key={t.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
              }}
            >
              <button
                onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: 0, background: 'transparent',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <StatusIcon status={t.status} />
                <strong style={{ fontSize: 12 }}>{t.title}</strong>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                  {typeof t.progress === 'number' && (
                    <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                      {Math.round(t.progress * 100)}%
                    </span>
                  )}
                  <StatusBadge status={t.status} />
                  {isRunning ? (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); void cancel(t.id) }}
                      className="wsh-btn"
                      style={{ padding: '3px 7px', fontSize: 11 }}
                      title="Cancel task"
                    >
                      <Square size={10} /> Stop
                    </span>
                  ) : (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); void remove(t.id) }}
                      className="wsh-btn"
                      style={{ padding: '3px 7px', fontSize: 11 }}
                      title="Remove task"
                    >
                      <Trash2 size={10} />
                    </span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 12px 12px 12px', fontSize: 12 }}>
                  <div style={{ color: 'var(--text-mute)', fontSize: 11, marginBottom: 6 }}>
                    id: <code>{t.id}</code>
                    <> · created {new Date(t.createdAt).toLocaleString()}</>
                    {t.startedAt && <> · started {new Date(t.startedAt).toLocaleString()}</>}
                    {t.finishedAt && <> · finished {new Date(t.finishedAt).toLocaleString()}</>}
                  </div>
                  {t.error && (
                    <div className="wsh-helper warn">{t.error}</div>
                  )}
                  {t.output && (
                    <pre style={{
                      margin: 0, padding: 10,
                      background: 'var(--bg-elev-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      maxHeight: 300, overflow: 'auto',
                    }}>
                      {t.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StatusIcon({ status }: { status: TaskView['status'] }) {
  if (status === 'running') return <Play size={12} style={{ color: 'var(--brand)' }} />
  if (status === 'queued')  return <Timer size={12} style={{ color: 'var(--warn, #d28a2c)' }} />
  if (status === 'done')    return <CheckCircle2 size={12} style={{ color: 'var(--ok, #4caf50)' }} />
  return <AlertTriangle size={12} style={{ color: 'var(--err, #c84242)' }} />
}

function StatusBadge({ status }: { status: TaskView['status'] }) {
  const color =
    status === 'running' ? 'var(--brand)' :
    status === 'queued'  ? 'var(--warn, #d28a2c)' :
    status === 'done'    ? 'var(--ok, #4caf50)' :
                           'var(--err, #c84242)'
  return (
    <span style={{
      fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase',
      color, border: `1px solid ${color}`, padding: '1px 6px', borderRadius: 8,
    }}>
      {status}
    </span>
  )
}
