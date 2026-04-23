/**
 * HomeView — Wish Code dashboard.
 *
 * Sections:
 *   - Snapshot tiles (recent sessions, running tasks, skills, memories)
 *   - Recent sessions list
 *   - Active tasks
 *   - Quick-ask card
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  MessageSquare, ListChecks, Wrench, Sparkles,
  Play, CheckCircle2, AlertTriangle, Timer,
} from 'lucide-react'
import type { TaskView, SkillInfo, MemoryEntry } from '../../types'

function fmtTimeAgo(ms: number | undefined): string {
  if (!ms) return '—'
  const delta = Math.max(0, Date.now() - ms)
  const mins = Math.floor(delta / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function HomeView() {
  const [tasks,     setTasks]     = useState<TaskView[]>([])
  const [skills,    setSkills]    = useState<SkillInfo[]>([])
  const [memories,  setMemories]  = useState<MemoryEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [err,       setErr]       = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const [t, s, m] = await Promise.all([
        window.wish.tasks.list().catch(() => [] as TaskView[]),
        window.wish.skills.list().catch(() => [] as SkillInfo[]),
        window.wish.memory.list().catch(() => [] as MemoryEntry[]),
      ])
      setTasks(t ?? [])
      setSkills(s ?? [])
      setMemories(m ?? [])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.wish.tasks.onChanged?.(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued')
  const done    = tasks.filter((t) => t.status === 'done')
  const failed  = tasks.filter((t) => t.status === 'failed')
  const latestTask = [...tasks].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]

  return (
    <div className="wsh-panel">
      <header className="wsh-panel-head">
        <h2>Home</h2>
        <div className="wsh-panel-head-actions">
          <span className="wsh-pill wsh-pill-subtle">
            <Sparkles size={11} /> Wish Code Agent
          </span>
        </div>
      </header>

      {err && <div className="wsh-error-banner">{err}</div>}

      <section className="wsh-grid wsh-grid-4">
        <div className="wsh-card wsh-stat">
          <div className="wsh-stat-label"><Play size={12} /> Running tasks</div>
          <div className="wsh-stat-value">{running.length}</div>
          <div className="wsh-stat-sub">
            {done.length} done · {failed.length} failed
          </div>
        </div>
        <div className="wsh-card wsh-stat">
          <div className="wsh-stat-label"><Wrench size={12} /> Skills</div>
          <div className="wsh-stat-value">{skills.length}</div>
          <div className="wsh-stat-sub">
            {skills.filter((s) => s.source === 'user').length} user · {skills.filter((s) => s.source === 'builtin').length} builtin
          </div>
        </div>
        <div className="wsh-card wsh-stat">
          <div className="wsh-stat-label"><ListChecks size={12} /> Memories</div>
          <div className="wsh-stat-value">{memories.length}</div>
          <div className="wsh-stat-sub">
            {memories.filter((m) => m.pinned).length} pinned
          </div>
        </div>
        <div className="wsh-card wsh-stat">
          <div className="wsh-stat-label"><Timer size={12} /> Latest task</div>
          <div className="wsh-stat-value wsh-stat-value-sm">
            {latestTask ? latestTask.title.slice(0, 32) : '—'}
          </div>
          <div className="wsh-stat-sub">
            {latestTask ? fmtTimeAgo(latestTask.createdAt) : 'no tasks yet'}
          </div>
        </div>
      </section>

      <section className="wsh-grid wsh-grid-2" style={{ marginTop: 16 }}>
        <div className="wsh-card">
          <h3 className="wsh-card-title"><Play size={13} /> Active tasks</h3>
          {loading && <div className="wsh-muted">Loading…</div>}
          {!loading && running.length === 0 && (
            <div className="wsh-muted">No tasks running. Ask the agent something in Chat to kick one off.</div>
          )}
          {!loading && running.length > 0 && (
            <ul className="wsh-activity">
              {running.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <span className={`wsh-dir wsh-dir-${t.status === 'running' ? 'out' : 'in'}`}>
                    {t.status === 'running' ? <Play size={12} /> : <Timer size={12} />}
                    {t.status}
                  </span>
                  <span className="wsh-activity-amt">{t.title}</span>
                  <span className="wsh-muted wsh-activity-time">{fmtTimeAgo(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="wsh-card">
          <h3 className="wsh-card-title"><CheckCircle2 size={13} /> Recently finished</h3>
          {loading && <div className="wsh-muted">Loading…</div>}
          {!loading && done.length === 0 && failed.length === 0 && (
            <div className="wsh-muted">No completed tasks yet.</div>
          )}
          {!loading && (done.length > 0 || failed.length > 0) && (
            <ul className="wsh-activity">
              {[...done, ...failed]
                .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
                .slice(0, 6)
                .map((t) => (
                  <li key={t.id}>
                    <span className={`wsh-dir wsh-dir-${t.status === 'done' ? 'in' : 'out'}`}>
                      {t.status === 'done' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                      {t.status}
                    </span>
                    <span className="wsh-activity-amt">{t.title}</span>
                    <span className="wsh-muted wsh-activity-time">{fmtTimeAgo(t.finishedAt ?? t.createdAt)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <section className="wsh-card wsh-summary-card" style={{ marginTop: 16 }}>
        <h3 className="wsh-card-title"><MessageSquare size={13} /> Get started</h3>
        <p>
          Open <strong>Chat</strong> and describe what you want to build or debug. Wish Code can read files,
          edit code, run shell commands, search the web, and spin up sub-agents. Type <code>/help</code>{' '}
          to see all available slash commands.
        </p>
      </section>
    </div>
  )
}
