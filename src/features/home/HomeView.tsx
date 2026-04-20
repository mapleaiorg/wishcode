/**
 * HomeView — the v1 dashboard.
 *
 * Sections:
 *   - Portfolio total (sum of `wallet.balances()` USD values)
 *   - Top holdings (top 5 by USD value)
 *   - Recent activity (tx history across accounts)
 *   - Active alerts (count of enabled local alert rules)
 *   - AI summary card (prompt to open Chat with a "what changed today"
 *     starter)
 *
 * Everything runs against existing `window.ibank.*` IPC, so no new
 * native surface is needed for Home.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wallet, Activity, Bell, Sparkles, ArrowUpRight, ArrowDownRight,
  Lock, Unlock, AlertTriangle,
} from 'lucide-react'
import type {
  BalanceView, TxEntry, WalletAccount, WalletStatusView,
} from '../../types'
import { getAlerts, type AlertRule } from '../../lib/localStore'
import { NON_ADVICE_SHORT } from '../../lib/disclosures'

const MAX_RECENT = 6

function fmtUsd(n: number | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`
  if (n >= 1)         return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

function fmtTimeAgo(ms: number | undefined): string {
  if (!ms) return '—'
  const delta = Math.max(0, Date.now() - ms)
  const mins = Math.floor(delta / 60_000)
  if (mins < 1)      return 'just now'
  if (mins < 60)     return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)     return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function HomeView() {
  const [status,   setStatus]   = useState<WalletStatusView | null>(null)
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [balances, setBalances] = useState<BalanceView[]>([])
  const [recent,   setRecent]   = useState<TxEntry[]>([])
  const [alerts,   setAlerts]   = useState<AlertRule[]>([])
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const s = (await window.ibank.wallet.status()) as WalletStatusView
      setStatus(s)
      const acc = (await window.ibank.wallet.accounts()) as WalletAccount[]
      setAccounts(acc ?? [])
      if (s.unlocked) {
        const bal = (await window.ibank.wallet.balances()) as BalanceView[]
        setBalances(bal ?? [])
        // Pull recent tx from the first ~3 accounts for the activity feed.
        const heads = (acc ?? []).slice(0, 3)
        const all: TxEntry[] = []
        for (const a of heads) {
          try {
            const rows = await window.ibank.wallet.history(a.chain, a.address)
            for (const r of rows ?? []) all.push(r)
          } catch {}
        }
        all.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        setRecent(all.slice(0, MAX_RECENT))
      } else {
        setBalances([])
        setRecent([])
      }
      setAlerts(getAlerts())
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

  const totalUsd = useMemo(
    () => balances.reduce((acc, b) => acc + (b.usdValue ?? 0), 0),
    [balances],
  )
  const topHoldings = useMemo(
    () => [...balances]
      .filter((b) => (b.usdValue ?? 0) > 0)
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
      .slice(0, 5),
    [balances],
  )
  const enabledAlerts = useMemo(() => alerts.filter((a) => a.enabled), [alerts])

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Home</h2>
        <div className="ibn-panel-head-actions">
          <span className="ibn-pill ibn-pill-subtle">
            {status?.unlocked
              ? <><Unlock size={11} /> Wallet unlocked</>
              : status?.exists
                ? <><Lock size={11} /> Wallet locked</>
                : <><AlertTriangle size={11} /> No wallet</>}
          </span>
        </div>
      </header>

      <p className="ibn-micro-disclaimer">{NON_ADVICE_SHORT}</p>

      {err && <div className="ibn-error-banner">{err}</div>}

      <section className="ibn-grid ibn-grid-4">
        <div className="ibn-card ibn-stat">
          <div className="ibn-stat-label"><Wallet size={12} /> Portfolio</div>
          <div className="ibn-stat-value">{fmtUsd(totalUsd)}</div>
          <div className="ibn-stat-sub">
            {balances.length} position{balances.length === 1 ? '' : 's'} across {accounts.length} account{accounts.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="ibn-card ibn-stat">
          <div className="ibn-stat-label"><Activity size={12} /> Recent activity</div>
          <div className="ibn-stat-value">{recent.length}</div>
          <div className="ibn-stat-sub">
            {recent[0]?.timestamp ? `latest ${fmtTimeAgo(recent[0].timestamp)}` : '—'}
          </div>
        </div>
        <div className="ibn-card ibn-stat">
          <div className="ibn-stat-label"><Bell size={12} /> Alerts</div>
          <div className="ibn-stat-value">{enabledAlerts.length}</div>
          <div className="ibn-stat-sub">
            {alerts.length - enabledAlerts.length} paused
          </div>
        </div>
        <div className="ibn-card ibn-stat">
          <div className="ibn-stat-label"><Sparkles size={12} /> iBank Agent</div>
          <div className="ibn-stat-value ibn-stat-value-sm">Ask about your wallet</div>
          <div className="ibn-stat-sub">
            Explains, summarizes, compares — never signs or recommends.
          </div>
        </div>
      </section>

      <section className="ibn-grid ibn-grid-2" style={{ marginTop: 16 }}>
        <div className="ibn-card">
          <h3 className="ibn-card-title"><Wallet size={13} /> Top holdings</h3>
          {loading && <div className="ibn-muted">Loading…</div>}
          {!loading && topHoldings.length === 0 && (
            <div className="ibn-muted">
              {status?.unlocked
                ? 'No priced balances yet.'
                : status?.exists
                  ? 'Unlock your wallet to see balances.'
                  : 'Create or import a wallet to begin.'}
            </div>
          )}
          {!loading && topHoldings.length > 0 && (
            <table className="ibn-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Chain</th>
                  <th>Amount</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {topHoldings.map((b, i) => (
                  <tr key={`${b.chain}-${b.symbol}-${i}`}>
                    <td><strong>{b.symbol}</strong></td>
                    <td><span className="ibn-chain-pill">{b.chain}</span></td>
                    <td>{b.formatted}</td>
                    <td style={{ textAlign: 'right' }}>{fmtUsd(b.usdValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="ibn-card">
          <h3 className="ibn-card-title"><Activity size={13} /> Recent activity</h3>
          {loading && <div className="ibn-muted">Loading…</div>}
          {!loading && recent.length === 0 && (
            <div className="ibn-muted">No on-chain activity detected yet.</div>
          )}
          {!loading && recent.length > 0 && (
            <ul className="ibn-activity">
              {recent.map((t) => (
                <li key={`${t.chain}-${t.hash}`}>
                  <span className={`ibn-dir ibn-dir-${t.direction}`}>
                    {t.direction === 'out' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {t.direction}
                  </span>
                  <span className="ibn-activity-amt">{t.amount} {t.symbol}</span>
                  <span className="ibn-chain-pill">{t.chain}</span>
                  <span className="ibn-muted ibn-activity-time">{fmtTimeAgo(t.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="ibn-card ibn-summary-card" style={{ marginTop: 16 }}>
        <h3 className="ibn-card-title"><Sparkles size={13} /> AI summary</h3>
        <p>
          {status?.unlocked
            ? `You currently hold ${balances.length} position${balances.length === 1 ? '' : 's'} worth ${fmtUsd(totalUsd)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'}. Open Chat and ask the iBank Agent to explain specific movements, concentration risks, or transaction history.`
            : status?.exists
              ? 'Your wallet is locked. Unlock it to let the iBank Agent analyze your balances and transaction history.'
              : 'Create or import a self-custodial wallet to get started. The iBank Agent will help you understand your on-chain activity once it is set up.'}
        </p>
      </section>
    </div>
  )
}
