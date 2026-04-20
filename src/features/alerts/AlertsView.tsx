/**
 * AlertsView — local alert rules.
 *
 * Rules live in localStorage; evaluation runs on demand against the
 * current `trading.prices([syms])` result and compares to the
 * rule threshold. The first rule to match fires and is recorded
 * with `lastFired`.
 *
 * Kinds:
 *   - priceAbove / priceBelow: trigger when price crosses threshold.
 *   - dailyChange:             trigger when |change24h%| >= threshold.
 *   - concentration:           informational; set a percent target that
 *                              the user watches manually via Portfolio.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Bell, BellOff, Trash2, Play } from 'lucide-react'
import {
  addAlert, getAlerts, removeAlert, saveAlerts, toggleAlert,
  type AlertRule, type AlertKind,
} from '../../lib/localStore'

const KIND_LABEL: Record<AlertKind, string> = {
  priceAbove:    'Price above',
  priceBelow:    'Price below',
  dailyChange:   '|24h change| ≥',
  concentration: 'Concentration ≥',
}

export function AlertsView() {
  const [rules, setRules] = useState<AlertRule[]>(() => getAlerts())
  const [kind, setKind] = useState<AlertKind>('priceAbove')
  const [symbol, setSymbol] = useState('BTC')
  const [threshold, setThreshold] = useState('')
  const [note, setNote] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  const add = useCallback(() => {
    const n = parseFloat(threshold)
    if (!isFinite(n) || n <= 0) return
    const rule = addAlert({
      kind,
      symbol: kind === 'concentration' ? symbol.toUpperCase() : symbol.toUpperCase() || undefined,
      threshold: n,
      note: note || undefined,
      enabled: true,
    })
    setRules(getAlerts())
    setThreshold('')
    setNote('')
    void rule
  }, [kind, symbol, threshold, note])

  const evaluate = useCallback(async () => {
    setEvaluating(true)
    setLastRun(null)
    try {
      const priceKinds: AlertKind[] = ['priceAbove', 'priceBelow', 'dailyChange']
      const syms = Array.from(new Set(
        rules.filter((r) => r.enabled && r.symbol && priceKinds.includes(r.kind))
          .map((r) => r.symbol as string),
      ))
      const hits: string[] = []
      if (syms.length > 0) {
        const quotes = await window.ibank.trading.prices(syms)
        const now = Date.now()
        const next = rules.map((r) => {
          if (!r.enabled || !r.symbol || !r.threshold) return r
          const q = quotes[r.symbol]
          if (!q) return r
          let fired = false
          if (r.kind === 'priceAbove' && q.priceUsd >= r.threshold) fired = true
          if (r.kind === 'priceBelow' && q.priceUsd <= r.threshold) fired = true
          if (r.kind === 'dailyChange' && Math.abs(q.change24hPct) >= r.threshold) fired = true
          if (fired) {
            hits.push(`${r.symbol} ${KIND_LABEL[r.kind]} ${r.threshold} — now ${q.priceUsd.toFixed(2)} (${q.change24hPct.toFixed(2)}%)`)
            return { ...r, lastFired: now }
          }
          return r
        })
        saveAlerts(next)
        setRules(next)
      }
      setLastRun(hits.length
        ? `Fired ${hits.length} rule${hits.length === 1 ? '' : 's'}: ${hits.join(' · ')}`
        : 'No price rules matched.')
    } catch (e: any) {
      setLastRun(`Evaluation failed: ${e?.message ?? e}`)
    } finally {
      setEvaluating(false)
    }
  }, [rules])

  const enabledCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules])

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Alerts</h2>
        <div className="ibn-panel-head-actions">
          <span className="ibn-pill ibn-pill-subtle">
            {enabledCount}/{rules.length} active
          </span>
          <button
            className="ibn-btn"
            onClick={() => void evaluate()}
            disabled={evaluating || enabledCount === 0}
            title="Evaluate price rules against current market data"
          >
            <Play size={12} /> {evaluating ? 'Evaluating…' : 'Evaluate now'}
          </button>
        </div>
      </header>

      <section className="ibn-card">
        <h3 className="ibn-card-title"><Plus size={13} /> New alert rule</h3>
        <div className="ibn-form-row">
          <label className="ibn-filter">
            <span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)}>
              <option value="priceAbove">Price above</option>
              <option value="priceBelow">Price below</option>
              <option value="dailyChange">|24h change| ≥ (%)</option>
              <option value="concentration">Concentration ≥ (%)</option>
            </select>
          </label>
          <label className="ibn-filter">
            <span>Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="BTC"
            />
          </label>
          <label className="ibn-filter">
            <span>Threshold</span>
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={kind === 'dailyChange' || kind === 'concentration' ? '5' : '95000'}
              inputMode="decimal"
            />
          </label>
          <label className="ibn-filter" style={{ flex: 1 }}>
            <span>Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional context for yourself"
              style={{ flex: 1 }}
            />
          </label>
          <button className="ibn-btn primary" onClick={add} disabled={!threshold}>
            Add rule
          </button>
        </div>
      </section>

      {lastRun && (
        <div className="ibn-info-banner">{lastRun}</div>
      )}

      <section className="ibn-card">
        <h3 className="ibn-card-title">Rules</h3>
        {rules.length === 0 && <div className="ibn-muted">No rules yet.</div>}
        {rules.length > 0 && (
          <table className="ibn-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Symbol</th>
                <th style={{ textAlign: 'right' }}>Threshold</th>
                <th>Note</th>
                <th>Last fired</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                  <td>{KIND_LABEL[r.kind]}</td>
                  <td><strong>{r.symbol ?? '—'}</strong></td>
                  <td style={{ textAlign: 'right' }}>{r.threshold}</td>
                  <td>{r.note ?? ''}</td>
                  <td className="ibn-muted">
                    {r.lastFired ? new Date(r.lastFired).toLocaleString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="ibn-icon-btn"
                      title={r.enabled ? 'Pause' : 'Resume'}
                      onClick={() => setRules(toggleAlert(r.id))}
                    >
                      {r.enabled ? <Bell size={12} /> : <BellOff size={12} />}
                    </button>
                    <button
                      className="ibn-icon-btn"
                      title="Delete"
                      onClick={() => setRules(removeAlert(r.id))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="ibn-micro-disclaimer">
        Alerts are local-only signals, not trade instructions. They are informational.
      </p>
    </div>
  )
}
