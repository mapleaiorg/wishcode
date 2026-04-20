/**
 * Harness engine — pure-TS quantitative harnesses for the FinancialBuddies
 * to call into, and for the UI to drive directly from the Views panel.
 *
 * Scope (phase 1 — all in-process, no external compute):
 *   1. **Backtest harness** — replay a simple strategy against a fetched
 *      OHLCV series, compute equity curve + metrics (CAGR, Sharpe,
 *      max-drawdown, hit-rate).
 *   2. **Scenario harness** — Monte-Carlo GBM simulation of one or many
 *      assets over N paths; extract VaR / CVaR / probability-of-loss.
 *   3. **Stress harness** — apply a named preset shock (2008-GFC,
 *      COVID-crash, LUNA-collapse, FTX, China-ban) to current holdings
 *      and report $-impact per position.
 *   4. **Policy harness** — dry-run a proposed wallet-spend against the
 *      spending policy + current balances, returning pass/fail + reasons.
 *   5. **Yield harness** — project APR/APY outcomes over time with
 *      compounding + optional fee drag.
 *
 * Every harness run emits `harness.progress` events (for long MC sims)
 * and a terminal `harness.result` carrying a compact report object. Results
 * are cached to `~/.ibank/harness/runs/<runId>.json` for later retrieval.
 *
 * No harness depends on keystore unlock — they're all read-only. The
 * Policy harness is the exception: it reads the policy file + balances and
 * simulates the decision path, returning a structured verdict.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { paths, ensureAllDirs } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'
import { ohlcv, type OhlcvCandle } from '../trading/market.js'

const log = createLogger('harness')

// ── Types ──────────────────────────────────────────────────────────

export interface RunHandle { runId: string; kind: HarnessKind; startedAt: number }

export type HarnessKind =
  | 'backtest'
  | 'monteCarlo'
  | 'stress'
  | 'policy'
  | 'yield'

export interface BacktestStrategy {
  /** Human name, e.g. "sma-20-50-cross". */
  name: string
  /** Decide buy/sell/flat given bar index + past bars. Return +1 long, -1 short, 0 flat. */
  onBar: (bar: OhlcvCandle, history: OhlcvCandle[]) => -1 | 0 | 1
}

export interface BacktestResult {
  runId: string
  kind: 'backtest'
  symbol: string
  strategy: string
  startTs: number
  endTs: number
  bars: number
  metrics: {
    totalReturnPct: number
    cagrPct: number
    sharpe: number
    sortino: number
    maxDrawdownPct: number
    hitRatePct: number
    trades: number
  }
  equity: Array<{ ts: number; value: number; position: -1 | 0 | 1 }>
}

export interface MonteCarloInput {
  symbol: string
  spotUsd: number
  annualDriftPct: number    // μ
  annualVolPct: number      // σ
  horizonDays: number
  paths: number
  /** Optional — if passed, per-path drawdown vs. this benchmark return. */
  benchmarkAnnualPct?: number
}

export interface MonteCarloResult {
  runId: string
  kind: 'monteCarlo'
  input: MonteCarloInput
  endPrices: { p05: number; p25: number; p50: number; p75: number; p95: number }
  endReturns:  { p05: number; p25: number; p50: number; p75: number; p95: number }
  var95Pct: number
  cvar95Pct: number
  probOfLossPct: number
  pathsPreview: number[][]  // first 50 paths only, for charting
}

export interface StressScenario {
  id: string
  name: string
  /** Per-symbol % shock. Missing → defaultPct. */
  shocks: Record<string, number>
  /** Fallback shock for any symbol not called out (e.g. -0.5 = −50%). */
  defaultPct: number
  /** Correlated drawdown of traditional assets (optional). */
  tradFi?: { sp500Pct: number; goldPct: number; dollarPct: number }
  notes: string
}

export interface StressResult {
  runId: string
  kind: 'stress'
  scenario: StressScenario
  before: Array<{ symbol: string; valueUsd: number }>
  after:  Array<{ symbol: string; valueUsd: number; shockPct: number }>
  totalBeforeUsd: number
  totalAfterUsd: number
  drawdownPct: number
}

export interface YieldInput {
  principalUsd: number
  aprPct: number
  compoundPerYear: number
  years: number
  monthlyFeeUsd?: number
}

export interface YieldResult {
  runId: string
  kind: 'yield'
  input: YieldInput
  finalUsd: number
  interestUsd: number
  effectiveApyPct: number
  curve: Array<{ year: number; value: number }>
}

export type HarnessResult = BacktestResult | MonteCarloResult | StressResult | YieldResult | PolicyResult

export interface PolicyResult {
  runId: string
  kind: 'policy'
  pass: boolean
  reasons: string[]
  details: Record<string, unknown>
}

// ── Run persistence ────────────────────────────────────────────────

function runsDir(): string { return path.join(paths().harnessDir, 'runs') }
function saveRun(r: HarnessResult): void {
  ensureAllDirs()
  if (!fs.existsSync(runsDir())) fs.mkdirSync(runsDir(), { recursive: true, mode: 0o700 })
  const f = path.join(runsDir(), `${r.runId}.json`)
  fs.writeFileSync(f, JSON.stringify(r, null, 2), { mode: 0o600 })
}

export function listRuns(limit = 50): Array<{ runId: string; kind: HarnessKind; savedAt: number }> {
  ensureAllDirs()
  if (!fs.existsSync(runsDir())) return []
  return fs.readdirSync(runsDir())
    .filter((n) => n.endsWith('.json'))
    .map((n) => {
      const stat = fs.statSync(path.join(runsDir(), n))
      return { runId: n.replace(/\.json$/, ''), kind: 'backtest' as HarnessKind, savedAt: stat.mtimeMs }
    })
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, limit)
}

export function readRun(runId: string): HarnessResult | null {
  const f = path.join(runsDir(), `${runId}.json`)
  if (!fs.existsSync(f)) return null
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) as HarnessResult } catch { return null }
}

function newRunId(kind: HarnessKind): string {
  return `${kind}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`
}

// ── 1) Backtest ────────────────────────────────────────────────────

/**
 * Long-flat-short backtest on a single symbol. Strategies below ship a
 * small library of classics — SMA-cross, momentum, mean-revert.
 */
export async function runBacktest(args: {
  symbol: string
  strategy: BacktestStrategy
  interval?: '1h' | '4h' | '1d'
  limit?: number
  /** Starting capital; cosmetic — metrics are return-based. */
  capital?: number
}): Promise<BacktestResult> {
  const { symbol, strategy } = args
  const candles = await ohlcv(symbol, args.interval ?? '1d', args.limit ?? 365) as OhlcvCandle[]
  if (candles.length < 20) throw new Error(`not enough candles for ${symbol}: ${candles.length}`)

  const runId = newRunId('backtest')
  emit('harness.progress', { runId, kind: 'backtest', phase: 'start', bars: candles.length })

  let position: -1 | 0 | 1 = 0
  let equity = args.capital ?? 10_000
  const baseline = equity
  const peaks: number[] = [equity]
  const trades: Array<{ entry: number; exit: number; pnl: number }> = []
  let entryPrice = 0
  const curve: BacktestResult['equity'] = []
  const rets: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]
    const bar = candles[i]
    // Mark-to-market
    if (position !== 0) {
      const ret = position === 1 ? (bar.close / prev.close) - 1 : 1 - (bar.close / prev.close)
      equity = equity * (1 + ret)
      rets.push(ret)
    } else {
      rets.push(0)
    }
    peaks.push(Math.max(peaks[peaks.length - 1], equity))
    const signal = strategy.onBar(bar, candles.slice(0, i + 1))
    if (signal !== position) {
      if (position !== 0) {
        const pnl = position === 1 ? (bar.close - entryPrice) : (entryPrice - bar.close)
        trades.push({ entry: entryPrice, exit: bar.close, pnl })
      }
      position = signal
      entryPrice = bar.close
    }
    curve.push({ ts: bar.ts, value: equity, position })
  }

  const start = candles[0].ts
  const end = candles[candles.length - 1].ts
  const yrs = Math.max(1e-9, (end - start) / (365 * 24 * 3_600_000))
  const totalRet = equity / baseline - 1
  const cagr = Math.pow(equity / baseline, 1 / yrs) - 1
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length)
  const std = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length))
  const downside = rets.filter((r) => r < 0)
  const downstd = downside.length
    ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length)
    : std
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(365)
  const sortino = downstd === 0 ? 0 : (mean / downstd) * Math.sqrt(365)
  const maxDD = Math.min(
    ...curve.map((c, i) => c.value / peaks[i + 1] - 1),
  )
  const hit = trades.length === 0
    ? 0
    : trades.filter((t) => t.pnl > 0).length / trades.length

  const result: BacktestResult = {
    runId, kind: 'backtest',
    symbol, strategy: strategy.name,
    startTs: start, endTs: end,
    bars: candles.length,
    metrics: {
      totalReturnPct: +(totalRet * 100).toFixed(2),
      cagrPct: +(cagr * 100).toFixed(2),
      sharpe: +sharpe.toFixed(2),
      sortino: +sortino.toFixed(2),
      maxDrawdownPct: +(maxDD * 100).toFixed(2),
      hitRatePct: +(hit * 100).toFixed(1),
      trades: trades.length,
    },
    equity: curve,
  }
  saveRun(result)
  emit('harness.result', { runId, kind: 'backtest', result })
  log.info('backtest done', { symbol, strategy: strategy.name, metrics: result.metrics })
  return result
}

// ── Strategy library ───────────────────────────────────────────────

export const STRATEGIES = {
  smaCross(fast = 20, slow = 50): BacktestStrategy {
    return {
      name: `sma-${fast}-${slow}-cross`,
      onBar(_bar, history) {
        if (history.length < slow) return 0
        const recent = history.slice(-slow)
        const fastMa = mean(recent.slice(-fast).map((c) => c.close))
        const slowMa = mean(recent.map((c) => c.close))
        return fastMa > slowMa ? 1 : -1
      },
    }
  },
  momentum(lookback = 30, threshold = 0.05): BacktestStrategy {
    return {
      name: `momentum-${lookback}-${threshold}`,
      onBar(_bar, history) {
        if (history.length < lookback) return 0
        const past = history[history.length - lookback].close
        const now = history[history.length - 1].close
        const ret = now / past - 1
        if (ret > threshold) return 1
        if (ret < -threshold) return -1
        return 0
      },
    }
  },
  meanReversion(lookback = 20, zScore = 1.8): BacktestStrategy {
    return {
      name: `mean-reversion-${lookback}-z${zScore}`,
      onBar(_bar, history) {
        if (history.length < lookback) return 0
        const window = history.slice(-lookback).map((c) => c.close)
        const m = mean(window)
        const s = Math.sqrt(window.reduce((a, x) => a + (x - m) ** 2, 0) / window.length) || 1
        const z = (history[history.length - 1].close - m) / s
        if (z > zScore) return -1
        if (z < -zScore) return 1
        return 0
      },
    }
  },
  buyAndHold(): BacktestStrategy {
    return { name: 'buy-and-hold', onBar: () => 1 }
  },
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0; for (const x of xs) s += x
  return s / xs.length
}

// ── 2) Monte-Carlo GBM ─────────────────────────────────────────────

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const runId = newRunId('monteCarlo')
  emit('harness.progress', { runId, kind: 'monteCarlo', phase: 'start', paths: input.paths })
  const dt = 1 / 365
  const mu = input.annualDriftPct / 100
  const sigma = input.annualVolPct / 100
  const steps = input.horizonDays
  const endPrices: number[] = []
  const preview: number[][] = []

  for (let i = 0; i < input.paths; i++) {
    let s = input.spotUsd
    const path: number[] = i < 50 ? [s] : []
    for (let t = 0; t < steps; t++) {
      const z = randNormal()
      s *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z)
      if (i < 50) path.push(s)
    }
    endPrices.push(s)
    if (i < 50) preview.push(path)
    if (input.paths >= 1000 && i % Math.ceil(input.paths / 20) === 0) {
      emit('harness.progress', { runId, kind: 'monteCarlo', phase: 'running', done: i, total: input.paths })
    }
  }

  endPrices.sort((a, b) => a - b)
  const pick = (q: number) => endPrices[Math.floor(q * (endPrices.length - 1))]
  const endReturns = endPrices.map((p) => p / input.spotUsd - 1)
  endReturns.sort((a, b) => a - b)
  const pickR = (q: number) => endReturns[Math.floor(q * (endReturns.length - 1))]
  const var95 = -pickR(0.05)
  const tail = endReturns.slice(0, Math.floor(0.05 * endReturns.length))
  const cvar95 = tail.length
    ? -tail.reduce((a, b) => a + b, 0) / tail.length
    : var95
  const probLoss = endReturns.filter((r) => r < 0).length / endReturns.length

  const result: MonteCarloResult = {
    runId, kind: 'monteCarlo', input,
    endPrices: {
      p05: +pick(0.05).toFixed(2), p25: +pick(0.25).toFixed(2), p50: +pick(0.5).toFixed(2),
      p75: +pick(0.75).toFixed(2), p95: +pick(0.95).toFixed(2),
    },
    endReturns: {
      p05: +(pickR(0.05) * 100).toFixed(2), p25: +(pickR(0.25) * 100).toFixed(2),
      p50: +(pickR(0.5) * 100).toFixed(2),  p75: +(pickR(0.75) * 100).toFixed(2),
      p95: +(pickR(0.95) * 100).toFixed(2),
    },
    var95Pct: +(var95 * 100).toFixed(2),
    cvar95Pct: +(cvar95 * 100).toFixed(2),
    probOfLossPct: +(probLoss * 100).toFixed(1),
    pathsPreview: preview,
  }
  saveRun(result)
  emit('harness.result', { runId, kind: 'monteCarlo', result })
  log.info('monte-carlo done', { symbol: input.symbol, var95: result.var95Pct })
  return result
}

/** Box-Muller N(0,1). */
function randNormal(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

// ── 3) Stress harness ──────────────────────────────────────────────

/** Preset shocks, grounded in historical max-drawdowns (approximate). */
export const PRESET_SCENARIOS: StressScenario[] = [
  {
    id: 'covid-2020', name: 'COVID crash (Mar 2020)',
    shocks: { BTC: -0.5, ETH: -0.6, SOL: -0.75, USDC: 0, USDT: -0.01 },
    defaultPct: -0.55,
    tradFi: { sp500Pct: -0.34, goldPct: 0.04, dollarPct: 0.06 },
    notes: '20-day drawdown during initial COVID-19 panic. Stables held peg.',
  },
  {
    id: 'luna-2022', name: 'LUNA / UST collapse (May 2022)',
    shocks: { LUNA: -0.99, UST: -0.99, BTC: -0.3, ETH: -0.4, SOL: -0.55, USDT: -0.05 },
    defaultPct: -0.4,
    notes: 'Algorithmic stablecoin implosion cascading to majors.',
  },
  {
    id: 'ftx-2022', name: 'FTX insolvency (Nov 2022)',
    shocks: { FTT: -0.95, SOL: -0.55, BTC: -0.25, ETH: -0.28 },
    defaultPct: -0.35,
    notes: 'CEX failure; counterparty risk across ecosystem.',
  },
  {
    id: 'gfc-2008', name: '2008 GFC analog',
    shocks: { BTC: -0.8, ETH: -0.85 },
    defaultPct: -0.75,
    tradFi: { sp500Pct: -0.55, goldPct: 0.05, dollarPct: 0.1 },
    notes: 'Hypothetical — crypto did not exist in current form; scaled from equities.',
  },
  {
    id: 'china-ban', name: 'China mining ban (May 2021)',
    shocks: { BTC: -0.5, ETH: -0.55, BNB: -0.4 },
    defaultPct: -0.45,
    notes: 'Mining-capacity flight + regulatory shock.',
  },
]

export function runStress(args: {
  scenarioId: string
  holdings: Array<{ symbol: string; valueUsd: number }>
}): StressResult {
  const s = PRESET_SCENARIOS.find((x) => x.id === args.scenarioId)
  if (!s) throw new Error('unknown scenario: ' + args.scenarioId)
  const runId = newRunId('stress')
  const before = args.holdings.slice()
  const after = before.map(({ symbol, valueUsd }) => {
    const shock = s.shocks[symbol.toUpperCase()] ?? s.defaultPct
    return { symbol, valueUsd: valueUsd * (1 + shock), shockPct: shock * 100 }
  })
  const totalBefore = before.reduce((a, b) => a + b.valueUsd, 0)
  const totalAfter = after.reduce((a, b) => a + b.valueUsd, 0)
  const result: StressResult = {
    runId, kind: 'stress', scenario: s,
    before, after,
    totalBeforeUsd: +totalBefore.toFixed(2),
    totalAfterUsd: +totalAfter.toFixed(2),
    drawdownPct: totalBefore === 0 ? 0 : +(((totalAfter / totalBefore) - 1) * 100).toFixed(2),
  }
  saveRun(result)
  emit('harness.result', { runId, kind: 'stress', result })
  return result
}

// ── 4) Policy harness ──────────────────────────────────────────────

import { getPolicy } from '../wallet/policy.js'

/**
 * Dry-run a proposed spend against the current policy. Does NOT touch the
 * keystore. Returns pass/fail + the matching rule reasons.
 */
export function runPolicyCheck(args: {
  chain: string
  toAddress: string
  amountUsd: number
  category?: 'send' | 'swap' | 'nft_transfer'
  currentBalancesUsd?: Record<string, number>
}): PolicyResult {
  const runId = newRunId('policy')
  const policy = getPolicy() as any
  const reasons: string[] = []
  let pass = true
  const maxPerTx = policy?.maxPerTxUsd ?? Infinity
  const dailyCap  = policy?.dailyCapUsd ?? Infinity
  const allowList = policy?.allowListAddresses as string[] | undefined
  const blockList = policy?.blockListAddresses as string[] | undefined
  const reqConfirm = policy?.requireConfirmAboveUsd ?? 100

  if (args.amountUsd > maxPerTx) { pass = false; reasons.push(`amount > maxPerTxUsd (${maxPerTx})`) }
  if (args.amountUsd > dailyCap)  { pass = false; reasons.push(`amount > dailyCapUsd (${dailyCap})`) }
  if (blockList?.some((a) => a.toLowerCase() === args.toAddress.toLowerCase())) {
    pass = false; reasons.push('destination on block list')
  }
  if (allowList && allowList.length > 0 && !allowList.some((a) => a.toLowerCase() === args.toAddress.toLowerCase())) {
    pass = false; reasons.push('destination not on allow list')
  }
  if (args.amountUsd > reqConfirm) {
    reasons.push(`amount > requireConfirmAboveUsd (${reqConfirm}) — user confirmation required`)
  }
  const result: PolicyResult = {
    runId, kind: 'policy', pass, reasons,
    details: { args, policySnapshot: policy },
  }
  saveRun(result)
  emit('harness.result', { runId, kind: 'policy', result })
  return result
}

// ── 5) Yield projection ────────────────────────────────────────────

export function runYield(input: YieldInput): YieldResult {
  const runId = newRunId('yield')
  const r = input.aprPct / 100
  const n = input.compoundPerYear || 1
  const years = input.years
  const curve: YieldResult['curve'] = []
  let value = input.principalUsd
  for (let y = 0; y <= years; y++) {
    if (y === 0) { curve.push({ year: 0, value }); continue }
    const grown = value * Math.pow(1 + r / n, n)
    const fee = (input.monthlyFeeUsd ?? 0) * 12
    value = Math.max(0, grown - fee)
    curve.push({ year: y, value: +value.toFixed(2) })
  }
  const interest = value - input.principalUsd
  const apy = Math.pow(value / input.principalUsd, 1 / Math.max(0.0001, years)) - 1
  const result: YieldResult = {
    runId, kind: 'yield',
    input,
    finalUsd: +value.toFixed(2),
    interestUsd: +interest.toFixed(2),
    effectiveApyPct: +(apy * 100).toFixed(2),
    curve,
  }
  saveRun(result)
  emit('harness.result', { runId, kind: 'yield', result })
  return result
}
