/**
 * On-chain transaction history.
 *
 * Strategy per family:
 *   - BTC: Blockstream public API — `/address/{addr}/txs` returns the last 25
 *     confirmed + all unconfirmed. No API key required.
 *   - EVM: Etherscan-family `txlist` endpoint if the user has an API key
 *     configured at config.wallet.etherscanApiKey (or per-chain override);
 *     otherwise falls back to the local sent-log (txs we broadcast ourselves).
 *   - Solana / TRON: local sent-log only (phase 1).
 *
 * Every entry also looks up the user's private sent-log so pending broadcasts
 * show up immediately, merged by hash with any matching confirmed entry.
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths } from '../core/config.js'
import { readConfig } from '../core/config.js'
import { getRpcUrl } from './rpc.js'
import { CHAINS, type ChainId } from './chains.js'

export interface TxEntry {
  chain: ChainId
  hash: string
  direction: 'in' | 'out' | 'self'
  from: string
  to: string
  amount: string          // decimal string, human-readable, native symbol
  amountRaw: string       // integer string (wei/sats/lamports)
  symbol: string
  feeRaw?: string
  feeSymbol?: string
  timestamp?: number      // unix seconds
  blockNumber?: number
  status: 'pending' | 'confirmed' | 'failed'
  explorerUrl?: string
  note?: string
}

// ── Local sent log (always available) ──────────────────────────────

interface SentLogFile {
  version: 1
  entries: TxEntry[]
}

function sentLogPath(): string {
  return path.join(paths().walletDir, 'sent-log.json')
}

function readSentLog(): SentLogFile {
  const p = sentLogPath()
  if (!fs.existsSync(p)) return { version: 1, entries: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return raw.version === 1 ? raw : { version: 1, entries: [] }
  } catch { return { version: 1, entries: [] } }
}

function writeSentLog(file: SentLogFile): void {
  fs.writeFileSync(sentLogPath(), JSON.stringify(file, null, 2), { mode: 0o600 })
}

export function appendSentTx(entry: TxEntry): void {
  const log = readSentLog()
  // Deduplicate by hash+chain if re-broadcast
  log.entries = log.entries.filter(e => !(e.chain === entry.chain && e.hash === entry.hash))
  log.entries.unshift(entry)
  // Keep last 200 entries
  log.entries = log.entries.slice(0, 200)
  writeSentLog(log)
}

export function localSentEntries(chain?: ChainId, address?: string): TxEntry[] {
  const all = readSentLog().entries
  return all.filter(e => {
    if (chain && e.chain !== chain) return false
    if (address && e.from.toLowerCase() !== address.toLowerCase()) return false
    return true
  })
}

function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < 0n
  const abs = neg ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  const out = fracStr ? `${whole}.${fracStr}` : whole.toString()
  return neg ? `-${out}` : out
}

function explorerTx(chain: ChainId, hash: string): string {
  return CHAINS[chain].explorer.tx.replace('{tx}', hash)
}

function classifyDirection(address: string, from: string, to: string): 'in' | 'out' | 'self' {
  const a = address.toLowerCase()
  const f = from.toLowerCase()
  const t = to.toLowerCase()
  if (f === a && t === a) return 'self'
  if (f === a) return 'out'
  return 'in'
}

// ── BTC (Blockstream) ──────────────────────────────────────────────

async function btcHistory(address: string): Promise<TxEntry[]> {
  const base = getRpcUrl('btc').replace(/\/$/, '')
  const url = `${base}/address/${address}/txs`
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!r.ok) throw new Error(`btc history ${r.status}`)
  const rows = await r.json() as any[]
  const addrLc = address.toLowerCase()
  const out: TxEntry[] = []
  for (const tx of rows) {
    // Sum vin values where prevout.scriptpubkey_address === address
    // Sum vout values where scriptpubkey_address === address
    const vin: any[] = tx.vin ?? []
    const vout: any[] = tx.vout ?? []
    const sent: bigint = vin
      .filter((v) => v.prevout?.scriptpubkey_address?.toLowerCase() === addrLc)
      .reduce<bigint>((acc, v) => acc + BigInt(v.prevout?.value ?? 0), 0n)
    const received: bigint = vout
      .filter((v) => v.scriptpubkey_address?.toLowerCase() === addrLc)
      .reduce<bigint>((acc, v) => acc + BigInt(v.value ?? 0), 0n)
    const net: bigint = received - sent
    const direction: 'in' | 'out' | 'self' = net > 0n ? 'in' : (net < 0n ? 'out' : 'self')
    const firstFrom = vin[0]?.prevout?.scriptpubkey_address ?? '—'
    // Find a vout that isn't us for the "to" (best effort)
    const otherVout = vout.find((v) => v.scriptpubkey_address && v.scriptpubkey_address.toLowerCase() !== addrLc)
    const to = otherVout?.scriptpubkey_address ?? address
    const amtAbs = net < 0n ? -net : net
    out.push({
      chain: 'btc',
      hash: tx.txid,
      direction,
      from: direction === 'in' ? firstFrom : address,
      to: direction === 'out' ? to : address,
      amount: formatUnits(amtAbs, 8),
      amountRaw: amtAbs.toString(),
      symbol: 'BTC',
      feeRaw: tx.fee?.toString(),
      feeSymbol: 'BTC',
      timestamp: tx.status?.block_time,
      blockNumber: tx.status?.block_height,
      status: tx.status?.confirmed ? 'confirmed' : 'pending',
      explorerUrl: explorerTx('btc', tx.txid),
    })
  }
  return out
}

// ── EVM (Etherscan-family) ─────────────────────────────────────────

/** Etherscan V2 unified endpoint takes chainid= per request. */
const ETHERSCAN_CHAINID: Partial<Record<ChainId, number>> = {
  eth: 1, arbitrum: 42161, optimism: 10, base: 8453, polygon: 137, bsc: 56,
}

async function evmHistory(chain: ChainId, address: string): Promise<TxEntry[]> {
  const cfg = readConfig()
  const apiKey: string | undefined =
    cfg.wallet?.etherscanApiKeys?.[chain] ?? cfg.wallet?.etherscanApiKey
  const chainId = ETHERSCAN_CHAINID[chain]
  if (!apiKey || !chainId) return []      // Fall back to sent-log only.

  const url =
    `https://api.etherscan.io/v2/api` +
    `?chainid=${chainId}` +
    `&module=account&action=txlist` +
    `&address=${address}&startblock=0&endblock=99999999` +
    `&page=1&offset=25&sort=desc` +
    `&apikey=${apiKey}`

  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!r.ok) throw new Error(`${chain} history ${r.status}`)
  const data = await r.json() as any
  if (data.status !== '1' || !Array.isArray(data.result)) return []

  const spec = CHAINS[chain]
  return (data.result as any[]).map((tx) => {
    const wei = BigInt(tx.value ?? '0')
    const from = tx.from ?? ''
    const to = tx.to ?? ''
    const feeWei = BigInt(tx.gasUsed ?? 0) * BigInt(tx.gasPrice ?? 0)
    return {
      chain,
      hash: tx.hash,
      direction: classifyDirection(address, from, to),
      from, to,
      amount: formatUnits(wei, spec.decimals),
      amountRaw: wei.toString(),
      symbol: spec.symbol,
      feeRaw: feeWei.toString(),
      feeSymbol: spec.symbol,
      timestamp: tx.timeStamp ? Number(tx.timeStamp) : undefined,
      blockNumber: tx.blockNumber ? Number(tx.blockNumber) : undefined,
      status: tx.isError === '1' ? 'failed' : 'confirmed',
      explorerUrl: explorerTx(chain, tx.hash),
    } as TxEntry
  })
}

// ── Public dispatch ────────────────────────────────────────────────

/**
 * Merge remote + local. Local entries are kept when they don't yet appear
 * in the remote result (e.g. still pending). Remote entries override local
 * on same hash (authoritative status / fees).
 */
function merge(remote: TxEntry[], local: TxEntry[]): TxEntry[] {
  const byHash = new Map<string, TxEntry>()
  for (const e of local) byHash.set(e.hash.toLowerCase(), e)
  for (const e of remote) byHash.set(e.hash.toLowerCase(), e)
  const out = Array.from(byHash.values())
  out.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  return out
}

export async function historyFor(chain: ChainId, address: string): Promise<TxEntry[]> {
  const local = localSentEntries(chain, address)
  try {
    const spec = CHAINS[chain]
    let remote: TxEntry[] = []
    if (spec.family === 'btc') remote = await btcHistory(address)
    else if (spec.family === 'evm') remote = await evmHistory(chain, address)
    // solana/tron: phase 1 = local only
    return merge(remote, local)
  } catch (err: any) {
    // Remote failed — still return local entries so the user sees their own sends.
    return local.map(e => ({ ...e, note: `remote fetch failed: ${err?.message ?? err}` }))
  }
}
