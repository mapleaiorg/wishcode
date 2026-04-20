/**
 * HarnessView — engineering harness for backtests, Monte-Carlo, stress,
 * yield projections, and policy checks. Drives the main-process engine
 * via window.ibank.harness.* and subscribes to progress events.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlaskConical, Play, TrendingUp, Activity, ShieldCheck, Coins, BarChart3,
} from 'lucide-react'
import type {
  BacktestResult, MonteCarloResult, StressScenario,
} from '../types'

type Tab = 'backtest' | 'monteCarlo' | 'stress' | 'yield' | 'policy'

export function HarnessView() {
  const [tab, setTab] = useState<Tab>('backtest')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // backtest
  const [btSymbol, setBtSymbol] = useState('BTC')
  const [btStrategy, setBtStrategy] = useState('smaCross')
  const [btFast, setBtFast] = useState('20')
  const [btSlow, setBtSlow] = useState('50')
  const [btDays, setBtDays] = useState('365')
  const [btResult, setBtResult] = useState<BacktestResult | null>(null)

  // monte carlo
  const [mcSymbol, setMcSymbol] = useState('BTC')
  const [mcSpot, setMcSpot] = useState('65000')
  const [mcDrift, setMcDrift] = useState('25')
  const [mcVol, setMcVol] = useState('70')
  const [mcDays, setMcDays] = useState('180')
  const [mcPaths, setMcPaths] = useState('2000')
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)

  // stress
  const [scenarios, setScenarios] = useState<StressScenario[]>([])
  const [stressScenario, setStressScenario] = useState('covid-2020')
  const [stressHoldings, setStressHoldings] = useState('BTC:1,ETH:10,USDC:5000')
  const [stressResult, setStressResult] = useState<any>(null)

  // yield
  const [ySymbol, setYSymbol] = useState('USDC')
  const [yAmount, setYAmount] = useState('10000')
  const [yApy, setYApy] = useState('5.5')
  const [yMonths, setYMonths] = useState('36')
  const [yFee, setYFee] = useState('0')
  const [yResult, setYResult] = useState<any>(null)

  // policy
  const [polAmount, setPolAmount] = useState('1500')
  const [polToken, setPolToken] = useState('USDC')
  const [polCounterparty, setPolCounterparty] = useState('')
  const [polResult, setPolResult] = useState<any>(null)

  useEffect(() => {
    void window.ibank.harness.scenarios().then((s: any) => setScenarios(s ?? []))
    const onProg = window.ibank.harness.onProgress((p: any) => {
      if (typeof p?.pct === 'number') setProgress(p.pct)
    })
    const onRes = window.ibank.harness.onResult(() => setProgress(null))
    return () => { onProg?.(); onRes?.() }
  }, [])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setErr(null); setRunning(true); setProgress(0)
    try { await fn() } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setRunning(false); setProgress(null) }
  }, [])

  const runBacktest = () => run(async () => {
    const args: any = {
      symbol: btSymbol.toUpperCase(),
      strategy: btStrategy,
      params:
        btStrategy === 'smaCross'        ? { fast: Number(btFast), slow: Number(btSlow) } :
        btStrategy === 'momentum'        ? { lookback: Number(btFast), threshold: Number(btSlow) / 100 } :
        btStrategy === 'meanReversion'   ? { lookback: Number(btFast), zScore: Number(btSlow) / 10 } :
        {},
      days: Number(btDays),
    }
    const r = (await window.ibank.harness.backtest(args)) as BacktestResult
    setBtResult(r)
  })

  const runMc = () => run(async () => {
    const r = (await window.ibank.harness.monteCarlo({
      symbol: mcSymbol.toUpperCase(),
      spotUsd: Number(mcSpot),
      annualDriftPct: Number(mcDrift),
      annualVolPct: Number(mcVol),
      horizonDays: Number(mcDays),
      paths: Number(mcPaths),
    })) as MonteCarloResult
    setMcResult(r)
  })

  const runStress = () => run(async () => {
    const holdings: Record<string, number> = {}
    for (const chunk of stressHoldings.split(',')) {
      const [sym, amt] = chunk.split(':').map((s) => s.trim())
      if (sym && amt) holdings[sym.toUpperCase()] = Number(amt)
    }
    const r = await window.ibank.harness.stress({ scenarioId: stressScenario, holdings })
    setStressResult(r)
  })

  const runYield = () => run(async () => {
    const r = await window.ibank.harness.yieldProject({
      symbol: ySymbol.toUpperCase(),
      amount: Number(yAmount),
      apyPct: Number(yApy),
      months: Number(yMonths),
      monthlyFeeUsd: Number(yFee) || undefined,
    })
    setYResult(r)
  })

  const runPolicy = () => run(async () => {
    const r = await window.ibank.harness.policyCheck({
      amountUsd: Number(polAmount),
      token: polToken.toUpperCase(),
      counterparty: polCounterparty || undefined,
    })
    setPolResult(r)
  })

  const equityPath = useMemo(() => {
    if (!btResult?.equity?.length) return ''
    const pts = btResult.equity
    const min = Math.min(...pts.map((p) => p.value))
    const max = Math.max(...pts.map((p) => p.value))
    const w = 600, h = 140
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w
      const y = h - ((p.value - min) / Math.max(1e-9, max - min)) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }, [btResult])

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2><FlaskConical size={14} style={{ verticalAlign: -2 }} /> Harness</h2>
        {running && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            Running{progress != null ? ` · ${Math.round(progress)}%` : '…'}
          </div>
        )}
      </header>

      <nav style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--line)' }}>
        {([
          ['backtest',   'Backtest',    <TrendingUp size={12} />],
          ['monteCarlo', 'Monte-Carlo', <Activity size={12} />],
          ['stress',     'Stress',      <ShieldCheck size={12} />],
          ['yield',      'Yield',       <Coins size={12} />],
          ['policy',     'Policy',      <BarChart3 size={12} />],
        ] as Array<[Tab, string, React.ReactNode]>).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="ibn-btn"
            style={{
              border: 'none', borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none', padding: '6px 12px', fontSize: 12,
              color: tab === k ? 'var(--text)' : 'var(--text-mute)',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </nav>

      {err && <div style={{ color: 'var(--err)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {tab === 'backtest' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 10 }}>
            <input className="ibn-input" placeholder="Symbol" value={btSymbol} onChange={(e) => setBtSymbol(e.target.value)} />
            <select className="ibn-input" value={btStrategy} onChange={(e) => setBtStrategy(e.target.value)}>
              <option value="smaCross">SMA cross</option>
              <option value="momentum">Momentum</option>
              <option value="meanReversion">Mean reversion</option>
              <option value="buyAndHold">Buy & hold</option>
            </select>
            <input className="ibn-input" placeholder={btStrategy === 'smaCross' ? 'fast' : btStrategy === 'momentum' ? 'lookback' : 'lookback'} value={btFast} onChange={(e) => setBtFast(e.target.value)} />
            <input className="ibn-input" placeholder={btStrategy === 'smaCross' ? 'slow' : btStrategy === 'momentum' ? 'threshold %' : 'zScore×10'} value={btSlow} onChange={(e) => setBtSlow(e.target.value)} />
            <input className="ibn-input" placeholder="days" value={btDays} onChange={(e) => setBtDays(e.target.value)} />
          </div>
          <button className="ibn-btn primary" disabled={running} onClick={runBacktest}><Play size={12} /> Run backtest</button>

          {btResult && (
            <div style={{ marginTop: 16 }}>
              <Metrics rows={[
                ['Total return %',  btResult.metrics.totalReturnPct.toFixed(2)],
                ['CAGR %',          btResult.metrics.cagrPct.toFixed(2)],
                ['Sharpe',          btResult.metrics.sharpe.toFixed(2)],
                ['Sortino',         btResult.metrics.sortino.toFixed(2)],
                ['Max drawdown %',  btResult.metrics.maxDrawdownPct.toFixed(2)],
                ['Hit rate %',      btResult.metrics.hitRatePct.toFixed(2)],
                ['Trades',          String(btResult.metrics.trades)],
              ]} />
              <svg viewBox="0 0 600 140" width="100%" height={140} style={{ marginTop: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <path d={equityPath} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
              </svg>
            </div>
          )}
        </div>
      )}

      {tab === 'monteCarlo' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 10 }}>
            <input className="ibn-input" placeholder="Symbol" value={mcSymbol} onChange={(e) => setMcSymbol(e.target.value)} />
            <input className="ibn-input" placeholder="Spot USD" value={mcSpot} onChange={(e) => setMcSpot(e.target.value)} />
            <input className="ibn-input" placeholder="Drift %" value={mcDrift} onChange={(e) => setMcDrift(e.target.value)} />
            <input className="ibn-input" placeholder="Vol %" value={mcVol} onChange={(e) => setMcVol(e.target.value)} />
            <input className="ibn-input" placeholder="Days" value={mcDays} onChange={(e) => setMcDays(e.target.value)} />
            <input className="ibn-input" placeholder="Paths" value={mcPaths} onChange={(e) => setMcPaths(e.target.value)} />
          </div>
          <button className="ibn-btn primary" disabled={running} onClick={runMc}><Play size={12} /> Simulate</button>

          {mcResult && (
            <div style={{ marginTop: 16 }}>
              <Metrics rows={[
                ['p5',             `$${mcResult.endPrices.p05.toFixed(2)}`],
                ['p25',            `$${mcResult.endPrices.p25.toFixed(2)}`],
                ['median',         `$${mcResult.endPrices.p50.toFixed(2)}`],
                ['p75',            `$${mcResult.endPrices.p75.toFixed(2)}`],
                ['p95',            `$${mcResult.endPrices.p95.toFixed(2)}`],
                ['VaR 95 %',       mcResult.var95Pct.toFixed(2) + '%'],
                ['CVaR 95 %',      mcResult.cvar95Pct.toFixed(2) + '%'],
                ['Prob of loss %', mcResult.probOfLossPct.toFixed(2) + '%'],
              ]} />
              <svg viewBox={`0 0 600 160`} width="100%" height={160} style={{ marginTop: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                {mcResult.pathsPreview.slice(0, 50).map((path, i) => {
                  const max = Math.max(...path); const min = Math.min(...path)
                  const range = Math.max(1e-9, max - min)
                  const d = path.map((v, j) => {
                    const x = (j / (path.length - 1)) * 600
                    const y = 160 - ((v - min) / range) * 160
                    return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
                  }).join(' ')
                  return <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="0.5" opacity="0.35" />
                })}
              </svg>
            </div>
          )}
        </div>
      )}

      {tab === 'stress' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 10 }}>
            <select className="ibn-input" value={stressScenario} onChange={(e) => setStressScenario(e.target.value)}>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="ibn-input" placeholder="Holdings — SYM:amount,…" value={stressHoldings} onChange={(e) => setStressHoldings(e.target.value)} />
          </div>
          <button className="ibn-btn primary" disabled={running} onClick={runStress}><Play size={12} /> Apply shock</button>

          {stressResult && (
            <pre className="ibn-card" style={{ padding: 12, marginTop: 12, fontSize: 11, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(stressResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {tab === 'yield' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 10 }}>
            <input className="ibn-input" placeholder="Symbol" value={ySymbol} onChange={(e) => setYSymbol(e.target.value)} />
            <input className="ibn-input" placeholder="Principal" value={yAmount} onChange={(e) => setYAmount(e.target.value)} />
            <input className="ibn-input" placeholder="APY %" value={yApy} onChange={(e) => setYApy(e.target.value)} />
            <input className="ibn-input" placeholder="Months" value={yMonths} onChange={(e) => setYMonths(e.target.value)} />
            <input className="ibn-input" placeholder="Monthly fee USD" value={yFee} onChange={(e) => setYFee(e.target.value)} />
          </div>
          <button className="ibn-btn primary" disabled={running} onClick={runYield}><Play size={12} /> Project</button>

          {yResult && (
            <pre className="ibn-card" style={{ padding: 12, marginTop: 12, fontSize: 11, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(yResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {tab === 'policy' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <input className="ibn-input" placeholder="Amount USD" value={polAmount} onChange={(e) => setPolAmount(e.target.value)} />
            <input className="ibn-input" placeholder="Token" value={polToken} onChange={(e) => setPolToken(e.target.value)} />
            <input className="ibn-input" placeholder="Counterparty (optional)" value={polCounterparty} onChange={(e) => setPolCounterparty(e.target.value)} />
          </div>
          <button className="ibn-btn primary" disabled={running} onClick={runPolicy}><Play size={12} /> Check</button>

          {polResult && (
            <pre className="ibn-card" style={{ padding: 12, marginTop: 12, fontSize: 11, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(polResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function Metrics({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
      {rows.map(([k, v]) => (
        <div key={k} className="ibn-card" style={{ padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase' }}>{k}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
        </div>
      ))}
    </div>
  )
}
