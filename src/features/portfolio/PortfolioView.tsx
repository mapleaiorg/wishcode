/**
 * PortfolioView — holdings + allocation + concentration indicators.
 *
 * - Holdings: per-chain / per-asset rows sorted by USD value.
 * - Allocation: horizontal bar chart of the top 8 positions by weight.
 * - Concentration: flags single-asset concentration above 60% and
 *   single-chain concentration above 70%.
 *
 * All read-only; uses `wallet.balances()`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { PieChart, AlertTriangle, Layers } from 'lucide-react'
import type { BalanceView, WalletStatusView } from '../../types'
import { NON_ADVICE_SHORT } from '../../lib/disclosures'

function fmtUsd(n: number | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

const CONCENTRATION_ASSET_PCT = 60
const CONCENTRATION_CHAIN_PCT = 70

export function PortfolioView() {
  const [status, setStatus] = useState<WalletStatusView | null>(null)
  const [balances, setBalances] = useState<BalanceView[]>([])
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    try {
      const s = (await window.ibank.wallet.status()) as WalletStatusView
      setStatus(s)
      if (s.unlocked) {
        const bal = (await window.ibank.wallet.balances()) as BalanceView[]
        setBalances(bal ?? [])
      } else {
        setBalances([])
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ibank.wallet.onLockChanged?.(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const priced = useMemo(
    () => balances.filter((b) => (b.usdValue ?? 0) > 0)
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)),
    [balances],
  )

  const totalUsd = useMemo(
    () => priced.reduce((a, b) => a + (b.usdValue ?? 0), 0),
    [priced],
  )

  const allocation = useMemo(() => {
    if (totalUsd <= 0) return []
    return priced.slice(0, 8).map((b) => ({
      label: `${b.symbol} · ${b.chain}`,
      pct: ((b.usdValue ?? 0) / totalUsd) * 100,
      usd: b.usdValue ?? 0,
    }))
  }, [priced, totalUsd])

  const chainExposure = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of priced) {
      map.set(b.chain, (map.get(b.chain) ?? 0) + (b.usdValue ?? 0))
    }
    return [...map.entries()]
      .map(([chain, usd]) => ({ chain, usd, pct: totalUsd > 0 ? (usd / totalUsd) * 100 : 0 }))
      .sort((a, b) => b.usd - a.usd)
  }, [priced, totalUsd])

  const assetFlag = allocation.find((a) => a.pct >= CONCENTRATION_ASSET_PCT)
  const chainFlag = chainExposure.find((c) => c.pct >= CONCENTRATION_CHAIN_PCT)

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Portfolio</h2>
        <div className="ibn-panel-head-actions">
          <span className="ibn-pill ibn-pill-subtle">{fmtUsd(totalUsd)} total</span>
        </div>
      </header>

      <p className="ibn-micro-disclaimer">{NON_ADVICE_SHORT}</p>

      {err && <div className="ibn-error-banner">{err}</div>}

      {!status?.unlocked && (
        <div className="ibn-muted" style={{ marginTop: 12 }}>
          Unlock your wallet to compute balances and allocation.
        </div>
      )}

      {status?.unlocked && priced.length === 0 && (
        <div className="ibn-muted" style={{ marginTop: 12 }}>
          No priced balances found on the supported chains.
        </div>
      )}

      {status?.unlocked && priced.length > 0 && (
        <>
          {(assetFlag || chainFlag) && (
            <section className="ibn-risk-flags">
              {assetFlag && (
                <div className="ibn-risk-flag">
                  <AlertTriangle size={13} />
                  <span>
                    <strong>{assetFlag.label}</strong> is {assetFlag.pct.toFixed(0)}% of your portfolio.
                    High single-asset concentration amplifies both upside and downside volatility.
                  </span>
                </div>
              )}
              {chainFlag && (
                <div className="ibn-risk-flag">
                  <AlertTriangle size={13} />
                  <span>
                    {chainFlag.pct.toFixed(0)}% of value sits on <strong>{chainFlag.chain}</strong>.
                    Chain-specific risks (outages, re-orgs, bridge hacks) affect this share.
                  </span>
                </div>
              )}
            </section>
          )}

          <section className="ibn-card" style={{ marginTop: 12 }}>
            <h3 className="ibn-card-title"><PieChart size={13} /> Allocation</h3>
            <div className="ibn-bars">
              {allocation.map((a) => (
                <div key={a.label} className="ibn-bar-row">
                  <div className="ibn-bar-label">
                    <span>{a.label}</span>
                    <span className="ibn-muted">{a.pct.toFixed(1)}%</span>
                  </div>
                  <div className="ibn-bar-track">
                    <div className="ibn-bar-fill" style={{ width: `${Math.min(100, a.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="ibn-card" style={{ marginTop: 12 }}>
            <h3 className="ibn-card-title"><Layers size={13} /> Chain exposure</h3>
            <table className="ibn-table">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th style={{ textAlign: 'right' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {chainExposure.map((c) => (
                  <tr key={c.chain}>
                    <td><span className="ibn-chain-pill">{c.chain}</span></td>
                    <td style={{ textAlign: 'right' }}>{fmtUsd(c.usd)}</td>
                    <td style={{ textAlign: 'right' }}>{c.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="ibn-card" style={{ marginTop: 12 }}>
            <h3 className="ibn-card-title">Holdings</h3>
            <table className="ibn-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Chain</th>
                  <th>Amount</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th style={{ textAlign: 'right' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {priced.map((b, i) => (
                  <tr key={`${b.chain}-${b.symbol}-${i}`}>
                    <td><strong>{b.symbol}</strong></td>
                    <td><span className="ibn-chain-pill">{b.chain}</span></td>
                    <td>{b.formatted}</td>
                    <td style={{ textAlign: 'right' }}>{fmtUsd(b.usdValue)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {totalUsd > 0 ? (((b.usdValue ?? 0) / totalUsd) * 100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
