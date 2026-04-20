/**
 * FinancialBuddiesView — persona switcher & system-prompt editor.
 *
 * Each persona shapes the ModelFetch turn loop (Maple / Arion / Nimbus …).
 * Exactly one is active at a time; overrides live alongside the built-in
 * defaults in ~/.ibank/financialBuddies/config.json.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Users, Check, RotateCcw, Edit3, X } from 'lucide-react'
import type { FinancialBuddyPersona } from '../types'

const ROLE_COLOR: Record<string, string> = {
  assistant:  '#38bdf8',
  advisor:    '#a855f7',
  arbitrator: '#f59e0b',
  trader:     '#f43f5e',
  research:   '#60a5fa',
  risk:       '#ef4444',
  treasurer:  '#14b8a6',
  tax:        '#84cc16',
  compliance: '#c084fc',
}

export function FinancialBuddiesView() {
  const [personas, setPersonas] = useState<FinancialBuddyPersona[]>([])
  const [active, setActive] = useState<string>('')
  const [editing, setEditing] = useState<FinancialBuddyPersona | null>(null)
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftTagline, setDraftTagline] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = (await window.ibank.financialBuddies.list()) as FinancialBuddyPersona[]
      setPersonas(list ?? [])
      const a = (await window.ibank.financialBuddies.active()) as string
      setActive(a)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ibank.financialBuddies.onUpdated(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const pickActive = async (id: string) => {
    setErr(null)
    try { await window.ibank.financialBuddies.setActive(id); void refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const openEditor = (p: FinancialBuddyPersona) => {
    setEditing(p); setDraftPrompt(p.systemPrompt); setDraftTagline(p.tagline)
  }

  const saveOverride = async () => {
    if (!editing) return
    setErr(null)
    try {
      await window.ibank.financialBuddies.override(editing.id, {
        systemPrompt: draftPrompt,
        tagline: draftTagline,
      })
      setEditing(null); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const resetAll = async () => {
    if (!confirm('Reset every persona override?')) return
    try { await window.ibank.financialBuddies.reset(); void refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2><Users size={14} style={{ verticalAlign: -2 }} /> FinancialBuddies</h2>
        <div className="ibn-panel-head-actions">
          <button className="ibn-btn danger" onClick={resetAll}>
            <RotateCcw size={12} /> Reset all
          </button>
        </div>
      </header>

      <p style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        Exactly one persona steers every chat turn. Pick an advisor for guidance, a trader for
        execution, an arbitrator to reconcile disputes, and so on.
      </p>

      {err && <div style={{ color: 'var(--err)', fontSize: 12, padding: '6px 0' }}>{err}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12, marginTop: 12,
        }}
      >
        {personas.map((p) => {
          const color = ROLE_COLOR[p.role] ?? 'var(--text-mute)'
          const isActive = p.id === active
          return (
            <div
              key={p.id}
              className="ibn-card"
              style={{
                padding: 12,
                borderColor: isActive ? color : undefined,
                borderWidth: isActive ? 2 : 1,
                borderStyle: 'solid',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 18 }}>{p.glyph ?? '✦'}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color, marginTop: 2 }}>
                    {p.role}
                  </div>
                </div>
                {isActive && (
                  <span className="pill" style={{ fontSize: 10, color, borderColor: color }}>
                    <Check size={10} /> active
                  </span>
                )}
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 8, minHeight: 40 }}>
                {p.tagline}
              </p>

              {p.tools && p.tools.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {p.tools.slice(0, 6).map((t) => (
                    <span key={t} className="pill" style={{ fontSize: 9 }}>{t}</span>
                  ))}
                  {p.tools.length > 6 && (
                    <span className="pill" style={{ fontSize: 9 }}>+{p.tools.length - 6}</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {!isActive && (
                  <button className="ibn-btn primary" style={{ fontSize: 11 }} onClick={() => pickActive(p.id)}>
                    Activate
                  </button>
                )}
                <button className="ibn-btn" style={{ fontSize: 11 }} onClick={() => openEditor(p)}>
                  <Edit3 size={11} /> Edit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            className="ibn-card"
            style={{ padding: 16, width: 560, maxHeight: '85vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{editing.glyph} {editing.title}</h3>
              <button className="ibn-btn" onClick={() => setEditing(null)}><X size={12} /></button>
            </div>
            <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>Tagline</label>
            <input
              className="ibn-input" value={draftTagline}
              onChange={(e) => setDraftTagline(e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>System prompt</label>
            <textarea
              className="ibn-input" rows={14}
              value={draftPrompt} onChange={(e) => setDraftPrompt(e.target.value)}
              style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ibn-btn primary" onClick={saveOverride}>Save override</button>
              <button className="ibn-btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
