/**
 * Multi-chain native-balance queries.
 *
 * Phase 1: native asset only (ETH, MATIC, BNB, BTC, SOL, TRX).
 * Phase 2 will add ERC-20 / SPL / TRC-20.
 *
 * All calls are read-only — no signing. Can be done without unlocking
 * the wallet as long as we have the public address.
 */

import { CHAINS, type ChainId, type ChainSpec } from './chains.js'
import { evmJsonRpc, getRpcUrl } from './rpc.js'

export interface Balance {
  chain: ChainId
  address: string
  native: {
    symbol: string
    amount: string        // decimal string, human-readable
    raw: string           // unformatted integer string (wei/sats/lamports)
    decimals: number
  }
  updatedAt: number
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

// ── Per-family implementations ─────────────────────────────────────

async function balanceEVM(chain: ChainId, address: string): Promise<Balance> {
  const raw = await evmJsonRpc(chain, 'eth_getBalance', [address, 'latest'])
  const wei = BigInt(raw as string)
  const spec = CHAINS[chain]
  return {
    chain, address,
    native: {
      symbol: spec.symbol,
      amount: formatUnits(wei, spec.decimals),
      raw: wei.toString(),
      decimals: spec.decimals,
    },
    updatedAt: Date.now(),
  }
}

async function balanceBTC(address: string): Promise<Balance> {
  // Blockstream API: /address/<addr> → { chain_stats: { funded, spent } } in sats
  const url = `${getRpcUrl('btc')}/address/${address}`
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`btc balance ${r.status}`)
  const data = await r.json() as any
  const funded = BigInt(data.chain_stats?.funded_txo_sum ?? 0)
  const spent = BigInt(data.chain_stats?.spent_txo_sum ?? 0)
  const sats = funded - spent
  return {
    chain: 'btc', address,
    native: {
      symbol: 'BTC',
      amount: formatUnits(sats, 8),
      raw: sats.toString(),
      decimals: 8,
    },
    updatedAt: Date.now(),
  }
}

async function balanceSolana(address: string): Promise<Balance> {
  const url = getRpcUrl('solana')
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`sol balance ${r.status}`)
  const data = await r.json() as any
  const lamports = BigInt(data.result?.value ?? 0)
  return {
    chain: 'solana', address,
    native: {
      symbol: 'SOL',
      amount: formatUnits(lamports, 9),
      raw: lamports.toString(),
      decimals: 9,
    },
    updatedAt: Date.now(),
  }
}

async function balanceTron(address: string): Promise<Balance> {
  // TronGrid: /v1/accounts/<addr>
  const url = `${getRpcUrl('tron')}/v1/accounts/${address}`
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`tron balance ${r.status}`)
  const data = await r.json() as any
  const sun = BigInt(data.data?.[0]?.balance ?? 0)
  return {
    chain: 'tron', address,
    native: {
      symbol: 'TRX',
      amount: formatUnits(sun, 6),
      raw: sun.toString(),
      decimals: 6,
    },
    updatedAt: Date.now(),
  }
}

// ── Public dispatch ────────────────────────────────────────────────

export async function getBalance(chain: ChainId, address: string): Promise<Balance> {
  const spec: ChainSpec = CHAINS[chain]
  switch (spec.family) {
    case 'evm':    return balanceEVM(chain, address)
    case 'btc':    return balanceBTC(address)
    case 'solana': return balanceSolana(address)
    case 'tron':   return balanceTron(address)
  }
}

/** Fetch balances for all configured addresses in parallel. */
export async function getAllBalances(
  addresses: Partial<Record<ChainId, string>>,
): Promise<Balance[]> {
  const entries = Object.entries(addresses).filter(([, a]) => !!a) as Array<[ChainId, string]>
  const results = await Promise.allSettled(entries.map(([c, a]) => getBalance(c, a)))
  const out: Balance[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') out.push(r.value)
    // silently drop failed chains; renderer displays "—" for missing entries
  }
  return out
}
