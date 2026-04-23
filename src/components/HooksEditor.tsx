/**
 * HooksEditor — edit `~/.wishcode/hooks.json`.
 *
 * Hooks gate the agent's lifecycle — each entry is a shell command that
 * Wish Code runs on `UserPromptSubmit | PreToolUse | PostToolUse | Stop`
 * events. Exit 0 merges stdout into the turn; exit 2 blocks with stderr
 * as the reason. Schema is permissive; we validate as JSON on save.
 *
 * Full schema (per event key):
 *   {
 *     "UserPromptSubmit": [{ "command": "…", "timeoutMs"?: 10000, "matcher"?: "…" }],
 *     "PreToolUse":        [{ "command": "…", "matcher"?: "fs_write|fs_edit" }],
 *     "PostToolUse":       [{ "command": "…" }],
 *     "Stop":              [{ "command": "…" }]
 *   }
 */

import React, { useCallback, useEffect, useState } from 'react'
import { FileCode2, RefreshCw, Save, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'

const TEMPLATE = JSON.stringify(
  {
    UserPromptSubmit: [
      { command: 'echo "prompt at $(date +%FT%T): $CLAUDE_PROMPT"', timeoutMs: 5000 },
    ],
    PreToolUse: [
      { matcher: 'fs_write|fs_edit', command: 'echo "about to write"' },
    ],
    PostToolUse: [],
    Stop: [],
  },
  null,
  2,
)

export function HooksEditor() {
  const [content, setContent] = useState<string>('')
  const [original, setOriginal] = useState<string>('')
  const [filePath, setFilePath] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setErr(null); setNotice(null)
    try {
      const { file, content: raw } = await window.wish.hooks.read()
      setFilePath(file)
      const text = raw?.trim() ? raw : TEMPLATE
      setContent(text)
      setOriginal(text)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setContent(TEMPLATE)
      setOriginal('')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const dirty = content !== original

  const validate = useCallback((): string | null => {
    try {
      const parsed = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return 'Top level must be a JSON object keyed by hook event.'
      }
      const allowed = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'])
      for (const k of Object.keys(parsed)) {
        if (!allowed.has(k)) return `Unknown event: "${k}". Use UserPromptSubmit | PreToolUse | PostToolUse | Stop.`
        const v = (parsed as any)[k]
        if (!Array.isArray(v)) return `"${k}" must be an array of hook entries.`
        for (const [i, entry] of v.entries()) {
          if (!entry || typeof entry !== 'object') return `"${k}"[${i}] must be an object.`
          if (typeof entry.command !== 'string' || !entry.command.trim()) {
            return `"${k}"[${i}].command must be a non-empty string.`
          }
        }
      }
      return null
    } catch (e: any) {
      return `Invalid JSON: ${e?.message ?? String(e)}`
    }
  }, [content])

  const save = useCallback(async () => {
    setErr(null); setNotice(null)
    const problem = validate()
    if (problem) { setErr(problem); return }
    setSaving(true)
    try {
      await window.wish.hooks.write(content)
      setOriginal(content)
      setNotice('Saved.')
      setTimeout(() => setNotice(null), 1800)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }, [content, validate])

  const revert = () => { setContent(original); setErr(null); setNotice(null) }

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FileCode2 size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>Hooks</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void refresh()}>
            <RefreshCw size={12} /> Reload
          </button>
          <button className="wsh-btn" onClick={revert} disabled={!dirty}>
            <RotateCcw size={12} /> Revert
          </button>
          <button className="wsh-btn primary" onClick={() => void save()} disabled={!dirty || saving}>
            <Save size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 6px 0' }}>
        Events: <code>UserPromptSubmit</code>, <code>PreToolUse</code>, <code>PostToolUse</code>, <code>Stop</code>.
        Exit 0 merges stdout into the turn; exit 2 blocks the action (stderr = reason).
      </p>
      {filePath && (
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8 }}>
          <code>{filePath}</code>
        </div>
      )}

      {err && <div className="wsh-helper warn"><AlertCircle size={12} /> {err}</div>}
      {notice && <div className="wsh-helper info"><CheckCircle2 size={12} /> {notice}</div>}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={20}
        spellCheck={false}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 12px',
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text)',
          resize: 'vertical',
          outline: 'none',
        }}
      />
    </section>
  )
}
