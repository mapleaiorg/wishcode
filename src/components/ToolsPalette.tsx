/**
 * ToolsPalette — read-only list of registered agent tools.
 *
 * Surfaces the full tool catalog the agent can invoke (fs_*, shell_bash,
 * agent_task, memory_*, web_*, todo_write, plan_mode, task_*, mcp_*,
 * cron_*, ask_user_question). Filter by category and keyword; click to
 * expand each tool's description + JSON schema.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ChevronDown, ChevronRight, ShieldAlert, Wrench } from 'lucide-react'

interface ToolRow {
  name: string
  title: string
  description: string
  category: string
  permission: 'auto' | 'ask' | 'plan' | 'bypass'
  dangerous: boolean
  inputSchema: any
}

export function ToolsPalette() {
  const [tools, setTools] = useState<ToolRow[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.tools.list()
      setTools(list as ToolRow[])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const t of tools) s.add(t.category)
    return ['all', ...Array.from(s).sort()]
  }, [tools])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tools.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false
      if (!needle) return true
      return t.name.toLowerCase().includes(needle)
        || t.title.toLowerCase().includes(needle)
        || t.description.toLowerCase().includes(needle)
    })
  }, [tools, q, cat])

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Wrench size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Tools</h3>
        <span style={{ marginLeft: 'auto' }}>
          <button className="wsh-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Refresh
          </button>
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{
          flex: '1 1 220px',
          display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: '6px 10px', background: 'var(--surface)',
        }}>
          <Search size={12} style={{ color: 'var(--text-mute)' }} />
          <input
            placeholder="Filter tools…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1, border: 0, outline: 'none', background: 'transparent',
              fontSize: 12, color: 'var(--text)',
            }}
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
          {visible.length} of {tools.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((t) => {
          const isOpen = !!open[t.name]
          return (
            <div
              key={t.name}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
              }}
            >
              <button
                onClick={() => setOpen((o) => ({ ...o, [t.name]: !isOpen }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: 0, background: 'transparent',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <code style={{ color: 'var(--brand)', fontSize: 12 }}>{t.name}</code>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.title}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {t.dangerous && (
                    <span
                      title="Marked dangerous"
                      style={{ color: 'var(--warn, #d28a2c)', display: 'inline-flex' }}
                    >
                      <ShieldAlert size={11} />
                    </span>
                  )}
                  <PermissionBadge perm={t.permission} />
                  <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>{t.category}</span>
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '4px 12px 12px 12px', fontSize: 12 }}>
                  <div style={{ color: 'var(--text-dim)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                    {t.description}
                  </div>
                  {t.inputSchema && (
                    <details>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-mute)' }}>
                        Input schema
                      </summary>
                      <pre style={{
                        margin: '6px 0 0 0',
                        padding: 10,
                        background: 'var(--bg-elev-1)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        overflowX: 'auto',
                      }}>
                        {JSON.stringify(t.inputSchema, null, 2)}
                      </pre>
                    </details>
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

function PermissionBadge({ perm }: { perm: ToolRow['permission'] }) {
  const color = perm === 'auto' ? 'var(--text-mute)'
    : perm === 'ask' ? 'var(--brand)'
    : perm === 'plan' ? 'var(--warn, #d28a2c)'
    : 'var(--err, #c84242)'
  return (
    <span style={{
      fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase',
      color, border: `1px solid ${color}`, padding: '1px 6px', borderRadius: 8,
    }}>
      {perm}
    </span>
  )
}
