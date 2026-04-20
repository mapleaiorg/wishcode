/**
 * MarketView — local watchlist + live prices.
 *
 * - Watchlist lives in localStorage (see `lib/localStore.ts`).
 * - Prices come from `trading.prices([syms])`.
 * - Optional live ticker via `trading.onPrice`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Star, Plus, X, TrendingUp, TrendingDown, Play, Pause } from 'lucide-react'
import type { Quote } from '../../types'
import {
  addToWatchlist, getWatchlist, removeFromWatchlist,
} from '../../lib/localStore'

function fmtUsd(n?: number): string {
  if (n == null || !isFinite(n)) return '—'
  if (n >= 1_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (n >= 1)     return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

export function MarketView() {
  const [symbols, setSymbols]  = useState<string[]>(() => getWatchlist())
  const [quotes,  setQuotes]   = useState<Record<string, Quote>>({})
  const [live,    setLive]     = useState(false)
  const [input,   setInput]    = useState('')
  const [err,     setErr]      = useState<string | null>(null)
  const [loading, setLoading]  = useState(false)

  const refresh = useCallback(async (syms: string[] = symbols) => {
    if (syms.length === 0) { setQuotes({}); return }
    setLoading(true)
    setErr(null)
    try {
      const q = await window.ibank.trading.prices(syms)
      setQuotes(q ?? {})
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [symbols])

  useEffect(() => { void refresh(symbols) }, [symbols, refresh])

  // Live ticker wiring
  useEffect(() => {
    if (!live) return
    let cancelled = false
    void window.ibank.trading.tickerStart(symbols, 10_000).catch(() => {})
    const unsub = window.ibank.trading.onPrice(({ symbol, price, ts }) => {
      if (cancelled) return
      setQuotes((prev) => {
        const existing = prev[symbol]
        return {
          ...prev,
          [symbol]: {
            symbol,
            priceUsd: price,
            change24hPct: existing?.change24hPct ?? 0,
            marketCapUsd: existing?.marketCapUsd,
            volume24hUsd: existing?.volume24hUsd,
            updatedAt: ts,
          },
        }
      })
    })
    return () => {
      cancelled = true
      unsub?.()
      void window.ibank.trading.tickerStop().catch(() => {})
    }
  }, [live, symbols])

  const onAdd = () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return
    setSymbols(addToWatchlist(sym))
    setInput('')
  }
  const onRemove = (sym: string) => {
    setSymbols(removeFromWatchlist(sym))
    setQuotes((q) => { const n = { ...q }; delete n[sym]; return n })
  }

  const rows = useMemo(() => symbols.map((s) => ({ sym: s, q: quotes[s] })), [symbols, quotes])

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Market</h2>
        <div className="ibn-panel-head-actions">
          <button
            className={`ibn-btn ${live ? 'primary' : ''}`}
            onClick={() => setLive((v) => !v)}
            title="Toggle live price ticker"
          >
            {live ? <Pause size={12} /> : <Play size={12} />}
            <span style={{ marginLeft: 4 }}>{live ? 'Live' : 'Snapshot'}</span>
          </button>
          <button className="ibn-btn" onClick={() => void refresh()}>Refresh</button>
        </div>
      </header>

      <section className="ibn-filter-row">
        <label className="ibn-filter" style={{ flex: 1 }}>
          <Star size={12} />
          <span>Add symbol</span>
          <input
            type="text"
            placeholder="e.g. BTC, ETH, SOL, ARB"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
            style={{ flex: 1, minWidth: 140 }}
          />
          <button className="ibn-btn" onClick={onAdd}>
            <Plus size={12} /> Add
          </button>
        </label>
        <span className="ibn-muted">{symbols.length} symbols</span>
      </section>

      {err && <div className="ibn-error-banner">{err}</div>}
      {loading && rows.every((r) => !r.q) && <div className="ibn-muted">Loading prices…</div>}

      {rows.length === 0 ? (
        <div className="ibn-muted">Watchlist is empty. Add a symbol above.</div>
      ) : (
        <table className="ibn-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>24h</th>
              <th style={{ textAlign: 'right' }}>Market Cap</th>
              <th style={{ textAlign: 'right' }}>Volume 24h</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sym, q }) => {
              const change = q?.change24hPct ?? 0
              const up = change >= 0
              return (
                <tr key={sym}>
                  <td><strong>{sym}</strong></td>
                  <td style={{ textAlign: 'right' }}>{q ? fmtUsd(q.priceUsd) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={up ? 'ibn-up' : 'ibn-down'}>
                      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {' '}{change.toFixed(2)}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{q?.marketCapUsd != null ? fmtUsd(q.marketCapUsd) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{q?.volume24hUsd != null ? fmtUsd(q.volume24hUsd) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="ibn-icon-btn"
                      onClick={() => onRemove(sym)}
                      title="Remove from watchlist"
                    >
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <p className="ibn-micro-disclaimer">
        Prices are sourced from third-party market data providers. They are informational,
        not a recommendation, and may lag live markets.
      </p>
    </div>
  )
}
