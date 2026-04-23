/**
 * MemoryPanel — add / list / pin / delete agent memories.
 *
 * Memories are free-form text entries the agent can recall via the
 * `memory_recall` tool. Tags narrow recall; pinning keeps a memory
 * present on every turn. State lives in `~/.wishcode/memory.json`
 * with lightweight TF-IDF scoring on recall.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, Plus, Trash2, Pin, PinOff, Search, X, Check, Brain, Tag,
} from 'lucide-react'
import type { MemoryEntry } from '../types'

export function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [pin, setPin] = useState(false)

  const refresh = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.memory.list()
      setMemories(list as MemoryEntry[])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Live reload when the backend signals change (e.g. from recall via tool).
  useEffect(() => {
    const unsub = window.wish?.memory.onChanged(() => { void refresh() })
    return () => { unsub?.() }
  }, [refresh])

  const add = useCallback(async () => {
    const b = body.trim()
    if (!b) { setErr('Memory body required.'); return }
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean)
    try {
      await window.wish.memory.add(b, {
        tags: tagList.length > 0 ? tagList : undefined,
        pinned: pin,
      })
      setBody(''); setTags(''); setPin(false); setCreating(false)
      await refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [body, tags, pin, refresh])

  const remove = useCallback(async (id: string) => {
    if (!confirm('Delete this memory?')) return
    try { await window.wish.memory.remove(id); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const togglePin = useCallback(async (m: MemoryEntry) => {
    try {
      await window.wish.memory.update(m.id, { pinned: !m.pinned })
      await refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return memories
    return memories.filter((m) => {
      if (m.body.toLowerCase().includes(needle)) return true
      return m.tags?.some((t) => t.toLowerCase().includes(needle))
    })
  }, [memories, q])

  const pinned = visible.filter((m) => m.pinned)
  const rest = visible.filter((m) => !m.pinned)

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Brain size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Memory</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Refresh
          </button>
          {!creating && (
            <button className="wsh-btn primary" onClick={() => setCreating(true)}>
              <Plus size={12} /> New memory
            </button>
          )}
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        marginBottom: 10, flexWrap: 'wrap',
      }}>
        <div style={{
          flex: '1 1 220px',
          display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: '6px 10px', background: 'var(--surface)',
        }}>
          <Search size={12} style={{ color: 'var(--text-mute)' }} />
          <input
            placeholder="Filter memories (body or tag)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1, border: 0, outline: 'none', background: 'transparent',
              fontSize: 12, color: 'var(--text)',
            }}
          />
        </div>
        <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
          {visible.length} of {memories.length}
        </span>
      </div>

      {creating && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 12, marginBottom: 12,
          background: 'var(--surface)',
        }}>
          <label>Memory</label>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="The deploy script is `bin/deploy`, runs migrations, then health-checks /_up."
            style={{ resize: 'vertical' }}
          />
          <label>Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="deploy, ops"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
            <span>Pin (include on every turn)</span>
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="wsh-btn" onClick={() => { setCreating(false); setErr(null) }}>
              <X size={12} /> Cancel
            </button>
            <button className="wsh-btn primary" onClick={() => void add()}>
              <Check size={12} /> Add
            </button>
          </div>
        </div>
      )}

      {pinned.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', margin: '6px 0', letterSpacing: 0.4 }}>
            PINNED · {pinned.length}
          </div>
          <MemoryList memories={pinned} onPinToggle={togglePin} onRemove={remove} />
        </>
      )}
      {rest.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', margin: '12px 0 6px 0', letterSpacing: 0.4 }}>
            ALL · {rest.length}
          </div>
          <MemoryList memories={rest} onPinToggle={togglePin} onRemove={remove} />
        </>
      )}
      {memories.length === 0 && !loading && (
        <div className="wsh-helper info" style={{ fontSize: 12 }}>
          No memories yet. Add context the agent should always know — conventions, API keys to avoid,
          preferred libraries, etc.
        </div>
      )}
    </section>
  )
}

function MemoryList({
  memories, onPinToggle, onRemove,
}: {
  memories: MemoryEntry[]
  onPinToggle: (m: MemoryEntry) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {memories.map((m) => (
        <div
          key={m.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            background: 'var(--surface)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: 'var(--text)',
            }}>
              {m.body}
            </div>
            {m.tags && m.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {m.tags.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, color: 'var(--text-mute)',
                    border: '1px solid var(--border)', padding: '1px 6px',
                    borderRadius: 8, background: 'var(--bg-elev-1)',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    <Tag size={9} /> {t}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>
              {new Date(m.created).toLocaleString()}
              {m.updated && m.updated !== m.created && (
                <> · edited {new Date(m.updated).toLocaleString()}</>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="wsh-btn"
              onClick={() => onPinToggle(m)}
              title={m.pinned ? 'Unpin' : 'Pin'}
            >
              {m.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            <button className="wsh-btn" onClick={() => onRemove(m.id)} title="Delete">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
