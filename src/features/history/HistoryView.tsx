/**
 * HistoryView — unified transaction list across accounts, with per-chain
 * and direction filters and a one-click "Export CSV" shortcut.
 *
 * History rows come from `wallet.history(chain, address)` for each
 * account. We concat + sort by timestamp desc.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { History as HistoryIcon, Download, ExternalLink, Filter } from 'lucide-react'
import type { ChainId, TxEntry, WalletAccount, WalletStatusView } from '../../types'
import { addExportJob } from '../../lib/localStore'

type DirectionFilter = 'all' | 'in' | 'out' | 'self'

function fmtTs(ms?: number): string {
  if (!ms) return '—'
  try {
    const d = new Date(ms)
    const day = d.toISOString().slice(0, 10)
    const hm = d.toISOString().slice(11, 16)
    return `${day} ${hm}`
  } catch { return '—' }
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function HistoryView() {
  const [status, setStatus] = useState<WalletStatusView | null>(null)
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [rows, setRows] = useState<TxEntry[]>([])
  const [chainFilter, setChainFilter] = useState<ChainId | 'all'>('all')
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const s = (await window.ibank.wallet.status()) as WalletStatusView
      setStatus(s)
      const acc = (await window.ibank.wallet.accounts()) as WalletAccount[]
      setAccounts(acc ?? [])
      if (!s.unlocked) { setRows([]); return }
      const all: TxEntry[] = []
      for (const a of acc ?? []) {
        try {
          const r = await window.ibank.wallet.history(a.chain, a.address)
          for (const row of r ?? []) all.push(row)
        } catch {}
      }
      all.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      setRows(all)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ibank.wallet.onLockChanged?.(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const chains = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.chain))),
    [accounts],
  )

  const filtered = useMemo(
    () => rows.filter((r) => {
      if (chainFilter !== 'all' && r.chain !== chainFilter) return false
      if (dirFilter   !== 'all' && r.direction !== dirFilter) return false
      return true
    }),
    [rows, chainFilter, dirFilter],
  )

  const exportCsv = useCallback(() => {
    const header = [
      'timestamp', 'chain', 'hash', 'direction', 'from', 'to',
      'amount', 'symbol', 'fee', 'feeSymbol', 'status', 'blockNumber',
    ].join(',')
    const body = filtered.map((r) => [
      r.timestamp ? new Date(r.timestamp).toISOString() : '',
      r.chain,
      r.hash,
      r.direction,
      r.from,
      r.to,
      r.amount,
      r.symbol,
      r.feeRaw ?? '',
      r.feeSymbol ?? '',
      r.status,
      r.blockNumber != null ? String(r.blockNumber) : '',
    ].map(csvEscape).join(',')).join('\n')
    const csv = `${header}\n${body}\n`
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    downloadText(`ibank-history-${ts}.csv`, csv)
    addExportJob({
      kind: 'csv-history',
      chain: chainFilter,
      address: accounts.map((a) => a.address).join(';'),
      fromMs: filtered[filtered.length - 1]?.timestamp ?? 0,
      toMs:   filtered[0]?.timestamp ?? Date.now(),
      rows:   filtered.length,
    })
  }, [filtered, chainFilter, accounts])

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>History</h2>
        <div className="ibn-panel-head-actions">
          <button className="ibn-btn" onClick={() => void refresh()}>
            <HistoryIcon size={12} /> Refresh
          </button>
          <button
            className="ibn-btn"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Export filtered rows as CSV"
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </header>

      <section className="ibn-filter-row">
        <label className="ibn-filter">
          <Filter size={12} />
          <span>Chain</span>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value as ChainId | 'all')}
          >
            <option value="all">All chains</option>
            {chains.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="ibn-filter">
          <span>Direction</span>
          <select
            value={dirFilter}
            onChange={(e) => setDirFilter(e.target.value as DirectionFilter)}
          >
            <option value="all">All</option>
            <option value="in">Incoming</option>
            <option value="out">Outgoing</option>
            <option value="self">Self</option>
          </select>
        </label>
        <span className="ibn-muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {rows.length} transactions
        </span>
      </section>

      {err && <div className="ibn-error-banner">{err}</div>}
      {loading && <div className="ibn-muted">Loading…</div>}
      {!status?.unlocked && (
        <div className="ibn-muted">Unlock your wallet to list transactions.</div>
      )}
      {status?.unlocked && !loading && filtered.length === 0 && (
        <div className="ibn-muted">No transactions match the current filters.</div>
      )}

      {status?.unlocked && !loading && filtered.length > 0 && (
        <table className="ibn-table ibn-table-history">
          <thead>
            <tr>
              <th>Time</th>
              <th>Chain</th>
              <th>Dir.</th>
              <th>Amount</th>
              <th>Counterparty</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const counter = r.direction === 'out' ? r.to : r.from
              return (
                <tr key={`${r.chain}-${r.hash}`}>
                  <td className="ibn-muted">{fmtTs(r.timestamp)}</td>
                  <td><span className="ibn-chain-pill">{r.chain}</span></td>
                  <td className={`ibn-dir-cell ibn-dir-${r.direction}`}>{r.direction}</td>
                  <td>{r.amount} {r.symbol}</td>
                  <td><code className="ibn-addr">{counter.slice(0, 8)}…{counter.slice(-6)}</code></td>
                  <td className={`ibn-status-${r.status}`}>{r.status}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.explorerUrl && (
                      <button
                        className="ibn-icon-btn"
                        onClick={() => window.ibank.app.openExternal(r.explorerUrl!)}
                        title="Open in block explorer"
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
