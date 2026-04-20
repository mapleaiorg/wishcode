/**
 * Market-data facade.
 *
 * Sources:
 *   binance     — https://api.binance.com       (spot, no key) — DEFAULT
 *   binanceTest — https://testnet.binance.vision (spot testnet, no key)
 *   coingecko   — https://api.coingecko.com/api/v3 (no key, broader coin coverage)
 *
 * The active source is read from config.trading.marketSource (defaults to
 * "binance"). `setMarketSource()` persists the choice and clears caches.
 *
 * Every public function normalizes to USD quotes. Binance quotes USDT but
 * we treat USDT ≈ USD for display purposes — the chain RPC layer handles
 * on-chain pricing where precision matters.
 *
 * All responses are cached in-memory for SHORT_TTL_MS to stay polite even
 * when skills fan out to many symbols.
 */

import { readConfig, writeConfig } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'

const log = createLogger('trading')

export type MarketSource = 'binance' | 'binanceTest' | 'coingecko'

const SOURCE_URLS: Record<MarketSource, string> = {
  binance:     'https://api.binance.com/api/v3',
  binanceTest: 'https://testnet.binance.vision/api/v3',
  coingecko:   'https://api.coingecko.com/api/v3',
}

const SHORT_TTL_MS = 30_000
const LIST_TTL_MS = 15 * 60_000

// ── Source selection ────────────────────────────────────────────────

export function currentSource(): MarketSource {
  const cfg = readConfig()
  const s = cfg.trading?.marketSource as MarketSource | undefined
  if (s && s in SOURCE_URLS) return s
  return 'binance'
}

export function listSources(): Array<{ id: MarketSource; label: string; note: string }> {
  return [
    { id: 'binance',     label: 'Binance (live)',      note: 'Production spot prices, no API key needed.' },
    { id: 'binanceTest', label: 'Binance Testnet',     note: 'Testnet quotes — safe for testing flows.' },
    { id: 'coingecko',   label: 'CoinGecko (fallback)', note: 'Broader coin coverage; slightly stricter rate limit.' },
  ]
}

export function setMarketSource(source: MarketSource): MarketSource {
  if (!(source in SOURCE_URLS)) throw new Error(`unknown market source: ${source}`)
  writeConfig((cfg) => {
    cfg.trading = cfg.trading ?? {}
    cfg.trading.marketSource = source
    return cfg
  })
  // Bust caches so the next request hits the new source.
  priceCache.clear()
  topCache.ts = 0
  topCache.value = []
  log.info('market source changed', { source })
  return source
}

// ── CoinGecko symbol → id lookup (lazy) ─────────────────────────────

const CG_SEED_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', BNB: 'binancecoin',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', DOT: 'polkadot',
  MATIC: 'matic-network', LINK: 'chainlink', UNI: 'uniswap', ATOM: 'cosmos',
  LTC: 'litecoin', TRX: 'tron', ARB: 'arbitrum', OP: 'optimism',
  APT: 'aptos', SUI: 'sui', NEAR: 'near', USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
}
const cgSymToId: Map<string, string> = new Map(
  Object.entries(CG_SEED_IDS).map(([s, i]) => [s.toUpperCase(), i]),
)
let cgFullListLoadedAt = 0

async function ensureCoingeckoList(): Promise<void> {
  if (Date.now() - cgFullListLoadedAt < LIST_TTL_MS) return
  try {
    const r = await fetch(`${SOURCE_URLS.coingecko}/coins/list`, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return
    const list = await r.json() as Array<{ id: string; symbol: string; name: string }>
    for (const c of list) {
      const sym = c.symbol.toUpperCase()
      if (!cgSymToId.has(sym)) cgSymToId.set(sym, c.id)
    }
    cgFullListLoadedAt = Date.now()
    log.info('coingecko list loaded', { count: list.length })
  } catch (e) {
    log.warn('coingecko list failed', { err: (e as Error).message })
  }
}

// ── Cache ──────────────────────────────────────────────────────────

interface CacheEntry<T> { ts: number; value: T }
const priceCache = new Map<string, CacheEntry<Quote>>()
const topCache: { ts: number; value: Quote[] } = { ts: 0, value: [] }

export interface Quote {
  symbol: string
  priceUsd: number
  change24hPct: number
  marketCapUsd?: number
  volume24hUsd?: number
  updatedAt: number
  source: MarketSource
}

export interface OhlcvCandle {
  ts: number
  open: number; high: number; low: number; close: number; volume: number
}

// ── Binance helpers ────────────────────────────────────────────────

/** Binance quotes symbols as e.g. BTCUSDT. We always pair against USDT. */
function binanceSymbol(sym: string): string {
  const up = sym.toUpperCase()
  if (up === 'USDT') return 'USDCUSDT' // proxy for stablecoin parity
  return `${up}USDT`
}

async function binanceTicker24(src: MarketSource, sym: string): Promise<Quote | null> {
  const base = SOURCE_URLS[src]
  const url = `${base}/ticker/24hr?symbol=${binanceSymbol(sym)}`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (r.status === 400) return null           // unknown symbol
    if (!r.ok) throw new Error(`binance ${r.status}`)
    const j = await r.json() as any
    return {
      symbol: sym.toUpperCase(),
      priceUsd: Number(j.lastPrice ?? 0),
      change24hPct: Number(j.priceChangePercent ?? 0),
      volume24hUsd: Number(j.quoteVolume ?? 0),
      updatedAt: Date.now(),
      source: src,
    }
  } catch (e) {
    log.warn('binance ticker failed', { sym, err: (e as Error).message })
    return null
  }
}

async function binanceKlines(
  src: MarketSource, sym: string, interval: string, limit: number,
): Promise<OhlcvCandle[]> {
  const base = SOURCE_URLS[src]
  const url = `${base}/klines?symbol=${binanceSymbol(sym)}&interval=${interval}&limit=${limit}`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new Error(`binance ${r.status}`)
    const arr = await r.json() as Array<Array<string | number>>
    return arr.map((row) => ({
      ts: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
  } catch (e) {
    log.warn('binance klines failed', { sym, err: (e as Error).message })
    return []
  }
}

async function binanceTopTickers(src: MarketSource, limit: number): Promise<Quote[]> {
  const base = SOURCE_URLS[src]
  try {
    const r = await fetch(`${base}/ticker/24hr`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new Error(`binance ${r.status}`)
    const arr = await r.json() as Array<any>
    const usdtPairs = arr.filter((t) => typeof t.symbol === 'string' && t.symbol.endsWith('USDT'))
    usdtPairs.sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
    return usdtPairs.slice(0, limit).map((t) => ({
      symbol: (t.symbol as string).replace(/USDT$/, ''),
      priceUsd: Number(t.lastPrice ?? 0),
      change24hPct: Number(t.priceChangePercent ?? 0),
      volume24hUsd: Number(t.quoteVolume ?? 0),
      updatedAt: Date.now(),
      source: src,
    }))
  } catch (e) {
    log.warn('binance top tickers failed', { err: (e as Error).message })
    return []
  }
}

// ── CoinGecko helpers ──────────────────────────────────────────────

async function coingeckoPrice(sym: string): Promise<Quote | null> {
  await ensureCoingeckoList()
  const id = cgSymToId.get(sym.toUpperCase())
  if (!id) return null
  try {
    const r = await fetch(
      `${SOURCE_URLS.coingecko}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!r.ok) throw new Error(`coingecko ${r.status}`)
    const arr = await r.json() as Array<any>
    const row = arr[0]; if (!row) return null
    return {
      symbol: sym.toUpperCase(),
      priceUsd: Number(row.current_price ?? 0),
      change24hPct: Number(row.price_change_percentage_24h ?? 0),
      marketCapUsd: row.market_cap,
      volume24hUsd: row.total_volume,
      updatedAt: Date.now(),
      source: 'coingecko',
    }
  } catch (e) {
    log.warn('coingecko price failed', { sym, err: (e as Error).message })
    return null
  }
}

async function coingeckoTopTickers(limit: number): Promise<Quote[]> {
  try {
    const r = await fetch(
      `${SOURCE_URLS.coingecko}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(100, limit)}&page=1&price_change_percentage=24h`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!r.ok) throw new Error(`coingecko ${r.status}`)
    const arr = await r.json() as Array<any>
    return arr.map((row) => ({
      symbol: String(row.symbol ?? '').toUpperCase(),
      priceUsd: Number(row.current_price ?? 0),
      change24hPct: Number(row.price_change_percentage_24h ?? 0),
      marketCapUsd: row.market_cap,
      volume24hUsd: row.total_volume,
      updatedAt: Date.now(),
      source: 'coingecko' as const,
    }))
  } catch (e) {
    log.warn('coingecko top failed', { err: (e as Error).message })
    return []
  }
}

async function coingeckoOhlcv(sym: string, interval: '1d' | '4h' | '1h', limit: number): Promise<OhlcvCandle[]> {
  await ensureCoingeckoList()
  const id = cgSymToId.get(sym.toUpperCase()); if (!id) return []
  const days = interval === '1d'
    ? (limit <= 7 ? 7 : limit <= 14 ? 14 : limit <= 30 ? 30 : limit <= 90 ? 90 : limit <= 180 ? 180 : 365)
    : (limit <= 14 ? 14 : 30)
  try {
    const r = await fetch(
      `${SOURCE_URLS.coingecko}/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (!r.ok) throw new Error(`coingecko ${r.status}`)
    const arr = await r.json() as Array<[number, number, number, number, number]>
    return arr.map(([t, o, h, l, c]) => ({ ts: t, open: o, high: h, low: l, close: c, volume: 0 })).slice(-limit)
  } catch (e) {
    log.warn('coingecko ohlcv failed', { sym, err: (e as Error).message })
    return []
  }
}

// ── Public API ─────────────────────────────────────────────────────

export async function price(symbol: string): Promise<Quote | null> {
  const sym = symbol.toUpperCase()
  const cacheKey = `${currentSource()}:${sym}`
  const cached = priceCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < SHORT_TTL_MS) return cached.value

  const src = currentSource()
  let q: Quote | null = null
  if (src === 'binance' || src === 'binanceTest') {
    q = await binanceTicker24(src, sym)
    // If Binance doesn't list this symbol, fall back to CoinGecko.
    if (!q) q = await coingeckoPrice(sym)
  } else {
    q = await coingeckoPrice(sym)
  }
  if (q) {
    priceCache.set(cacheKey, { ts: Date.now(), value: q })
    emit('trading.price', { symbol: sym, price: q.priceUsd, ts: q.updatedAt })
  }
  return q
}

export async function prices(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {}
  await Promise.all(
    symbols.map(async (s) => {
      const q = await price(s)
      if (q) out[s.toUpperCase()] = q
    }),
  )
  return out
}

export async function topTickers(limit: number = 25): Promise<Quote[]> {
  if (Date.now() - topCache.ts < SHORT_TTL_MS && topCache.value.length >= limit) {
    return topCache.value.slice(0, limit)
  }
  const src = currentSource()
  const value = (src === 'coingecko')
    ? await coingeckoTopTickers(limit)
    : await binanceTopTickers(src, limit)
  if (value.length > 0) {
    topCache.ts = Date.now()
    topCache.value = value
  }
  return value.slice(0, limit)
}

export async function ohlcv(
  symbol: string,
  interval: '1d' | '4h' | '1h' = '1d',
  limit: number = 180,
): Promise<OhlcvCandle[]> {
  const src = currentSource()
  if (src === 'binance' || src === 'binanceTest') {
    const bnInterval = interval === '1d' ? '1d' : interval === '4h' ? '4h' : '1h'
    const candles = await binanceKlines(src, symbol, bnInterval, limit)
    if (candles.length > 0) return candles
  }
  return coingeckoOhlcv(symbol, interval, limit)
}

// ── Live price ticker (optional, wired via config.trading.ticker) ──

let tickerTimer: NodeJS.Timeout | null = null

export async function startTicker(symbols: string[], intervalMs: number = 15_000): Promise<void> {
  stopTicker()
  const syms = symbols.map((s) => s.toUpperCase())
  async function tick() {
    for (const s of syms) { await price(s) }
  }
  await tick()
  tickerTimer = setInterval(tick, intervalMs)
}
export function stopTicker(): void {
  if (tickerTimer) { clearInterval(tickerTimer); tickerTimer = null }
}

// Autostart from config on module load
;(async () => {
  try {
    const cfg = await readConfig()
    const t = cfg.trading?.ticker
    if (t && Array.isArray(t.symbols) && t.symbols.length > 0) {
      await startTicker(t.symbols, t.intervalMs ?? 15_000)
    }
  } catch {}
})()
