/**
 * ModelPicker — dropdown overlay that lists every model the user can
 * actually use right now, grouped by provider.
 *
 * Providers are surfaced in an order that matches the product's
 * "local-first, then cloud" narrative:
 *   Ollama → OpenAI → Anthropic → xAI → Gemini → OpeniBank
 *
 * Selecting a row calls `window.ibank.model.set(provider, model)` and
 * closes the overlay. If nothing is available (no keys, no Ollama) we
 * show a gentle nudge toward /Login.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, AlertCircle, LogIn } from 'lucide-react'
import type { CurrentModel, ModelEntry, Provider } from '../types'

interface Props {
  current: CurrentModel | null
  onChanged(next: CurrentModel): void
  onRequestLogin(): void
}

const PROVIDER_ORDER: Provider[] = ['ollama', 'anthropic', 'openai', 'xai', 'gemini', 'openibank']
const PROVIDER_LABEL: Record<Provider, string> = {
  ollama:    'Ollama (local)',
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  xai:       'xAI (Grok)',
  gemini:    'Google Gemini',
  openibank: 'OpeniBank',
}

export function ModelPicker({ current, onChanged, onRequestLogin }: Props) {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<ModelEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res: any = await window.ibank?.model.list()
      const list: ModelEntry[] = Array.isArray(res) ? res : (res?.available ?? [])
      setModels(list)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  // click-outside
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      if (anchorRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const grouped = useMemo(() => {
    const g = new Map<Provider, ModelEntry[]>()
    for (const m of models) {
      const arr = g.get(m.provider) ?? []
      arr.push(m)
      g.set(m.provider, arr)
    }
    return g
  }, [models])

  const pick = useCallback(async (m: ModelEntry) => {
    try {
      await window.ibank.model.set(m.provider, m.model)
      onChanged({ provider: m.provider, model: m.model })
      setOpen(false)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [onChanged])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={anchorRef}
        className="ibn-model-btn"
        onClick={() => setOpen((v) => !v)}
        title="Switch model"
      >
        <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>{current?.provider ?? 'no provider'}</span>
        <span style={{ margin: '0 6px', color: 'var(--border)' }}>/</span>
        <span style={{ fontWeight: 600 }}>{current?.model ?? 'select model'}</span>
        <ChevronDown size={12} style={{ marginLeft: 6, opacity: 0.6 }} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="ibn-card"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            width: 360, maxHeight: 460, overflowY: 'auto',
            padding: 6, zIndex: 40,
            boxShadow: '0 18px 32px rgba(0,0,0,0.35)',
          }}
        >
          {loading && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-mute)' }}>Loading…</div>}
          {err && <div style={{ padding: 10, fontSize: 12, color: 'var(--err)' }}>{err}</div>}
          {!loading && models.length === 0 && !err && (
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warn)', fontSize: 12 }}>
                <AlertCircle size={14} /> No models available yet.
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '8px 0' }}>
                Install Ollama for a local model, or sign in to a cloud provider.
              </p>
              <button className="ibn-btn primary" onClick={() => { setOpen(false); onRequestLogin() }}>
                <LogIn size={12} /> Open Login
              </button>
            </div>
          )}
          {PROVIDER_ORDER.map((p) => {
            const list = grouped.get(p)
            if (!list || list.length === 0) return null
            return (
              <div key={p} className="ibn-models-group">
                <div className="ibn-models-group-label">{PROVIDER_LABEL[p]}</div>
                {list.map((m) => {
                  const active = current && current.provider === m.provider && current.model === m.model
                  return (
                    <button
                      key={`${m.provider}:${m.model}`}
                      className={`ibn-model-row ${active ? 'selected' : ''}`}
                      onClick={() => void pick(m)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                          {m.label ?? m.model}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', gap: 6 }}>
                          <code style={{ color: 'var(--text-mute)' }}>{m.model}</code>
                          {m.rateNote && <span>· {m.rateNote}</span>}
                          {m.warning && <span style={{ color: 'var(--warn)' }}>· {m.warning}</span>}
                        </div>
                      </div>
                      {active && <Check size={14} style={{ color: 'var(--ok)' }} />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
