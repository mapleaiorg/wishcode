/**
 * ExportsView — CSV range export for transaction history.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { DisclaimerBanner } from '../../components/DisclaimerBanner'
import { EXPORT_DISCLOSURE } from '../../lib/disclosures'
import { addExportJob, getExportJobs, type ExportJob } from '../../lib/localStore'
import type { ChainId, TxEntry, WalletAccount, WalletStatusView } from '../../types'

const PRESETS: Array<{ id: string; label: string; days: number }> = [
  { id: '7d',    label: 'Last 7 days',   days: 7 },
  { id: '30d',   label: 'Last 30 days',  days: 30 },
  { id: '90d',   label: 'Last 90 days',  days: 90 },
  { id: '365d',  label: 'Last year',     days: 365 },
]

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
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

export function ExportsView() {
  const [status, setStatus]       = useState<WalletStatusView | null>(null)
  const [accounts, setAccounts]   = useState<WalletAccount[]>([])
  const [chain, setChain]         = useState<ChainId | 'all'>('all')
  const [preset, setPreset]       = useState<string>('30d')
  const [customFrom, setCustomFrom] = useState<string>(toDateStr(Date.now() - 30 * 86_400_000))
  const [customTo, setCustomTo]     = useState<string>(toDateStr(Date.now()))
  const [jobs, setJobs]           = useState<ExportJob[]>(() => getExportJobs())
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const s = (await window.ibank.wallet.status()) as WalletStatusView
        setStatus(s)
        const acc = (await window.ibank.wallet.accounts()) as WalletAccount[]
        setAccounts(acc ?? [])
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      }
    })()
  }, [])

  const chains = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.chain))),
    [accounts],
  )

  const range = useMemo(() => {
    if (preset === 'custom') {
      const from = new Date(customFrom).getTime()
      const to   = new Date(customTo).getTime() + 86_400_000 - 1
      return { fromMs: from, toMs: to }
    }
    const days = PRESETS.find((p) => p.id === preset)?.days ?? 30
    return { fromMs: Date.now() - days * 86_400_000, toMs: Date.now() }
  }, [preset, customFrom, customTo])

  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const picks = accounts.filter((a) => chain === 'all' || a.chain === chain)
      const all: TxEntry[] = []
      for (const a of picks) {
        try {
          const rows = await window.ibank.wallet.history(a.chain, a.address)
          for (const r of rows ?? []) {
            const ts = r.timestamp ?? 0
            if (ts >= range.fromMs && ts <= range.toMs) all.push(r)
          }
        } catch {}
      }
      all.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

      const header = [
        'timestamp', 'chain', 'hash', 'direction', 'from', 'to',
        'amount', 'symbol', 'fee', 'feeSymbol', 'status', 'blockNumber',
      ].join(',')
      const body = all.map((r) => [
        r.timestamp ? new Date(r.timestamp).toISOString() : '',
        r.chain, r.hash, r.direction, r.from, r.to, r.amount, r.symbol,
        r.feeRaw ?? '', r.feeSymbol ?? '', r.status,
        r.blockNumber != null ? String(r.blockNumber) : '',
      ].map(csvEscape).join(',')).join('\n')
      const csv = `${header}\n${body}\n`
      const name = `ibank-history-${chain}-${toDateStr(range.fromMs)}-${toDateStr(range.toMs)}.csv`
      downloadText(name, csv)
      addExportJob({
        kind: 'csv-history',
        chain,
        address: picks.map((a) => a.address).join(';'),
        fromMs: range.fromMs,
        toMs: range.toMs,
        rows: all.length,
      })
      setJobs(getExportJobs())
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [accounts, chain, range])

  const clearJobs = () => {
    localStorage.removeItem('ibn.v1.export.jobs')
    setJobs([])
  }

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Exports</h2>
      </header>

      <DisclaimerBanner surface="exports" text={EXPORT_DISCLOSURE} />

      <section className="ibn-card">
        <h3 className="ibn-card-title">New export</h3>
        <div className="ibn-form-row">
          <label className="ibn-filter">
            <span>Chain</span>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value as ChainId | 'all')}
            >
              <option value="all">All chains</option>
              {chains.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="ibn-filter">
            <span>Range</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="custom">Custom</option>
            </select>
          </label>
          {preset === 'custom' && (
            <>
              <label className="ibn-filter">
                <span>From</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label className="ibn-filter">
                <span>To</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </>
          )}
          <button
            className="ibn-btn primary"
            onClick={() => void run()}
            disabled={busy || !status?.unlocked}
          >
            <Download size={12} /> {busy ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        {!status?.unlocked && (
          <div className="ibn-muted" style={{ marginTop: 8 }}>
            Unlock your wallet to export transactions.
          </div>
        )}
      </section>

      {err && <div className="ibn-error-banner">{err}</div>}

      <section className="ibn-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="ibn-card-title">Recent exports</h3>
          {jobs.length > 0 && (
            <button className="ibn-btn ghost" onClick={clearJobs}>
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
        {jobs.length === 0 ? (
          <div className="ibn-muted">No exports recorded yet.</div>
        ) : (
          <table className="ibn-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Chain</th>
                <th>Range</th>
                <th style={{ textAlign: 'right' }}>Rows</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="ibn-muted">{new Date(j.createdAt).toLocaleString()}</td>
                  <td><span className="ibn-chain-pill">{j.chain}</span></td>
                  <td className="ibn-muted">{toDateStr(j.fromMs)} → {toDateStr(j.toMs)}</td>
                  <td style={{ textAlign: 'right' }}>{j.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
