/**
 * SkillsPanel — list/install/uninstall agent skills.
 *
 * Skills are markdown files with YAML frontmatter that extend the agent's
 * capabilities (triggers + tool preferences + prompt templates). Built-ins
 * ship with the app; user skills live in `~/.wishcode/skills/`.
 *
 * New-skill form accepts a unique name + the full markdown body; the
 * backend parses frontmatter and rejects invalid files.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Plus, Trash2, X, Check, Package, User } from 'lucide-react'
import type { SkillInfo } from '../types'

const TEMPLATE = `---
name: my-skill
title: My Skill
description: A one-line pitch for the agent.
triggers:
  keywords: [foo, bar]
  regex:
    - "(?i)match-me"
tools: [fs_read, fs_grep]
permissions:
  auto: [fs_read, fs_grep]
version: 1
---

# My Skill

When triggered, …
`

export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [markdown, setMarkdown] = useState(TEMPLATE)

  const refresh = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.skills.list()
      setSkills(list as SkillInfo[])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const reload = useCallback(async () => {
    setErr(null); setLoading(true)
    try {
      const list = await window.wish.skills.reload()
      setSkills(list as SkillInfo[])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  const install = useCallback(async () => {
    const n = name.trim()
    const m = markdown.trim()
    if (!n || !m) { setErr('Name and markdown required.'); return }
    setErr(null)
    try {
      await window.wish.skills.install(n, m)
      setCreating(false); setName(''); setMarkdown(TEMPLATE)
      await refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [name, markdown, refresh])

  const remove = useCallback(async (s: SkillInfo) => {
    if (s.source === 'builtin') {
      setErr(`Cannot uninstall built-in skill "${s.name}".`); return
    }
    if (!confirm(`Uninstall "${s.name}"?`)) return
    try { await window.wish.skills.uninstall(s.name); await refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  const builtins = skills.filter((s) => s.source === 'builtin')
  const user = skills.filter((s) => s.source === 'user')

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Package size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Skills</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Reload
          </button>
          {!creating && (
            <button className="wsh-btn primary" onClick={() => setCreating(true)}>
              <Plus size={12} /> New skill
            </button>
          )}
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      {creating && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 12, marginBottom: 12,
          background: 'var(--surface)',
        }}>
          <label>Skill filename (kebab-case, no extension)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-skill"
          />

          <label style={{ marginTop: 10 }}>Markdown (with YAML frontmatter)</label>
          <textarea
            rows={14}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck={false}
            style={{
              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
              fontSize: 12,
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="wsh-btn" onClick={() => { setCreating(false); setErr(null) }}>
              <X size={12} /> Cancel
            </button>
            <button className="wsh-btn primary" onClick={() => void install()}>
              <Check size={12} /> Install
            </button>
          </div>
        </div>
      )}

      {builtins.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', margin: '10px 0 6px 0', letterSpacing: 0.4 }}>
            BUILT-IN · {builtins.length}
          </div>
          <SkillList skills={builtins} onRemove={remove} />
        </>
      )}
      {user.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', margin: '14px 0 6px 0', letterSpacing: 0.4 }}>
            USER · {user.length}
          </div>
          <SkillList skills={user} onRemove={remove} />
        </>
      )}
      {skills.length === 0 && !loading && (
        <div className="wsh-helper info" style={{ fontSize: 12 }}>
          No skills installed.
        </div>
      )}
    </section>
  )
}

function SkillList({
  skills, onRemove,
}: { skills: SkillInfo[]; onRemove: (s: SkillInfo) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {skills.map((s) => (
        <div
          key={s.name}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            background: 'var(--surface)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ color: 'var(--brand)', fontSize: 12 }}>{s.name}</code>
              <strong style={{ fontSize: 12 }}>{s.title}</strong>
              {s.version && (
                <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>v{s.version}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              {s.description}
            </div>
            {s.author && (
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
                <User size={10} style={{ verticalAlign: '-1px' }} /> {s.author}
              </div>
            )}
          </div>
          {s.source === 'user' && (
            <button className="wsh-btn" onClick={() => onRemove(s)} title="Uninstall">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
