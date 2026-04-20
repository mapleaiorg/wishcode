/**
 * TokensView — token information pages.
 *
 * Compliance-safe, non-advice research: pulls price + 24h change + mcap
 * + volume, then layers risk notes and a glossary "how this works"
 * block. Educational only.
 */

import React, { useCallback, useState } from 'react'
import { Search, ExternalLink, Info, ShieldAlert } from 'lucide-react'
import { DisclaimerBanner } from '../../components/DisclaimerBanner'
import { TOKEN_RESEARCH_DISCLOSURE } from '../../lib/disclosures'
import type { Quote } from '../../types'

interface TokenResearch {
  symbol: string
  quote: Quote | null
  note: string
  risks: string[]
  officialUrls: Array<{ label: string; url: string }>
}

const KNOWN: Record<string, Omit<TokenResearch, 'quote'>> = {
  BTC: {
    symbol: 'BTC',
    note:
      'Bitcoin is a permissionless peer-to-peer digital asset secured by proof-of-work. ' +
      'New units are issued through block rewards on a fixed supply schedule capped at 21 million.',
    risks: [
      'High historical price volatility — large drawdowns are common.',
      'Regulatory treatment varies significantly by jurisdiction.',
      'Custodial exchanges have historically failed — self-custody shifts risk to key management.',
    ],
    officialUrls: [
      { label: 'bitcoin.org', url: 'https://bitcoin.org' },
      { label: 'Whitepaper', url: 'https://bitcoin.org/bitcoin.pdf' },
    ],
  },
  ETH: {
    symbol: 'ETH',
    note:
      'Ethereum is a proof-of-stake smart-contract platform. ETH secures the network and ' +
      'is used to pay gas fees. EIP-1559 introduced a base fee that is burned, partially ' +
      'offsetting new issuance.',
    risks: [
      'Smart-contract risk — bugs in upstream protocols can cascade.',
      'Staking rewards depend on network participation and can change.',
      'Gas fee spikes during demand peaks can affect transaction economics.',
    ],
    officialUrls: [
      { label: 'ethereum.org', url: 'https://ethereum.org' },
    ],
  },
  SOL: {
    symbol: 'SOL',
    note:
      'Solana is a high-throughput proof-of-stake chain with a parallelized transaction ' +
      'scheduler. SOL is used for gas and staking.',
    risks: [
      'Historical network outages affecting transaction finality.',
      'Validator hardware requirements concentrate node operation.',
    ],
    officialUrls: [
      { label: 'solana.com', url: 'https://solana.com' },
    ],
  },
}

function fmtUsd(n?: number): string {
  if (n == null || !isFinite(n)) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`
  if (n >= 1)             return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

export function TokensView() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<TokenResearch | null>(null)

  const search = useCallback(async () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return
    setErr(null)
    setLoading(true)
    setResult(null)
    try {
      const q = await window.ibank.trading.price(sym)
      const known = KNOWN[sym]
      setResult({
        symbol: sym,
        quote: q as Quote | null,
        note: known?.note ?? `Public market data for ${sym}. iBank does not ship project-specific editorial commentary for this token; verify details against the token's official sources.`,
        risks: known?.risks ?? [
          'Unknown smart-contract or custody risks — verify the contract address from an official source before interacting.',
          'Lower-liquidity assets can slip substantially on large trades.',
          'Tokens sharing tickers across chains can be confused for one another — always double-check the chain and contract.',
        ],
        officialUrls: known?.officialUrls ?? [],
      })
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [input])

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Tokens</h2>
      </header>

      <DisclaimerBanner surface="tokens" text={TOKEN_RESEARCH_DISCLOSURE} />

      <section className="ibn-filter-row" style={{ marginTop: 8 }}>
        <label className="ibn-filter" style={{ flex: 1 }}>
          <Search size={12} />
          <span>Symbol</span>
          <input
            type="text"
            placeholder="BTC, ETH, SOL, ARB, …"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="ibn-btn primary" onClick={() => void search()} disabled={loading}>
            {loading ? 'Searching…' : 'Research'}
          </button>
        </label>
      </section>

      {err && <div className="ibn-error-banner">{err}</div>}
      {!result && !loading && (
        <div className="ibn-muted">
          Enter a symbol above to pull public market data and risk notes.
        </div>
      )}

      {result && (
        <>
          <section className="ibn-card">
            <h3 className="ibn-card-title">
              <Info size={13} /> {result.symbol}
            </h3>
            {result.quote ? (
              <div className="ibn-kv-grid">
                <div><span className="ibn-muted">Price</span><strong>{fmtUsd(result.quote.priceUsd)}</strong></div>
                <div><span className="ibn-muted">24h change</span>
                  <strong className={result.quote.change24hPct >= 0 ? 'ibn-up' : 'ibn-down'}>
                    {result.quote.change24hPct.toFixed(2)}%
                  </strong>
                </div>
                <div><span className="ibn-muted">Market cap</span><strong>{fmtUsd(result.quote.marketCapUsd)}</strong></div>
                <div><span className="ibn-muted">Volume 24h</span><strong>{fmtUsd(result.quote.volume24hUsd)}</strong></div>
              </div>
            ) : (
              <div className="ibn-muted">No market data available for {result.symbol}.</div>
            )}
            <p style={{ marginTop: 10 }}>{result.note}</p>
          </section>

          <section className="ibn-card">
            <h3 className="ibn-card-title"><ShieldAlert size={13} /> Risk overview</h3>
            <ul className="ibn-bullets">
              {result.risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>

          {result.officialUrls.length > 0 && (
            <section className="ibn-card">
              <h3 className="ibn-card-title">Official sources</h3>
              <ul className="ibn-bullets">
                {result.officialUrls.map((u) => (
                  <li key={u.url}>
                    <button
                      className="ibn-link-btn"
                      onClick={() => window.ibank.app.openExternal(u.url)}
                    >
                      {u.label} <ExternalLink size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
