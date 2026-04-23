/**
 * CronPanel — list, create, edit, delete scheduled prompts.
 *
 * A cron entry fires a session named `cron:<id>` — the scheduler does one
 * full agent turn with the entry's prompt text at each tick. Users manage
 * entries from this panel; the underlying state lives in
 * `~/.wishcode/cron.json` via `window.wish.cron.*`.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, Plus, Trash2, Play, Edit3, X, Check, Pause, PlayCircle, CalendarClock,
} from 'lucide-react'

interface CronEntry {
  id: string
  name: string
  expression: string
  prompt: string
  disabled?: boolean
  lastRunAt?: number
  lastRunTaskId?: string
  runCount?: number
  createdAt: number
}

type Draft = { name: string; expression: string; prompt: string }

const EMPTY: Draft = { name: '', expression: '@hourly', prompt: '' }

const PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Every hour',  value: '@hourly' },
  { label: 'Every day',   value: '@daily' },
  { label: 'Every week',  value: '@weekly' },
  { label: 'Every month', value: '@monthly' },
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Workdays 9am',value: '0 9 * * 1-5' },
]

export function CronPanel() {
  const [entries, setEntries] = useState<CronEntry[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)

  const refresh = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.cron.list()
      setEntries(list as CronEntry[])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const beginCreate = () => { setCreating(true); setEditingId(null); setDraft(EMPTY) }
  const beginEdit   = (e: CronEntry) => {
    setCreating(false); setEditingId(e.id)
    setDraft({ name: e.name, expression: e.expression, prompt: e.prompt })
  }
  const cancel      = () => { setCreating(false); setEditingId(null); setDraft(EMPTY) }

  const save = useCallback(async () => {
    const name = draft.name.trim()
    const expression = draft.expression.trim()
    const prompt = draft.prompt.trim()
    if (!name || !expression || !prompt) {
      setErr('Name, expression, and prompt are required.'); return
    }
    setErr(null)
    try {
      if (editingId) {
        await window.wish.cron.update(editingId, { name, expression, prompt })
      } else {
        await window.wish.cron.create({ name, expression, prompt })
      }
      cancel()
      await refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [draft, editingId, refresh])

  const remove = useCallback(async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    try { await window.wish.cron.delete(id); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const runNow = useCallback(async (id: string) => {
    try { await window.wish.cron.runNow(id); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const toggle = useCallback(async (e: CronEntry) => {
    try {
      await window.wish.cron.update(e.id, { disabled: !e.disabled })
      await refresh()
    } catch (err: any) { setErr(err?.message ?? String(err)) }
  }, [refresh])

  const isEditing = creating || editingId !== null

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <CalendarClock size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Schedules</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Refresh
          </button>
          {!isEditing && (
            <button className="wsh-btn primary" onClick={beginCreate}>
              <Plus size={12} /> New schedule
            </button>
          )}
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 10px 0' }}>
        5-field cron (min hour dom month dow) or aliases like <code>@hourly</code>, <code>@daily</code>.
      </p>

      {isEditing && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 12,
          marginBottom: 12,
          background: 'var(--surface)',
        }}>
          <label>Name</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Morning digest"
          />

          <label>Cron expression</label>
          <input
            type="text"
            value={draft.expression}
            onChange={(e) => setDraft((d) => ({ ...d, expression: e.target.value }))}
            style={{ fontFamily: 'ui-monospace, monospace' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.value}
                className="wsh-btn"
                style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setDraft((d) => ({ ...d, expression: p.value }))}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>

          <label style={{ marginTop: 10 }}>Prompt</label>
          <textarea
            rows={4}
            value={draft.prompt}
            onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            placeholder="Summarize yesterday's commits and list TODOs."
            style={{ fontFamily: 'ui-monospace, monospace', resize: 'vertical' }}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="wsh-btn" onClick={cancel}>
              <X size={12} /> Cancel
            </button>
            <button className="wsh-btn primary" onClick={() => void save()}>
              <Check size={12} /> {editingId ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && !loading && !isEditing && (
        <div className="wsh-helper info" style={{ fontSize: 12 }}>
          No schedules yet. Create one to have the agent run automatically.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((e) => (
          <div
            key={e.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              background: 'var(--surface)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{
                  color: e.disabled ? 'var(--text-mute)' : 'var(--text)',
                  textDecoration: e.disabled ? 'line-through' : 'none',
                }}>
                  {e.name}
                </strong>
                <code style={{ fontSize: 11, color: 'var(--text-mute)' }}>{e.expression}</code>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
                {e.runCount != null && <>{e.runCount} run{e.runCount === 1 ? '' : 's'}</>}
                {e.lastRunAt && <> · last {new Date(e.lastRunAt).toLocaleString()}</>}
              </div>
              <div style={{
                fontSize: 12, marginTop: 4, color: 'var(--text-dim)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {e.prompt}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="wsh-btn" onClick={() => void runNow(e.id)} title="Run now">
                <Play size={12} />
              </button>
              <button className="wsh-btn" onClick={() => void toggle(e)} title={e.disabled ? 'Enable' : 'Pause'}>
                {e.disabled ? <PlayCircle size={12} /> : <Pause size={12} />}
              </button>
              <button className="wsh-btn" onClick={() => beginEdit(e)} title="Edit">
                <Edit3 size={12} />
              </button>
              <button className="wsh-btn" onClick={() => void remove(e.id)} title="Delete">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
