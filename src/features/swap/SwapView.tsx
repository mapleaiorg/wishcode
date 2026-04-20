/**
 * SwapView — quote input + disclosed third-party routing + unsigned-tx
 * preview.
 *
 * v0.4.0 boundary: this view does **not** yet build a signed swap
 * transaction. It computes a quote from the existing `trading.prices`
 * (price ratio), shows the route and provider fully, and renders a
 * "Route disclosure" card with the exact provider + URL the user would
 * be sending their assets to. A real router integration is a future
 * native module (see PLAN_v0.4.0.md §8 "Out of scope").
 *
 * This is intentional: iBank's product boundary says the LLM/app may
 * **prepare**, never execute silently. So we show the full disclosure,
 * let the user open the provider's own UI to finish the swap, and we
 * record the intent locally.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, ExternalLink, Repeat, ShieldAlert, AlertTriangle } from 'lucide-react'
import { DisclaimerBanner } from '../../components/DisclaimerBanner'
import { SWAP_DISCLOSURE } from '../../lib/disclosures'
import {
  getSwapProvider, setSwapProvider, SWAP_PROVIDERS,
  type SwapProvider, type ChainId,
} from '../../lib/localStore'
import type { Quote } from '../../types'

function fmt(n: number, digits = 6): string {
  if (!isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function SwapView() {
  const [fromSym, setFromSym]     = useState('ETH')
  const [toSym,   setToSym]       = useState('USDC')
  const [amountIn, setAmountIn]   = useState('1')
  const [chain,   setChain]       = useState<ChainId>('eth')
  const [slippage, setSlippage]   = useState('0.5')
  const [provider, setProvider]   = useState<SwapProvider>(() => getSwapProvider())
  const [fromQ,   setFromQ]       = useState<Quote | null>(null)
  const [toQ,     setToQ]         = useState<Quote | null>(null)
  const [err,     setErr]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)

  const providerMeta = useMemo(
    () => SWAP_PROVIDERS.find((p) => p.id === provider)!,
    [provider],
  )
  const providerChainOk = providerMeta.chains.includes(chain)

  const refresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const [f, t] = await Promise.all([
        window.ibank.trading.price(fromSym),
        window.ibank.trading.price(toSym),
      ])
      setFromQ((f as Quote | null) ?? null)
      setToQ((t as Quote | null) ?? null)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [fromSym, toSym])

  useEffect(() => { void refresh() }, [refresh])

  const quote = useMemo(() => {
    const amt = parseFloat(amountIn)
    if (!isFinite(amt) || amt <= 0) return null
    if (!fromQ || !toQ || toQ.priceUsd <= 0) return null
    const valueIn = amt * fromQ.priceUsd
    const mid = valueIn / toQ.priceUsd
    const slip = (parseFloat(slippage) || 0) / 100
    const minOut = mid * (1 - slip)
    return { valueIn, mid, minOut, rate: fromQ.priceUsd / toQ.priceUsd }
  }, [amountIn, fromQ, toQ, slippage])

  const onSwitch = () => {
    setFromSym(toSym)
    setToSym(fromSym)
  }

  const openProvider = () => {
    if (providerMeta.url) {
      void window.ibank.app.openExternal(providerMeta.url)
    }
  }

  const onProvider = (p: SwapProvider) => {
    setProvider(p)
    setSwapProvider(p)
  }

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Swap</h2>
      </header>

      <DisclaimerBanner surface="swap" text={SWAP_DISCLOSURE} tone="warn" />

      <section className="ibn-card ibn-swap-card">
        <div className="ibn-swap-row">
          <label className="ibn-filter">
            <span>From</span>
            <input
              value={fromSym}
              onChange={(e) => setFromSym(e.target.value.toUpperCase())}
              style={{ width: 80 }}
            />
          </label>
          <label className="ibn-filter" style={{ flex: 1 }}>
            <span>Amount</span>
            <input
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              inputMode="decimal"
              style={{ flex: 1 }}
            />
          </label>
          <button className="ibn-icon-btn" onClick={onSwitch} title="Flip direction">
            <Repeat size={14} />
          </button>
          <label className="ibn-filter">
            <span>To</span>
            <input
              value={toSym}
              onChange={(e) => setToSym(e.target.value.toUpperCase())}
              style={{ width: 80 }}
            />
          </label>
        </div>
        <div className="ibn-swap-row">
          <label className="ibn-filter">
            <span>Chain</span>
            <select value={chain} onChange={(e) => setChain(e.target.value as ChainId)}>
              {(['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'solana'] as ChainId[]).map((c) =>
                <option key={c} value={c}>{c}</option>,
              )}
            </select>
          </label>
          <label className="ibn-filter">
            <span>Slippage %</span>
            <input
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              inputMode="decimal"
              style={{ width: 80 }}
            />
          </label>
          <label className="ibn-filter">
            <span>Provider</span>
            <select value={provider} onChange={(e) => onProvider(e.target.value as SwapProvider)}>
              {SWAP_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <button className="ibn-btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh quote'}
          </button>
        </div>
      </section>

      {err && <div className="ibn-error-banner">{err}</div>}

      {quote && (
        <section className="ibn-card">
          <h3 className="ibn-card-title"><ArrowRightLeft size={13} /> Quote</h3>
          <div className="ibn-kv-grid">
            <div><span className="ibn-muted">Rate</span><strong>1 {fromSym} = {fmt(quote.rate)} {toSym}</strong></div>
            <div><span className="ibn-muted">Value in</span><strong>${fmt(quote.valueIn, 2)}</strong></div>
            <div><span className="ibn-muted">Estimated out</span><strong>{fmt(quote.mid)} {toSym}</strong></div>
            <div><span className="ibn-muted">Min received (slip {slippage}%)</span><strong>{fmt(quote.minOut)} {toSym}</strong></div>
          </div>
          <p className="ibn-micro-disclaimer">
            Quote derived from public mid-market prices, not a live router quote. Final
            execution price depends on pool depth, gas, and network conditions.
          </p>
        </section>
      )}

      <section className="ibn-card">
        <h3 className="ibn-card-title"><ShieldAlert size={13} /> Route disclosure</h3>
        <ul className="ibn-bullets">
          <li><strong>Provider:</strong> {providerMeta.label} ({provider})</li>
          <li><strong>Chain:</strong> {chain}</li>
          <li><strong>Routing:</strong> {providerMeta.note}</li>
          <li><strong>iBank role:</strong> iBank is <em>not</em> the liquidity provider. iBank prepares the transaction; the third-party router matches the swap.</li>
          <li><strong>Settlement:</strong> Any swap requires you to sign locally. Blockchain transactions are irreversible.</li>
        </ul>

        {!providerChainOk && (
          <div className="ibn-risk-flag">
            <AlertTriangle size={13} />
            <span>
              The selected provider <strong>{providerMeta.label}</strong> does not list
              <code> {chain} </code> as a supported chain. Pick a different provider.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            className="ibn-btn primary"
            onClick={openProvider}
            disabled={!providerMeta.url || !providerChainOk}
            title="Continue on the provider's site to sign the swap in your wallet"
          >
            Open {providerMeta.label} <ExternalLink size={12} />
          </button>
        </div>
      </section>

      <p className="ibn-micro-disclaimer">
        iBank does not custody client assets and earns no spread on swaps. Swap execution
        via a third-party router is at your own risk; verify contract addresses and token
        symbols before signing.
      </p>
    </div>
  )
}
