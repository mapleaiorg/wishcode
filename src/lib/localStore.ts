/**
 * localStorage-backed stores for v1 renderer state that does not yet need
 * a native IPC backend: watchlist, alert rules, address book, swap
 * provider preference.
 *
 * All keys namespaced under `ibn.v1.*` so they can be identified and
 * migrated later when a SQLite service is added.
 */

export type ChainId =
  | 'eth' | 'arbitrum' | 'optimism' | 'base' | 'polygon' | 'bsc'
  | 'btc' | 'solana' | 'tron'

const K_WATCHLIST     = 'ibn.v1.watchlist'
const K_ALERTS        = 'ibn.v1.alerts'
const K_ADDRESS_BOOK  = 'ibn.v1.addressBook'
const K_SWAP_PROVIDER = 'ibn.v1.swap.provider'
const K_EXPORT_JOBS   = 'ibn.v1.export.jobs'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── Watchlist ─────────────────────────────────────────────────────────

const DEFAULT_WATCHLIST = ['BTC', 'ETH', 'SOL', 'ARB', 'OP']

export function getWatchlist(): string[] {
  const list = readJson<string[]>(K_WATCHLIST, DEFAULT_WATCHLIST)
  return Array.isArray(list) && list.length ? list : DEFAULT_WATCHLIST
}
export function addToWatchlist(symbol: string): string[] {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return getWatchlist()
  const cur = getWatchlist()
  if (cur.includes(sym)) return cur
  const next = [...cur, sym]
  writeJson(K_WATCHLIST, next)
  return next
}
export function removeFromWatchlist(symbol: string): string[] {
  const sym = symbol.trim().toUpperCase()
  const next = getWatchlist().filter((s) => s !== sym)
  writeJson(K_WATCHLIST, next)
  return next
}

// ── Alert rules ───────────────────────────────────────────────────────

export type AlertKind = 'priceAbove' | 'priceBelow' | 'concentration' | 'dailyChange'

export interface AlertRule {
  id: string
  kind: AlertKind
  // For priceAbove/priceBelow/dailyChange: symbol + threshold
  symbol?: string
  threshold?: number
  // For concentration: asset symbol + percent cap
  note?: string
  createdAt: number
  lastFired?: number
  enabled: boolean
}

export function getAlerts(): AlertRule[] {
  return readJson<AlertRule[]>(K_ALERTS, [])
}
export function saveAlerts(rules: AlertRule[]): void {
  writeJson(K_ALERTS, rules)
}
export function addAlert(rule: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule {
  const full: AlertRule = {
    ...rule,
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  }
  const cur = getAlerts()
  const next = [full, ...cur]
  saveAlerts(next)
  return full
}
export function removeAlert(id: string): AlertRule[] {
  const next = getAlerts().filter((a) => a.id !== id)
  saveAlerts(next)
  return next
}
export function toggleAlert(id: string): AlertRule[] {
  const next = getAlerts().map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a)
  saveAlerts(next)
  return next
}

// ── Address book ──────────────────────────────────────────────────────

export interface Contact {
  id: string
  label: string
  chain: ChainId
  address: string
  note?: string
  createdAt: number
}

export function getContacts(): Contact[] {
  return readJson<Contact[]>(K_ADDRESS_BOOK, [])
}
export function saveContacts(list: Contact[]): void {
  writeJson(K_ADDRESS_BOOK, list)
}
export function addContact(c: Omit<Contact, 'id' | 'createdAt'>): Contact {
  const full: Contact = {
    ...c,
    id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  }
  saveContacts([full, ...getContacts()])
  return full
}
export function removeContact(id: string): Contact[] {
  const next = getContacts().filter((c) => c.id !== id)
  saveContacts(next)
  return next
}

// ── Swap provider preference ──────────────────────────────────────────

export type SwapProvider = 'uniswap' | 'oneInch' | 'jupiter' | 'raydium' | 'manual'

export interface SwapProviderMeta {
  id: SwapProvider
  label: string
  chains: ChainId[]
  url: string
  note: string
}

export const SWAP_PROVIDERS: SwapProviderMeta[] = [
  {
    id: 'uniswap',
    label: 'Uniswap',
    chains: ['eth', 'arbitrum', 'optimism', 'base', 'polygon'],
    url: 'https://app.uniswap.org',
    note: 'On-chain EVM DEX aggregator. Route built on Uniswap v3 pools.',
  },
  {
    id: 'oneInch',
    label: '1inch',
    chains: ['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc'],
    url: 'https://app.1inch.io',
    note: 'Cross-DEX EVM aggregator. Splits orders across pools for best price.',
  },
  {
    id: 'jupiter',
    label: 'Jupiter',
    chains: ['solana'],
    url: 'https://jup.ag',
    note: 'Solana aggregator. Routes through Raydium, Orca, Phoenix, etc.',
  },
  {
    id: 'raydium',
    label: 'Raydium',
    chains: ['solana'],
    url: 'https://raydium.io',
    note: 'Solana AMM + order book.',
  },
  {
    id: 'manual',
    label: 'Manual (no router)',
    chains: ['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'btc', 'solana', 'tron'],
    url: '',
    note: 'No third-party routing. You construct the transaction yourself.',
  },
]

export function getSwapProvider(): SwapProvider {
  const v = localStorage.getItem(K_SWAP_PROVIDER) as SwapProvider | null
  return v && SWAP_PROVIDERS.some((p) => p.id === v) ? v : 'oneInch'
}
export function setSwapProvider(p: SwapProvider): void {
  try { localStorage.setItem(K_SWAP_PROVIDER, p) } catch {}
}

// ── Export jobs ───────────────────────────────────────────────────────

export interface ExportJob {
  id: string
  kind: 'csv-history'
  chain: string
  address: string
  fromMs: number
  toMs: number
  rows: number
  createdAt: number
}

export function getExportJobs(): ExportJob[] {
  return readJson<ExportJob[]>(K_EXPORT_JOBS, [])
}
export function addExportJob(job: Omit<ExportJob, 'id' | 'createdAt'>): ExportJob {
  const full: ExportJob = {
    ...job,
    id: `export_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  }
  const next = [full, ...getExportJobs()].slice(0, 50)
  writeJson(K_EXPORT_JOBS, next)
  return full
}
